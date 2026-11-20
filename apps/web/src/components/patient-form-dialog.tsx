import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Check, ChevronsUpDown, Search, UserPlus } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { api, ApiError } from '@/lib/api';
import type { Patient, PatientDuplicateMatch } from '@/lib/clinic-types';
import { cn } from '@/lib/utils';

export function calculateAgeYears(dobStr: string): number | null {
  if (!dobStr) return null;
  const birth = new Date(`${dobStr}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age >= 0 && age <= 130 ? age : null;
}

const schema = z
  .object({
    fullName: z.string().trim().min(2, 'Name must be at least 2 characters').max(200),
    preferredName: z.string().trim().max(150).optional().or(z.literal('')),
    dateOfBirth: z
      .string()
      .regex(/^$|^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format')
      .optional(),
    approximateAgeYears: z.string().optional(),
    sex: z.enum(['', 'MALE', 'FEMALE', 'OTHER', 'UNKNOWN']).optional(),
    address: z.string().trim().max(2000).optional().or(z.literal('')),
    primaryPhone: z
      .string()
      .trim()
      .regex(/^$|^[0-9+\-\s()]{7,20}$/, 'Enter a valid phone number')
      .optional(),
    secondaryPhone: z
      .string()
      .trim()
      .regex(/^$|^[0-9+\-\s()]{7,20}$/, 'Enter a valid phone number')
      .optional(),
    guardianName: z.string().trim().max(120).optional().or(z.literal('')),
    relationship: z.string().trim().max(80).optional().or(z.literal('')),
    guardianPhone: z
      .string()
      .trim()
      .regex(/^$|^[0-9+\-\s()]{7,20}$/, 'Enter a valid phone number')
      .optional(),
    contactExceptionReason: z.string().trim().max(500).optional().or(z.literal('')),
    confirmDuplicate: z.boolean().optional(),
    confirmSharedPhone: z.boolean().optional(),
  })
  .superRefine((values, ctx) => {
    const hasPhone = Boolean(
      values.primaryPhone?.trim() ||
        values.secondaryPhone?.trim() ||
        values.guardianPhone?.trim(),
    );
    if (!hasPhone && !values.contactExceptionReason?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Add a phone number or a no-contact reason',
        path: ['primaryPhone'],
      });
    }
    const hasAge = Boolean(values.approximateAgeYears?.trim());
    if (hasAge) {
      const n = Number(values.approximateAgeYears);
      if (!Number.isInteger(n) || n < 0 || n > 130) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Age must be an integer from 0 to 130',
          path: ['approximateAgeYears'],
        });
      }
    }
  });

type FormValues = z.infer<typeof schema>;

function buildContacts(values: FormValues) {
  const contacts: Array<{
    contactType: string;
    value: string;
    contactPersonName?: string;
    relationship?: string;
    isPrimary?: boolean;
  }> = [];
  if (values.primaryPhone?.trim()) {
    contacts.push({
      contactType: 'MOBILE',
      value: values.primaryPhone.trim(),
      isPrimary: true,
    });
  }
  if (values.secondaryPhone?.trim()) {
    contacts.push({
      contactType: 'MOBILE',
      value: values.secondaryPhone.trim(),
      isPrimary: contacts.length === 0,
    });
  }
  if (values.guardianPhone?.trim()) {
    contacts.push({
      contactType: 'GUARDIAN_MOBILE',
      value: values.guardianPhone.trim(),
      contactPersonName: values.guardianName?.trim() || undefined,
      relationship: values.relationship?.trim() || undefined,
      isPrimary: contacts.length === 0,
    });
  }
  return contacts;
}

function buildPayload(
  values: FormValues,
  extras?: { confirmDuplicate?: boolean; confirmSharedPhone?: boolean },
) {
  const contacts = buildContacts(values);
  const dob = values.dateOfBirth?.trim() || undefined;
  const approximateAgeYears = dob
    ? undefined
    : values.approximateAgeYears?.trim()
      ? Number(values.approximateAgeYears)
      : undefined;

  return {
    fullName: values.fullName.trim(),
    preferredName: values.preferredName?.trim() || undefined,
    dateOfBirth: dob,
    approximateAgeYears,
    sex: values.sex || undefined,
    address: values.address?.trim() || undefined,
    contacts: contacts.length ? contacts : undefined,
    contactExceptionReason: values.contactExceptionReason?.trim() || undefined,
    confirmDuplicate: extras?.confirmDuplicate || values.confirmDuplicate || false,
    confirmSharedPhone: extras?.confirmSharedPhone || values.confirmSharedPhone || false,
  };
}

function RelationshipCombobox({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    let active = true;
    api<Array<{ id: string; name: string }>>('/clinic/catalog/relationships')
      .then((data) => {
        if (active) setItems(data);
      })
      .catch(() => {
        if (active) {
          setItems([
            { id: '1', name: 'Father' },
            { id: '2', name: 'Mother' },
            { id: '3', name: 'Spouse' },
            { id: '4', name: 'Son' },
            { id: '5', name: 'Daughter' },
            { id: '6', name: 'Brother' },
            { id: '7', name: 'Sister' },
            { id: '8', name: 'Guardian' },
            { id: '9', name: 'Grandparent' },
            { id: '10', name: 'Relative' },
            { id: '11', name: 'Friend' },
            { id: '12', name: 'Other' },
          ]);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.name.toLowerCase().includes(q));
  }, [items, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-9 w-full justify-between bg-background px-3 text-sm font-normal text-foreground hover:bg-background"
        >
          <span className={cn('truncate', !value && 'text-muted-foreground')}>
            {value || 'Select relationship (optional)'}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-2" align="start">
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search relationship…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-7 text-xs"
            autoFocus
          />
        </div>
        <div className="max-h-48 overflow-y-auto space-y-0.5">
          {filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                'flex w-full items-center justify-between rounded px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-muted',
                value.toLowerCase() === item.name.toLowerCase() &&
                  'bg-muted font-medium text-primary',
              )}
              onClick={() => {
                onChange(item.name);
                setOpen(false);
              }}
            >
              <span>{item.name}</span>
              {value.toLowerCase() === item.name.toLowerCase() ? (
                <Check className="size-3.5 text-primary" />
              ) : null}
            </button>
          ))}
          {filtered.length === 0 ? (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              {search.trim() ? (
                <button
                  type="button"
                  className="w-full text-left font-medium text-primary hover:underline"
                  onClick={() => {
                    onChange(search.trim());
                    setOpen(false);
                  }}
                >
                  Use &ldquo;{search.trim()}&rdquo;
                </button>
              ) : (
                'No relationships found.'
              )}
            </div>
          ) : null}
        </div>
        {value ? (
          <div className="mt-1.5 border-t border-border/70 pt-1.5">
            <button
              type="button"
              className="w-full rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
            >
              Clear selection
            </button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

export function PatientFormDialog({
  open,
  onOpenChange,
  patientId,
  initialPhone = '',
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId?: string | null;
  initialPhone?: string;
  onSaved?: (patient: Patient) => void;
}) {
  const isEdit = Boolean(patientId);
  const [version, setVersion] = useState<number | null>(null);
  const [patientNumber, setPatientNumber] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [matches, setMatches] = useState<PatientDuplicateMatch[]>([]);
  const [dupCode, setDupCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [review, setReview] = useState(false);
  const [preferredNameEdited, setPreferredNameEdited] = useState(false);
  const idempotencyKeyRef = useRef(crypto.randomUUID());

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: '',
      preferredName: '',
      dateOfBirth: '',
      approximateAgeYears: '',
      sex: '',
      address: '',
      primaryPhone: initialPhone,
      secondaryPhone: '',
      guardianName: '',
      relationship: '',
      guardianPhone: '',
      contactExceptionReason: '',
      confirmDuplicate: false,
      confirmSharedPhone: false,
    },
  });

  useEffect(() => {
    if (!open) {
      form.reset({
        fullName: '',
        preferredName: '',
        dateOfBirth: '',
        approximateAgeYears: '',
        sex: '',
        address: '',
        primaryPhone: '',
        secondaryPhone: '',
        guardianName: '',
        relationship: '',
        guardianPhone: '',
        contactExceptionReason: '',
        confirmDuplicate: false,
        confirmSharedPhone: false,
      });
      setReview(false);
      setMatches([]);
      setDupCode(null);
      setServerError(null);
      setPreferredNameEdited(false);
      return;
    }

    if (patientId) {
      setPreferredNameEdited(true);
      api<Patient>(`/clinic/patients/${patientId}`)
        .then((patient) => {
          setVersion(patient.version);
          setPatientNumber(patient.patientNumber);
          const primary =
            patient.contacts.find((c) => c.isPrimary && c.contactType !== 'GUARDIAN_MOBILE') ??
            patient.contacts.find((c) => c.contactType === 'MOBILE');
          const secondary = patient.contacts.find(
            (c) => c.contactType === 'MOBILE' && c.id !== primary?.id,
          );
          const guardian = patient.contacts.find((c) => c.contactType === 'GUARDIAN_MOBILE');

          const initialAge =
            patient.approximateAgeYears != null
              ? String(patient.approximateAgeYears)
              : patient.dateOfBirth
                ? String(calculateAgeYears(patient.dateOfBirth) ?? '')
                : '';

          form.reset({
            fullName: patient.fullName,
            preferredName: patient.preferredName ?? '',
            dateOfBirth: patient.dateOfBirth ?? '',
            approximateAgeYears: initialAge,
            sex: patient.sex ?? '',
            address: patient.address ?? '',
            primaryPhone: primary?.displayValue ?? '',
            secondaryPhone: secondary?.displayValue ?? '',
            guardianName: guardian?.contactPersonName ?? '',
            relationship: guardian?.relationship ?? '',
            guardianPhone: guardian?.displayValue ?? '',
            contactExceptionReason: patient.contactExceptionReason ?? '',
            confirmDuplicate: false,
            confirmSharedPhone: false,
          });
        })
        .catch((err) =>
          setServerError(err instanceof ApiError ? err.message : 'Patient not found'),
        );
    } else {
      setPreferredNameEdited(false);
      form.reset({
        fullName: '',
        preferredName: '',
        dateOfBirth: '',
        approximateAgeYears: '',
        sex: '',
        address: '',
        primaryPhone: initialPhone,
        secondaryPhone: '',
        guardianName: '',
        relationship: '',
        guardianPhone: '',
        contactExceptionReason: '',
        confirmDuplicate: false,
        confirmSharedPhone: false,
      });
      idempotencyKeyRef.current = crypto.randomUUID();
    }
  }, [open, patientId, initialPhone]);

  const watched = form.watch();
  const summary = useMemo(
    () => ({
      name: watched.fullName || '—',
      phone: watched.primaryPhone || watched.guardianPhone || 'No phone / exception',
      age: watched.dateOfBirth || watched.approximateAgeYears || '—',
    }),
    [watched],
  );

  const runDuplicateCheck = async (values: FormValues) => {
    const primary = values.primaryPhone?.trim() || values.guardianPhone?.trim();
    try {
      const result = await api<{
        matches: PatientDuplicateMatch[];
        hasStrongMatch: boolean;
        hasSharedPhone: boolean;
      }>('/clinic/patients/check-duplicates', {
        method: 'POST',
        json: {
          fullName: values.fullName.trim(),
          primaryPhone: primary || undefined,
          dateOfBirth: values.dateOfBirth?.trim() || undefined,
          approximateAgeYears: values.approximateAgeYears?.trim()
            ? Number(values.approximateAgeYears)
            : undefined,
        },
      });
      setMatches(result.matches);
      if (result.hasStrongMatch) setDupCode('POSSIBLE_DUPLICATE');
      else if (result.hasSharedPhone) setDupCode('SHARED_PHONE');
      else setDupCode(null);
      return result;
    } catch {
      return null;
    }
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);

    // Run duplicate check on new patients if not yet reviewed
    if (!isEdit && !review) {
      setSubmitting(true);
      try {
        const dupResult = await runDuplicateCheck(values);
        if (dupResult && (dupResult.hasStrongMatch || dupResult.hasSharedPhone)) {
          setReview(true);
          setSubmitting(false);
          return;
        }
      } finally {
        setSubmitting(false);
      }
    }

    setSubmitting(true);
    try {
      if (isEdit && patientId) {
        if (version === null) throw new Error('Missing record version for update');
        const payload = {
          ...buildPayload(values),
          version,
        };
        const updated = await api<Patient>(`/clinic/patients/${patientId}`, {
          method: 'PATCH',
          json: payload,
        });
        onSaved?.(updated);
        onOpenChange(false);
      } else {
        const payload = buildPayload(values);
        const created = await api<Patient>('/clinic/patients', {
          method: 'POST',
          headers: { 'idempotency-key': idempotencyKeyRef.current },
          json: payload,
        });
        onSaved?.(created);
        onOpenChange(false);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const message = err.message || '';
        if (message.toLowerCase().includes('duplicate')) {
          setDupCode('POSSIBLE_DUPLICATE');
          form.setValue('confirmDuplicate', true);
        } else if (
          message.toLowerCase().includes('phone') ||
          message.toLowerCase().includes('shared')
        ) {
          setDupCode('SHARED_PHONE');
          form.setValue('confirmSharedPhone', true);
        }
        await runDuplicateCheck(form.getValues());
        setReview(true);
      } else {
        setServerError(err instanceof ApiError ? err.message : 'Save failed');
      }
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-5 text-primary" />
            {isEdit ? 'Edit Patient' : 'Register Patient'}
          </DialogTitle>
          <DialogDescription>
            {isEdit && patientNumber
              ? `Updating patient details for ID: ${patientNumber}`
              : 'Capture essential patient identity and contact details for clinic records.'}
          </DialogDescription>
        </DialogHeader>

        {matches.length > 0 ? (
          <Alert variant="destructive" className="my-2 border-amber-300 bg-amber-50 text-amber-900">
            <AlertCircle className="size-4 text-amber-700" />
            <AlertTitle className="text-amber-900">
              {dupCode === 'POSSIBLE_DUPLICATE'
                ? 'Possible existing patient found'
                : dupCode === 'SHARED_PHONE'
                  ? 'Shared family phone number'
                  : 'Similar patients found'}
            </AlertTitle>
            <AlertDescription className="text-amber-800">
              <ul className="mt-2 space-y-1.5 text-xs">
                {matches.map((m) => (
                  <li key={m.id} className="rounded border border-amber-200 bg-white/80 p-2">
                    <span className="font-semibold text-slate-900">{m.fullName}</span>{' '}
                    <span className="font-mono text-muted-foreground">({m.patientNumber})</span>
                    <span className="block text-muted-foreground">
                      {m.reasons.join(' · ')}
                      {m.primaryContactMasked ? ` · ${m.primaryContactMasked}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}

        <form className="space-y-5" onSubmit={onSubmit} noValidate>
          {/* Personal information */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Personal Information
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="fullName">Full Name *</Label>
                <Input
                  id="fullName"
                  placeholder="e.g. Kasun Silva"
                  {...form.register('fullName', {
                    onChange: (e) => {
                      if (!preferredNameEdited) {
                        form.setValue('preferredName', e.target.value, { shouldValidate: true });
                      }
                    },
                  })}
                />
                {form.formState.errors.fullName ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.fullName.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="preferredName">Preferred Name</Label>
                <Input
                  id="preferredName"
                  placeholder="Optional nickname / familiar name"
                  {...form.register('preferredName', {
                    onChange: () => {
                      setPreferredNameEdited(true);
                    },
                  })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sex">Sex</Label>
                <select
                  id="sex"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  {...form.register('sex')}
                >
                  <option value="">Not recorded</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                  <option value="UNKNOWN">Unknown</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="dateOfBirth">Date of Birth</Label>
                <Input
                  id="dateOfBirth"
                  type="date"
                  max={new Date().toISOString().split('T')[0]}
                  {...form.register('dateOfBirth', {
                    onChange: (e) => {
                      const dobVal = e.target.value;
                      if (dobVal) {
                        const age = calculateAgeYears(dobVal);
                        if (age !== null) {
                          form.setValue('approximateAgeYears', String(age), {
                            shouldValidate: true,
                          });
                        }
                      }
                    },
                  })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="approximateAgeYears">Approximate Age (years)</Label>
                <Input
                  id="approximateAgeYears"
                  placeholder="e.g. 35 (if DOB unknown)"
                  inputMode="numeric"
                  {...form.register('approximateAgeYears')}
                />
                {form.formState.errors.approximateAgeYears ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.approximateAgeYears.message}
                  </p>
                ) : null}
              </div>
            </div>
          </section>

          {/* Contact Details */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Contact Details
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="primaryPhone">Primary Phone</Label>
                <Input
                  id="primaryPhone"
                  placeholder="0771234567"
                  {...form.register('primaryPhone')}
                />
                {form.formState.errors.primaryPhone ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.primaryPhone.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="secondaryPhone">Secondary Phone</Label>
                <Input
                  id="secondaryPhone"
                  placeholder="Optional secondary"
                  {...form.register('secondaryPhone')}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="guardianName">Guardian / Contact Person</Label>
                <Input
                  id="guardianName"
                  placeholder="Name if minor / dependent"
                  {...form.register('guardianName')}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="relationship">Relationship</Label>
                <RelationshipCombobox
                  value={form.watch('relationship') ?? ''}
                  onChange={(val) => form.setValue('relationship', val, { shouldValidate: true })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="guardianPhone">Guardian Phone</Label>
                <Input
                  id="guardianPhone"
                  placeholder="0771234567"
                  {...form.register('guardianPhone')}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="contactExceptionReason">
                  No-Contact Exception Reason
                </Label>
                <Input
                  id="contactExceptionReason"
                  placeholder="Required ONLY if no phone provided"
                  {...form.register('contactExceptionReason')}
                />
              </div>

              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  placeholder="Optional street address / town"
                  {...form.register('address')}
                />
              </div>
            </div>
          </section>

          {review && dupCode ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50/70 p-3 text-xs text-amber-900 space-y-2">
              <p className="font-semibold">Confirmation required to proceed:</p>
              {dupCode === 'POSSIBLE_DUPLICATE' ? (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-amber-400"
                    {...form.register('confirmDuplicate')}
                  />
                  <span>Confirm this is a new patient despite similar names/records</span>
                </label>
              ) : null}
              {dupCode === 'SHARED_PHONE' ? (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-amber-400"
                    {...form.register('confirmSharedPhone')}
                  />
                  <span>Confirm this phone number is shared with family members</span>
                </label>
              ) : null}
            </div>
          ) : null}

          {serverError ? (
            <p className="text-xs text-destructive font-medium">{serverError}</p>
          ) : null}

          <DialogFooter className="gap-2 sm:justify-between">
            <div className="text-xs text-muted-foreground self-center">
              {summary.name !== '—' ? (
                <span>
                  Registering: <strong>{summary.name}</strong>
                </span>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving…' : isEdit ? 'Save Changes' : review ? 'Confirm & Register' : 'Review & Register'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
