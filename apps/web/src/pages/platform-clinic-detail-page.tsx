import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, ApiError } from '@/lib/api';

type ClinicDetail = {
  id: string;
  clinicName: string;
  slug: string;
  schemaName: string;
  status: string;
  smsEnabled: boolean;
  registrationStatus: string;
  provisioningStatus: string;
  createdAt: string;
  registration: {
    ownerName: string;
    email: string;
    mobile: string;
    address: string;
    status: string;
    createdAt: string;
    rejectionReason: string | null;
  } | null;
};

type NotificationRow = {
  id: string;
  eventType: string;
  recipientMasked: string;
  status: string;
  attempts: number;
  errorCategory: string | null;
  createdAt: string;
};

function statusTone(status: string): 'pending' | 'active' | 'suspended' | 'failed' | 'rejected' | 'default' {
  const s = status.toLowerCase();
  if (s.includes('pending')) return 'pending';
  if (s.includes('active') || s.includes('approved')) return 'active';
  if (s.includes('suspend')) return 'suspended';
  if (s.includes('fail')) return 'failed';
  if (s.includes('reject')) return 'rejected';
  return 'default';
}

function formatWhen(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

export function PlatformClinicDetailPage() {
  const { tenantId } = useParams();
  const [clinic, setClinic] = useState<ClinicDetail | null>(null);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadClinic = useCallback(async () => {
    if (!tenantId) return;
    const data = await api<ClinicDetail>(`/platform/clinics/${tenantId}`);
    setClinic(data);
  }, [tenantId]);

  const loadSms = useCallback(async () => {
    if (!tenantId) return;
    const params = new URLSearchParams({ limit: '50' });
    if (status) params.set('status', status);
    const data = await api<{ items: NotificationRow[] }>(
      `/platform/clinics/${tenantId}/notifications?${params}`,
    );
    setItems(data.items);
  }, [tenantId, status]);

  useEffect(() => {
    void Promise.all([loadClinic(), loadSms()])
      .then(() => setError(null))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load clinic'));
  }, [loadClinic, loadSms]);

  async function setClinicStatus(action: 'suspend' | 'reactivate') {
    if (!clinic) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/platform/clinics/${clinic.id}/${action}`, { method: 'POST', json: {} });
      await loadClinic();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  async function toggleSms(enabled: boolean) {
    if (!clinic) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ id: string; smsEnabled: boolean }>(`/platform/clinics/${clinic.id}/toggle-sms`, {
        method: 'POST',
        json: { enabled },
      });
      setClinic((c) => (c ? { ...c, smsEnabled: res.smsEnabled } : c));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update SMS setting');
    } finally {
      setBusy(false);
    }
  }

  if (!clinic && !error) {
    return <p className="text-sm text-muted-foreground">Loading clinic…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">{clinic?.clinicName ?? 'Clinic'}</h1>
          <div className="flex flex-wrap gap-2">
            {clinic ? <Badge tone={statusTone(clinic.status)}>{clinic.status}</Badge> : null}
            {clinic ? (
              <Badge tone={statusTone(clinic.registrationStatus)}>{clinic.registrationStatus}</Badge>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <Link to="/platform-admin">Back to clinics</Link>
          </Button>
          {clinic?.status === 'ACTIVE' ? (
            <Button type="button" variant="destructive" disabled={busy} onClick={() => void setClinicStatus('suspend')}>
              Suspend
            </Button>
          ) : null}
          {clinic?.status === 'SUSPENDED' ? (
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void setClinicStatus('reactivate')}>
              Reactivate
            </Button>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {clinic ? (
        <Card className="border-teal-200 bg-teal-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-teal-900">SMS Gateway Entitlement</CardTitle>
            <CardDescription>
              Platform Administrator decision: control whether this clinic can send automated SMS notifications to patients (booking confirmations, queue arrival time estimates, approaching turn alerts).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
            <div>
              <p className="font-medium text-sm text-foreground">
                Status: {clinic.smsEnabled ? 'SMS Gateway is ENABLED for this clinic' : 'SMS Gateway is DISABLED for this clinic'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {clinic.smsEnabled
                  ? 'Active — appointments booked at this clinic automatically trigger live arrival time SMS updates via SMSLenz.'
                  : 'Disabled — patients will NOT receive outbound SMS (queue tracking link is still available online).'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Switch
                id="clinic-sms-switch"
                checked={clinic.smsEnabled}
                disabled={busy}
                onCheckedChange={(val) => void toggleSms(val)}
              />
              <Label htmlFor="clinic-sms-switch" className="cursor-pointer text-sm font-semibold">
                {clinic.smsEnabled ? 'Enabled' : 'Disabled'}
              </Label>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {clinic ? (
        <Card>
          <CardHeader>
            <CardTitle>Clinic profile</CardTitle>
            <CardDescription>Registration and provisioning details for this clinic.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <p>
              <span className="text-muted-foreground">Owner</span>
              <span className="mt-1 block font-medium">{clinic.registration?.ownerName ?? '—'}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Email</span>
              <span className="mt-1 block font-medium">{clinic.registration?.email ?? '—'}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Mobile</span>
              <span className="mt-1 block font-medium">{clinic.registration?.mobile ?? '—'}</span>
            </p>
            <p className="sm:col-span-2">
              <span className="text-muted-foreground">Address</span>
              <span className="mt-1 block font-medium">{clinic.registration?.address ?? '—'}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Registered</span>
              <span className="mt-1 block font-medium">{formatWhen(clinic.registration?.createdAt ?? clinic.createdAt)}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Schema</span>
              <span className="mt-1 block font-mono text-xs">{clinic.schemaName}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Provisioning</span>
              <span className="mt-1 block">
                <Badge tone={statusTone(clinic.provisioningStatus)}>{clinic.provisioningStatus}</Badge>
              </span>
            </p>
            <p>
              <span className="text-muted-foreground">Slug</span>
              <span className="mt-1 block font-medium">{clinic.slug}</span>
            </p>
            {clinic.registration?.rejectionReason ? (
              <p className="sm:col-span-2">
                <span className="text-muted-foreground">Rejection reason</span>
                <span className="mt-1 block font-medium">{clinic.registration.rejectionReason}</span>
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>SMS history</CardTitle>
            <CardDescription>Masked numbers and delivery status. Message text stays encrypted.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
            <Button type="button" variant="secondary" onClick={() => void loadSms()}>
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.eventType}</TableCell>
                  <TableCell className="font-mono text-xs">{row.recipientMasked}</TableCell>
                  <TableCell>
                    <Badge className="border border-border bg-transparent">{row.status}</Badge>
                    {row.errorCategory ? (
                      <p className="mt-1 text-xs text-muted-foreground">{row.errorCategory}</p>
                    ) : null}
                  </TableCell>
                  <TableCell>{row.attempts}</TableCell>
                  <TableCell className="text-sm">{formatWhen(row.createdAt)}</TableCell>
                </TableRow>
              ))}
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No SMS messages for this clinic yet.
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
