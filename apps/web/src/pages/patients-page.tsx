import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PatientFormDialog } from '@/components/patient-form-dialog';
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
import { TablePagination } from '@/components/ui/table-pagination';
import {
  displayPatientAge,
  formatRegisteredDate,
} from '@/features/patients/utils/patient-display';
import { api, ApiError } from '@/lib/api';
import type { Patient } from '@/lib/clinic-types';

export function PatientsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<Patient[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [limit, setLimit] = useState(10);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<{
    q: string;
    phone: string;
    status: 'ALL' | 'ACTIVE' | 'INACTIVE';
  }>({ q: '', phone: '', status: 'ACTIVE' });

  // Dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [editingPatientId, setEditingPatientId] = useState<string | null>(null);

  const createParam = searchParams.get('create') === '1';
  const editParam = searchParams.get('edit');

  useEffect(() => {
    if (createParam) {
      setEditingPatientId(null);
      setFormOpen(true);
    } else if (editParam) {
      setEditingPatientId(editParam);
      setFormOpen(true);
    }
  }, [createParam, editParam]);

  const openCreate = useCallback(() => {
    setEditingPatientId(null);
    setFormOpen(true);
    const next = new URLSearchParams(searchParams);
    next.set('create', '1');
    next.delete('edit');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const openEdit = useCallback(
    (id: string) => {
      setEditingPatientId(id);
      setFormOpen(true);
      const next = new URLSearchParams(searchParams);
      next.set('edit', id);
      next.delete('create');
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const closeForm = useCallback(
    (open: boolean) => {
      setFormOpen(open);
      if (!open) {
        setEditingPatientId(null);
        const next = new URLSearchParams(searchParams);
        next.delete('create');
        next.delete('edit');
        setSearchParams(next, { replace: true });
      }
    },
    [searchParams, setSearchParams],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const usePhoneSearch = Boolean(applied.phone.trim());
      const data = usePhoneSearch
        ? await api<{ items: Patient[]; total: number }>('/clinic/patients/search', {
            method: 'POST',
            json: {
              phone: applied.phone.trim() || undefined,
              q: applied.q.trim() || undefined,
              status: applied.status,
              limit,
              offset,
            },
          })
        : await api<{ items: Patient[]; total: number }>(
            `/clinic/patients?${new URLSearchParams({
              status: applied.status,
              limit: String(limit),
              offset: String(offset),
              ...(applied.q.trim() ? { q: applied.q.trim() } : {}),
              sortBy: 'createdAt',
              sortDir: 'desc',
            })}`,
          );
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load patients');
    } finally {
      setLoading(false);
    }
  }, [applied, limit, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Patients</h1>
          <p className="text-sm text-muted-foreground">
            Register, search and manage your clinic&apos;s patient records.
          </p>
        </div>
        <Button type="button" onClick={openCreate}>
          + Register Patient
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
          <Input
            placeholder="Search name or patient ID"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="lg:max-w-xs"
          />
          <Input
            placeholder="Phone (e.g. 0771234567)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="lg:max-w-xs"
          />
          <select
            className="h-9 rounded-md border border-input bg-background text-foreground px-3 text-sm shadow-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
          >
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="ALL">All</option>
          </select>
          <Button
            type="button"
            onClick={() => {
              setOffset(0);
              setApplied({ q, phone, status });
            }}
          >
            Apply
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setQ('');
              setPhone('');
              setStatus('ACTIVE');
              setOffset(0);
              setApplied({ q: '', phone: '', status: 'ACTIVE' });
            }}
          >
            Clear
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : null}
          {error ? (
            <div className="space-y-2">
              <p className="text-sm text-destructive">{error}</p>
              <Button type="button" variant="secondary" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          ) : null}
          {!loading && !error && items.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-muted-foreground">No patients found.</p>
              <div className="mt-3">
                <Button type="button" variant="secondary" onClick={openCreate}>
                  Register first patient
                </Button>
              </div>
            </div>
          ) : null}
          {items.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-border/80 bg-card shadow-2xs">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Patient ID</TableHead>
                    <TableHead>Patient Name</TableHead>
                    <TableHead>Age / DOB</TableHead>
                    <TableHead>Primary Contact</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Registered</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((patient) => (
                    <TableRow key={patient.id}>
                      <TableCell className="font-mono text-xs tracking-wide text-muted-foreground">
                        {patient.patientNumber}
                      </TableCell>
                      <TableCell className="font-medium text-foreground">
                        {patient.preferredName || patient.fullName}
                        {patient.preferredName ? (
                          <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                            {patient.fullName}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm text-foreground">
                        {displayPatientAge(patient)}
                      </TableCell>
                      <TableCell className="text-sm text-foreground">
                        {patient.primaryContact?.displayValue ?? '—'}
                      </TableCell>
                      <TableCell>
                        <Badge tone={patient.status === 'ACTIVE' ? 'active' : 'suspended'}>
                          {patient.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatRegisteredDate(patient.createdAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button asChild size="sm" variant="ghost">
                            <Link to={`/patients/${patient.id}`}>View</Link>
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            type="button"
                            onClick={() => openEdit(patient.id)}
                          >
                            Edit
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="border-t border-border/70 bg-muted/20 px-4 py-3">
                <TablePagination
                  total={total}
                  limit={limit}
                  offset={offset}
                  pageSizeOptions={[10, 20, 30, 50]}
                  onPageChange={setOffset}
                  onLimitChange={(newLimit) => {
                    setLimit(newLimit);
                    setOffset(0);
                  }}
                  disabled={loading}
                />
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <PatientFormDialog
        open={formOpen}
        onOpenChange={closeForm}
        patientId={editingPatientId}
        onSaved={() => void load()}
      />
    </div>
  );
}
