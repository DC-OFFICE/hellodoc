import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { CatalogCombobox } from '@/components/catalog-combobox';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError } from '@/lib/api';
import type { Doctor } from '@/lib/clinic-types';

const schema = z.object({
  fullName: z.string().trim().min(2).max(120),
  displayName: z.string().trim().max(120).optional(),
  specializationId: z.string().uuid('Select a specialization'),
  qualificationId: z.string().uuid('Select a qualification'),
  contactNumber: z
    .string()
    .trim()
    .regex(/^$|^[0-9+\-\s()]{7,20}$/, 'Enter a valid phone number')
    .optional(),
  email: z.string().trim().email().optional().or(z.literal('')),
  confirmDuplicate: z.boolean().optional(),
});

type FormValues = z.infer<typeof schema>;

export function DoctorFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [version, setVersion] = useState<number | null>(null);
  const [registrationNumber, setRegistrationNumber] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [duplicatePrompt, setDuplicatePrompt] = useState(false);
  const [specName, setSpecName] = useState('');
  const [qualName, setQualName] = useState('');

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: '',
      displayName: '',
      specializationId: '',
      qualificationId: '',
      contactNumber: '',
      email: '',
      confirmDuplicate: false,
    },
  });

  useEffect(() => {
    if (!id) return;
    api<Doctor>(`/clinic/doctors/${id}`)
      .then((doctor) => {
        setVersion(doctor.version);
        setRegistrationNumber(doctor.registrationNumber);
        setSpecName(doctor.specialization ?? '');
        setQualName(doctor.qualifications ?? '');
        form.reset({
          fullName: doctor.fullName,
          displayName: doctor.displayName,
          specializationId: doctor.specializationId ?? '',
          qualificationId: doctor.qualificationId ?? '',
          contactNumber: doctor.contactNumber ?? '',
          email: doctor.email ?? '',
          confirmDuplicate: false,
        });
      })
      .catch((err) => setServerError(err instanceof ApiError ? err.message : 'Doctor not found'));
  }, [id, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    const payload = {
      ...values,
      displayName: values.displayName || values.fullName,
      email: values.email || undefined,
      contactNumber: values.contactNumber || undefined,
      confirmDuplicate: values.confirmDuplicate || duplicatePrompt,
    };
    try {
      if (isEdit) {
        if (version == null) throw new Error('Missing version');
        if (!values.specializationId || !values.qualificationId) {
          setServerError('Specialization and qualification are required');
          return;
        }
        const updated = await api<Doctor>(`/clinic/doctors/${id}`, {
          method: 'PATCH',
          json: { ...payload, version },
        });
        navigate(`/doctors/${updated.id}`);
      } else {
        const created = await api<Doctor>('/clinic/doctors', { method: 'POST', json: payload });
        navigate(`/doctors/${created.id}`);
      }
    } catch (err) {
      if (err instanceof ApiError && err.message.toLowerCase().includes('similar doctor')) {
        setDuplicatePrompt(true);
        form.setValue('confirmDuplicate', true);
      }
      setServerError(err instanceof ApiError ? err.message : 'Save failed');
    }
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{isEdit ? 'Edit doctor' : 'Add doctor'}</h1>
        <Link to="/doctors"><Button variant="outline" type="button">Cancel</Button></Link>
      </div>
      <Card>
        <CardHeader>
          <p className="text-sm text-slate-600">
            Registration numbers are generated automatically. Specialization and qualifications come from the global HelloDoc catalog.
          </p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit} noValidate>
            <div>
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" {...form.register('fullName')} />
            </div>
            <div>
              <Label htmlFor="displayName">Display name</Label>
              <Input id="displayName" {...form.register('displayName')} />
            </div>
            {isEdit ? (
              <div>
                <Label>Registration number</Label>
                <Input value={registrationNumber ?? ''} readOnly disabled />
              </div>
            ) : null}
            <CatalogCombobox
              label="Specialization"
              kind="specializations"
              value={form.watch('specializationId')}
              selectedName={specName}
              onChange={(idValue, name) => {
                form.setValue('specializationId', idValue, { shouldValidate: true });
                setSpecName(name);
              }}
              error={form.formState.errors.specializationId?.message}
            />
            <CatalogCombobox
              label="Qualifications"
              kind="qualifications"
              value={form.watch('qualificationId')}
              selectedName={qualName}
              onChange={(idValue, name) => {
                form.setValue('qualificationId', idValue, { shouldValidate: true });
                setQualName(name);
              }}
              error={form.formState.errors.qualificationId?.message}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="contactNumber">Phone</Label>
                <Input id="contactNumber" {...form.register('contactNumber')} />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...form.register('email')} />
              </div>
            </div>
            {duplicatePrompt ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                A similar doctor may already exist. Click Save again to confirm creating another record.
              </p>
            ) : null}
            {serverError ? <p className="text-sm text-red-700">{serverError}</p> : null}
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Saving…' : 'Save Doctor'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
