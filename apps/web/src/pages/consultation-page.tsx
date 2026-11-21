import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError, openProtectedDocument } from '@/lib/api';

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
  vitals?: Array<{
    id: string;
    systolic_mmhg: number | null;
    diastolic_mmhg: number | null;
    pulse_bpm: number | null;
    temperature_c: string | number | null;
  }>;
};

type Prescription = {
  id: string;
  status: string;
  version: number;
};

export function ConsultationPage() {
  const { id } = useParams();
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [prescription, setPrescription] = useState<Prescription | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [medicine, setMedicine] = useState('Demo tablet');
  const [dose, setDose] = useState('1 tablet');
  const [frequency, setFrequency] = useState('Twice daily');
  const [systolic, setSystolic] = useState('120');
  const [diastolic, setDiastolic] = useState('80');
  const [pulse, setPulse] = useState('72');
  const [temperature, setTemperature] = useState('36.8');

  const load = async () => {
    if (!id) return;
    const data = await api<Encounter>(`/clinic/encounters/${id}`);
    setEncounter(data);
  };

  useEffect(() => {
    void load().catch((err) => setError(err instanceof ApiError ? err.message : 'Load failed'));
  }, [id]);

  if (!encounter) return <p className="text-sm text-muted-foreground">{error ?? 'Loading consultation…'}</p>;
  const locked = encounter.status !== 'DRAFT';

  const field = (key: keyof Encounter, label: string) => (
    <div>
      <Label>{label}</Label>
      <textarea
        className="mt-1 min-h-20 w-full rounded-md border px-3 py-2 text-sm"
        disabled={locked}
        value={(encounter[key] as string | null) ?? ''}
        onChange={(e) => setEncounter({ ...encounter, [key]: e.target.value })}
      />
    </div>
  );

  return (
    <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[280px_1fr]">
      <div className="space-y-4">
        <Card className="h-fit shadow-none">
          <CardHeader className="pb-2">
            <h2 className="font-semibold">Allergies</h2>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Status: {encounter.allergies.status}</p>
            {encounter.allergies.status === 'UNKNOWN' ? (
              <p className="text-amber-800">UNKNOWN is not the same as no known allergies.</p>
            ) : null}
            {encounter.allergies.items.map((item) => (
              <p key={item.substance}>
                {item.substance}
                {item.reaction ? ` — ${item.reaction}` : ''}
              </p>
            ))}
            {encounter.allergies.items.length === 0 ? (
              <p className="text-muted-foreground">Allergy status has not been assessed.</p>
            ) : null}
            {!locked ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await api(`/clinic/patients/${encounter.patient_id}/allergy-status`, {
                      method: 'POST',
                      json: { status: 'NO_KNOWN_ALLERGIES' },
                    });
                    await load();
                    setMessage('Allergy status updated to NO KNOWN ALLERGIES');
                  } catch (err) {
                    setError(err instanceof ApiError ? err.message : 'Allergy update failed');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Mark no known allergies
              </Button>
            ) : null}
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader className="pb-2">
            <h2 className="font-semibold">Vitals</h2>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {(encounter.vitals ?? []).map((item) => (
              <p key={item.id}>
                BP {item.systolic_mmhg}/{item.diastolic_mmhg} · Pulse {item.pulse_bpm} · Temp {item.temperature_c}
              </p>
            ))}
            {!locked ? (
              <>
                <Label htmlFor="systolic">Systolic</Label>
                <Input id="systolic" value={systolic} onChange={(e) => setSystolic(e.target.value)} />
                <Label htmlFor="diastolic">Diastolic</Label>
                <Input id="diastolic" value={diastolic} onChange={(e) => setDiastolic(e.target.value)} />
                <Label htmlFor="pulse">Pulse</Label>
                <Input id="pulse" value={pulse} onChange={(e) => setPulse(e.target.value)} />
                <Label htmlFor="temperature">Temperature °C</Label>
                <Input id="temperature" value={temperature} onChange={(e) => setTemperature(e.target.value)} />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      await api(`/clinic/encounters/${encounter.id}/vitals`, {
                        method: 'POST',
                        json: {
                          systolicMmhg: Number(systolic),
                          diastolicMmhg: Number(diastolic),
                          pulseBpm: Number(pulse),
                          temperatureC: Number(temperature),
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
                  }}
                >
                  Save vitals
                </Button>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Consultation</h1>
          <span className="text-sm">{encounter.status}</span>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {message ? <p className="text-sm text-primary">{message}</p> : null}
        {field('chief_complaint', 'Chief complaint')}
        {field('history_present_illness', 'History of present illness')}
        {field('examination_findings', 'Examination findings')}
        {field('assessment', 'Assessment')}
        {field('treatment_plan', 'Treatment plan')}
        {field('follow_up_instructions', 'Follow-up')}
        {!locked ? (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={async () => {
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
              }}
            >
              Save draft
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={async () => {
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
              }}
            >
              Review & sign
            </Button>
          </div>
        ) : null}
        <Card className="shadow-none">
          <CardHeader className="pb-2">
            <h2 className="font-semibold">Prescription</h2>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-3">
            <Input aria-label="Medicine name" value={medicine} onChange={(e) => setMedicine(e.target.value)} />
            <Input aria-label="Dose" value={dose} onChange={(e) => setDose(e.target.value)} />
            <Input aria-label="Frequency" value={frequency} onChange={(e) => setFrequency(e.target.value)} />
            <div className="flex flex-wrap gap-2 sm:col-span-3">
              <Button
                type="button"
                disabled={busy || encounter.status !== 'SIGNED'}
                onClick={async () => {
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
                    setMessage(`Prescription ${drafted.status}`);
                  } catch (err) {
                    setError(err instanceof ApiError ? err.message : 'Prescription draft failed');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Save prescription draft
              </Button>
              <Button
                type="button"
                disabled={busy || !prescription || prescription.status !== 'DRAFT'}
                onClick={async () => {
                  if (!prescription) return;
                  setBusy(true);
                  setError(null);
                  try {
                    const signed = await api<Prescription>(`/clinic/prescriptions/${prescription.id}/sign`, {
                      method: 'POST',
                      json: { version: prescription.version },
                    });
                    setPrescription(signed);
                    setMessage(`Prescription ${signed.status}`);
                  } catch (err) {
                    setError(err instanceof ApiError ? err.message : 'Prescription sign failed');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Sign prescription
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!prescription || prescription.status !== 'SIGNED'}
                onClick={async () => {
                  if (!prescription) return;
                  try {
                    await openProtectedDocument(`/clinic/prescriptions/${prescription.id}/print`);
                  } catch (err) {
                    setError(err instanceof ApiError ? err.message : 'Print failed');
                  }
                }}
              >
                Print prescription
              </Button>
            </div>
            {prescription ? <p className="sm:col-span-3 text-sm">Prescription status: {prescription.status}</p> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
