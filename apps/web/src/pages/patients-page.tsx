import { useCallback, useEffect, useState } from 'react';
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
import {
  displayPatientAge,
  formatRegisteredDate,
} from '@/features/patients/utils/patient-display';
import { api, ApiError } from '@/lib/api';
import type { Patient } from '@/lib/clinic-types';

export function PatientsPage() {
  const [items, setItems] = useState<Patient[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [limit] = useState(25);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<{
    q: string;
    phone: string;
    status: 'ALL' | 'ACTIVE' | 'INACTIVE';
  }>({ q: '', phone: '', status: 'ACTIVE' });

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

  const page = Math.floor(offset / limit) + 1;
  const pageCount = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Patients</h1>
          <p className="text-sm text-slate-600">
            Register, search and manage your clinic&apos;s patient records.
          </p>
        </div>
        <Link to="/patients/new">
          <Button type="button">+ Register Patient</Button>
        </Link>
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
            className="h-9 rounded-md border border-input bg-white px-3 text-sm"
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
            variant="outline"
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
              <p className="text-sm text-red-700">{error}</p>
              <Button type="button" variant="outline" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          ) : null}
          {!loading && !error && items.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-slate-500">No patients found.</p>
              <Link to="/patients/new" className="mt-3 inline-block">
                <Button type="button" variant="secondary">
                  Register first patient
                </Button>
              </Link>
            </div>
          ) : null}
          {items.length > 0 ? (
            <>
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
                      <TableCell className="font-mono text-xs tracking-wide text-slate-700">
                        {patient.patientNumber}
                      </TableCell>
                      <TableCell className="font-medium text-slate-900">
                        {patient.preferredName || patient.fullName}
                        {patient.preferredName ? (
                          <span className="mt-0.5 block text-xs font-normal text-slate-500">
                            {patient.fullName}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm text-slate-700">
                        {displayPatientAge(patient)}
                      </TableCell>
                      <TableCell className="text-sm text-slate-700">
                        {patient.primaryContact?.displayValue ?? '—'}
                      </TableCell>
                      <TableCell>
                        <Badge tone={patient.status === 'ACTIVE' ? 'active' : 'suspended'}>
                          {patient.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {formatRegisteredDate(patient.createdAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Link to={`/patients/${patient.id}`}>
                            <Button size="sm" variant="outline" type="button">
                              View
                            </Button>
                          </Link>
                          <Link to={`/patients/${patient.id}/edit`}>
                            <Button size="sm" variant="outline" type="button">
                              Edit
                            </Button>
                          </Link>
                        </div>
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
