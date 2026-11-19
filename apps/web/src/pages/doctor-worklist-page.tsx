import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';

type Item = {
  appointment_id: string;
  queue_number: number;
  full_name: string;
  patient_number: string;
  queue_state: string | null;
  encounter_id: string | null;
  encounter_status: string | null;
  start_at: string;
};

export function DoctorWorklistPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [clinicName, setClinicName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    try {
      const data = await api<{ clinicName: string; items: Item[] }>('/doctor/worklist');
      setItems(data.items);
      setClinicName(data.clinicName);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load worklist');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (error && items.length === 0) return <p className="text-sm text-red-700">{error}</p>;
  if (!clinicName && !error) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <p className="text-xs font-semibold tracking-[0.16em] text-teal-700 uppercase">Doctor</p>
        <h1 className="text-2xl font-semibold">Today&apos;s worklist</h1>
        <p className="text-sm text-muted-foreground">{clinicName}</p>
      </div>
      <Card className="shadow-none">
        <CardHeader className="pb-2">
          <h2 className="font-semibold">Assigned appointments</h2>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assigned appointments for today.</p>
          ) : null}
          {items.map((item) => (
            <div key={item.appointment_id} className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
              <div>
                <p className="font-medium">
                  #{String(item.queue_number).padStart(3, '0')} · {item.full_name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {item.patient_number} · Queue {item.queue_state ?? '—'} · Record {item.encounter_status ?? 'none'}
                </p>
              </div>
              {item.encounter_id ? (
                <Link to={`/consultations/${item.encounter_id}`}>
                  <Button type="button" variant="secondary">
                    {item.encounter_status === 'SIGNED' ? 'Review' : 'Continue draft'}
                  </Button>
                </Link>
              ) : (
                <Button
                  type="button"
                  disabled={busy === item.appointment_id}
                  onClick={async () => {
                    setBusy(item.appointment_id);
                    try {
                      const created = await api<{ id: string }>('/clinic/encounters', {
                        method: 'POST',
                        json: { appointmentId: item.appointment_id },
                      });
                      window.location.assign(`/consultations/${created.id}`);
                    } catch (err) {
                      setError(err instanceof ApiError ? err.message : 'Could not start consultation');
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  Start consultation
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
