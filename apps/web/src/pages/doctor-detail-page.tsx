import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, ApiError } from '@/lib/api';
import type { ConsultationSession, Doctor, ScheduleTemplate } from '@/lib/clinic-types';
import { WEEKDAYS } from '@/lib/clinic-types';

export function DoctorDetailPage() {
  const { id } = useParams();
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);
  const [upcoming, setUpcoming] = useState<ConsultationSession[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [scheduleMsg, setScheduleMsg] = useState<string | null>(null);
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 3, 5]);
  const [startTime, setStartTime] = useState('17:00');
  const [endTime, setEndTime] = useState('21:00');
  const [capacity, setCapacity] = useState(25);
  const [duration, setDuration] = useState(10);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!id) return;
    setError(null);
    try {
      const [d, t, s] = await Promise.all([
        api<Doctor>(`/clinic/doctors/${id}`),
        api<ScheduleTemplate[]>(`/clinic/doctors/${id}/schedule-templates`),
        api<{ items: ConsultationSession[] }>(
          `/clinic/sessions?doctorId=${id}&status=SCHEDULED&limit=20`,
        ),
      ]);
      setDoctor(d);
      setTemplates(t);
      setUpcoming(s.items.filter((x) => new Date(x.startAt).getTime() > Date.now()).slice(0, 10));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load doctor');
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!doctor) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{doctor.displayName}</h1>
          <p className="text-sm text-muted-foreground">{doctor.fullName}</p>
          <div className="mt-2">
            <Badge tone={doctor.status === 'ACTIVE' ? 'active' : 'suspended'}>{doctor.status}</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Link to={`/doctors?edit=${doctor.id}`}>
            <Button type="button" variant="secondary">Edit Profile</Button>
          </Link>
          <Link to={`/sessions?create=1&doctorId=${doctor.id}`}>
            <Button type="button">Create Session</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><h2 className="font-semibold">Profile</h2></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="text-muted-foreground">Registration:</span> {doctor.registrationNumber ?? '—'}</p>
            <p><span className="text-muted-foreground">Specialization:</span> {doctor.specialization ?? '—'}</p>
            <p><span className="text-muted-foreground">Qualifications:</span> {doctor.qualifications ?? '—'}</p>
            <p><span className="text-muted-foreground">Phone:</span> {doctor.contactNumber ?? '—'}</p>
            <p><span className="text-muted-foreground">Email:</span> {doctor.email ?? '—'}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><h2 className="font-semibold">Upcoming sessions</h2></CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming sessions.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Capacity</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {upcoming.map((session) => (
                    <TableRow key={session.id}>
                      <TableCell className="font-medium">{session.localDate}</TableCell>
                      <TableCell>
                        {new Date(session.startAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {' – '}
                        {new Date(session.endAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </TableCell>
                      <TableCell>{session.capacity}</TableCell>
                      <TableCell>
                        <Link to={`/sessions/${session.id}`}>
                          <Button size="sm" variant="outline" type="button">
                            View
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h2 className="font-semibold">Manage weekly schedule</h2>
          <p className="text-sm text-slate-600">
            Save weekdays and generate the next 90 days of consultation sessions.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            {WEEKDAYS.map((day) => (
              <label key={day.value} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedDays.includes(day.value)}
                  onChange={(e) => {
                    setSelectedDays((prev) =>
                      e.target.checked
                        ? [...prev, day.value]
                        : prev.filter((v) => v !== day.value),
                    );
                  }}
                />
                {day.label}
              </label>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <Label>Start</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div>
              <Label>End</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
            <div>
              <Label>Capacity</Label>
              <Input type="number" value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} />
            </div>
            <div>
              <Label>Duration (min)</Label>
              <Input type="number" value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
            </div>
          </div>
          {scheduleMsg ? <p className="text-sm text-primary">{scheduleMsg}</p> : null}
          <Button
            type="button"
            disabled={saving || selectedDays.length === 0 || doctor.status !== 'ACTIVE'}
            onClick={async () => {
              setSaving(true);
              setScheduleMsg(null);
              try {
                const today = new Date().toISOString().slice(0, 10);
                const result = await api<{
                  templates: ScheduleTemplate[];
                  materialize: { created: number; skippedExisting: number; skippedConflicts: number };
                }>(`/clinic/doctors/${doctor.id}/schedule-templates`, {
                  method: 'POST',
                  json: {
                    slots: selectedDays.map((weekday) => ({
                      weekday,
                      localStartTime: startTime,
                      localEndTime: endTime,
                    })),
                    effectiveFrom: today,
                    defaultCapacity: capacity,
                    expectedDurationMinutes: duration,
                    timezone: 'Asia/Colombo',
                    materialize: true,
                  },
                });
                setScheduleMsg(
                  `Saved ${result.templates.length} template(s). Generated ${result.materialize?.created ?? 0} sessions` +
                    ` (${result.materialize?.skippedExisting ?? 0} existing, ${result.materialize?.skippedConflicts ?? 0} conflicts).`,
                );
                await load();
              } catch (err) {
                setScheduleMsg(err instanceof ApiError ? err.message : 'Failed to save schedule');
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? 'Saving…' : 'Save schedule & generate 90 days'}
          </Button>

          {templates.length > 0 ? (
            <div className="space-y-3">
              <h3 className="font-medium">Current templates</h3>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Weekday</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">
                        {WEEKDAYS.find((d) => d.value === t.weekday)?.label}
                      </TableCell>
                      <TableCell>
                        {t.localStartTime}–{t.localEndTime}
                      </TableCell>
                      <TableCell>
                        <Badge tone={t.isActive ? 'active' : 'suspended'}>
                          {t.isActive ? 'ACTIVE' : 'INACTIVE'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {t.isActive ? (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              type="button"
                              onClick={async () => {
                                const result = await api<{ created: number }>(
                                  `/clinic/schedule-templates/${t.id}/materialize`,
                                  { method: 'POST', json: { horizonDays: 90 } },
                                );
                                setScheduleMsg(`Extended sessions: created ${result.created}`);
                                await load();
                              }}
                            >
                              Extend upcoming
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              type="button"
                              onClick={async () => {
                                await api(`/clinic/schedule-templates/${t.id}/deactivate`, {
                                  method: 'POST',
                                  json: {},
                                });
                                await load();
                              }}
                            >
                              Deactivate
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
