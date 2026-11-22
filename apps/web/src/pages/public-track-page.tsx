import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { notify } from '@/lib/notify';

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
  const lastToastRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/public/track/${encodeURIComponent(token)}`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        const message = 'This tracking link is invalid or expired.';
        setError(message);
        setData(null);
        if (lastToastRef.current !== message) {
          lastToastRef.current = message;
          notify.validation(message);
        }
        return;
      }
      const json = (await res.json()) as TrackSnapshot;
      setData(json);
      setError(null);
      lastToastRef.current = null;
    } catch {
      const message = 'Unable to refresh tracking status.';
      setError(message);
      setConnection('offline');
      if (lastToastRef.current !== message) {
        lastToastRef.current = message;
        notify.error(message);
      }
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
        <div className="w-full rounded-2xl border border-border bg-card text-card-foreground p-6 text-center shadow-sm">
          <p className="text-lg font-semibold text-foreground">Link unavailable</p>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading your appointment…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-md space-y-4">
        <header className="text-center">
          <p className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">HelloDoc</p>
          <h1 className="mt-1 text-xl font-semibold text-foreground">{data.clinicName}</h1>
          <p className="text-sm text-muted-foreground">{data.doctorDisplayName}</p>
        </header>

        <section className="rounded-2xl border border-teal-500/20 bg-card text-card-foreground p-6 text-center shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Your appointment number</p>
          <p className="mt-2 text-5xl font-semibold tracking-wider text-primary">
            #{data.yourQueueDisplay}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {data.localDate} · status {data.yourState ?? data.appointmentStatus}
          </p>
        </section>

        <section className="rounded-2xl border border-border bg-card text-card-foreground p-6 shadow-sm">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Now serving</p>
              <p className="mt-1 text-3xl font-semibold text-foreground">
                {data.nowServingDisplay ? `#${data.nowServingDisplay}` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Estimated wait</p>
              <p className="mt-2 text-sm font-medium text-foreground">
                {data.estimate.available ? data.estimate.label : 'Estimated time currently unavailable'}
              </p>
            </div>
          </div>
          {data.peopleAhead != null ? (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              About {data.peopleAhead} patient{data.peopleAhead === 1 ? '' : 's'} ahead
            </p>
          ) : null}
          {data.sessionStatus === 'PAUSED' || data.sessionStatus === 'DELAYED' ? (
            <p className="mt-3 rounded-md bg-amber-500/10 px-3 py-2 text-center text-sm text-amber-700 dark:text-amber-300">
              Session is currently {data.sessionStatus.toLowerCase()}. Times may change.
            </p>
          ) : null}
        </section>

        <footer className="text-center text-xs text-muted-foreground">
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
