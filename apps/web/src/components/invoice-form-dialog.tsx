import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Pill, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { api, ApiError } from '@/lib/api';
import { notify } from '@/lib/notify';

type Patient = { id: string; fullName: string; patientNumber: string };
type Service = { id: string; code: string; name: string; price: string; active: boolean };

type LineItem = {
  id: string;
  serviceId: string;
  amount: string;
  discount: string;
};

type PrescriptionItem = {
  medicine_name: string;
  strength?: string | null;
  dose?: string | null;
  frequency?: string | null;
  duration?: string | null;
  instructions?: string | null;
};

type Prescription = {
  id: string;
  status: string;
  items: PrescriptionItem[];
};

export function InvoiceFormDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (invoiceId: string) => void;
}) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [patientId, setPatientId] = useState('');
  const [appointmentId, setAppointmentId] = useState('');
  const [lines, setLines] = useState<LineItem[]>([]);
  const [rx, setRx] = useState<Prescription | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPatientId('');
    setAppointmentId('');
    setRx(null);

    void api<{ items: Patient[] }>('/clinic/patients?limit=100&status=ACTIVE').then((data) => {
      setPatients(data.items);
    });

    void api<{ items: Service[] }>('/clinic/billing/services').then((data) => {
      const active = data.items.filter((item) => item.active);
      setServices(active);

      // Pre-seed 3 standard clinical lines if available: Doctor Fee, Clinic Fee, Medicines
      const doc = active.find((s) => s.code === 'DOC_CONSULT' || s.name.toLowerCase().includes('doctor'));
      const clinic = active.find((s) => s.code === 'CLINIC_FEE' || s.name.toLowerCase().includes('clinic'));
      const med = active.find((s) => s.code === 'MEDICINES' || s.name.toLowerCase().includes('medicine'));

      const initialLines: LineItem[] = [];
      if (doc) initialLines.push({ id: crypto.randomUUID(), serviceId: doc.id, amount: doc.price ?? '1500.00', discount: '0.00' });
      if (clinic) initialLines.push({ id: crypto.randomUUID(), serviceId: clinic.id, amount: clinic.price ?? '500.00', discount: '0.00' });
      if (med) initialLines.push({ id: crypto.randomUUID(), serviceId: med.id, amount: med.price ?? '0.00', discount: '0.00' });

      // Fallback: if codes don't match, add the first active service
      if (initialLines.length === 0 && active[0]) {
        initialLines.push({ id: crypto.randomUUID(), serviceId: active[0].id, amount: active[0].price ?? '0.00', discount: '0.00' });
      }
      setLines(initialLines);
    });
  }, [open]);

  // When appointment ID is provided, check if a signed prescription exists for it
  useEffect(() => {
    const trimmed = appointmentId.trim();
    if (!trimmed || trimmed.length < 32) {
      setRx(null);
      return;
    }
    void api<Prescription | null>(`/clinic/appointments/${trimmed}/prescription`, { toast: false })
      .then((data) => setRx(data))
      .catch(() => setRx(null));
  }, [appointmentId]);

  function addLine() {
    if (services.length === 0) return;
    const defaultService = services[0];
    setLines((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        serviceId: defaultService?.id ?? '',
        amount: defaultService?.price ?? '0.00',
        discount: '0.00',
      },
    ]);
  }

  function removeLine(id: string) {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((l) => l.id !== id));
  }

  function updateLine(id: string, patch: Partial<LineItem>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function onSelectService(lineId: string, serviceId: string) {
    const s = services.find((x) => x.id === serviceId);
    updateLine(lineId, {
      serviceId,
      amount: s?.price ?? '0.00',
    });
  }

  // Calculate live totals
  const subtotal = lines.reduce((acc, line) => {
    const amt = Number(line.amount) || 0;
    return acc + amt;
  }, 0);

  const discountTotal = lines.reduce((acc, line) => {
    const disc = Number(line.discount) || 0;
    return acc + disc;
  }, 0);

  const grandTotal = Math.max(0, subtotal - discountTotal);

  async function saveDraft() {
    setError(null);
    if (!patientId) {
      const message = 'Please select a patient';
      setError(message);
      notify.validation(message);
      return;
    }
    if (lines.length === 0) {
      const message = 'Please add at least one line item to the invoice';
      setError(message);
      notify.validation(message);
      return;
    }
    setSaving(true);
    try {
      const created = await api<{ id: string }>('/clinic/invoices', {
        method: 'POST',
        json: {
          patientId,
          appointmentId: appointmentId.trim() || undefined,
          items: lines.map((l) => ({
            serviceId: l.serviceId,
            quantity: 1,
            unitPrice: l.amount.trim() || '0.00',
            discount: l.discount.trim() || '0.00',
          })),
        },
      });
      onOpenChange(false);
      onCreated?.(created.id);
      navigate(`/billing/invoices/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invoice was not created');
    } finally {
      setSaving(false);
    }
  }

  const formBody = (
    <form
      id="invoice-form-dialog"
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void saveDraft();
      }}
    >
      <div className="space-y-1.5">
        <Label>Patient *</Label>
        <Select value={patientId || undefined} onValueChange={setPatientId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a patient" />
          </SelectTrigger>
          <SelectContent>
            {patients.map((patient) => (
              <SelectItem key={patient.id} value={patient.id}>
                {patient.fullName} · {patient.patientNumber}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="invoice-appointment">Appointment ID (optional)</Label>
        <Input
          id="invoice-appointment"
          placeholder="Paste appointment UUID to link visit & prescription"
          value={appointmentId}
          onChange={(e) => setAppointmentId(e.target.value)}
        />
      </div>

      {rx && rx.items.length > 0 ? (
        <div className="rounded-lg border border-teal-500/20 bg-teal-500/10 p-3 text-xs space-y-2">
          <div className="flex items-center gap-1.5 font-semibold text-teal-700 dark:text-teal-300">
            <Pill className="size-4 text-teal-600 dark:text-teal-400" />
            <span>Prescribed Medications from Doctor</span>
          </div>
          <div className="grid gap-1">
            {rx.items.map((item, idx) => (
              <div key={idx} className="flex justify-between border-b border-teal-500/20 pb-1">
                <span className="font-medium text-foreground">
                  {item.medicine_name} {item.strength ?? ''}
                </span>
                <span className="text-muted-foreground">
                  {item.dose ?? ''} {item.frequency ? `· ${item.frequency}` : ''} {item.duration ? `· ${item.duration}` : ''}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-teal-700 dark:text-teal-300">
            Review these medications above when entering the Medicines fee row below.
          </p>
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold">Invoice Fee Items</Label>
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={addLine}>
            <Plus className="size-3 mr-1" /> Add item
          </Button>
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {lines.map((line, index) => {
            const lineAmt = Number(line.amount) || 0;
            const lineDisc = Number(line.discount) || 0;
            const lineTotal = Math.max(0, lineAmt - lineDisc);

            return (
              <div key={line.id} className="rounded-md border p-2.5 bg-muted/20 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-muted-foreground">Item #{index + 1}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">
                      LKR {lineTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    {lines.length > 1 ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10"
                        onClick={() => removeLine(line.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-[2.5fr_1.25fr_1.25fr] gap-2.5 items-end">
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Reason / Service</Label>
                    <Select
                      value={line.serviceId || undefined}
                      onValueChange={(val) => onSelectService(line.id, val)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select fee reason" />
                      </SelectTrigger>
                      <SelectContent>
                        {services.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name} {Number(s.price) > 0 ? `(LKR ${s.price})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-[11px] text-muted-foreground">Amount (LKR)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      className="h-8 text-xs font-semibold tabular-nums"
                      value={line.amount}
                      onChange={(e) => updateLine(line.id, { amount: e.target.value })}
                    />
                  </div>

                  <div>
                    <Label className="text-[11px] text-muted-foreground">Discount (LKR)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      className="h-8 text-xs tabular-nums"
                      value={line.discount}
                      onChange={(e) => updateLine(line.id, { discount: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border bg-muted/40 p-3 text-xs space-y-1">
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotal:</span>
          <span>LKR {subtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Total Discounts:</span>
          <span>- LKR {discountTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div className="flex justify-between font-semibold text-sm text-foreground pt-1 border-t">
          <span>Grand Total:</span>
          <span className="text-teal-600 dark:text-teal-400 font-semibold">
            LKR {grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {error ? (
        <div className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}
    </form>
  );

  const actions = (
    <>
      <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
        Cancel
      </Button>
      <Button type="submit" form="invoice-form-dialog" disabled={saving || !patientId || lines.length === 0}>
        {saving ? 'Creating…' : 'Save draft & issue'}
      </Button>
    </>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="flex max-h-[92vh] flex-col gap-0 p-0">
          <SheetHeader className="px-5 py-4 text-left">
            <SheetTitle>New invoice</SheetTitle>
            <SheetDescription>Doctor fee, clinic fee, and medicines for patient visit.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-5 py-4">{formBody}</div>
          <SheetFooter className="px-5 py-4 sm:flex-row">{actions}</SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-full max-w-xl flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="px-6 pt-6 pb-2 text-left">
          <DialogTitle>New invoice</DialogTitle>
          <DialogDescription>
            Bill patient visit: Doctor Consultation Fee, Clinic Fee, and Medicines.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-2">{formBody}</div>
        <DialogFooter className="px-6 pt-2 pb-6">{actions}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
