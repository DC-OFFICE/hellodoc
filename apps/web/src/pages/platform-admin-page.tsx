import { useCallback, useEffect, useState } from 'react';
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

type ClinicsResponse = {
  totals: { total: number; pending: number; active: number; suspended: number; failed: number };
  clinics: Array<{
    id: string;
    clinicName: string;
    status: string;
    provisioningStatus: string;
    createdAt: string;
    registration?: { email: string; mobile: string; ownerName: string } | null;
  }>;
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

export function PlatformAdminPage() {
  const [actionError, setActionError] = useState<string | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [clinicsData, setClinicsData] = useState<ClinicsResponse | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [regs, clinics] = await Promise.all([
      api<Registration[]>('/platform/registrations'),
      api<ClinicsResponse>('/platform/clinics'),
    ]);
    setRegistrations(regs);
    setClinicsData(clinics);
  }, []);

  useEffect(() => {
    void load().catch(() => setActionError('Failed to load platform data'));
  }, [load]);

  const totals = clinicsData?.totals ?? { total: 0, pending: 0, active: 0, suspended: 0, failed: 0 };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-slate-900">Clinics</h1>
        <p className="mt-2 text-slate-600">Review registrations, approve clinics, and manage status.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Registered clinics', totals.total],
          ['Pending registrations', totals.pending],
          ['Active clinics', totals.active],
          ['Suspended clinics', totals.suspended],
        ].map(([label, value]) => (
          <Card key={label as string}>
            <CardContent>
              <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{label}</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {actionError ? <p className="text-sm text-red-700">{actionError}</p> : null}

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Clinic registrations</h2>
        </CardHeader>
        <CardContent>
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
                    <div className="font-medium text-slate-900">{reg.clinicName}</div>
                    <div className="text-xs text-slate-500">{reg.ownerName}</div>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <div>{reg.email}</div>
                    <div className="text-xs text-slate-500">{reg.mobile}</div>
                  </TableCell>
                  <TableCell>{new Date(reg.createdAt).toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge tone={statusTone(reg.status)}>{reg.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs text-slate-600">
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
                                await load();
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
                                await load();
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
                            try {
                              await api(`/platform/clinics/${reg.tenant!.id}/suspend`, {
                                method: 'POST',
                                json: {},
                              });
                              await load();
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
                            try {
                              await api(`/platform/clinics/${reg.tenant!.id}/reactivate`, {
                                method: 'POST',
                                json: {},
                              });
                              await load();
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
                  <TableCell colSpan={7} className="py-8 text-center text-slate-500">
                    No registrations yet.
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
