import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { addDaysIso, clinicTodayIso } from '@/features/sessions/utils/session-formatters';
import { useIsMobile } from '@/hooks/use-mobile';
import { PatientFormDialog } from '@/components/patient-form-dialog';
import { api, ApiError } from '@/lib/api';
import type {
  Appointment,
  ConsultationSession,
  Doctor,
  Patient,
  SessionAvailability,
} from '@/lib/clinic-types';

function formatSessionLabel(session: ConsultationSession) {
  const start = new Date(session.startAt).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  const end = new Date(session.endAt).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  return `${session.localDate} · ${start} – ${end}`;
}

export type AppointmentBookingDefaults = {
  patientId?: string;
  doctorId?: string;
  sessionId?: string;
};

export function AppointmentBookingDialog({
  open,
  onOpenChange,
  defaults,
  onBooked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaults?: AppointmentBookingDefaults;
  onBooked?: () => void;
}) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const idempotencyKeyRef = useRef(crypto.randomUUID());

  const [patientQ, setPatientQ] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorId, setDoctorId] = useState('');
  const [sessionDate, setSessionDate] = useState(clinicTodayIso());
  const [sessions, setSessions] = useState<ConsultationSession[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [availability, setAvailability] = useState<SessionAvailability | null>(null);
  const [bookingSource, setBookingSource] = useState<'PHONE' | 'WALK_IN'>('PHONE');
  const [notes, setNotes] = useState('');
  const [step, setStep] = useState<'form' | 'confirm' | 'done'>('form');
  const [created, setCreated] = useState<Appointment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [registerPatientOpen, setRegisterPatientOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setStep('form');
    setCreated(null);
    setPatientQ('');
    setPatientPhone('');
    setPatientResults([]);
    setSelectedPatient(null);
    setDoctorId(defaults?.doctorId ?? '');
    setSessionId(defaults?.sessionId ?? '');
    setSessionDate(clinicTodayIso());
    setBookingSource('PHONE');
    setNotes('');
    setAvailability(null);
    idempotencyKeyRef.current = crypto.randomUUID();

    api<{ items: Doctor[] }>('/clinic/doctors?status=ACTIVE&limit=100')
      .then((data) => setDoctors(data.items))
      .catch(() => setDoctors([]));

    if (defaults?.patientId) {
      api<Patient>(`/clinic/patients/${defaults.patientId}`)
        .then((p) => setSelectedPatient(p))
        .catch(() => undefined);
    }
  }, [open, defaults?.patientId, defaults?.doctorId, defaults?.sessionId]);

  useEffect(() => {
    if (!open || !doctorId) {
      setSessions([]);
      return;
    }
    const to = addDaysIso(sessionDate, 14);
    const qs = new URLSearchParams({
      doctorId,
      status: 'SCHEDULED',
      from: sessionDate,
      to,
      limit: '50',
    });
    api<{ items: ConsultationSession[] }>(`/clinic/sessions?${qs}`)
      .then((data) => {
        const bookable = data.items.filter((s) => new Date(s.endAt).getTime() > Date.now());
        setSessions(bookable);
        if (sessionId && !bookable.some((s) => s.id === sessionId)) setSessionId('');
      })
      .catch(() => setSessions([]));
  }, [open, doctorId, sessionDate]);

  useEffect(() => {
    if (!open || !sessionId) {
      setAvailability(null);
      return;
    }
    api<SessionAvailability>(`/clinic/sessions/${sessionId}/availability`)
      .then(setAvailability)
      .catch(() => setAvailability(null));
  }, [open, sessionId]);

  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === sessionId) ?? null,
    [sessions, sessionId],
  );

  const searchPatients = async () => {
    setSearching(true);
    setError(null);
    try {
      if (patientPhone.trim()) {
        const data = await api<{ items: Patient[] }>('/clinic/patients/search', {
          method: 'POST',
          json: { phone: patientPhone.trim(), q: patientQ.trim() || undefined, status: 'ACTIVE' },
        });
        setPatientResults(data.items);
      } else if (patientQ.trim()) {
        const data = await api<{ items: Patient[] }>(
          `/clinic/patients?${new URLSearchParams({
            q: patientQ.trim(),
            status: 'ACTIVE',
            limit: '20',
          })}`,
        );
        setPatientResults(data.items);
      } else {
        setError('Enter a name/ID or phone number to search');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Patient search failed');
    } finally {
      setSearching(false);
    }
  };

  const goConfirm = () => {
    setError(null);
    if (!selectedPatient) {
      setError('Select a patient');
      return;
    }
    if (!sessionId || !availability?.bookable) {
      setError('Select a bookable session with remaining capacity');
      return;
    }
    setStep('confirm');
  };

  const submit = async () => {
    if (!selectedPatient || !sessionId) return;
    setSubmitting(true);
    setError(null);
    try {
      const appointment = await api<Appointment>('/clinic/appointments', {
        method: 'POST',
        json: {
          patientId: selectedPatient.id,
          sessionId,
          bookingSource,
          internalNotes: notes.trim() || undefined,
          idempotencyKey: idempotencyKeyRef.current,
        },
      });
      idempotencyKeyRef.current = crypto.randomUUID();
      setCreated(appointment);
      setStep('done');
      onBooked?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Booking failed');
      if (sessionId) {
        api<SessionAvailability>(`/clinic/sessions/${sessionId}/availability`)
          .then(setAvailability)
          .catch(() => undefined);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const body = (
    <div className="space-y-4">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Booking issue</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {step === 'done' && created ? (
        <div className="space-y-3 text-sm">
          <p className="text-4xl font-semibold tracking-wider text-primary">
            #{created.queueDisplay}
          </p>
          <p>
            <span className="text-muted-foreground">Booking ref:</span> {created.bookingReference}
          </p>
          <p>
            <span className="text-muted-foreground">Patient:</span> {created.patientFullName} (
            {created.patientNumber})
          </p>
          <p>
            <span className="text-muted-foreground">Doctor:</span> {created.doctorDisplayName}
          </p>
          <p>
            <span className="text-muted-foreground">Date:</span> {created.localDate}
          </p>
        </div>
      ) : null}

      {step === 'form' ? (
        <div className="space-y-5">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">1. Patient</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Name / patient ID</Label>
                <Input value={patientQ} onChange={(e) => setPatientQ(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input
                  value={patientPhone}
                  onChange={(e) => setPatientPhone(e.target.value)}
                  placeholder="0771234567"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={searching}
                onClick={() => void searchPatients()}
              >
                {searching ? 'Searching…' : 'Search patients'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setRegisterPatientOpen(true)}
              >
                + Register new patient
              </Button>
            </div>
            {patientResults.length > 0 ? (
              <ul className="space-y-2">
                {patientResults.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                        selectedPatient?.id === p.id
                          ? 'border-primary bg-primary/10'
                          : 'border-border bg-background'
                      }`}
                      onClick={() => setSelectedPatient(p)}
                    >
                      <span className="font-medium">{p.fullName}</span>
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
                        {p.patientNumber}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {p.primaryContact?.displayValue ?? 'No phone'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {selectedPatient ? (
              <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                Selected: <strong>{selectedPatient.fullName}</strong> (
                {selectedPatient.patientNumber})
              </div>
            ) : null}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">2. Doctor & session</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Doctor</Label>
                <Select
                  value={doctorId || undefined}
                  onValueChange={(value) => {
                    setDoctorId(value);
                    setSessionId('');
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select doctor" />
                  </SelectTrigger>
                  <SelectContent>
                    {doctors.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>From date</Label>
                <Input
                  type="date"
                  value={sessionDate}
                  onChange={(e) => setSessionDate(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Available session</Label>
              <Select
                value={sessionId || undefined}
                onValueChange={setSessionId}
                disabled={!sessions.length}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select session" />
                </SelectTrigger>
                <SelectContent>
                  {sessions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {formatSessionLabel(s)} · cap {s.capacity}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {availability ? (
              <p className="text-sm text-muted-foreground">
                Remaining places: <strong>{availability.remaining}</strong> /{' '}
                {availability.capacity}
                {availability.bookable ? '' : ' · not bookable'}
              </p>
            ) : null}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">3. Booking details</h3>
            <div className="space-y-1.5">
              <Label>Booking source</Label>
              <Select
                value={bookingSource}
                onValueChange={(value) => setBookingSource(value as 'PHONE' | 'WALK_IN')}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PHONE">Phone</SelectItem>
                  <SelectItem value="WALK_IN">Walk-in</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Internal notes (optional)</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </section>
        </div>
      ) : null}

      {step === 'confirm' && selectedPatient && selectedSession ? (
        <div className="space-y-2 text-sm">
          <h3 className="text-sm font-semibold">4. Confirm appointment</h3>
          <p>
            <span className="text-muted-foreground">Patient:</span> {selectedPatient.fullName} (
            {selectedPatient.patientNumber})
          </p>
          <p>
            <span className="text-muted-foreground">Doctor:</span>{' '}
            {selectedSession.doctorDisplayName ??
              doctors.find((d) => d.id === doctorId)?.displayName}
          </p>
          <p>
            <span className="text-muted-foreground">Session:</span>{' '}
            {formatSessionLabel(selectedSession)}
          </p>
          <p>
            <span className="text-muted-foreground">Source:</span> {bookingSource}
          </p>
          <p className="text-xs text-muted-foreground">
            Availability snapshot: {availability?.remaining ?? '—'} remaining. Revalidated on
            submit.
          </p>
        </div>
      ) : null}
    </div>
  );

  const actions =
    step === 'done' && created ? (
      <>
        <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
          Close
        </Button>
        <Button
          type="button"
          onClick={() => {
            onOpenChange(false);
            navigate(`/appointments/${created.id}`);
          }}
        >
          View appointment
        </Button>
      </>
    ) : step === 'confirm' ? (
      <>
        <Button type="button" variant="secondary" onClick={() => setStep('form')} disabled={submitting}>
          Back
        </Button>
        <Button type="button" onClick={() => void submit()} disabled={submitting}>
          {submitting ? 'Booking…' : 'Confirm Appointment'}
        </Button>
      </>
    ) : (
      <>
        <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="button" onClick={goConfirm}>
          Review booking
        </Button>
      </>
    );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="flex max-h-[92vh] flex-col gap-0 p-0">
          <SheetHeader className="px-5 py-4 text-left">
            <SheetTitle>
              {step === 'done' ? 'Appointment confirmed' : 'Book appointment'}
            </SheetTitle>
            <SheetDescription>
              Select patient and consultation session. Queue numbers are assigned by the server.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-5 py-4">{body}</div>
          <SheetFooter className="px-5 py-4 sm:flex-row">{actions}</SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[90vh] w-full max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="px-6 pt-6 pb-2 text-left">
            <DialogTitle>
              {step === 'done' ? 'Appointment confirmed' : 'Book appointment'}
            </DialogTitle>
            <DialogDescription>
              Select patient and consultation session. Queue numbers are assigned by the server.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-2">{body}</div>
          <DialogFooter className="px-6 pt-2 pb-6">{actions}</DialogFooter>
        </DialogContent>
      </Dialog>

      <PatientFormDialog
        open={registerPatientOpen}
        onOpenChange={setRegisterPatientOpen}
        initialPhone={patientPhone}
        onSaved={(newPatient) => {
          setSelectedPatient(newPatient);
          setPatientResults((prev) => [newPatient, ...prev.filter((p) => p.id !== newPatient.id)]);
        }}
      />
    </>
  );
}
