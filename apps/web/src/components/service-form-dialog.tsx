import { useEffect, useState } from 'react';
import { AlertCircle, Layers, Tag, Trash2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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
import { Switch } from '@/components/ui/switch';
import { api, ApiError } from '@/lib/api';
import { notify } from '@/lib/notify';

export type ServiceRecord = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  price: string;
  currency: string;
  tax_classification: 'UNCLASSIFIED' | 'TAXABLE' | 'EXEMPT';
  active: boolean;
  created_at?: string;
  updated_at?: string;
};

const COMMON_PRESETS = [
  { code: 'DOC_CONSULT', name: 'Doctor Consultation Fee', price: '1500.00', desc: 'Standard outpatient physician consultation' },
  { code: 'CLINIC_FEE', name: 'Clinic / Facility Fee', price: '500.00', desc: 'Dispensary & registration facility charge' },
  { code: 'MEDICINES', name: 'Medicines / Pharmacy', price: '0.00', desc: 'Prescription pharmaceuticals and supplies' },
  { code: 'DRESSING', name: 'Wound Dressing & Care', price: '850.00', desc: 'Sterile wound cleansing and dressing application' },
  { code: 'NEBULIZATION', name: 'Nebulization Therapy', price: '750.00', desc: 'Inhalation therapy and bronchodilator delivery' },
  { code: 'BLOOD_GLUCOSE', name: 'Random Blood Glucose Test', price: '350.00', desc: 'Point-of-care capillary blood sugar test' },
  { code: 'ECG_RECORDING', name: '12-Lead ECG Recording', price: '1200.00', desc: 'Diagnostic resting electrocardiogram' },
];

type ServiceFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service?: ServiceRecord | null;
  onSuccess: (savedServiceId: string) => void;
};

export function ServiceFormDialog({
  open,
  onOpenChange,
  service,
  onSuccess,
}: ServiceFormDialogProps) {
  const isEdit = Boolean(service);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('0.00');
  const [taxClassification, setTaxClassification] = useState<'UNCLASSIFIED' | 'TAXABLE' | 'EXEMPT'>('EXEMPT');
  const [active, setActive] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (service) {
        setCode(service.code);
        setName(service.name);
        setDescription(service.description ?? '');
        setPrice(service.price);
        setTaxClassification(service.tax_classification);
        setActive(service.active);
      } else {
        setCode('');
        setName('');
        setDescription('');
        setPrice('0.00');
        setTaxClassification('EXEMPT');
        setActive(true);
      }
      setError(null);
    }
  }, [open, service]);

  function applyPreset(preset: typeof COMMON_PRESETS[number]) {
    setCode(preset.code);
    setName(preset.name);
    setPrice(preset.price);
    setDescription(preset.desc);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedCode = code.trim().toUpperCase();
    const trimmedName = name.trim();
    const trimmedDesc = description.trim();
    const trimmedPrice = price.trim();

    if (!isEdit && !/^[A-Z0-9_-]{2,20}$/.test(trimmedCode)) {
      const message =
        'Service code must be 2-20 characters uppercase alphanumeric, dash or underscore (e.g. DOC_CONSULT).';
      setError(message);
      notify.validation(message);
      return;
    }

    if (trimmedName.length < 2) {
      const message = 'Service name must be at least 2 characters long.';
      setError(message);
      notify.validation(message);
      return;
    }

    if (!/^\d+(\.\d{1,2})?$/.test(trimmedPrice)) {
      const message = 'Price must be a valid non-negative amount with up to 2 decimal places (e.g. 1500.00).';
      setError(message);
      notify.validation(message);
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit && service) {
        await api(`/clinic/billing/services/${service.id}`, {
          method: 'PATCH',
          json: {
            name: trimmedName,
            description: trimmedDesc || null,
            price: Number(trimmedPrice).toFixed(2),
            taxClassification,
            active,
          },
        });
        onSuccess(service.id);
      } else {
        const res = await api<{ id: string }>('/clinic/billing/services', {
          method: 'POST',
          json: {
            code: trimmedCode,
            name: trimmedName,
            description: trimmedDesc || null,
            price: Number(trimmedPrice).toFixed(2),
            taxClassification,
          },
        });
        onSuccess(res.id);
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save service');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="size-5 text-primary" />
              {isEdit ? 'Edit Service' : 'Add New Billing Service'}
            </DialogTitle>
            <DialogDescription>
              {isEdit
                ? `Updating pricing and billing properties for code: ${service?.code}`
                : 'Register a clinical consultation, pharmacy category, procedure, or diagnostic service.'}
            </DialogDescription>
          </DialogHeader>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {!isEdit && (
            <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Layers className="size-3.5" />
                Quick presets:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {COMMON_PRESETS.map((preset) => (
                  <button
                    key={preset.code}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className="inline-flex items-center text-xs px-2.5 py-1 rounded-md border bg-background hover:bg-accent text-foreground transition-colors"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="service-code">
                Service Code <span className="text-destructive">*</span>
              </Label>
              {isEdit ? (
                <div className="pt-1">
                  <Badge tone="suspended" className="font-mono text-sm px-2.5 py-1">
                    {code}
                  </Badge>
                </div>
              ) : (
                <Input
                  id="service-code"
                  placeholder="e.g. DOC_CONSULT"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="font-mono uppercase"
                  required
                />
              )}
              {!isEdit && (
                <p className="text-[11px] text-muted-foreground">Unique identifier used in billing.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="service-price">
                Default Price (LKR) <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs font-semibold text-muted-foreground">
                  LKR
                </span>
                <Input
                  id="service-price"
                  type="text"
                  inputMode="decimal"
                  placeholder="1500.00"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="pl-12 font-medium"
                  required
                />
              </div>
              <p className="text-[11px] text-muted-foreground">Can be adjusted per invoice at cashier checkout.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="service-name">
              Service Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="service-name"
              placeholder="e.g. Doctor Consultation Fee"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="service-desc">Description (Optional)</Label>
            <Input
              id="service-desc"
              placeholder="Clinical details, notes, or patient instructions"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="service-tax">Tax Classification</Label>
              <Select
                value={taxClassification}
                onValueChange={(val) => setTaxClassification(val as typeof taxClassification)}
              >
                <SelectTrigger id="service-tax">
                  <SelectValue placeholder="Select tax status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EXEMPT">EXEMPT (Medical Standard)</SelectItem>
                  <SelectItem value="TAXABLE">TAXABLE (Subject to VAT)</SelectItem>
                  <SelectItem value="UNCLASSIFIED">UNCLASSIFIED</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isEdit && (
              <div className="space-y-1.5 flex flex-col justify-center">
                <Label htmlFor="service-active" className="cursor-pointer">
                  Active Status
                </Label>
                <div className="flex items-center gap-3 pt-1">
                  <Switch
                    id="service-active"
                    checked={active}
                    onCheckedChange={setActive}
                  />
                  <span className="text-xs text-muted-foreground">
                    {active ? 'Available for cashier billing' : 'Deactivated / Hidden from invoices'}
                  </span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Register Service'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type DeleteServiceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service: ServiceRecord | null;
  onSuccess: (resultMessage: string) => void;
};

export function DeleteServiceDialog({
  open,
  onOpenChange,
  service,
  onSuccess,
}: DeleteServiceDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!service) return null;

  async function handleDelete() {
    if (!service) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await api<{ deleted: boolean; deactivated?: boolean; message: string }>(
        `/clinic/billing/services/${service.id}`,
        { method: 'DELETE' },
      );
      onSuccess(res.message);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete service');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="size-5" />
            Delete Billing Service
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to remove <strong>{service.name}</strong> ({service.code})?
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3 text-xs text-amber-900 space-y-1.5 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
          <p className="font-semibold flex items-center gap-1.5">
            <AlertCircle className="size-4 text-amber-600 dark:text-amber-400" />
            Financial Record Integrity Guard
          </p>
          <p>
            If this service is referenced in any past patient invoices, it will be safely <strong>deactivated and archived</strong> instead of permanently deleted so historical billing and receipt history remain complete.
          </p>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={submitting}
          >
            {submitting ? 'Removing…' : 'Confirm Delete / Archive'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
