import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, ApiError } from '@/lib/api';
import type { Doctor } from '@/lib/clinic-types';

export function DoctorsPage() {
  const [items, setItems] = useState<Doctor[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ status, limit: '100' });
      if (q.trim()) params.set('q', q.trim());
      const data = await api<{ items: Doctor[] }>(`/clinic/doctors?${params}`);
      setItems(data.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load doctors');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [status]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Doctors</h1>
          <p className="text-sm text-slate-600">Manage clinic doctor profiles and availability.</p>
        </div>
        <Link to="/doctors/new">
          <Button type="button">Add Doctor</Button>
        </Link>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            placeholder="Search by name or registration"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="sm:max-w-xs"
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
          <Button type="button" variant="outline" onClick={() => void load()}>
            Search
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? <p className="text-sm text-slate-500">Loading…</p> : null}
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          {!loading && !error && items.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No doctors found.</p>
          ) : null}
          {items.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Doctor</TableHead>
                  <TableHead>Registration</TableHead>
                  <TableHead>Specialization</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((doctor) => (
                  <TableRow key={doctor.id}>
                    <TableCell className="font-medium text-slate-900">
                      {doctor.displayName}
                    </TableCell>
                    <TableCell className="font-mono text-xs tracking-wide text-slate-700">
                      {doctor.registrationNumber}
                    </TableCell>
                    <TableCell>{doctor.specialization ?? '—'}</TableCell>
                    <TableCell>
                      <Badge tone={doctor.status === 'ACTIVE' ? 'active' : 'suspended'}>
                        {doctor.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Link to={`/doctors/${doctor.id}`}>
                          <Button size="sm" variant="outline" type="button">
                            View
                          </Button>
                        </Link>
                        <Link to={`/doctors/${doctor.id}/edit`}>
                          <Button size="sm" variant="outline" type="button">
                            Edit
                          </Button>
                        </Link>
                        <Button
                          size="sm"
                          variant={doctor.status === 'ACTIVE' ? 'destructive' : 'default'}
                          type="button"
                          disabled={busyId === doctor.id}
                          onClick={async () => {
                            setBusyId(doctor.id);
                            try {
                              const path =
                                doctor.status === 'ACTIVE'
                                  ? `/clinic/doctors/${doctor.id}/deactivate`
                                  : `/clinic/doctors/${doctor.id}/reactivate`;
                              await api(path, { method: 'POST', json: {} });
                              await load();
                            } catch (err) {
                              setError(err instanceof ApiError ? err.message : 'Status update failed');
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
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
