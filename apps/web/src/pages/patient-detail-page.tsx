import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Calendar, MessageSquare, Plus, Receipt, Shield, Stethoscope, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  displayPatientAge,
  formatRegisteredDate,
} from '@/features/patients/utils/patient-display';
import { api, ApiError, openProtectedDocument } from '@/lib/api';
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

type AppointmentRow = {
  id: string;
  bookingReference: string;
  doctorName: string;
  doctorSpecialization?: string | null;
  sessionDate: string;
  sessionStartAt: string;
  queueNumber: number;
  queueDisplay: string;
  status: string;
};

type InvoiceRow = {
  id: string;
  invoiceNumber: string | null;
  status: string;
  invoiceTotal: string;
  paid: string;
  balance: string;
  settlement: string;
};

type EncounterRow = {
  id: string;
  appointment_id: string;
  status: string;
  chief_complaint: string | null;
  assessment: string | null;
  signed_at: string | null;
  created_at: string;
};

type ClinicalHistory = {
  encounters: EncounterRow[];
  history: Array<{ id: string; category: string; summary: string; created_at: string }>;
  allergies: {
    status: string;
    items: Array<{ substance: string; reaction: string | null; severity?: string | null }>;
  };
};

function statusTone(status: string) {
  const s = status.toUpperCase();
  if (s === 'ACTIVE' || s === 'CONFIRMED' || s === 'PAID' || s === 'SETTLED' || s === 'COMPLETED') {
    return 'active' as const;
  }
  if (s === 'SCHEDULED' || s === 'PENDING' || s === 'PARTIAL' || s === 'CALLED') {
    return 'pending' as const;
  }
  if (s === 'CANCELLED' || s === 'VOID' || s === 'INACTIVE' || s === 'SUSPENDED') {
    return 'suspended' as const;
  }
  return 'default' as const;
}

export function PatientDetailPage() {
  const { id } = useParams();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [sms, setSms] = useState<SmsRow[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [clinical, setClinical] = useState<ClinicalHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [showDeactivate, setShowDeactivate] = useState(false);

  const load = async () => {
    if (!id) return;
    setError(null);
    try {
      const [p, a, messages, appts] = await Promise.all([
        api<Patient>(`/clinic/patients/${id}`),
        api<{ items: AuditItem[] }>(`/clinic/patients/${id}/audit`).catch(() => ({ items: [] })),
        api<{ items: SmsRow[] }>(`/clinic/patients/${id}/notifications`).catch(() => ({ items: [] })),
        api<{ items: AppointmentRow[] }>(`/clinic/appointments?patientId=${id}&limit=50`).catch(() => ({ items: [] })),
      ]);
      setPatient(p);
      setAudit(a.items);
      setSms(messages.items);
      setAppointments(appts.items);

      if (p.patientNumber) {
        void api<{ items: InvoiceRow[] }>(`/clinic/invoices?q=${encodeURIComponent(p.patientNumber)}&limit=50`)
          .then((inv) => setInvoices(inv.items))
          .catch(() => setInvoices([]));
      }

      void api<ClinicalHistory>(`/clinic/patients/${id}/clinical-history`)
        .then((ch) => setClinical(ch))
        .catch(() => setClinical(null));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load patient registry');
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!patient) return <p className="text-sm text-muted-foreground">Loading patient record…</p>;

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
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs tracking-wider text-muted-foreground uppercase">{patient.patientNumber}</span>
            <Badge tone={statusTone(patient.status)}>{patient.status}</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground mt-1">
            {patient.preferredName || patient.fullName}
          </h1>
          {patient.preferredName ? (
            <p className="text-sm text-muted-foreground">Official: {patient.fullName}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {patient.status === 'ACTIVE' ? (
            <Link to={`/appointments/new?patientId=${patient.id}`}>
              <Button type="button" size="sm">
                <Plus className="size-3.5 mr-1" /> Book Appointment
              </Button>
            </Link>
          ) : null}
          <Link to={`/patients/${patient.id}/edit`}>
            <Button type="button" size="sm" variant="secondary">
              Edit Patient
            </Button>
          </Link>
          {patient.status === 'ACTIVE' ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => setShowDeactivate(true)}
            >
              Deactivate
            </Button>
          ) : (
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void onReactivate()}>
              Reactivate
            </Button>
          )}
          <Link to="/patients">
            <Button type="button" size="sm" variant="ghost">
              Back to directory
            </Button>
          </Link>
        </div>
      </div>

      {showDeactivate ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-base text-destructive">Confirm deactivation</CardTitle>
            <CardDescription>
              The patient record and number will be preserved. Please provide a reason for the audit trail.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="reason">Reason</Label>
              <Input
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Duplicate entry / patient moved away"
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="destructive" disabled={busy || reason.trim().length < 3} onClick={() => void onDeactivate()}>
                Confirm deactivate
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowDeactivate(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Registry Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1 p-1 bg-muted/60">
          <TabsTrigger value="overview" className="gap-1.5 text-xs sm:text-sm">
            <User className="size-3.5" /> Overview
          </TabsTrigger>
          <TabsTrigger value="visits" className="gap-1.5 text-xs sm:text-sm">
            <Calendar className="size-3.5" /> Visits ({appointments.length})
          </TabsTrigger>
          <TabsTrigger value="medical" className="gap-1.5 text-xs sm:text-sm">
            <Stethoscope className="size-3.5" /> Medical History
          </TabsTrigger>
          <TabsTrigger value="billing" className="gap-1.5 text-xs sm:text-sm">
            <Receipt className="size-3.5" /> Invoices ({invoices.length})
          </TabsTrigger>
          <TabsTrigger value="sms" className="gap-1.5 text-xs sm:text-sm">
            <MessageSquare className="size-3.5" /> SMS Logs ({sms.length})
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5 text-xs sm:text-sm">
            <Shield className="size-3.5" /> Audit Trail
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: OVERVIEW */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Personal details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p><span className="text-muted-foreground">Full name:</span> {patient.fullName}</p>
                <p><span className="text-muted-foreground">Preferred name:</span> {patient.preferredName ?? '—'}</p>
                <p><span className="text-muted-foreground">Age / DOB:</span> {displayPatientAge(patient)}</p>
                <p><span className="text-muted-foreground">Sex:</span> {patient.sex ?? '—'}</p>
                <p><span className="text-muted-foreground">Address:</span> {patient.address ?? '—'}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Contact information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {patient.contacts.length === 0 ? (
                  <p><span className="text-muted-foreground">Exception reason:</span> {patient.contactExceptionReason ?? '—'}</p>
                ) : (
                  patient.contacts.map((c) => (
                    <p key={c.id}>
                      <span className="text-muted-foreground">{c.contactType}:</span> {c.displayValue}
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
              <CardTitle className="text-base">Administrative details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
              <p><span className="text-muted-foreground">Registered on:</span> {formatRegisteredDate(patient.createdAt)}</p>
              <p><span className="text-muted-foreground">Last updated:</span> {formatRegisteredDate(patient.updatedAt)}</p>
              {patient.deactivationReason ? (
                <p className="sm:col-span-2 text-destructive">
                  <span className="font-medium">Deactivation reason:</span> {patient.deactivationReason}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: VISITS & APPOINTMENTS */}
        <TabsContent value="visits">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base">Appointment & Visit History</CardTitle>
                <CardDescription>All clinical sessions and queue tokens for this patient.</CardDescription>
              </div>
              <Link to={`/appointments/new?patientId=${patient.id}`}>
                <Button size="sm">
                  <Plus className="size-3.5 mr-1" /> New Appointment
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Queue #</TableHead>
                    <TableHead>Ref</TableHead>
                    <TableHead>Date / Time</TableHead>
                    <TableHead>Attending Doctor</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {appointments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        No appointments recorded for this patient yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    appointments.map((appt) => (
                      <TableRow key={appt.id}>
                        <TableCell className="font-semibold text-foreground">
                          {appt.queueDisplay || String(appt.queueNumber).padStart(3, '0')}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{appt.bookingReference}</TableCell>
                        <TableCell>{appt.sessionDate} {appt.sessionStartAt ? `(${appt.sessionStartAt})` : ''}</TableCell>
                        <TableCell>
                          <span className="font-medium">{appt.doctorName}</span>
                          {appt.doctorSpecialization ? (
                            <span className="text-xs text-muted-foreground block">{appt.doctorSpecialization}</span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Badge tone={statusTone(appt.status)}>{appt.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: MEDICAL HISTORY */}
        <TabsContent value="medical" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Allergy Status</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <p className="font-medium">
                Status: <Badge tone={clinical?.allergies.status === 'NO_KNOWN_ALLERGIES' ? 'active' : 'pending'}>{clinical?.allergies.status ?? 'UNKNOWN'}</Badge>
              </p>
              {clinical?.allergies.items && clinical.allergies.items.length > 0 ? (
                <div className="mt-3 space-y-1">
                  {clinical.allergies.items.map((item, idx) => (
                    <div key={idx} className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                      <strong>{item.substance}</strong>: {item.reaction ?? 'Reaction unspecified'}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mt-2">No known specific drug or food allergies recorded.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Consultations & Diagnosis Notes</CardTitle>
              <CardDescription>Clinical assessments and doctor notes recorded during visits.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!clinical?.encounters || clinical.encounters.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No signed consultations recorded yet.</p>
              ) : (
                clinical.encounters.map((enc) => (
                  <div key={enc.id} className="rounded-lg border p-4 space-y-2 bg-muted/10">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{new Date(enc.created_at).toLocaleDateString()}</span>
                      <Badge tone={statusTone(enc.status)}>{enc.status}</Badge>
                    </div>
                    {enc.chief_complaint ? (
                      <p className="text-sm">
                        <strong className="text-muted-foreground font-medium">Chief Complaint:</strong> {enc.chief_complaint}
                      </p>
                    ) : null}
                    {enc.assessment ? (
                      <p className="text-sm">
                        <strong className="text-teal-900 font-semibold">Diagnosis / Assessment:</strong>{' '}
                        <span className="font-medium text-foreground">{enc.assessment}</span>
                      </p>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 4: BILLING & INVOICES */}
        <TabsContent value="billing">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base">Invoices & Settlement Registry</CardTitle>
                <CardDescription>Past invoices, payments received, and outstanding balances.</CardDescription>
              </div>
              <Link to="/billing/invoices?create=1">
                <Button size="sm">
                  <Plus className="size-3.5 mr-1" /> New Invoice
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Total (LKR)</TableHead>
                    <TableHead>Paid (LKR)</TableHead>
                    <TableHead>Balance (LKR)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        No billing invoices created for this patient yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    invoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium text-foreground">
                          <Link to={`/billing/invoices/${inv.id}`} className="hover:underline">
                            {inv.invoiceNumber ?? 'Draft invoice'}
                          </Link>
                        </TableCell>
                        <TableCell>{inv.invoiceTotal}</TableCell>
                        <TableCell>{inv.paid}</TableCell>
                        <TableCell className={inv.balance !== '0.00' ? 'font-semibold text-amber-700' : ''}>
                          {inv.balance}
                        </TableCell>
                        <TableCell>
                          <Badge tone={statusTone(inv.status === 'ISSUED' ? inv.settlement : inv.status)}>
                            {inv.status === 'ISSUED' ? inv.settlement : inv.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() => void openProtectedDocument(`/clinic/invoices/${inv.id}/print`)}
                          >
                            Print bill
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 5: SMS LOGS */}
        <TabsContent value="sms">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Outbound SMS History</CardTitle>
              <CardDescription>All automated SMS notifications dispatched to this patient.</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              {sms.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No SMS messages dispatched to this patient yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Notification Event</TableHead>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Dispatched At</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sms.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.eventType}</TableCell>
                        <TableCell className="font-mono text-xs">{row.recipientMasked}</TableCell>
                        <TableCell>
                          <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                          {row.errorCategory ? (
                            <span className="block text-xs text-muted-foreground mt-0.5">{row.errorCategory}</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(row.createdAt).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 6: AUDIT TRAIL */}
        <TabsContent value="audit">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Security & Compliance Audit Log</CardTitle>
            </CardHeader>
            <CardContent>
              {audit.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No audit entries recorded.</p>
              ) : (
                <ul className="space-y-2 text-xs">
                  {audit.map((item) => (
                    <li key={item.id} className="rounded-md border p-2.5 flex items-center justify-between">
                      <span className="font-medium text-foreground">{item.action}</span>
                      <span className="text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
