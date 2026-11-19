import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { addDaysIso, clinicTodayIso } from '@/features/sessions/utils/session-formatters';
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

export function AppointmentFormPage() {
  const [params] = useSearchParams();
  const idempotencyKeyRef = useRef(crypto.randomUUID());

  const [patientQ, setPatientQ] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorId, setDoctorId] = useState(params.get('doctorId') ?? '');
  const [sessionDate, setSessionDate] = useState(clinicTodayIso());
  const [sessions, setSessions] = useState<ConsultationSession[]>([]);
  const [sessionId, setSessionId] = useState(params.get('sessionId') ?? '');
  const [availability, setAvailability] = useState<SessionAvailability | null>(null);
  const [bookingSource, setBookingSource] = useState<'PHONE' | 'WALK_IN'>('PHONE');
  const [notes, setNotes] = useState('');
  const [step, setStep] = useState<'form' | 'confirm' | 'done'>('form');
  const [created, setCreated] = useState<Appointment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api<{ items: Doctor[] }>('/clinic/doctors?status=ACTIVE&limit=100')
      .then((data) => setDoctors(data.items))
      .catch(() => setDoctors([]));
  }, []);

  useEffect(() => {
    const patientId = params.get('patientId');
    if (!patientId) return;
    api<Patient>(`/clinic/patients/${patientId}`)
      .then((p) => setSelectedPatient(p))
      .catch(() => undefined);
  }, [params]);

  useEffect(() => {
    if (!doctorId) {
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
  }, [doctorId, sessionDate]);

  useEffect(() => {
    if (!sessionId) {
      setAvailability(null);
      return;
    }
    api<SessionAvailability>(`/clinic/sessions/${sessionId}/availability`)
      .then(setAvailability)
      .catch(() => setAvailability(null));
  }, [sessionId]);

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
          `/clinic/patients?${new URLSearchParams({ q: patientQ.trim(), status: 'ACTIVE', limit: '20' })}`,
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
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Booking failed');
      // Refresh availability after conflict
      if (sessionId) {
        api<SessionAvailability>(`/clinic/sessions/${sessionId}/availability`)
          .then(setAvailability)
          .catch(() => undefined);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (step === 'done' && created) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Card>
          <CardHeader>
            <h1 className="text-2xl font-semibold text-slate-900">Appointment confirmed</h1>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-4xl font-semibold tracking-wider text-teal-800">
              #{created.queueDisplay}
            </p>
            <p>
              <span className="text-slate-500">Booking ref:</span> {created.bookingReference}
            </p>
            <p>
              <span className="text-slate-500">Patient:</span> {created.patientFullName} (
              {created.patientNumber})
            </p>
            <p>
              <span className="text-slate-500">Doctor:</span> {created.doctorDisplayName}
            </p>
            <p>
              <span className="text-slate-500">Date:</span> {created.localDate}
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <Link to={`/appointments/${created.id}`}>
                <Button type="button">View appointment</Button>
              </Link>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setStep('form');
                  setCreated(null);
                  setSelectedPatient(null);
                  setSessionId('');
                }}
              >
                Book another
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Book appointment</h1>
          <p className="text-sm text-slate-600">
            Select patient and consultation session. Queue numbers are assigned by the server.
          </p>
        </div>
        <Link to="/appointments">
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </Link>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Booking issue</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {step === 'form' ? (
        <>
          <Card>
            <CardHeader>
              <h2 className="font-semibold">1. Patient</h2>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Name / patient ID</Label>
                  <Input value={patientQ} onChange={(e) => setPatientQ(e.target.value)} />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={patientPhone}
                    onChange={(e) => setPatientPhone(e.target.value)}
                    placeholder="0771234567"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" disabled={searching} onClick={() => void searchPatients()}>
                  {searching ? 'Searching…' : 'Search patients'}
                </Button>
                <Link to={`/patients/new?returnTo=${encodeURIComponent('/appointments/new')}`}>
                  <Button type="button" variant="outline">
                    Register new patient
                  </Button>
                </Link>
              </div>
              {patientResults.length > 0 ? (
                <ul className="space-y-2">
                  {patientResults.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                          selectedPatient?.id === p.id
                            ? 'border-teal-600 bg-teal-50'
                            : 'border-border bg-white'
                        }`}
                        onClick={() => setSelectedPatient(p)}
                      >
                        <span className="font-medium">{p.fullName}</span>
                        <span className="ml-2 font-mono text-xs text-slate-500">{p.patientNumber}</span>
                        <span className="mt-0.5 block text-xs text-slate-600">
                          {p.primaryContact?.displayValue ?? 'No phone'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {selectedPatient ? (
                <div className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm">
                  Selected: <strong>{selectedPatient.fullName}</strong> ({selectedPatient.patientNumber})
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="font-semibold">2. Doctor & session</h2>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Doctor</Label>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-white px-3 text-sm"
                    value={doctorId}
                    onChange={(e) => {
                      setDoctorId(e.target.value);
                      setSessionId('');
                    }}
                  >
                    <option value="">Select doctor</option>
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.displayName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>From date</Label>
                  <Input
                    type="date"
                    value={sessionDate}
                    onChange={(e) => setSessionDate(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label>Available session</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-white px-3 text-sm"
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value)}
                  disabled={!sessions.length}
                >
                  <option value="">Select session</option>
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {formatSessionLabel(s)} · cap {s.capacity}
                    </option>
                  ))}
                </select>
              </div>
              {availability ? (
                <p className="text-sm text-slate-600">
                  Remaining places: <strong>{availability.remaining}</strong> / {availability.capacity}
                  {availability.bookable ? '' : ' · not bookable'}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="font-semibold">3. Booking details</h2>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Booking source</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-white px-3 text-sm"
                  value={bookingSource}
                  onChange={(e) => setBookingSource(e.target.value as 'PHONE' | 'WALK_IN')}
                >
                  <option value="PHONE">Phone</option>
                  <option value="WALK_IN">Walk-in</option>
                </select>
              </div>
              <div>
                <Label>Internal notes (optional)</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <Button type="button" onClick={goConfirm}>
                Review booking
              </Button>
            </CardContent>
          </Card>
        </>
      ) : null}

      {step === 'confirm' && selectedPatient && selectedSession ? (
        <Card>
          <CardHeader>
            <h2 className="font-semibold">4. Confirm appointment</h2>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-slate-500">Patient:</span> {selectedPatient.fullName} (
              {selectedPatient.patientNumber})
            </p>
            <p>
              <span className="text-slate-500">Doctor:</span>{' '}
              {selectedSession.doctorDisplayName ?? doctors.find((d) => d.id === doctorId)?.displayName}
            </p>
            <p>
              <span className="text-slate-500">Session:</span> {formatSessionLabel(selectedSession)}
            </p>
            <p>
              <span className="text-slate-500">Source:</span> {bookingSource}
            </p>
            <p className="text-xs text-slate-500">
              Availability snapshot: {availability?.remaining ?? '—'} remaining. Revalidated on submit.
            </p>
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setStep('form')} disabled={submitting}>
                Back
              </Button>
              <Button type="button" onClick={() => void submit()} disabled={submitting}>
                {submitting ? 'Booking…' : 'Confirm Appointment'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
