import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Stethoscope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { SessionCancelDialog } from '@/features/sessions/components/SessionCancelDialog';
import { SessionStatusBadge } from '@/features/sessions/components/SessionStatusBadge';
import {
  formatSessionDate,
  formatSessionDuration,
  formatSessionTime,
} from '@/features/sessions/utils/session-formatters';
import { canModifySession } from '@/features/sessions/utils/session-status';
import { api, ApiError } from '@/lib/api';
import type { ConsultationSession } from '@/lib/clinic-types';

export function SessionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const [session, setSession] = useState<ConsultationSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(search.get('edit') === '1');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [localDate, setLocalDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [capacity, setCapacity] = useState(20);
  const [duration, setDuration] = useState(10);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!id) return;
    try {
      const data = await api<ConsultationSession>(`/clinic/sessions/${id}`);
      setSession(data);
      setLocalDate(data.localDate);
      setStartTime(
        new Date(data.startAt).toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: data.timezone || 'Asia/Colombo',
        }),
      );
      setEndTime(
        new Date(data.endAt).toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: data.timezone || 'Asia/Colombo',
        }),
      );
      setCapacity(data.capacity);
      setDuration(data.expectedDurationMinutes);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Session not found');
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-700">{error}</p>
        <Link to="/sessions">
          <Button type="button" variant="outline">
            Back to sessions
          </Button>
        </Link>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const canEdit = canModifySession(session.status, session.startAt);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold tracking-[0.16em] text-teal-700 uppercase">
            Clinic Management / Sessions / Detail
          </p>
          <h1 className="text-2xl font-semibold text-slate-900">Session detail</h1>
          <p className="text-sm text-muted-foreground">{session.doctorDisplayName}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/sessions">
            <Button variant="outline" type="button">
              <ArrowLeft className="size-4" />
              Back
            </Button>
          </Link>
          {session.status === 'SCHEDULED' || session.status === 'OPEN' ? (
            <Link
              to={`/appointments/new?sessionId=${session.id}&doctorId=${session.doctorId}`}
            >
              <Button type="button">Book Appointment</Button>
            </Link>
          ) : null}
          <Link to={`/sessions/${session.id}/queue`}>
            <Button type="button" variant="secondary">
              Queue Board
            </Button>
          </Link>
          {canEdit ? (
            <Button type="button" variant="secondary" onClick={() => setEditing((v) => !v)}>
              <Pencil className="size-4" />
              {editing ? 'Close editor' : 'Edit'}
            </Button>
          ) : null}
        </div>
      </div>

      <Card className="shadow-none">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <SessionStatusBadge status={session.status} />
          <p className="text-xs text-muted-foreground">{session.timezone}</p>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">Doctor</p>
              <p className="font-medium">{session.doctorDisplayName}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Date</p>
              <p className="font-medium">
                {formatSessionDate(session.localDate, session.timezone)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Time</p>
              <p className="font-medium">
                {formatSessionTime(session.startAt, session.endAt, session.timezone)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Session duration</p>
              <p className="font-medium">
                {formatSessionDuration(session.startAt, session.endAt)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Capacity</p>
              <p className="font-medium">{session.capacity} patients</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Expected consult</p>
              <p className="font-medium">{session.expectedDurationMinutes} min</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Location</p>
              <p className="font-medium">{session.location ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Internal notes</p>
              <p className="font-medium">{session.internalNotes ?? '—'}</p>
            </div>
          </div>
          {session.cancellationReason ? (
            <>
              <Separator />
              <p>
                <span className="text-muted-foreground">Cancellation reason:</span>{' '}
                {session.cancellationReason}
              </p>
            </>
          ) : null}
        </CardContent>
      </Card>

      {editing && canEdit ? (
        <Card className="shadow-none">
          <CardHeader>
            <h2 className="font-semibold">Edit session</h2>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label>Date</Label>
                <Input type="date" value={localDate} onChange={(e) => setLocalDate(e.target.value)} />
              </div>
              <div>
                <Label>Start</Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div>
                <Label>End</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Capacity</Label>
                <Input
                  type="number"
                  value={capacity}
                  onChange={(e) => setCapacity(Number(e.target.value))}
                />
              </div>
              <div>
                <Label>Expected consult (min)</Label>
                <Input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                />
              </div>
            </div>
            {error ? <p className="text-sm text-red-700">{error}</p> : null}
            <Button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  const updated = await api<ConsultationSession>(`/clinic/sessions/${session.id}`, {
                    method: 'PATCH',
                    json: {
                      localDate,
                      startTime,
                      endTime,
                      capacity,
                      expectedDurationMinutes: duration,
                      version: session.version,
                    },
                  });
                  setSession(updated);
                  setEditing(false);
                } catch (err) {
                  setError(err instanceof ApiError ? err.message : 'Update failed');
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save changes
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {canEdit ? (
          <Button type="button" variant="destructive" onClick={() => setCancelOpen(true)}>
            Cancel session
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          onClick={() => navigate(`/doctors/${session.doctorId}`)}
        >
          <Stethoscope className="size-4" />
          View doctor
        </Button>
      </div>

      <SessionCancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        doctorName={session.doctorDisplayName ?? 'this doctor'}
        onConfirm={async (reason) => {
          const updated = await api<ConsultationSession>(
            `/clinic/sessions/${session.id}/cancel`,
            { method: 'POST', json: { reason } },
          );
          setSession(updated);
        }}
      />
    </div>
  );
}
