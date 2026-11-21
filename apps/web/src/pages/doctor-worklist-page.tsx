import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  Clock,
  FileEdit,
  FileText,
  History,
  Play,
  RefreshCw,
  Search,
  Stethoscope,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

type WorklistItem = {
  appointment_id: string;
  queue_number: number;
  appointment_status: string;
  patient_id: string;
  full_name: string;
  patient_number: string;
  sex?: string | null;
  approximate_age_years?: number | null;
  phone?: string | null;
  session_id: string;
  local_date: string;
  start_at: string;
  end_at?: string | null;
  session_status: string;
  queue_state: string | null;
  encounter_id: string | null;
  encounter_status: string | null;
};

type WorklistResponse = {
  doctorId: string;
  clinicName: string;
  items: WorklistItem[];
};

function getQueueBadge(state: string | null) {
  switch (state) {
    case 'CALLED':
      return (
        <Badge tone="pending" className="border border-amber-500/30 animate-pulse">
          CALLED
        </Badge>
      );
    case 'WAITING':
      return (
        <Badge className="border border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300">
          WAITING
        </Badge>
      );
    case 'IN_PROGRESS':
      return (
        <Badge className="border border-purple-500/30 bg-purple-500/15 text-purple-700 dark:text-purple-300">
          IN PROGRESS
        </Badge>
      );
    case 'DONE':
      return (
        <Badge tone="active" className="border border-emerald-500/30">
          COMPLETED
        </Badge>
      );
    case 'RESERVED':
      return (
        <Badge tone="suspended" className="border border-border font-mono">
          RESERVED
        </Badge>
      );
    default:
      return (
        <Badge tone="suspended" className="border border-border">
          {state ?? 'CONFIRMED'}
        </Badge>
      );
  }
}

function getRecordBadge(status: string | null) {
  switch (status) {
    case 'SIGNED':
      return (
        <Badge tone="active" className="border border-emerald-500/30">
          SIGNED & FINAL
        </Badge>
      );
    case 'DRAFT':
      return (
        <Badge tone="pending" className="border border-amber-500/30">
          DRAFT IN PROGRESS
        </Badge>
      );
    default:
      return (
        <Badge tone="suspended" className="border border-dashed border-border text-muted-foreground">
          NOT STARTED
        </Badge>
      );
  }
}

export function DoctorWorklistPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<WorklistItem[]>([]);
  const [clinicName, setClinicName] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [filterState, setFilterState] = useState<'ALL' | 'WAITING' | 'IN_PROGRESS' | 'DONE'>('ALL');

  const load = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await api<WorklistResponse>('/doctor/worklist');
      setItems(data.items ?? []);
      setClinicName(data.clinicName ?? '');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load doctor worklist');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Statistics
  const stats = useMemo(() => {
    const total = items.length;
    const waiting = items.filter(
      (i) => i.queue_state === 'WAITING' || i.queue_state === 'CALLED' || i.queue_state === 'RESERVED',
    ).length;
    const inProgress = items.filter(
      (i) => i.encounter_status === 'DRAFT' || i.queue_state === 'IN_PROGRESS',
    ).length;
    const completed = items.filter((i) => i.encounter_status === 'SIGNED').length;
    return { total, waiting, inProgress, completed };
  }, [items]);

  // Filtered patients
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const q = search.trim().toLowerCase();
      const matchSearch =
        !q ||
        item.full_name.toLowerCase().includes(q) ||
        item.patient_number.toLowerCase().includes(q) ||
        (item.phone && item.phone.includes(q)) ||
        String(item.queue_number).includes(q);

      if (!matchSearch) return false;

      if (filterState === 'WAITING') {
        return (
          item.queue_state === 'WAITING' ||
          item.queue_state === 'CALLED' ||
          item.queue_state === 'RESERVED'
        );
      }
      if (filterState === 'IN_PROGRESS') {
        return item.encounter_status === 'DRAFT' || item.queue_state === 'IN_PROGRESS';
      }
      if (filterState === 'DONE') {
        return item.encounter_status === 'SIGNED' || item.queue_state === 'DONE';
      }
      return true;
    });
  }, [items, search, filterState]);

  const handleStartConsultation = async (appointmentId: string) => {
    setBusyId(appointmentId);
    setError(null);
    try {
      const created = await api<{ id: string }>('/clinic/encounters', {
        method: 'POST',
        json: { appointmentId },
      });
      navigate(`/consultations/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start consultation encounter');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Badge tone="active" className="px-2 py-0.5 text-xs font-semibold uppercase tracking-wider">
              Doctor Consultation Portal
            </Badge>
            <span className="text-xs text-muted-foreground">· Live Clinical Queue</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground mt-1">
            Today&apos;s Worklist
          </h1>
          <p className="text-sm text-muted-foreground">
            {clinicName || 'Clinic'} · Assigned consultation queue and clinical encounters for today.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={refreshing || loading}
            onClick={() => void load(true)}
            className="gap-1.5 cursor-pointer text-xs"
          >
            <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh Queue
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid (4 Cards) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Patients */}
        <Card className="border-border shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total Assigned Today
            </CardTitle>
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {stats.total}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Scheduled patient appointments</p>
          </CardContent>
        </Card>

        {/* Waiting / Arrived */}
        <Card className="border-sky-500/25 bg-linear-to-br from-sky-500/10 via-card to-card shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Waiting in Queue
            </CardTitle>
            <div className="flex size-8 items-center justify-center rounded-lg bg-sky-500/20 text-sky-600 dark:text-sky-400">
              <Clock className="size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {stats.waiting}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Ready to be called into room</p>
          </CardContent>
        </Card>

        {/* In Progress */}
        <Card className="border-amber-500/25 bg-linear-to-br from-amber-500/10 via-card to-card shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              In Consultation
            </CardTitle>
            <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400">
              <FileEdit className="size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {stats.inProgress}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Draft clinical notes ongoing</p>
          </CardContent>
        </Card>

        {/* Completed */}
        <Card className="border-emerald-500/25 bg-linear-to-br from-emerald-500/10 via-card to-card shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Signed & Finalized
            </CardTitle>
            <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {stats.completed}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Encounters locked & prescriptions issued</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Worklist Table Section */}
      <Card className="shadow-none border-border">
        <CardHeader className="space-y-3 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Stethoscope className="size-4 text-primary" />
                Assigned Consultation Queue
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Patients booked for your clinic sessions today.
              </p>
            </div>

            {/* Quick Status Filters */}
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ['ALL', 'All Patients'],
                  ['WAITING', 'Waiting'],
                  ['IN_PROGRESS', 'In Progress'],
                  ['DONE', 'Completed'],
                ] as const
              ).map(([state, label]) => (
                <Button
                  key={state}
                  type="button"
                  size="sm"
                  variant={filterState === state ? 'default' : 'outline'}
                  onClick={() => setFilterState(state)}
                  className="h-8 text-xs cursor-pointer"
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by patient name, number, or phone..."
              className="h-8 pl-8 text-xs"
            />
          </div>
        </CardHeader>

        <CardContent className="px-0 pt-0 pb-0">
          {error ? (
            <div className="mx-6 mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              {error}
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[90px] text-center">Queue #</TableHead>
                  <TableHead>Patient Details</TableHead>
                  <TableHead>Queue Status</TableHead>
                  <TableHead>Clinical Record</TableHead>
                  <TableHead>Session Time</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-sm text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="size-4 animate-spin text-primary" />
                        <span>Loading doctor consultation worklist...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-36 text-center text-sm text-muted-foreground">
                      <div className="flex flex-col items-center justify-center gap-1.5 py-6">
                        <Users className="size-8 text-muted-foreground/40 mb-1" />
                        <p className="font-semibold text-foreground">No patients found</p>
                        <p className="text-xs">
                          {items.length === 0
                            ? 'There are no assigned appointments scheduled for your session today.'
                            : 'No patients match your search or filter criteria.'}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredItems.map((item) => {
                    const isBusy = busyId === item.appointment_id;
                    return (
                      <TableRow key={item.appointment_id} className="hover:bg-muted/40 transition-colors">
                        {/* Column 1: Queue # */}
                        <TableCell className="text-center font-mono">
                          <span className="inline-flex items-center justify-center rounded-lg bg-primary/10 px-2.5 py-1 text-sm font-bold text-primary">
                            #{String(item.queue_number).padStart(3, '0')}
                          </span>
                        </TableCell>

                        {/* Column 2: Patient Info */}
                        <TableCell>
                          <div className="space-y-0.5">
                            <div className="font-semibold text-sm text-foreground flex items-center gap-2">
                              <span>{item.full_name}</span>
                              {item.sex ? (
                                <Badge tone="suspended" className="text-[10px] uppercase font-mono px-1 py-0">
                                  {item.sex}
                                </Badge>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground font-mono">
                              <span>{item.patient_number}</span>
                              {item.approximate_age_years ? (
                                <span>· {item.approximate_age_years} yrs</span>
                              ) : null}
                              {item.phone ? <span>· {item.phone}</span> : null}
                            </div>
                          </div>
                        </TableCell>

                        {/* Column 3: Queue State */}
                        <TableCell>{getQueueBadge(item.queue_state)}</TableCell>

                        {/* Column 4: Clinical Record Status */}
                        <TableCell>{getRecordBadge(item.encounter_status)}</TableCell>

                        {/* Column 5: Session Time */}
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(item.start_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true,
                          })}
                        </TableCell>

                        {/* Column 6: Actions */}
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {item.encounter_id ? (
                              <Button
                                asChild
                                size="sm"
                                variant={item.encounter_status === 'SIGNED' ? 'outline' : 'default'}
                                className={`h-8 cursor-pointer gap-1.5 text-xs ${item.encounter_status === 'SIGNED' ? '' : 'text-white hover:text-white'}`}
                              >
                                <Link to={`/consultations/${item.encounter_id}`}>
                                  {item.encounter_status === 'SIGNED' ? (
                                    <>
                                      <FileText className="size-3.5" />
                                      Review Record
                                    </>
                                  ) : (
                                    <>
                                      <FileEdit className="size-3.5" />
                                      Continue Consultation
                                    </>
                                  )}
                                </Link>
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                disabled={isBusy}
                                onClick={() => void handleStartConsultation(item.appointment_id)}
                                className="h-8 text-xs cursor-pointer gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                              >
                                <Play className="size-3.5 fill-current" />
                                {isBusy ? 'Opening...' : 'Start Consultation'}
                              </Button>
                            )}

                            {/* Link to patient clinical record history */}
                            <Button
                              asChild
                              size="sm"
                              variant="ghost"
                              className="h-8 text-xs text-muted-foreground hover:text-foreground"
                              title="View Patient Medical History"
                            >
                              <Link to={`/patients/${item.patient_id}`}>
                                <History className="size-3.5" />
                              </Link>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
