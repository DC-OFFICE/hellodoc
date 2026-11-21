import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError, openProtectedDocument } from '@/lib/api';

type Prescription = {
  id: string;
  status: string;
  version: number;
};

type Encounter = {
  id: string;
  status: string;
  version: number;
  patient_id: string;
  chief_complaint: string | null;
  history_present_illness: string | null;
  examination_findings: string | null;
  assessment: string | null;
  treatment_plan: string | null;
  follow_up_instructions: string | null;
  allergies: { status: string; items: Array<{ substance: string; reaction: string | null }> };
  prescription?: Prescription | null;
  vitals?: Array<{
    id: string;
    systolic_mmhg: number | null;
    diastolic_mmhg: number | null;
    pulse_bpm: number | null;
    temperature_c: string | number | null;
  }>;
};

const noteClass =
  'min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60';

function allergyLabel(status: string) {
  if (status === 'NO_KNOWN_ALLERGIES') return 'No known allergies';
  if (status === 'UNKNOWN') return 'Not assessed';
  return status.replaceAll('_', ' ');
}

export function ConsultationPage() {
  const { id } = useParams();
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [prescription, setPrescription] = useState<Prescription | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [medicine, setMedicine] = useState('');
  const [dose, setDose] = useState('');
  const [frequency, setFrequency] = useState('');
  const [systolic, setSystolic] = useState('');
  const [diastolic, setDiastolic] = useState('');
  const [pulse, setPulse] = useState('');
  const [temperature, setTemperature] = useState('');

  const load = async () => {
    if (!id) return;
    const data = await api<Encounter>(`/clinic/encounters/${id}`);
    setEncounter(data);
    if (data.prescription) setPrescription(data.prescription);
  };

  useEffect(() => {
    void load().catch((err) => setError(err instanceof ApiError ? err.message : 'Load failed'));
  }, [id]);

  if (!encounter) {
    return <p className="text-sm text-muted-foreground">{error ?? 'Loading consultation…'}</p>;
  }

  const locked = encounter.status !== 'DRAFT';
  const latestVitals = encounter.vitals?.[0];

  const setNote = (key: keyof Encounter, value: string) => {
    setEncounter({ ...encounter, [key]: value });
  };

  const saveDraft = async () => {
    setBusy(true);
    setError(null);
    try {
      const saved = await api<Encounter>(`/clinic/encounters/${encounter.id}/draft`, {
        method: 'POST',
        json: {
          version: encounter.version,
          chiefComplaint: encounter.chief_complaint,
          historyPresentIllness: encounter.history_present_illness,
          examinationFindings: encounter.examination_findings,
          assessment: encounter.assessment,
          treatmentPlan: encounter.treatment_plan,
          followUpInstructions: encounter.follow_up_instructions,
        },
      });
      setEncounter(saved);
      setMessage('Draft saved');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const signEncounter = async () => {
    setBusy(true);
    setError(null);
    try {
      const signed = await api<Encounter>(`/clinic/encounters/${encounter.id}/sign`, {
        method: 'POST',
        json: { version: encounter.version },
      });
      setEncounter(signed);
      setMessage('Consultation signed');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign failed');
    } finally {
      setBusy(false);
    }
  };

  const saveVitals = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/clinic/encounters/${encounter.id}/vitals`, {
        method: 'POST',
        json: {
          systolicMmhg: systolic === '' ? undefined : Number(systolic),
          diastolicMmhg: diastolic === '' ? undefined : Number(diastolic),
          pulseBpm: pulse === '' ? undefined : Number(pulse),
          temperatureC: temperature === '' ? undefined : Number(temperature),
        },
      });
      const refreshed = await api<Encounter>(`/clinic/encounters/${encounter.id}`);
      setEncounter((current) =>
        current
          ? {
              ...current,
              version: refreshed.version,
              vitals: refreshed.vitals,
              allergies: refreshed.allergies,
            }
          : refreshed,
      );
      setMessage('Vitals recorded');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Vitals save failed');
    } finally {
      setBusy(false);
    }
  };

  const markNoKnownAllergies = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/clinic/patients/${encounter.patient_id}/allergy-status`, {
        method: 'POST',
        json: { status: 'NO_KNOWN_ALLERGIES' },
      });
      await load();
      setMessage('Allergy status updated to no known allergies');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Allergy update failed');
    } finally {
      setBusy(false);
    }
  };

  const savePrescription = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await api<Prescription>(`/clinic/encounters/${encounter.id}/prescriptions`, {
        method: 'POST',
      });
      const drafted = await api<Prescription>(`/clinic/prescriptions/${created.id}/draft`, {
        method: 'POST',
        json: {
          version: created.version ?? 1,
          items: [{ medicineName: medicine, dose, frequency }],
        },
      });
      setPrescription(drafted);
      setMessage(`Prescription ${drafted.status.toLowerCase()}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Prescription draft failed');
    } finally {
      setBusy(false);
    }
  };

  const signPrescription = async () => {
    if (!prescription) return;
    setBusy(true);
    setError(null);
    try {
      const signed = await api<Prescription>(`/clinic/prescriptions/${prescription.id}/sign`, {
        method: 'POST',
        json: { version: prescription.version },
      });
      setPrescription(signed);
      setMessage(`Prescription ${signed.status.toLowerCase()}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Prescription sign failed');
    } finally {
      setBusy(false);
    }
  };

  const actions = !locked ? (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="secondary" disabled={busy} onClick={() => void saveDraft()}>
        Save draft
      </Button>
      <Button type="button" disabled={busy} className="text-white hover:text-white" onClick={() => void signEncounter()}>
        Review & sign
      </Button>
    </div>
  ) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Consultation</h1>
            <Badge tone={locked ? 'active' : 'pending'}>{encounter.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Record the clinical note, vitals, and prescription. Sign the consultation before signing a prescription.
          </p>
        </div>
        {actions}
      </div>

      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-primary">{message}</p>
      ) : null}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Clinical note</CardTitle>
              <CardDescription>Chief complaint through follow-up. Save the draft before you leave this page.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label htmlFor="chief-complaint">Chief complaint</Label>
                <textarea
                  id="chief-complaint"
                  className={`mt-1.5 ${noteClass}`}
                  disabled={locked}
                  value={encounter.chief_complaint ?? ''}
                  onChange={(event) => setNote('chief_complaint', event.target.value)}
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="history">History of present illness</Label>
                <textarea
                  id="history"
                  className={`mt-1.5 ${noteClass}`}
                  disabled={locked}
                  value={encounter.history_present_illness ?? ''}
                  onChange={(event) => setNote('history_present_illness', event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="examination">Examination findings</Label>
                <textarea
                  id="examination"
                  className={`mt-1.5 ${noteClass}`}
                  disabled={locked}
                  value={encounter.examination_findings ?? ''}
                  onChange={(event) => setNote('examination_findings', event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="assessment">Assessment</Label>
                <textarea
                  id="assessment"
                  className={`mt-1.5 ${noteClass}`}
                  disabled={locked}
                  value={encounter.assessment ?? ''}
                  onChange={(event) => setNote('assessment', event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="plan">Treatment plan</Label>
                <textarea
                  id="plan"
                  className={`mt-1.5 ${noteClass}`}
                  disabled={locked}
                  value={encounter.treatment_plan ?? ''}
                  onChange={(event) => setNote('treatment_plan', event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="follow-up">Follow-up</Label>
                <textarea
                  id="follow-up"
                  className={`mt-1.5 ${noteClass}`}
                  disabled={locked}
                  value={encounter.follow_up_instructions ?? ''}
                  onChange={(event) => setNote('follow_up_instructions', event.target.value)}
                />
              </div>
              {actions ? <div className="md:col-span-2 border-t border-border pt-4">{actions}</div> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle>Prescription</CardTitle>
                  <CardDescription>
                    {encounter.status === 'SIGNED'
                      ? 'Add the medicine, save a draft, then sign and print.'
                      : 'Available after the consultation is signed.'}
                  </CardDescription>
                </div>
                {prescription ? <Badge tone={prescription.status === 'SIGNED' ? 'active' : 'pending'}>{prescription.status}</Badge> : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor="medicine">Medicine</Label>
                  <Input id="medicine" className="mt-1.5" placeholder="Medicine name" value={medicine} onChange={(event) => setMedicine(event.target.value)} />
                </div>
                <div>
                  <Label htmlFor="dose">Dose</Label>
                  <Input id="dose" className="mt-1.5" placeholder="1 tablet" value={dose} onChange={(event) => setDose(event.target.value)} />
                </div>
                <div>
                  <Label htmlFor="frequency">Frequency</Label>
                  <Input id="frequency" className="mt-1.5" placeholder="Twice daily" value={frequency} onChange={(event) => setFrequency(event.target.value)} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={busy || encounter.status !== 'SIGNED' || medicine.trim() === ''} onClick={() => void savePrescription()}>
                  Save prescription draft
                </Button>
                <Button type="button" variant="secondary" disabled={busy || !prescription || prescription.status !== 'DRAFT'} onClick={() => void signPrescription()}>
                  Sign prescription
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!prescription || prescription.status !== 'SIGNED'}
                  onClick={async () => {
                    if (!prescription) return;
                    setError(null);
                    try {
                      await openProtectedDocument(`/clinic/prescriptions/${prescription.id}/print`, {
                        autoPrint: true,
                      });
                      setMessage('Prescription opened. Choose Save as PDF in the print dialog.');
                    } catch (err) {
                      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Print failed');
                    }
                  }}
                >
                  Print / Save PDF
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>Allergies</CardTitle>
                <Badge tone={encounter.allergies.status === 'UNKNOWN' ? 'pending' : 'active'}>
                  {allergyLabel(encounter.allergies.status)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {encounter.allergies.status === 'UNKNOWN' ? (
                <p className="text-muted-foreground">Confirm allergies before signing. Not assessed is not the same as no known allergies.</p>
              ) : null}
              {encounter.allergies.items.map((item) => (
                <p key={item.substance} className="rounded-lg border border-border bg-muted/40 px-3 py-2">
                  <span className="font-medium text-foreground">{item.substance}</span>
                  {item.reaction ? <span className="text-muted-foreground"> — {item.reaction}</span> : null}
                </p>
              ))}
              {encounter.allergies.items.length === 0 && encounter.allergies.status !== 'UNKNOWN' ? (
                <p className="text-muted-foreground">No active allergies recorded.</p>
              ) : null}
              {!locked && encounter.allergies.status !== 'NO_KNOWN_ALLERGIES' ? (
                <Button type="button" variant="outline" disabled={busy} onClick={() => void markNoKnownAllergies()}>
                  Mark no known allergies
                </Button>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Vitals</CardTitle>
              <CardDescription>Record the reading taken in this visit.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {latestVitals ? (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-muted/50 px-2 py-2">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">BP</p>
                    <p className="text-sm font-semibold text-foreground">
                      {latestVitals.systolic_mmhg ?? '—'}/{latestVitals.diastolic_mmhg ?? '—'}
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 px-2 py-2">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Pulse</p>
                    <p className="text-sm font-semibold text-foreground">{latestVitals.pulse_bpm ?? '—'}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 px-2 py-2">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Temp</p>
                    <p className="text-sm font-semibold text-foreground">{latestVitals.temperature_c ?? '—'}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No vitals recorded for this visit.</p>
              )}
              {!locked ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="systolic">Systolic</Label>
                      <Input id="systolic" className="mt-1.5" inputMode="numeric" placeholder="120" value={systolic} onChange={(event) => setSystolic(event.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="diastolic">Diastolic</Label>
                      <Input id="diastolic" className="mt-1.5" inputMode="numeric" placeholder="80" value={diastolic} onChange={(event) => setDiastolic(event.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="pulse">Pulse</Label>
                      <Input id="pulse" className="mt-1.5" inputMode="numeric" placeholder="72" value={pulse} onChange={(event) => setPulse(event.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="temperature">Temp °C</Label>
                      <Input id="temperature" className="mt-1.5" inputMode="decimal" placeholder="36.8" value={temperature} onChange={(event) => setTemperature(event.target.value)} />
                    </div>
                  </div>
                  <Button type="button" variant="secondary" disabled={busy} onClick={() => void saveVitals()}>
                    Save vitals
                  </Button>
                </>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
