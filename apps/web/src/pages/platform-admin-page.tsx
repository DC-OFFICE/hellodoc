import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, Building2, CheckCircle2, Clock3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TablePagination } from '@/components/ui/table-pagination';
import { api, ApiError } from '@/lib/api';

type Registration = {
  id: string;
  clinicName: string;
  ownerName: string;
  email: string;
  mobile: string;
  status: string;
  createdAt: string;
  tenant?: { id: string; status: string; provisioningStatus: string; schemaName: string } | null;
};

type ClinicRow = {
  id: string;
  clinicName: string;
  status: string;
  smsEnabled?: boolean;
  provisioningStatus: string;
  createdAt: string;
  registration?: { email: string; mobile: string; ownerName: string } | null;
};

type Totals = { total: number; pending: number; active: number; suspended: number; failed: number };

type Page<T> = { items: T[]; total: number; limit: number; offset: number };

function statusTone(status: string): 'pending' | 'active' | 'suspended' | 'failed' | 'rejected' | 'default' {
  const s = status.toLowerCase();
  if (s.includes('pending')) return 'pending';
  if (s.includes('active') || s.includes('approved')) return 'active';
  if (s.includes('suspend')) return 'suspended';
  if (s.includes('fail')) return 'failed';
  if (s.includes('reject')) return 'rejected';
  return 'default';
}

export function PlatformAdminPage() {
  const [actionError, setActionError] = useState<string | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [regTotal, setRegTotal] = useState(0);
  const [regTab, setRegTab] = useState<'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED'>('PENDING_APPROVAL');
  const [regLimit, setRegLimit] = useState(10);
  const [regOffset, setRegOffset] = useState(0);

  const [clinics, setClinics] = useState<ClinicRow[]>([]);
  const [clinicTotal, setClinicTotal] = useState(0);
  const [clinicTab, setClinicTab] = useState<'ACTIVE' | 'PROVISIONING' | 'SUSPENDED'>('ACTIVE');
  const [clinicLimit, setClinicLimit] = useState(10);
  const [clinicOffset, setClinicOffset] = useState(0);
  const [totals, setTotals] = useState<Totals>({ total: 0, pending: 0, active: 0, suspended: 0, failed: 0 });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [section, setSection] = useState<'registrations' | 'clinics'>('registrations');

  const loadRegistrations = useCallback(async () => {
    const params = new URLSearchParams({
      status: regTab,
      limit: String(regLimit),
      offset: String(regOffset),
    });
    const data = await api<Page<Registration>>(`/platform/registrations?${params}`);
    if (data.items.length === 0 && regOffset > 0) {
      setRegOffset(Math.max(0, regOffset - regLimit));
      return;
    }
    setRegistrations(data.items);
    setRegTotal(data.total);
  }, [regTab, regOffset, regLimit]);

  const loadClinics = useCallback(async () => {
    const params = new URLSearchParams({
      status: clinicTab,
      limit: String(clinicLimit),
      offset: String(clinicOffset),
    });
    const data = await api<Page<ClinicRow> & { totals: Totals }>(`/platform/clinics?${params}`);
    if (data.items.length === 0 && clinicOffset > 0) {
      setClinicOffset(Math.max(0, clinicOffset - clinicLimit));
      return;
    }
    setClinics(data.items);
    setClinicTotal(data.total);
    setTotals(data.totals);
  }, [clinicTab, clinicOffset, clinicLimit]);

  const reload = useCallback(async () => {
    setActionError(null);
    const results = await Promise.allSettled([loadRegistrations(), loadClinics()]);
    const rejections = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (rejections.length > 0) {
      const firstReason = rejections[0].reason;
      const msg =
        firstReason instanceof ApiError
          ? firstReason.message
          : firstReason instanceof Error
            ? firstReason.message
            : 'Failed to load platform data';
      setActionError(msg);
    }
  }, [loadRegistrations, loadClinics]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const stats = [
    { label: 'Registered clinics', value: totals.total, icon: Building2 },
    { label: 'Pending registrations', value: totals.pending, icon: Clock3 },
    { label: 'Active clinics', value: totals.active, icon: CheckCircle2 },
    { label: 'Suspended clinics', value: totals.suspended, icon: Ban },
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Clinics</h1>
        <p className="text-sm text-muted-foreground">
          Review registrations, approve clinics, and manage status.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((item) => (
          <Card key={item.label}>
            <CardHeader className="pb-3">
              <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <item.icon className="size-4" />
              </div>
              <CardDescription>{item.label}</CardDescription>
              <CardTitle className="text-3xl">{item.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      {actionError ? (
        <div className="flex items-center justify-between rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          <span>{actionError}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void reload()}>
            Retry
          </Button>
        </div>
      ) : null}

      <Tabs value={section} onValueChange={(value) => setSection(value as typeof section)}>
        <TabsList>
          <TabsTrigger value="registrations">Clinic registrations</TabsTrigger>
          <TabsTrigger value="clinics">Clinics</TabsTrigger>
        </TabsList>
        <TabsContent value="registrations">
      <Card className="overflow-hidden">
        <CardHeader className="gap-4">
          <CardTitle>Clinic registrations</CardTitle>
          <Tabs
            value={regTab}
            onValueChange={(value) => {
              setRegTab(value as typeof regTab);
              setRegOffset(0);
            }}
          >
            <TabsList>
              <TabsTrigger value="PENDING_APPROVAL">Pending</TabsTrigger>
              <TabsTrigger value="APPROVED">Approved</TabsTrigger>
              <TabsTrigger value="REJECTED">Rejected</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="px-0 pt-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Clinic</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Registered</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Schema</TableHead>
                <TableHead>Provisioning</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {registrations.map((reg) => (
                <TableRow key={reg.id} className="align-top">
                  <TableCell className="whitespace-normal">
                    {reg.tenant?.id ? (
                      <Link
                        to={`/platform-admin/clinics/${reg.tenant.id}`}
                        className="font-medium text-foreground hover:underline"
                      >
                        {reg.clinicName}
                      </Link>
                    ) : (
                      <div className="font-medium text-foreground">{reg.clinicName}</div>
                    )}
                    <div className="text-xs text-muted-foreground">{reg.ownerName}</div>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <div>{reg.email}</div>
                    <div className="text-xs text-muted-foreground">{reg.mobile}</div>
                  </TableCell>
                  <TableCell>{new Date(reg.createdAt).toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge tone={statusTone(reg.status)}>{reg.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs text-muted-foreground">
                      {reg.tenant?.schemaName ?? '—'}
                    </code>
                  </TableCell>
                  <TableCell>
                    <Badge
                      tone={statusTone(
                        reg.tenant?.provisioningStatus ?? reg.tenant?.status ?? 'pending',
                      )}
                    >
                      {reg.tenant?.provisioningStatus ?? reg.tenant?.status ?? 'NOT_STARTED'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      {reg.status === 'PENDING_APPROVAL' ? (
                        <>
                          <Button
                            size="sm"
                            type="button"
                            disabled={busyId === reg.id}
                            onClick={async () => {
                              setBusyId(reg.id);
                              setActionError(null);
                              try {
                                await api(`/platform/registrations/${reg.id}/approve`, {
                                  method: 'POST',
                                  json: {},
                                });
                                await reload();
                              } catch (error) {
                                setActionError(
                                  error instanceof ApiError ? error.message : 'Approval failed',
                                );
                              } finally {
                                setBusyId(null);
                              }
                            }}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            type="button"
                            disabled={busyId === reg.id}
                            onClick={async () => {
                              setBusyId(reg.id);
                              setActionError(null);
                              try {
                                await api(`/platform/registrations/${reg.id}/reject`, {
                                  method: 'POST',
                                  json: { reason: 'Rejected by administrator' },
                                });
                                await reload();
                              } catch (error) {
                                setActionError(
                                  error instanceof ApiError ? error.message : 'Reject failed',
                                );
                              } finally {
                                setBusyId(null);
                              }
                            }}
                          >
                            Reject
                          </Button>
                        </>
                      ) : null}
                      {reg.tenant?.status === 'ACTIVE' ? (
                        <Button
                          size="sm"
                          variant="destructive"
                          type="button"
                          disabled={busyId === reg.tenant.id}
                          onClick={async () => {
                            setBusyId(reg.tenant!.id);
                            setActionError(null);
                            try {
                              await api(`/platform/clinics/${reg.tenant!.id}/suspend`, {
                                method: 'POST',
                                json: {},
                              });
                              await reload();
                            } catch (error) {
                              setActionError(
                                error instanceof ApiError ? error.message : 'Suspend failed',
                              );
                            } finally {
                              setBusyId(null);
                            }
                          }}
                        >
                          Suspend
                        </Button>
                      ) : null}
                      {reg.tenant?.status === 'SUSPENDED' ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          type="button"
                          disabled={busyId === reg.tenant.id}
                          onClick={async () => {
                            setBusyId(reg.tenant!.id);
                            setActionError(null);
                            try {
                              await api(`/platform/clinics/${reg.tenant!.id}/reactivate`, {
                                method: 'POST',
                                json: {},
                              });
                              await reload();
                            } catch (error) {
                              setActionError(
                                error instanceof ApiError ? error.message : 'Reactivate failed',
                              );
                            } finally {
                              setBusyId(null);
                            }
                          }}
                        >
                          Reactivate
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {registrations.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    No registrations in this tab.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
          <div className="border-t border-border/70 bg-muted/20 px-4 py-3">
            <TablePagination
              total={regTotal}
              limit={regLimit}
              offset={regOffset}
              pageSizeOptions={[10, 20, 30, 50]}
              onPageChange={setRegOffset}
              onLimitChange={(newLimit) => {
                setRegLimit(newLimit);
                setRegOffset(0);
              }}
            />
          </div>
        </CardContent>
      </Card>
        </TabsContent>
        <TabsContent value="clinics">
      <Card className="overflow-hidden">
        <CardHeader className="gap-4">
          <div>
            <CardTitle>Clinics</CardTitle>
            <CardDescription>Open a clinic to see its profile and SMS history.</CardDescription>
          </div>
          <Tabs
            value={clinicTab}
            onValueChange={(value) => {
              setClinicTab(value as typeof clinicTab);
              setClinicOffset(0);
            }}
          >
            <TabsList>
              <TabsTrigger value="ACTIVE">Approved</TabsTrigger>
              <TabsTrigger value="PROVISIONING">Pending</TabsTrigger>
              <TabsTrigger value="SUSPENDED">Suspended</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="px-0 pt-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Clinic</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>SMS</TableHead>
                <TableHead>Provisioning</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clinics.map((clinic) => (
                <TableRow key={clinic.id}>
                  <TableCell>
                    <Link
                      to={`/platform-admin/clinics/${clinic.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {clinic.clinicName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge tone={statusTone(clinic.status)}>{clinic.status}</Badge>
                  </TableCell>
                  <TableCell>
                    {clinic.smsEnabled ? (
                      <Badge tone="active">Active</Badge>
                    ) : (
                      <Badge tone="suspended">Disabled</Badge>
                    )}
                  </TableCell>
                  <TableCell>{clinic.provisioningStatus}</TableCell>
                  <TableCell>
                    <Button asChild size="sm" variant="ghost">
                      <Link to={`/platform-admin/clinics/${clinic.id}`}>View</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {clinics.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No clinics in this tab.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
          <div className="border-t border-border/70 bg-muted/20 px-4 py-3">
            <TablePagination
              total={clinicTotal}
              limit={clinicLimit}
              offset={clinicOffset}
              pageSizeOptions={[10, 20, 30, 50]}
              onPageChange={setClinicOffset}
              onLimitChange={(newLimit) => {
                setClinicLimit(newLimit);
                setClinicOffset(0);
              }}
            />
          </div>
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
