import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, ApiError } from '@/lib/api';

type NotificationRow = {
  id: string;
  appointmentId: string | null;
  eventType: string;
  recipientMasked: string;
  status: string;
  attempts: number;
  providerName: string | null;
  errorCategory: string | null;
  estimatedCost: number | null;
  createdAt: string;
  updatedAt: string;
};

export function NotificationsPage() {
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (status) params.set('status', status);
      const data = await api<{ items: NotificationRow[] }>(`/clinic/notifications?${params}`);
      setItems(data.items);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load notifications');
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-teal-700 uppercase">
            Clinic / Communications
          </p>
          <h1 className="text-2xl font-semibold text-slate-900">SMS history</h1>
          <p className="text-sm text-muted-foreground">
            Delivery status for appointment messages. Tracking tokens are never shown.
          </p>
        </div>
        <Link to="/settings/notifications">
          <Button type="button" variant="outline">
            Notification settings
          </Button>
        </Link>
      </div>

      <Card className="shadow-none">
        <CardHeader className="flex flex-row items-center gap-3 pb-2">
          <select
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="PENDING">PENDING</option>
            <option value="SUBMITTED">SUBMITTED</option>
            <option value="DELIVERED">DELIVERED</option>
            <option value="FAILED">FAILED</option>
            <option value="UNCERTAIN">UNCERTAIN</option>
            <option value="SKIPPED">SKIPPED</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
          <Button type="button" variant="secondary" onClick={() => void load()}>
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {error ? <p className="mb-3 text-sm text-red-700">{error}</p> : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Created</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-sm">
                    <div className="font-medium">{row.eventType}</div>
                    {row.appointmentId ? (
                      <Link
                        className="text-xs text-teal-700 underline"
                        to={`/appointments/${row.appointmentId}`}
                      >
                        Appointment
                      </Link>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.recipientMasked}</TableCell>
                  <TableCell>
                    <Badge className="border border-border bg-transparent">{row.status}</Badge>
                    {row.errorCategory ? (
                      <p className="mt-1 text-xs text-muted-foreground">{row.errorCategory}</p>
                    ) : null}
                  </TableCell>
                  <TableCell>{row.attempts}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(row.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    {row.status === 'FAILED' || row.status === 'UNCERTAIN' ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busyId === row.id}
                        onClick={async () => {
                          setBusyId(row.id);
                          try {
                            await api(`/clinic/notifications/${row.id}/retry`, { method: 'POST' });
                            await load();
                          } catch (err) {
                            setError(err instanceof ApiError ? err.message : 'Retry failed');
                          } finally {
                            setBusyId(null);
                          }
                        }}
                      >
                        Retry
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    No SMS notifications yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
