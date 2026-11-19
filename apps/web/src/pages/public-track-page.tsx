import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

type TrackSnapshot = {
  revision: number;
  clinicName: string;
  doctorDisplayName: string | null;
  localDate: string;
  startAt: string;
  endAt: string;
  sessionStatus: string;
  yourQueueNumber: number;
  yourQueueDisplay: string;
  yourState: string | null;
  appointmentStatus: string;
  nowServingNumber: number | null;
  nowServingDisplay: string | null;
  nowServingState: string | null;
  peopleAhead: number | null;
  estimate: {
    available: boolean;
    label: string;
  };
  updatedAt: string;
};

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api';

export function PublicTrackPage() {
  const { token } = useParams();
  const [data, setData] = useState<TrackSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<'live' | 'polling' | 'offline'>('polling');

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/public/track/${encodeURIComponent(token)}`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        setError('This tracking link is invalid or expired.');
        setData(null);
        return;
      }
      const json = (await res.json()) as TrackSnapshot;
      setData(json);
      setError(null);
    } catch {
      setError('Unable to refresh tracking status.');
      setConnection('offline');
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!token) return;
    let es: EventSource | null = null;
    let pollTimer: number | undefined;

    const startPolling = () => {
      setConnection('polling');
      window.clearInterval(pollTimer);
      pollTimer = window.setInterval(() => {
        if (document.visibilityState === 'visible') void load();
      }, 12_000);
    };

    try {
      es = new EventSource(`${API_BASE}/public/track/${encodeURIComponent(token)}/events`);
      es.onopen = () => setConnection('live');
      es.addEventListener('queue', () => void load());
      es.onmessage = () => void load();
      es.onerror = () => {
        es?.close();
        startPolling();
      };
    } catch {
      startPolling();
    }

    return () => {
      es?.close();
      window.clearInterval(pollTimer);
    };
  }, [token, load]);

  if (error && !data) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md items-center px-4">
        <div className="w-full rounded-2xl border border-border bg-white p-6 text-center shadow-sm">
          <p className="text-lg font-semibold text-slate-900">Link unavailable</p>
          <p className="mt-2 text-sm text-slate-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-600">
        Loading your appointment…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-teal-50 to-slate-50 px-4 py-8">
      <div className="mx-auto max-w-md space-y-4">
        <header className="text-center">
          <p className="text-xs font-semibold tracking-[0.2em] text-teal-700 uppercase">HelloDoc</p>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">{data.clinicName}</h1>
          <p className="text-sm text-slate-600">{data.doctorDisplayName}</p>
        </header>

        <section className="rounded-2xl border border-teal-100 bg-white p-6 text-center shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Your appointment number</p>
          <p className="mt-2 text-5xl font-semibold tracking-wider text-teal-800">
            #{data.yourQueueDisplay}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {data.localDate} · status {data.yourState ?? data.appointmentStatus}
          </p>
        </section>

        <section className="rounded-2xl border border-border bg-white p-6 shadow-sm">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Now serving</p>
              <p className="mt-1 text-3xl font-semibold text-slate-900">
                {data.nowServingDisplay ? `#${data.nowServingDisplay}` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Estimated wait</p>
              <p className="mt-2 text-sm font-medium text-slate-800">
                {data.estimate.available ? data.estimate.label : 'Estimated time currently unavailable'}
              </p>
            </div>
          </div>
          {data.peopleAhead != null ? (
            <p className="mt-4 text-center text-sm text-slate-600">
              About {data.peopleAhead} patient{data.peopleAhead === 1 ? '' : 's'} ahead
            </p>
          ) : null}
          {data.sessionStatus === 'PAUSED' || data.sessionStatus === 'DELAYED' ? (
            <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-center text-sm text-amber-800">
              Session is currently {data.sessionStatus.toLowerCase()}. Times may change.
            </p>
          ) : null}
        </section>

        <footer className="text-center text-xs text-slate-500">
          <p>Updates automatically · {connection}</p>
          <p className="mt-1">Last updated {new Date(data.updatedAt).toLocaleTimeString()}</p>
          <p className="mt-2">
            Waiting times are estimates. Emergencies and consultation length can affect timing.
          </p>
        </footer>
      </div>
    </div>
  );
}
