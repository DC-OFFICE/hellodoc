import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar,
  CheckCircle2,
  Filter,
  Receipt,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
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
import { TablePagination } from '@/components/ui/table-pagination';
import { api, ApiError } from '@/lib/api';

type NotificationRow = {
  id: string;
  appointmentId: string | null;
  sessionId: string | null;
  eventType: string;
  recipientMasked: string;
  status: string;
  attempts: number;
  providerName: string | null;
  errorCategory: string | null;
  estimatedCost: number;
  createdAt: string;
  updatedAt: string;
};

type NotificationSummary = {
  totalMessages: number;
  sentCount: number;
  deliveredCount: number;
  submittedCount: number;
  failedCount: number;
  uncertainCount: number;
  skippedCount: number;
  cancelledCount: number;
  deliveryRate: number;
  totalSpendLkr: string;
  totalSavedLkr: string;
  unitPriceLkr: number;
};

type NotificationListResponse = {
  items: NotificationRow[];
  total: number;
  limit: number;
  offset: number;
  summary?: NotificationSummary;
};

type PresetKey = 'all' | 'today' | 'yesterday' | '7d' | 'month' | 'custom';

function getTodayColombo(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(new Date());
}

function getYesterdayColombo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(d);
}

function getPastDaysColombo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(d);
}

function getMonthStartColombo(): string {
  const today = getTodayColombo();
  return `${today.slice(0, 7)}-01`;
}

const EVENT_LABELS: Record<string, string> = {
  BOOKING_CONFIRMATION: 'Booking confirmation',
  CANCELLATION: 'Cancellation alert',
  RESCHEDULE: 'Reschedule alert',
  APPROACHING_TURN: 'Approaching turn',
  SESSION_DELAY: 'Session delay alert',
};

function getStatusBadge(status: string) {
  switch (status) {
    case 'DELIVERED':
      return (
        <Badge tone="active" className="border border-emerald-500/30">
          DELIVERED
        </Badge>
      );
    case 'SUBMITTED':
      return (
        <Badge className="border border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300">
          SUBMITTED
        </Badge>
      );
    case 'SKIPPED':
      return (
        <Badge tone="suspended" className="border border-dashed border-border">
          SKIPPED
        </Badge>
      );
    case 'FAILED':
      return (
        <Badge tone="failed" className="border border-destructive/30">
          FAILED
        </Badge>
      );
    case 'UNCERTAIN':
      return (
        <Badge tone="pending" className="border border-amber-500/30">
          UNCERTAIN
        </Badge>
      );
    case 'CANCELLED':
      return (
        <Badge tone="suspended" className="border border-border">
          CANCELLED
        </Badge>
      );
    default:
      return <Badge>{status}</Badge>;
  }
}

export function NotificationsPage() {
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [summary, setSummary] = useState<NotificationSummary | null>(null);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);

  // Filters
  const [preset, setPreset] = useState<PresetKey>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [status, setStatus] = useState('');
  const [eventType, setEventType] = useState('');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const applyPreset = (key: PresetKey) => {
    setPreset(key);
    setOffset(0);
    const today = getTodayColombo();
    switch (key) {
      case 'today':
        setFromDate(today);
        setToDate(today);
        break;
      case 'yesterday': {
        const y = getYesterdayColombo();
        setFromDate(y);
        setToDate(y);
        break;
      }
      case '7d':
        setFromDate(getPastDaysColombo(6));
        setToDate(today);
        break;
      case 'month':
        setFromDate(getMonthStartColombo());
        setToDate(today);
        break;
      case 'all':
        setFromDate('');
        setToDate('');
        break;
      case 'custom':
        // Keep current custom dates or seed with today
        if (!fromDate) setFromDate(today);
        if (!toDate) setToDate(today);
        break;
    }
  };

  const handleResetFilters = () => {
    setPreset('all');
    setFromDate('');
    setToDate('');
    setStatus('');
    setEventType('');
    setOffset(0);
  };

  const load = useCallback(
    async (isManualRefresh = false) => {
      if (isManualRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      try {
        const params = new URLSearchParams({
          limit: String(limit),
          offset: String(offset),
        });
        if (status) params.set('status', status);
        if (eventType) params.set('eventType', eventType);
        if (fromDate) params.set('from', fromDate);
        if (toDate) params.set('to', toDate);

        const data = await api<NotificationListResponse>(`/clinic/notifications?${params}`);
        setItems(data.items ?? []);
        setTotal(data.total ?? 0);
        if (data.summary) {
          setSummary(data.summary);
        }
        setError(null);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to load notifications');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [limit, offset, status, eventType, fromDate, toDate],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">SMS history & spend</h1>
          <p className="text-sm text-muted-foreground">
            Track SMS expenditure, delivery reliability, and patient notifications in real time.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={refreshing || loading}
            onClick={() => void load(true)}
            className="gap-1.5"
          >
            <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link to="/settings/notifications">Notification settings</Link>
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Total Spent */}
        <Card className="border-emerald-500/25 bg-linear-to-br from-emerald-500/10 via-card to-card shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total SMS Spend
            </CardTitle>
            <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
              <Receipt className="size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-foreground">
              LKR {summary?.totalSpendLkr ?? '0.00'}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                {summary?.sentCount ?? 0} billable SMS
              </span>{' '}
              dispatched (@ LKR 0.60)
            </p>
          </CardContent>
        </Card>

        {/* Card 2: Dispatched Messages */}
        <Card className="border-sky-500/25 bg-linear-to-br from-sky-500/10 via-card to-card shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Dispatched Volume
            </CardTitle>
            <div className="flex size-8 items-center justify-center rounded-lg bg-sky-500/20 text-sky-600 dark:text-sky-400">
              <Send className="size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {summary?.sentCount ?? 0}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-medium text-sky-600 dark:text-sky-400">
                {summary?.deliveryRate ?? 100}%
              </span>{' '}
              delivered successfully
            </p>
          </CardContent>
        </Card>

        {/* Card 3: Delivery Performance */}
        <Card className="border-teal-500/25 bg-linear-to-br from-teal-500/10 via-card to-card shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Delivery Status
            </CardTitle>
            <div className="flex size-8 items-center justify-center rounded-lg bg-teal-500/20 text-teal-600 dark:text-teal-400">
              <CheckCircle2 className="size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {summary?.deliveredCount ?? 0}{' '}
              <span className="text-sm font-normal text-muted-foreground">Delivered</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              <span>{summary?.submittedCount ?? 0} in transit</span> ·{' '}
              <span className={(summary?.failedCount ?? 0) > 0 ? 'text-destructive font-medium' : ''}>
                {summary?.failedCount ?? 0} failed
              </span>
            </p>
          </CardContent>
        </Card>

        {/* Card 4: Cost Saved */}
        <Card className="border-amber-500/25 bg-linear-to-br from-amber-500/10 via-card to-card shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Cost Saved / Avoided
            </CardTitle>
            <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400">
              <ShieldCheck className="size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-foreground">
              LKR {summary?.totalSavedLkr ?? '0.00'}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-medium text-amber-600 dark:text-amber-400">
                {summary?.skippedCount ?? 0} notifications
              </span>{' '}
              skipped (no gateway fee)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter & Data Management Section */}
      <Card className="shadow-none">
        <CardHeader className="space-y-4 pb-4">
          {/* Preset Buttons Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Calendar className="size-3.5" /> Date:
              </span>
              {(
                [
                  ['all', 'All time'],
                  ['today', 'Today'],
                  ['yesterday', 'Yesterday'],
                  ['7d', 'Last 7 days'],
                  ['month', 'This month'],
                  ['custom', 'Custom'],
                ] as const
              ).map(([key, label]) => (
                <Button
                  key={key}
                  type="button"
                  size="sm"
                  variant={preset === key ? 'default' : 'outline'}
                  className="h-8 text-xs cursor-pointer"
                  onClick={() => applyPreset(key)}
                >
                  {label}
                </Button>
              ))}
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleResetFilters}
              className="h-8 text-xs text-muted-foreground hover:text-foreground gap-1"
            >
              <RotateCcw className="size-3" />
              Reset filters
            </Button>
          </div>

          {/* Granular Filter Row: Date Pickers + Status + Event */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                From Date (Sri Lanka)
              </label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setPreset('custom');
                  setOffset(0);
                }}
                className="h-9 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                To Date (Sri Lanka)
              </label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setPreset('custom');
                  setOffset(0);
                }}
                className="h-9 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Status
              </label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setOffset(0);
                }}
              >
                <option value="">All statuses</option>
                <option value="DELIVERED">DELIVERED (Successful)</option>
                <option value="SUBMITTED">SUBMITTED (In-transit)</option>
                <option value="SKIPPED">SKIPPED (Free)</option>
                <option value="FAILED">FAILED</option>
                <option value="UNCERTAIN">UNCERTAIN</option>
                <option value="PENDING">PENDING</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Notification Event
              </label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                value={eventType}
                onChange={(e) => {
                  setEventType(e.target.value);
                  setOffset(0);
                }}
              >
                <option value="">All notification types</option>
                <option value="BOOKING_CONFIRMATION">Booking Confirmation</option>
                <option value="CANCELLATION">Cancellation Alert</option>
                <option value="RESCHEDULE">Reschedule Alert</option>
                <option value="APPROACHING_TURN">Approaching Turn Alert</option>
                <option value="SESSION_DELAY">Session Delay Alert</option>
              </select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              {error}
            </div>
          ) : null}

          {/* Table */}
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Event</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Cost (LKR)</TableHead>
                  <TableHead className="text-center">Attempts</TableHead>
                  <TableHead>Created (Asia/Colombo)</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-28 text-center text-sm text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="size-4 animate-spin text-primary" />
                        <span>Loading notification records...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-28 text-center text-sm text-muted-foreground">
                      <div className="flex flex-col items-center justify-center gap-1">
                        <Filter className="size-5 text-muted-foreground/60 mb-1" />
                        <p className="font-medium text-foreground">No SMS notifications found</p>
                        <p className="text-xs">Try selecting a different date range or status filter.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-sm">
                        <div className="font-medium text-foreground">
                          {EVENT_LABELS[row.eventType] ?? row.eventType}
                        </div>
                        {row.appointmentId ? (
                          <Link
                            className="text-xs text-primary underline hover:text-primary/80"
                            to={`/appointments/${row.appointmentId}`}
                          >
                            View appointment
                          </Link>
                        ) : null}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-foreground">
                        {row.recipientMasked}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          {getStatusBadge(row.status)}
                          {row.errorCategory ? (
                            <span className="text-[11px] text-muted-foreground font-mono">
                              {row.errorCategory}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {row.estimatedCost > 0 ? (
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                            LKR {row.estimatedCost.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">LKR 0.00 (Free)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center font-mono text-xs">
                        {row.attempts}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(row.createdAt).toLocaleString('en-US', {
                          timeZone: 'Asia/Colombo',
                          year: 'numeric',
                          month: 'short',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                          hour12: true,
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.status === 'FAILED' || row.status === 'UNCERTAIN' ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={busyId === row.id}
                            onClick={async () => {
                              setBusyId(row.id);
                              try {
                                await api(`/clinic/notifications/${row.id}/retry`, {
                                  method: 'POST',
                                });
                                await load();
                              } catch (err) {
                                setError(err instanceof ApiError ? err.message : 'Retry failed');
                              } finally {
                                setBusyId(null);
                              }
                            }}
                            className="h-7 text-xs"
                          >
                            Retry
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <TablePagination
            total={total}
            limit={limit}
            offset={offset}
            pageSizeOptions={[10, 20, 30, 50]}
            onPageChange={(newOffset) => setOffset(newOffset)}
            onLimitChange={(newLimit) => {
              setLimit(newLimit);
              setOffset(0);
            }}
            disabled={loading}
          />
        </CardContent>
      </Card>
    </div>
  );
}
