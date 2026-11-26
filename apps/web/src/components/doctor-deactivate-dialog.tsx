import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api, ApiError } from '@/lib/api';
import type { Doctor } from '@/lib/clinic-types';

type FutureSessions = {
  unbookedCount: number;
  booked: Array<{ id: string; localDate: string; startAt: string; endAt: string; bookings: number }>;
};

function timeRange(startAt: string, endAt: string) {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Colombo' });
  return `${fmt(startAt)}–${fmt(endAt)}`;
}

/**
 * Deactivating a doctor: future sessions without bookings can be cancelled in the same step.
 * Sessions that already have booked patients must be handled first in Sessions.
 */
export function DoctorDeactivateDialog({
  doctor,
  onOpenChange,
  onDeactivated,
}: {
  doctor: Doctor | null;
  onOpenChange: (open: boolean) => void;
  onDeactivated: (message: string) => void;
}) {
  const [future, setFuture] = useState<FutureSessions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setFuture(null);
    setError(null);
    if (!doctor) return;
    api<FutureSessions>(`/clinic/doctors/${doctor.id}/future-sessions`, { toast: false })
      .then(setFuture)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load future sessions'));
  }, [doctor]);

  const blocked = Boolean(future && future.booked.length > 0);

  const deactivate = async () => {
    if (!doctor || !future) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ cancelledSessions: number }>(`/clinic/doctors/${doctor.id}/deactivate`, {
        method: 'POST',
        json: { cancelFutureSessions: future.unbookedCount > 0 },
        toast: false,
      });
      onDeactivated(
        result.cancelledSessions > 0
          ? `${doctor.displayName} deactivated. Cancelled ${result.cancelledSessions} future session(s).`
          : `${doctor.displayName} deactivated.`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Deactivation failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={Boolean(doctor)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Deactivate {doctor?.displayName}</DialogTitle>
          <DialogDescription>
            An inactive doctor cannot be booked and gets no new sessions from weekly schedules.
          </DialogDescription>
        </DialogHeader>

        {!future && !error ? <p className="text-sm text-muted-foreground">Checking future sessions…</p> : null}

        {future ? (
          <div className="space-y-3 text-sm">
            {future.unbookedCount > 0 ? (
              <p>
                <strong>{future.unbookedCount}</strong> future scheduled session(s) have no bookings. They will be
                cancelled, and this doctor&apos;s weekly schedule templates will be set to inactive.
              </p>
            ) : null}
            {future.unbookedCount === 0 && !blocked ? <p>This doctor has no future scheduled sessions.</p> : null}
            {blocked ? (
              <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                <p className="font-medium">
                  {future.booked.length} future session(s) already have booked patients. Reschedule or cancel those
                  appointments and sessions first, then deactivate the doctor.
                </p>
                <ul className="space-y-1">
                  {future.booked.map((s) => (
                    <li key={s.id}>
                      <Link className="underline" to={`/sessions/${s.id}`}>
                        {s.localDate} · {timeRange(s.startAt, s.endAt)}
                      </Link>{' '}
                      · {s.bookings} booking(s)
                    </li>
                  ))}
                </ul>
                <Link className="inline-block font-medium underline" to={`/sessions?doctorId=${doctor?.id}`}>
                  Open this doctor&apos;s sessions
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy || !future || blocked}
            onClick={() => void deactivate()}
          >
            {busy
              ? 'Deactivating…'
              : future && future.unbookedCount > 0
                ? `Cancel ${future.unbookedCount} session(s) & deactivate`
                : 'Deactivate doctor'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
