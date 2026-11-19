import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError } from '@/lib/api';
import type { Patient, PatientDuplicateMatch } from '@/lib/clinic-types';

const schema = z
  .object({
    fullName: z.string().trim().min(2).max(200),
    preferredName: z.string().trim().max(150).optional().or(z.literal('')),
    dateOfBirth: z
      .string()
      .regex(/^$|^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
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
    const hasDob = Boolean(values.dateOfBirth?.trim());
    const hasAge = Boolean(values.approximateAgeYears?.trim());
    if (hasDob && hasAge) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide either date of birth or approximate age, not both',
        path: ['approximateAgeYears'],
      });
    }
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

function buildPayload(values: FormValues, extras?: { confirmDuplicate?: boolean; confirmSharedPhone?: boolean }) {
  const contacts = buildContacts(values);
  return {
    fullName: values.fullName.trim(),
    preferredName: values.preferredName?.trim() || undefined,
    dateOfBirth: values.dateOfBirth?.trim() || undefined,
    approximateAgeYears: values.approximateAgeYears?.trim()
      ? Number(values.approximateAgeYears)
      : undefined,
    sex: values.sex || undefined,
    address: values.address?.trim() || undefined,
    contacts: contacts.length ? contacts : undefined,
    contactExceptionReason: values.contactExceptionReason?.trim() || undefined,
    confirmDuplicate: extras?.confirmDuplicate || values.confirmDuplicate || false,
    confirmSharedPhone: extras?.confirmSharedPhone || values.confirmSharedPhone || false,
  };
}

export function PatientFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [version, setVersion] = useState<number | null>(null);
  const [patientNumber, setPatientNumber] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [matches, setMatches] = useState<PatientDuplicateMatch[]>([]);
  const [dupCode, setDupCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [review, setReview] = useState(false);
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
      primaryPhone: '',
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
    if (!id) return;
    api<Patient>(`/clinic/patients/${id}`)
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
        form.reset({
          fullName: patient.fullName,
          preferredName: patient.preferredName ?? '',
          dateOfBirth: patient.dateOfBirth ?? '',
          approximateAgeYears:
            patient.approximateAgeYears != null ? String(patient.approximateAgeYears) : '',
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
  }, [id, form]);

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
    if (!isEdit && !review) {
      await runDuplicateCheck(values);
      setReview(true);
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit) {
        if (version == null) throw new Error('Missing version');
        const contacts = buildContacts(values);
        const updated = await api<Patient>(`/clinic/patients/${id}`, {
          method: 'PATCH',
          json: {
            fullName: values.fullName.trim(),
            preferredName: values.preferredName?.trim() || null,
            dateOfBirth: values.dateOfBirth?.trim() || null,
            approximateAgeYears: values.approximateAgeYears?.trim()
              ? Number(values.approximateAgeYears)
              : null,
            sex: values.sex || null,
            address: values.address?.trim() || null,
            contacts,
            contactExceptionReason: values.contactExceptionReason?.trim() || null,
            version,
          },
        });
        navigate(`/patients/${updated.id}`);
      } else {
        const payload = buildPayload(values, {
          confirmDuplicate: Boolean(values.confirmDuplicate) || dupCode === 'POSSIBLE_DUPLICATE',
          confirmSharedPhone: Boolean(values.confirmSharedPhone) || dupCode === 'SHARED_PHONE',
        });
        // Only confirm when user explicitly checked or we're retrying after conflict
        if (dupCode === 'POSSIBLE_DUPLICATE' && !values.confirmDuplicate) {
          setServerError('Confirm that you want to continue despite a possible duplicate.');
          setSubmitting(false);
          return;
        }
        if (dupCode === 'SHARED_PHONE' && !values.confirmSharedPhone && !values.confirmDuplicate) {
          setServerError('Confirm that this is a different person sharing the phone number.');
          setSubmitting(false);
          return;
        }
        const created = await api<Patient>('/clinic/patients', {
          method: 'POST',
          json: {
            ...payload,
            confirmDuplicate: values.confirmDuplicate || false,
            confirmSharedPhone: values.confirmSharedPhone || false,
            idempotencyKey: idempotencyKeyRef.current,
          },
        });
        idempotencyKeyRef.current = crypto.randomUUID();
        navigate(`/patients/${created.id}`);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const message = err.message;
        if (message.toLowerCase().includes('possible existing')) {
          setDupCode('POSSIBLE_DUPLICATE');
          form.setValue('confirmDuplicate', true);
        } else if (message.toLowerCase().includes('same phone') || message.toLowerCase().includes('shared')) {
          setDupCode('SHARED_PHONE');
          form.setValue('confirmSharedPhone', true);
        }
        await runDuplicateCheck(form.getValues());
        setReview(true);
      }
      if (err instanceof ApiError && err.message.toLowerCase().includes('someone else')) {
        setServerError(err.message);
      } else {
        setServerError(err instanceof ApiError ? err.message : 'Save failed');
      }
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {isEdit ? 'Edit patient' : 'Register patient'}
          </h1>
          <p className="text-sm text-slate-600">
            {isEdit
              ? 'Update administrative patient details. Patient ID never changes.'
              : 'Capture essential identity and contact details for clinic records.'}
          </p>
        </div>
        <Link to={isEdit && id ? `/patients/${id}` : '/patients'}>
          <Button variant="outline" type="button">
            Cancel
          </Button>
        </Link>
      </div>

      {matches.length > 0 ? (
        <Alert>
          <AlertTitle>
            {dupCode === 'POSSIBLE_DUPLICATE'
              ? 'Possible existing patient found'
              : dupCode === 'SHARED_PHONE'
                ? 'Shared family phone number'
                : 'Similar patients found'}
          </AlertTitle>
          <AlertDescription>
            <ul className="mt-2 space-y-2 text-sm">
              {matches.map((m) => (
                <li key={m.id} className="rounded-md border border-border bg-white px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-900">
                        {m.fullName}{' '}
                        <span className="font-mono text-xs text-slate-500">{m.patientNumber}</span>
                      </p>
                      <p className="text-xs text-slate-600">
                        {m.reasons.join(' · ')}
                        {m.primaryContactMasked ? ` · ${m.primaryContactMasked}` : ''}
                      </p>
                    </div>
                    <Link to={`/patients/${m.id}`}>
                      <Button size="sm" variant="outline" type="button">
                        View existing
                      </Button>
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <p className="text-sm text-slate-600">
            {isEdit && patientNumber
              ? `Patient ID ${patientNumber} is permanent.`
              : 'Patient IDs are generated automatically on successful registration.'}
          </p>
        </CardHeader>
        <CardContent>
          <form className="space-y-6" onSubmit={onSubmit} noValidate>
            <section className="space-y-3">
              <h2 className="text-sm font-semibold tracking-wide text-teal-800 uppercase">
                Personal information
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="fullName">Full name</Label>
                  <Input id="fullName" {...form.register('fullName')} />
                  {form.formState.errors.fullName ? (
                    <p className="mt-1 text-xs text-red-700">
                      {form.formState.errors.fullName.message}
                    </p>
                  ) : null}
                </div>
                <div>
                  <Label htmlFor="preferredName">Preferred name</Label>
                  <Input id="preferredName" {...form.register('preferredName')} />
                </div>
                <div>
                  <Label htmlFor="sex">Sex (optional)</Label>
                  <select
                    id="sex"
                    className="h-9 w-full rounded-md border border-input bg-white px-3 text-sm"
                    {...form.register('sex')}
                  >
                    <option value="">Not recorded</option>
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                    <option value="UNKNOWN">Unknown</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="dateOfBirth">Date of birth</Label>
                  <Input id="dateOfBirth" type="date" {...form.register('dateOfBirth')} />
                </div>
                <div>
                  <Label htmlFor="approximateAgeYears">Approximate age (years)</Label>
                  <Input
                    id="approximateAgeYears"
                    inputMode="numeric"
                    {...form.register('approximateAgeYears')}
                  />
                  {form.formState.errors.approximateAgeYears ? (
                    <p className="mt-1 text-xs text-red-700">
                      {form.formState.errors.approximateAgeYears.message}
                    </p>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-semibold tracking-wide text-teal-800 uppercase">
                Contact details
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="primaryPhone">Primary phone</Label>
                  <Input id="primaryPhone" {...form.register('primaryPhone')} />
                  {form.formState.errors.primaryPhone ? (
                    <p className="mt-1 text-xs text-red-700">
                      {form.formState.errors.primaryPhone.message}
                    </p>
                  ) : null}
                </div>
                <div>
                  <Label htmlFor="secondaryPhone">Secondary phone</Label>
                  <Input id="secondaryPhone" {...form.register('secondaryPhone')} />
                </div>
                <div>
                  <Label htmlFor="guardianName">Guardian / contact person</Label>
                  <Input id="guardianName" {...form.register('guardianName')} />
                </div>
                <div>
                  <Label htmlFor="relationship">Relationship</Label>
                  <Input id="relationship" {...form.register('relationship')} />
                </div>
                <div>
                  <Label htmlFor="guardianPhone">Guardian phone</Label>
                  <Input id="guardianPhone" {...form.register('guardianPhone')} />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="address">Address</Label>
                  <Input id="address" {...form.register('address')} />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="contactExceptionReason">
                    No-contact exception reason (if no phone)
                  </Label>
                  <Input
                    id="contactExceptionReason"
                    {...form.register('contactExceptionReason')}
                  />
                </div>
              </div>
            </section>

            {!isEdit && review ? (
              <section className="space-y-3 rounded-lg border border-border bg-slate-50 p-4">
                <h2 className="text-sm font-semibold tracking-wide text-teal-800 uppercase">
                  Registration confirmation
                </h2>
                <dl className="grid gap-2 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-slate-500">Name</dt>
                    <dd className="font-medium text-slate-900">{summary.name}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Contact</dt>
                    <dd className="font-medium text-slate-900">{summary.phone}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Age / DOB</dt>
                    <dd className="font-medium text-slate-900">{summary.age}</dd>
                  </div>
                </dl>
                {dupCode === 'POSSIBLE_DUPLICATE' ? (
                  <label className="flex items-start gap-2 text-sm text-slate-700">
                    <input type="checkbox" {...form.register('confirmDuplicate')} className="mt-1" />
                    Continue registration even though a possible duplicate was found.
                  </label>
                ) : null}
                {dupCode === 'SHARED_PHONE' ? (
                  <label className="flex items-start gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      {...form.register('confirmSharedPhone')}
                      className="mt-1"
                    />
                    Confirm this is a different person sharing the same phone number.
                  </label>
                ) : null}
              </section>
            ) : null}

            {serverError ? <p className="text-sm text-red-700">{serverError}</p> : null}

            <div className="flex flex-wrap gap-2">
              {!isEdit && review ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setReview(false)}
                  disabled={submitting}
                >
                  Back
                </Button>
              ) : null}
              <Button type="submit" disabled={submitting}>
                {submitting
                  ? 'Saving…'
                  : isEdit
                    ? 'Save changes'
                    : review
                      ? 'Register Patient'
                      : 'Review & continue'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
