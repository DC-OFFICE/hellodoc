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
import {
  displayPatientAge,
  formatRegisteredDate,
} from '@/features/patients/utils/patient-display';
import { api, ApiError } from '@/lib/api';
import type { Patient } from '@/lib/clinic-types';

type AuditItem = {
  id: string;
  action: string;
  actorId: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
};

type SmsRow = {
  id: string;
  eventType: string;
  recipientMasked: string;
  status: string;
  errorCategory: string | null;
  createdAt: string;
};

export function PatientDetailPage() {
  const { id } = useParams();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [sms, setSms] = useState<SmsRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [showDeactivate, setShowDeactivate] = useState(false);

  const load = async () => {
    if (!id) return;
    setError(null);
    try {
      const [p, a, messages] = await Promise.all([
        api<Patient>(`/clinic/patients/${id}`),
        api<{ items: AuditItem[] }>(`/clinic/patients/${id}/audit`).catch(() => ({ items: [] })),
        api<{ items: SmsRow[] }>(`/clinic/patients/${id}/notifications`).catch(() => ({ items: [] })),
      ]);
      setPatient(p);
      setAudit(a.items);
      setSms(messages.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load patient');
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!patient) return <p className="text-sm text-slate-500">Loading…</p>;

  const onDeactivate = async () => {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      const updated = await api<Patient>(`/clinic/patients/${patient.id}/deactivate`, {
        method: 'POST',
        json: { reason: reason.trim() },
      });
      setPatient(updated);
      setShowDeactivate(false);
      setReason('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Deactivate failed');
    } finally {
      setBusy(false);
    }
  };

  const onReactivate = async () => {
    setBusy(true);
    try {
      const updated = await api<Patient>(`/clinic/patients/${patient.id}/reactivate`, {
        method: 'POST',
        json: {},
      });
      setPatient(updated);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Reactivate failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs tracking-wide text-slate-500">{patient.patientNumber}</p>
          <h1 className="text-2xl font-semibold text-slate-900">
            {patient.preferredName || patient.fullName}
          </h1>
          {patient.preferredName ? (
            <p className="text-sm text-slate-600">{patient.fullName}</p>
          ) : null}
          <div className="mt-2">
            <Badge tone={patient.status === 'ACTIVE' ? 'active' : 'suspended'}>
              {patient.status}
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {patient.status === 'ACTIVE' ? (
            <Link to={`/appointments?create=1&patientId=${patient.id}`}>
              <Button type="button">Book Appointment</Button>
            </Link>
          ) : null}
          <Link to={`/patients/${patient.id}/edit`}>
            <Button type="button" variant="secondary">
              Edit Patient
            </Button>
          </Link>
          {patient.status === 'ACTIVE' ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setShowDeactivate(true)}
            >
              Deactivate
            </Button>
          ) : (
            <Button type="button" variant="outline" disabled={busy} onClick={() => void onReactivate()}>
              Reactivate
            </Button>
          )}
          <Link to="/patients">
            <Button type="button" variant="outline">
              Back to directory
            </Button>
          </Link>
        </div>
      </div>

      {showDeactivate ? (
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Confirm deactivation</h2>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-600">
              The patient record and ID are retained. Provide a reason for the audit trail.
            </p>
            <div>
              <Label htmlFor="reason">Reason</Label>
              <Input
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Duplicate record / moved away"
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" disabled={busy || reason.trim().length < 3} onClick={() => void onDeactivate()}>
                Confirm deactivate
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowDeactivate(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Personal details</h2>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-slate-500">Full name:</span> {patient.fullName}
            </p>
            <p>
              <span className="text-slate-500">Preferred name:</span>{' '}
              {patient.preferredName ?? '—'}
            </p>
            <p>
              <span className="text-slate-500">Age / DOB:</span> {displayPatientAge(patient)}
            </p>
            <p>
              <span className="text-slate-500">Sex:</span> {patient.sex ?? '—'}
            </p>
            <p>
              <span className="text-slate-500">Address:</span> {patient.address ?? '—'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold">Contact information</h2>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {patient.contacts.length === 0 ? (
              <p>
                <span className="text-slate-500">No-contact reason:</span>{' '}
                {patient.contactExceptionReason ?? '—'}
              </p>
            ) : (
              patient.contacts.map((c) => (
                <p key={c.id}>
                  <span className="text-slate-500">{c.contactType}:</span> {c.displayValue}
                  {c.contactPersonName ? ` (${c.contactPersonName}` : ''}
                  {c.relationship ? ` · ${c.relationship}` : ''}
                  {c.contactPersonName ? ')' : ''}
                  {c.isPrimary ? ' · primary' : ''}
                </p>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h2 className="font-semibold">Administrative information</h2>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <p>
            <span className="text-slate-500">Registered:</span>{' '}
            {formatRegisteredDate(patient.createdAt)}
          </p>
          <p>
            <span className="text-slate-500">Last updated:</span>{' '}
            {formatRegisteredDate(patient.updatedAt)}
          </p>
          {patient.deactivationReason ? (
            <p className="sm:col-span-2">
              <span className="text-slate-500">Deactivation reason:</span>{' '}
              {patient.deactivationReason}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold">SMS history</h2>
        </CardHeader>
        <CardContent>
          {sms.length === 0 ? (
            <p className="text-sm text-slate-500">No SMS messages for this patient yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sms.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.eventType}</TableCell>
                    <TableCell className="font-mono text-xs">{row.recipientMasked}</TableCell>
                    <TableCell>
                      <Badge className="border border-border bg-transparent">{row.status}</Badge>
                      {row.errorCategory ? (
                        <p className="mt-1 text-xs text-muted-foreground">{row.errorCategory}</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm">{new Date(row.createdAt).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold">Audit history</h2>
        </CardHeader>
        <CardContent>
          {audit.length === 0 ? (
            <p className="text-sm text-slate-500">No audit events yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {audit.map((item) => (
                <li key={item.id} className="rounded-md border border-border px-3 py-2">
                  <p className="font-medium text-slate-900">{item.action}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(item.createdAt).toLocaleString()}
                    {item.metadata?.patientNumber
                      ? ` · ${String(item.metadata.patientNumber)}`
                      : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
