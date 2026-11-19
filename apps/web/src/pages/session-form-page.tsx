import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { api, ApiError } from '@/lib/api';
import type { ConsultationSession, Doctor } from '@/lib/clinic-types';
import { formatSessionDuration } from '@/features/sessions/utils/session-formatters';

const schema = z.object({
  doctorId: z.string().uuid('Select a doctor'),
  localDate: z.string().min(1, 'Date is required'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  capacity: z.number().int().min(1).max(500),
  expectedDurationMinutes: z.number().int().min(1).max(240),
  location: z.string().max(120).optional(),
  internalNotes: z.string().max(1000).optional(),
});

type FormValues = z.infer<typeof schema>;

export function SessionFormPage() {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      doctorId: search.get('doctorId') ?? '',
      localDate: search.get('date') ?? '',
      startTime: '17:00',
      endTime: '21:00',
      capacity: 20,
      expectedDurationMinutes: 10,
      location: '',
      internalNotes: '',
    },
  });

  const startTime = form.watch('startTime');
  const endTime = form.watch('endTime');
  const localDate = form.watch('localDate');

  const durationLabel = useMemo(() => {
    if (!localDate || !startTime || !endTime) return '—';
    const startAt = new Date(`${localDate}T${startTime}:00`);
    const endAt = new Date(`${localDate}T${endTime}:00`);
    return formatSessionDuration(startAt.toISOString(), endAt.toISOString());
  }, [localDate, startTime, endTime]);

  useEffect(() => {
    api<{ items: Doctor[] }>('/clinic/doctors?status=ACTIVE&limit=100')
      .then((data) => setDoctors(data.items))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load doctors'));
  }, []);

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const created = await api<ConsultationSession>('/clinic/sessions', {
        method: 'POST',
        json: {
          ...values,
          location: values.location || undefined,
          internalNotes: values.internalNotes || undefined,
          timezone: 'Asia/Colombo',
        },
      });
      navigate(`/sessions/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create session');
    }
  });

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold tracking-[0.16em] text-teal-700 uppercase">
            Clinic Management / Sessions / New
          </p>
          <h1 className="text-2xl font-semibold text-slate-900">Create session</h1>
          <p className="text-sm text-muted-foreground">
            Define a consultation period. Patient bookings are not created in this milestone.
          </p>
        </div>
        <Link to="/sessions">
          <Button variant="outline" type="button">
            <ArrowLeft className="size-4" />
            Back
          </Button>
        </Link>
      </div>

      <Card className="shadow-none">
        <CardContent className="pt-6">
          <form className="space-y-6" onSubmit={onSubmit} noValidate>
            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Doctor & date</h2>
                <p className="text-xs text-muted-foreground">Who is available and on which day</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Doctor</Label>
                  <Select
                    value={form.watch('doctorId') || undefined}
                    onValueChange={(v) => form.setValue('doctorId', v, { shouldValidate: true })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select doctor" />
                    </SelectTrigger>
                    <SelectContent>
                      {doctors.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.displayName}
                          {d.specialization ? ` · ${d.specialization}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.formState.errors.doctorId ? (
                    <p className="mt-1 text-xs text-red-700">
                      {form.formState.errors.doctorId.message}
                    </p>
                  ) : null}
                </div>
                <div>
                  <Label htmlFor="localDate">Consultation date</Label>
                  <Input id="localDate" type="date" {...form.register('localDate')} />
                </div>
              </div>
            </section>

            <Separator />

            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Time & availability</h2>
                <p className="text-xs text-muted-foreground">Asia/Colombo · duration calculated automatically</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="startTime">Start</Label>
                  <Input id="startTime" type="time" {...form.register('startTime')} />
                </div>
                <div>
                  <Label htmlFor="endTime">End</Label>
                  <Input id="endTime" type="time" {...form.register('endTime')} />
                </div>
                <div>
                  <Label>Session duration</Label>
                  <Input value={durationLabel} readOnly disabled />
                </div>
              </div>
            </section>

            <Separator />

            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Capacity</h2>
                <p className="text-xs text-muted-foreground">Maximum patients for this consultation period</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="capacity">Maximum patients</Label>
                  <Input
                    id="capacity"
                    type="number"
                    {...form.register('capacity', { valueAsNumber: true })}
                  />
                </div>
                <div>
                  <Label htmlFor="expectedDurationMinutes">Expected consult (min)</Label>
                  <Input
                    id="expectedDurationMinutes"
                    type="number"
                    {...form.register('expectedDurationMinutes', { valueAsNumber: true })}
                  />
                </div>
              </div>
            </section>

            <Separator />

            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Additional information</h2>
              </div>
              <div>
                <Label htmlFor="location">Location (optional)</Label>
                <Input id="location" {...form.register('location')} />
              </div>
              <div>
                <Label htmlFor="internalNotes">Internal notes (optional)</Label>
                <Input id="internalNotes" {...form.register('internalNotes')} />
              </div>
            </section>

            {error ? <p className="text-sm text-red-700">{error}</p> : null}

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Creating…' : 'Create Session'}
              </Button>
              <Link to="/sessions">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
