import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { clinicTodayIso } from '@/features/sessions/utils/session-formatters';
import { api, ApiError } from '@/lib/api';
import type { Appointment, Doctor } from '@/lib/clinic-types';

function formatTimeRange(startAt: string | null, endAt: string | null) {
  if (!startAt || !endAt) return '—';
  const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: true };
  return `${new Date(startAt).toLocaleTimeString('en-US', opts)} – ${new Date(endAt).toLocaleTimeString('en-US', opts)}`;
}

export function AppointmentsPage() {
  const today = useMemo(() => clinicTodayIso(), []);
  const [items, setItems] = useState<Appointment[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [total, setTotal] = useState(0);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [doctorId, setDoctorId] = useState('');
  const [status, setStatus] = useState<'ALL' | 'CONFIRMED' | 'CANCELLED' | 'RESCHEDULED'>('CONFIRMED');
  const [q, setQ] = useState('');
  const [applied, setApplied] = useState<{
    from: string;
    to: string;
    doctorId: string;
    status: 'ALL' | 'CONFIRMED' | 'CANCELLED' | 'RESCHEDULED';
    q: string;
  }>({ from: today, to: today, doctorId: '', status: 'CONFIRMED', q: '' });
  const [offset, setOffset] = useState(0);
  const limit = 25;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        status: applied.status,
        from: applied.from,
        to: applied.to,
      });
      if (applied.doctorId) params.set('doctorId', applied.doctorId);
      if (applied.q.trim()) params.set('q', applied.q.trim());
      const data = await api<{ items: Appointment[]; total: number }>(
        `/clinic/appointments?${params}`,
      );
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load appointments');
    } finally {
      setLoading(false);
    }
  }, [applied, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    api<{ items: Doctor[] }>('/clinic/doctors?status=ACTIVE&limit=100')
      .then((data) => setDoctors(data.items))
      .catch(() => setDoctors([]));
  }, []);

  const page = Math.floor(offset / limit) + 1;
  const pageCount = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Appointments</h1>
          <p className="text-sm text-slate-600">
            Book patients into consultation sessions and manage queue numbers.
          </p>
        </div>
        <Link to="/appointments/new">
          <Button type="button">+ Book Appointment</Button>
        </Link>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          <div>
            <label className="mb-1 block text-xs text-slate-500">From</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">To</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Doctor</label>
            <select
              className="h-9 rounded-md border border-input bg-white px-3 text-sm"
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
            >
              <option value="">All doctors</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.displayName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Status</label>
            <select
              className="h-9 rounded-md border border-input bg-white px-3 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
            >
              <option value="CONFIRMED">Confirmed</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="RESCHEDULED">Rescheduled</option>
              <option value="ALL">All</option>
            </select>
          </div>
          <Input
            placeholder="Search patient / booking ref"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="lg:max-w-xs"
          />
          <Button
            type="button"
            onClick={() => {
              setOffset(0);
              setApplied({ from, to, doctorId, status, q });
            }}
          >
            Apply
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setFrom(today);
              setTo(today);
              setDoctorId('');
              setStatus('CONFIRMED');
              setQ('');
              setOffset(0);
              setApplied({ from: today, to: today, doctorId: '', status: 'CONFIRMED', q: '' });
            }}
          >
            Reset
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : null}
          {error ? (
            <div className="space-y-2">
              <p className="text-sm text-red-700">{error}</p>
              <Button type="button" variant="outline" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          ) : null}
          {!loading && !error && items.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-slate-500">No appointments found for these filters.</p>
              <Link to="/appointments/new" className="mt-3 inline-block">
                <Button type="button" variant="secondary">
                  Book appointment
                </Button>
              </Link>
            </div>
          ) : null}
          {items.length > 0 ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Queue</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Doctor</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Session</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono font-semibold tracking-wide">
                        {item.queueDisplay}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-slate-900">{item.patientFullName}</div>
                        <div className="font-mono text-xs text-slate-500">{item.patientNumber}</div>
                      </TableCell>
                      <TableCell>{item.doctorDisplayName ?? '—'}</TableCell>
                      <TableCell>{item.localDate ?? '—'}</TableCell>
                      <TableCell className="text-sm">
                        {formatTimeRange(item.startAt, item.endAt)}
                      </TableCell>
                      <TableCell>{item.bookingSource}</TableCell>
                      <TableCell>
                        <Badge
                          tone={
                            item.status === 'CONFIRMED'
                              ? 'active'
                              : item.status === 'CANCELLED'
                                ? 'suspended'
                                : 'pending'
                          }
                        >
                          {item.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Link to={`/appointments/${item.id}`}>
                          <Button size="sm" variant="outline" type="button">
                            View
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
                <p>
                  Showing {items.length} of {total}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={offset <= 0}
                    onClick={() => setOffset(Math.max(0, offset - limit))}
                  >
                    Previous
                  </Button>
                  <span>
                    Page {page} / {pageCount}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={offset + limit >= total}
                    onClick={() => setOffset(offset + limit)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
