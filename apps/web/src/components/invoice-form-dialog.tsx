import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

type Patient = { id: string; fullName: string; patientNumber: string };
type Service = { id: string; name: string; price: string; active: boolean };

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
  const [serviceId, setServiceId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [discount, setDiscount] = useState('0.00');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPatientId('');
    setAppointmentId('');
    setQuantity('1');
    setDiscount('0.00');
    setServiceId('');

    void api<{ items: Patient[] }>('/clinic/patients?limit=50&status=ACTIVE').then((data) => {
      setPatients(data.items);
    });
    void api<{ items: Service[] }>('/clinic/billing/services').then((data) => {
      const active = data.items.filter((item) => item.active);
      setServices(active);
      if (active[0]) setServiceId(active[0].id);
    });
  }, [open]);

  async function saveDraft() {
    setError(null);
    setSaving(true);
    try {
      const created = await api<{ id: string }>('/clinic/invoices', {
        method: 'POST',
        json: {
          patientId,
          appointmentId: appointmentId.trim() || undefined,
          items: [{ serviceId, quantity: Number(quantity), discount }],
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
        <Label>Patient</Label>
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
          value={appointmentId}
          onChange={(e) => setAppointmentId(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Service</Label>
        <Select value={serviceId || undefined} onValueChange={setServiceId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a service" />
          </SelectTrigger>
          <SelectContent>
            {services.map((service) => (
              <SelectItem key={service.id} value={service.id}>
                {service.name} · LKR {service.price}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="invoice-qty">Quantity</Label>
          <Input
            id="invoice-qty"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invoice-discount">Discount (LKR)</Label>
          <Input
            id="invoice-discount"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
          />
        </div>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </form>
  );

  const actions = (
    <>
      <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
        Cancel
      </Button>
      <Button type="submit" form="invoice-form-dialog" disabled={saving || !patientId || !serviceId}>
        {saving ? 'Saving…' : 'Save draft'}
      </Button>
    </>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="flex max-h-[92vh] flex-col gap-0 p-0">
          <SheetHeader className="px-5 py-4 text-left">
            <SheetTitle>New invoice</SheetTitle>
            <SheetDescription>Create a draft invoice for a patient visit.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-5 py-4">{formBody}</div>
          <SheetFooter className="px-5 py-4 sm:flex-row">{actions}</SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-full max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="px-6 pt-6 pb-2 text-left">
          <DialogTitle>New invoice</DialogTitle>
          <DialogDescription>Create a draft invoice for a patient visit.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-2">{formBody}</div>
        <DialogFooter className="px-6 pt-2 pb-6">{actions}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
