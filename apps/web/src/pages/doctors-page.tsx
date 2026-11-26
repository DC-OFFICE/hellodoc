import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { DoctorDeactivateDialog } from '@/components/doctor-deactivate-dialog';
import { DoctorFormDialog } from '@/components/doctor-form-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TablePagination } from '@/components/ui/table-pagination';
import { api, ApiError } from '@/lib/api';
import type { Doctor } from '@/lib/clinic-types';

export function DoctorsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<Doctor[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(10);
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState<Doctor | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const openCreate = useCallback(() => {
    setEditingId(null);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((id: string) => {
    setEditingId(id);
    setFormOpen(true);
  }, []);

  const closeForm = useCallback(
    (open: boolean) => {
      setFormOpen(open);
      if (!open) {
        setEditingId(null);
        const next = new URLSearchParams(searchParams);
        next.delete('create');
        next.delete('edit');
        setSearchParams(next, { replace: true });
      }
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    if (searchParams.get('create') === '1') {
      openCreate();
      return;
    }
    const editId = searchParams.get('edit');
    if (editId) openEdit(editId);
  }, [searchParams, openCreate, openEdit]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        status,
        limit: String(limit),
        offset: String(offset),
      });
      if (q.trim()) params.set('q', q.trim());
      const data = await api<{ items: Doctor[]; total: number }>(`/clinic/doctors?${params}`);
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load doctors');
    } finally {
      setLoading(false);
    }
  }, [status, limit, offset, q]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Doctors</h1>
          <p className="text-sm text-muted-foreground">
            Manage clinic doctor profiles and availability.
          </p>
        </div>
        <Button type="button" onClick={openCreate}>
          <Plus className="size-4" />
          Add Doctor
        </Button>
      </div>

      <Card className="overflow-hidden shadow-none">
        <CardHeader className="gap-4 border-0 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">Doctor directory</CardTitle>
            <CardDescription>Search and filter clinic doctors.</CardDescription>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <div className="relative sm:w-64">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search name or registration"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void load();
                }}
                className="pl-8"
              />
            </div>
            <Select
              value={status}
              onValueChange={(value) => setStatus(value as typeof status)}
            >
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="INACTIVE">Inactive</SelectItem>
                <SelectItem value="ALL">All</SelectItem>
              </SelectContent>
            </Select>
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Search
            </Button>
          </div>
        </CardHeader>

        <CardContent className="px-0 pt-0 pb-0">
          {loading ? (
            <p className="px-6 py-10 text-sm text-muted-foreground">Loading…</p>
          ) : null}
          {error ? <p className="px-6 py-4 text-sm text-destructive">{error}</p> : null}
          {notice ? <p className="px-6 py-4 text-sm text-primary">{notice}</p> : null}
          {!loading && !error && items.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">
              No doctors found.
            </p>
          ) : null}

          {items.length > 0 ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Doctor</TableHead>
                    <TableHead>Registration</TableHead>
                    <TableHead>Specialization</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((doctor) => (
                    <TableRow key={doctor.id}>
                      <TableCell className="font-medium text-foreground">
                        {doctor.displayName}
                      </TableCell>
                      <TableCell className="font-mono text-xs tracking-wide text-muted-foreground">
                        {doctor.registrationNumber}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {doctor.specialization ?? '—'}
                      </TableCell>
                      <TableCell>
                        <Badge tone={doctor.status === 'ACTIVE' ? 'active' : 'suspended'}>
                          {doctor.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button asChild size="sm" variant="ghost">
                            <Link to={`/doctors/${doctor.id}`}>View</Link>
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            type="button"
                            onClick={() => openEdit(doctor.id)}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant={doctor.status === 'ACTIVE' ? 'destructive' : 'default'}
                            type="button"
                            disabled={busyId === doctor.id}
                            onClick={async () => {
                              setError(null);
                              setNotice(null);
                              if (doctor.status === 'ACTIVE') {
                                // Deactivation may need future sessions cancelled first.
                                setDeactivating(doctor);
                                return;
                              }
                              setBusyId(doctor.id);
                              try {
                                await api(`/clinic/doctors/${doctor.id}/reactivate`, { method: 'POST', json: {} });
                                await load();
                              } catch (err) {
                                setError(
                                  err instanceof ApiError ? err.message : 'Status update failed',
                                );
                              } finally {
                                setBusyId(null);
                              }
                            }}
                          >
                            {doctor.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}
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
                  onPageChange={(newOffset) => {
                    setOffset(newOffset);
                  }}
                  onLimitChange={(newLimit) => {
                    setLimit(newLimit);
                    setOffset(0);
                  }}
                  disabled={loading}
                />
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <DoctorDeactivateDialog
        doctor={deactivating}
        onOpenChange={(open) => {
          if (!open) setDeactivating(null);
        }}
        onDeactivated={(message) => {
          setDeactivating(null);
          setNotice(message);
          void load();
        }}
      />

      <DoctorFormDialog
        open={formOpen}
        onOpenChange={closeForm}
        doctorId={editingId}
        onSaved={() => void load()}
      />
    </div>
  );
}
