import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { api, ApiError } from '@/lib/api';
import {
  SmsGatewayConfigDialog,
  type GatewayConfig,
} from '@/components/sms-gateway-config-dialog';
import {
  Radio,
  Settings,
  Send,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Search,
  DollarSign,
  TrendingUp,
  Building2,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';

type ClinicUsageItem = {
  clinicId: string;
  clinicName: string;
  slug: string;
  schemaName: string;
  smsEnabled: boolean;
  tenantStatus: string;
  createdAt: string;
  totalSent: number;
  delivered: number;
  failed: number;
  skipped: number;
  credits: number;
  spendLkr: number;
  deliveryRate: number;
  lastSentAt: string | null;
};

type UsageResponse = {
  totals: {
    totalClinics: number;
    enabledClinics: number;
    totalSent: number;
    totalDelivered: number;
    totalFailed: number;
    totalSkipped: number;
    totalSpendLkr: number;
    deliveryRate: number;
  };
  items: ClinicUsageItem[];
  total: number;
  limit: number;
  offset: number;
  from: string | null;
  to: string | null;
};

const emptyGateway: GatewayConfig = {
  enabled: true,
  baseUrl: 'https://smslenz.lk',
  userId: '1862',
  senderId: 'DARTCODES',
  connectionTimeoutMs: 30000,
  readTimeoutMs: 30000,
  apiKeySet: false,
  apiKeyMask: null,
  updatedAt: null,
};

type Preset = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'all' | 'custom';

export function PlatformSmsGatewayPage() {
  const [gateway, setGateway] = useState<GatewayConfig>(emptyGateway);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [testingGateway, setTestingGateway] = useState(false);
  const [loadingUsage, setLoadingUsage] = useState(true);
  const [togglingClinicId, setTogglingClinicId] = useState<string | null>(null);

  // Filters
  const [preset, setPreset] = useState<Preset>('30d');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ENABLED' | 'DISABLED'>('ALL');

  // Pagination
  const [pageSize, setPageSize] = useState<number>(10);
  const [page, setPage] = useState<number>(1);

  // Data
  const [usageData, setUsageData] = useState<UsageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load Gateway Config
  const loadGateway = useCallback(async () => {
    try {
      const data = await api<GatewayConfig>('/platform/sms-gateway');
      setGateway(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load SMS gateway');
    }
  }, []);

  // Load Clinic Usage Analytics
  const loadUsage = useCallback(async () => {
    setLoadingUsage(true);
    try {
      const offset = (page - 1) * pageSize;
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(offset),
        status: statusFilter,
      });

      if (preset !== 'custom') {
        params.set('preset', preset);
      } else {
        if (fromDate) params.set('from', fromDate);
        if (toDate) params.set('to', toDate);
      }

      if (debouncedSearch) {
        params.set('q', debouncedSearch);
      }

      const res = await api<UsageResponse>(`/platform/sms-gateway/clinic-usage?${params.toString()}`);
      setUsageData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load clinic SMS usage');
    } finally {
      setLoadingUsage(false);
    }
  }, [page, pageSize, statusFilter, preset, fromDate, toDate, debouncedSearch]);

  useEffect(() => {
    void loadGateway();
  }, [loadGateway]);

  useEffect(() => {
    void loadUsage();
  }, [loadUsage]);

  async function testConnection() {
    setTestingGateway(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api<{ ok: boolean; message: string }>('/platform/sms-gateway/test', {
        method: 'POST',
        json: {},
      });
      if (result.ok) setNotice(result.message);
      else setError(result.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Connection test failed');
    } finally {
      setTestingGateway(false);
    }
  }

  async function toggleClinicSms(clinicId: string, currentEnabled: boolean) {
    setTogglingClinicId(clinicId);
    setError(null);
    try {
      await api(`/platform/clinics/${clinicId}/toggle-sms`, {
        method: 'POST',
        json: { enabled: !currentEnabled },
      });
      setUsageData((prev) => {
        if (!prev) return prev;
        const items = prev.items.map((c) =>
          c.clinicId === clinicId ? { ...c, smsEnabled: !currentEnabled } : c,
        );
        const change = !currentEnabled ? 1 : -1;
        return {
          ...prev,
          items,
          totals: {
            ...prev.totals,
            enabledClinics: Math.max(0, prev.totals.enabledClinics + change),
          },
        };
      });
      setNotice(
        !currentEnabled
          ? 'SMS entitlement granted to clinic.'
          : 'SMS entitlement revoked for clinic.',
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update clinic SMS setting');
    } finally {
      setTogglingClinicId(null);
    }
  }

  function handlePresetChange(p: Preset) {
    setPreset(p);
    setFromDate('');
    setToDate('');
    setPage(1);
  }

  function handleCustomDateApply() {
    if (fromDate || toDate) {
      setPreset('custom');
      setPage(1);
    }
  }

  function resetFilters() {
    setPreset('30d');
    setFromDate('');
    setToDate('');
    setSearchQuery('');
    setStatusFilter('ALL');
    setPage(1);
  }

  const totalClinics = usageData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalClinics / pageSize));
  const startItem = totalClinics === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalClinics);

  return (
    <div className="space-y-6">
      {/* Page Title & Gateway Top Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">SMS Gateway</h1>
          <p className="text-sm text-muted-foreground">
            Centralized SMSLenz provider dispatching notifications, appointments, and queue tracking across clinics.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={testingGateway}
            onClick={() => void testConnection()}
          >
            {testingGateway ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Radio className="mr-2 size-4" />
            )}
            Test connection
          </Button>
          <Button
            type="button"
            onClick={() => setConfigDialogOpen(true)}
          >
            <Settings className="mr-2 size-4" />
            Configure Gateway
          </Button>
        </div>
      </div>

      {/* Provider Details Bar */}
      <Card className="border-border/60 bg-card/60 backdrop-blur-xs">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`flex size-10 shrink-0 items-center justify-center rounded-lg border ${
                  gateway.enabled
                    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'border-muted bg-muted text-muted-foreground'
                }`}
              >
                <Radio className="size-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">SMSLenz Gateway</span>
                  <Badge tone={gateway.enabled ? 'active' : 'suspended'}>
                    {gateway.enabled ? 'Operational' : 'Disabled'}
                  </Badge>
                  {gateway.apiKeySet && (
                    <Badge tone="default">Key Configured</Badge>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1 font-mono">
                  <span>Base: {gateway.baseUrl}</span>
                  <span>User: {gateway.userId || 'Not set'}</span>
                  <span>Sender: {gateway.senderId || 'Not set'}</span>
                  <span>Key: {gateway.apiKeyMask ?? '••••'}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => setConfigDialogOpen(true)}
              >
                Edit Credentials
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Global Alerts */}
      {error && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setError(null)} className="h-6 px-2 text-xs">
            Dismiss
          </Button>
        </div>
      )}

      {notice && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0" />
            <span>{notice}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setNotice(null)} className="h-6 px-2 text-xs">
            Dismiss
          </Button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total SMS Dispatched</CardTitle>
            <Send className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {usageData?.totals.totalSent.toLocaleString() ?? 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {usageData?.totals.totalDelivered ?? 0} delivered, {usageData?.totals.totalFailed ?? 0} failed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total SMS Spend</CardTitle>
            <DollarSign className="size-4 text-emerald-600 dark:text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              LKR {usageData?.totals.totalSpendLkr.toFixed(2) ?? '0.00'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Estimated @ LKR 0.60 per SMS credit
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Delivery Success Rate</CardTitle>
            <TrendingUp className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {usageData?.totals.deliveryRate ?? 100}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {usageData?.totals.totalSkipped ?? 0} messages skipped by rule
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">SMS-Enabled Clinics</CardTitle>
            <Building2 className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {usageData?.totals.enabledClinics ?? 0}{' '}
              <span className="text-sm font-normal text-muted-foreground">
                / {usageData?.totals.totalClinics ?? 0} active
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Clinics entitled by platform admin
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Controls Bar */}
      <Card>
        <CardContent className="p-4 space-y-4">
          {/* Quick Date Presets */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-1 flex items-center gap-1">
                <Calendar className="size-3.5" /> Period:
              </span>
              {(
                [
                  { id: 'today', label: 'Today' },
                  { id: 'yesterday', label: 'Yesterday' },
                  { id: '7d', label: 'Last 7 Days' },
                  { id: '30d', label: 'Last 30 Days' },
                  { id: 'month', label: 'This Month' },
                  { id: 'all', label: 'All Time' },
                ] as const
              ).map((p) => (
                <Button
                  key={p.id}
                  type="button"
                  size="sm"
                  variant={preset === p.id ? 'default' : 'outline'}
                  className="h-8 text-xs font-medium"
                  onClick={() => handlePresetChange(p.id)}
                >
                  {p.label}
                </Button>
              ))}
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground"
              onClick={resetFilters}
            >
              <RotateCcw className="mr-1 size-3" />
              Reset filters
            </Button>
          </div>

          {/* Secondary Row: Custom Date Range, Search & Entitlement filter */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12 pt-1 border-t">
            {/* Custom Range Picker */}
            <div className="flex items-center gap-2 lg:col-span-5">
              <div className="flex-1 space-y-1">
                <Input
                  type="date"
                  className="h-8 text-xs"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  placeholder="From"
                />
              </div>
              <span className="text-xs text-muted-foreground">to</span>
              <div className="flex-1 space-y-1">
                <Input
                  type="date"
                  className="h-8 text-xs"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  placeholder="To"
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 text-xs"
                disabled={!fromDate && !toDate}
                onClick={handleCustomDateApply}
              >
                Apply
              </Button>
            </div>

            {/* Clinic Search */}
            <div className="relative lg:col-span-4">
              <Search className="absolute left-2.5 top-2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search clinic name or slug..."
                className="h-8 pl-8 text-xs"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Entitlement Status Selector */}
            <div className="lg:col-span-3">
              <select
                aria-label="Filter by clinic SMS entitlement"
                className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs text-foreground shadow-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as 'ALL' | 'ENABLED' | 'DISABLED');
                  setPage(1);
                }}
              >
                <option value="ALL">All Clinics</option>
                <option value="ENABLED">SMS Enabled Only</option>
                <option value="DISABLED">SMS Disabled Only</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Clinic SMS Usage Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs text-muted-foreground font-medium uppercase tracking-wider">
              <tr>
                <th scope="col" className="px-4 py-3">Clinic</th>
                <th scope="col" className="px-4 py-3">SMS Entitlement</th>
                <th scope="col" className="px-4 py-3 text-right">Dispatched</th>
                <th scope="col" className="px-4 py-3 text-right">Delivered</th>
                <th scope="col" className="px-4 py-3 text-right">Failed / Skipped</th>
                <th scope="col" className="px-4 py-3 text-right">Spend (LKR)</th>
                <th scope="col" className="px-4 py-3">Last Sent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {loadingUsage ? (
                <tr>
                  <td colSpan={7} className="h-32 text-center text-muted-foreground">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="size-5 animate-spin" />
                      <span>Loading SMS usage...</span>
                    </div>
                  </td>
                </tr>
              ) : usageData?.items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="h-32 text-center text-muted-foreground">
                    No clinics match the current criteria or date range.
                  </td>
                </tr>
              ) : (
                usageData?.items.map((clinic) => (
                  <tr key={clinic.clinicId} className="hover:bg-muted/30 transition-colors">
                    {/* Clinic Name & Slug */}
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">{clinic.clinicName}</span>
                        <span className="text-xs text-muted-foreground font-mono">
                          /{clinic.slug}
                        </span>
                      </div>
                    </td>

                    {/* Entitlement Toggle */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <Switch
                          id={`sms-toggle-${clinic.clinicId}`}
                          checked={clinic.smsEnabled}
                          disabled={togglingClinicId === clinic.clinicId}
                          onCheckedChange={() => void toggleClinicSms(clinic.clinicId, clinic.smsEnabled)}
                        />
                        <span
                          className={`text-xs font-medium ${
                            clinic.smsEnabled
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-muted-foreground'
                          }`}
                        >
                          {clinic.smsEnabled ? 'Active' : 'Disabled'}
                        </span>
                      </div>
                    </td>

                    {/* Dispatched */}
                    <td className="px-4 py-3.5 text-right font-medium text-foreground">
                      {clinic.totalSent.toLocaleString()}
                    </td>

                    {/* Delivered */}
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex flex-col items-end">
                        <span className="font-medium text-foreground">
                          {clinic.delivered.toLocaleString()}
                        </span>
                        {clinic.totalSent > 0 && (
                          <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
                            {clinic.deliveryRate}% rate
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Failed / Skipped */}
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5 text-xs">
                        {clinic.failed > 0 ? (
                          <span className="font-semibold text-destructive">
                            {clinic.failed} failed
                          </span>
                        ) : (
                          <span className="text-muted-foreground">0 failed</span>
                        )}
                        <span className="text-muted-foreground">·</span>
                        <span className="text-muted-foreground">{clinic.skipped} skipped</span>
                      </div>
                    </td>

                    {/* Spend (LKR) & Credits */}
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex flex-col items-end">
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          LKR {clinic.spendLkr.toFixed(2)}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {clinic.credits} credits
                        </span>
                      </div>
                    </td>

                    {/* Last Sent */}
                    <td className="px-4 py-3.5 text-xs text-muted-foreground">
                      {clinic.lastSentAt ? (
                        new Date(clinic.lastSentAt).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      ) : (
                        <span className="italic">No SMS dispatched</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Backend Pagination Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t p-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>
              Showing {startItem} to {endItem} of {totalClinics} clinics
            </span>
            <div className="flex items-center gap-1.5">
              <span>Rows per page:</span>
              <select
                aria-label="Rows per page"
                className="h-7 rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground shadow-xs focus:outline-hidden"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={30}>30</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="mr-2">
              Page {page} of {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2.5"
              disabled={page <= 1 || loadingUsage}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2.5"
              disabled={page >= totalPages || loadingUsage}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Configuration Dialog */}
      <SmsGatewayConfigDialog
        open={configDialogOpen}
        onOpenChange={setConfigDialogOpen}
        gateway={gateway}
        onSaveSuccess={(updated) => {
          setGateway(updated);
          setNotice('SMS gateway configuration updated successfully.');
        }}
      />
    </div>
  );
}
