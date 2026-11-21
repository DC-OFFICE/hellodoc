import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  RefreshCw,
  Sparkles,
  UserPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useClinicAuth } from '@/lib/auth';
import type { Doctor, ConsultationSession } from '@/lib/clinic-types';
import { DashboardFilterBar } from '@/features/dashboard/components/DashboardFilterBar';
import { DashboardKpiGrid } from '@/features/dashboard/components/DashboardKpiGrid';
import { DashboardLiveSessions } from '@/features/dashboard/components/DashboardLiveSessions';
import { DashboardRecentActivity } from '@/features/dashboard/components/DashboardRecentActivity';
import { DoctorWorkloadChart } from '@/features/dashboard/components/charts/DoctorWorkloadChart';
import { HourlyArrivalChart } from '@/features/dashboard/components/charts/HourlyArrivalChart';
import { PatientVolumeChart } from '@/features/dashboard/components/charts/PatientVolumeChart';
import { RevenueBreakdownChart } from '@/features/dashboard/components/charts/RevenueBreakdownChart';
import type { DashboardFilters, DashboardMetricsResponse, DashboardPreset } from '@/features/dashboard/types';

function getTodayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(new Date());
}

function resolveDatesForPreset(preset: DashboardPreset): { from: string; to: string } {
  const today = getTodayIso();
  const now = new Date();

  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const y = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const yStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(y);
      return { from: yStr, to: yStr };
    }
    case '7days': {
      const past = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      const pastStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(past);
      return { from: pastStr, to: today };
    }
    case 'month': {
      return { from: `${today.slice(0, 7)}-01`, to: today };
    }
    case 'custom':
    default:
      return { from: today, to: today };
  }
}

export function DashboardPage() {
  const { user } = useClinicAuth();
  const [clinicName, setClinicName] = useState<string | null>(user?.clinicName ?? null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [sessions, setSessions] = useState<ConsultationSession[]>([]);

  const [filters, setFilters] = useState<DashboardFilters>(() => {
    const dates = resolveDatesForPreset('today');
    return {
      preset: 'today',
      from: dates.from,
      to: dates.to,
      doctorId: 'all',
      sessionId: 'all',
    };
  });

  const [metrics, setMetrics] = useState<DashboardMetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load clinic metadata, doctors and sessions for filter dropdowns
  useEffect(() => {
    let cancelled = false;

    api<{ clinicName: string }>('/clinic/me')
      .then((me) => {
        if (!cancelled && me?.clinicName) setClinicName(me.clinicName);
      })
      .catch(() => {});

    api<{ items: Doctor[] }>('/clinic/doctors')
      .then((res) => {
        if (!cancelled && res?.items) setDoctors(res.items);
      })
      .catch(() => {});

    api<{ items: ConsultationSession[] }>('/clinic/sessions')
      .then((res) => {
        if (!cancelled && res?.items) setSessions(res.items);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch Dashboard Metrics
  const loadMetrics = useCallback(
    async (isManualRefresh = false) => {
      if (isManualRefresh) setRefreshing(true);
      else setLoading(true);

      setLoadError(null);

      const params = new URLSearchParams({
        preset: filters.preset,
        from: filters.from,
        to: filters.to,
      });

      if (filters.doctorId !== 'all') {
        params.set('doctorId', filters.doctorId);
      }
      if (filters.sessionId !== 'all') {
        params.set('sessionId', filters.sessionId);
      }

      try {
        const data = await api<DashboardMetricsResponse>(`/clinic/dashboard/metrics?${params}`);
        setMetrics(data);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load dashboard metrics');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [filters],
  );

  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);

  const handleFilterChange = (patch: Partial<DashboardFilters>) => {
    setFilters((prev) => {
      const next = { ...prev, ...patch };
      if (patch.preset && patch.preset !== 'custom') {
        const dates = resolveDatesForPreset(patch.preset);
        next.from = dates.from;
        next.to = dates.to;
      }
      return next;
    });
  };

  const handleResetFilters = () => {
    const dates = resolveDatesForPreset('today');
    setFilters({
      preset: 'today',
      from: dates.from,
      to: dates.to,
      doctorId: 'all',
      sessionId: 'all',
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Welcome & Actions Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              {clinicName || "Clinic Workspace"}
            </h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-teal-500/10 px-2.5 py-0.5 text-xs font-semibold text-teal-700 dark:text-teal-300">
              <Sparkles className="size-3" />
              Live Clinic Operations
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Signed in as {user?.email || 'Practitioner'} · Real-time patient throughput, consultation queues, and revenue.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 cursor-pointer"
            onClick={() => void loadMetrics(true)}
            disabled={loading || refreshing}
          >
            <RefreshCw className={`mr-1.5 size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Button asChild variant="outline" size="sm" className="h-9 cursor-pointer">
            <Link to="/appointments">
              <UserPlus className="mr-1.5 size-3.5" />
              Book Appointment
            </Link>
          </Button>

          <Button asChild size="sm" className="h-9 cursor-pointer">
            <Link to="/sessions">
              <Plus className="mr-1.5 size-3.5" />
              New Session
            </Link>
          </Button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <DashboardFilterBar
        filters={filters}
        onChange={handleFilterChange}
        onReset={handleResetFilters}
        doctors={doctors}
        sessions={sessions}
        loading={loading || refreshing}
      />

      {/* Error state */}
      {loadError ? (
        <Card className="border-destructive/30 bg-destructive/10">
          <CardContent className="flex items-center justify-between p-4 text-sm text-destructive">
            <span>{loadError}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadMetrics()}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* KPI Cards Grid */}
      {metrics ? (
        <DashboardKpiGrid kpis={metrics.kpis} loading={loading} />
      ) : loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="h-32 animate-pulse bg-muted/30" />
          ))}
        </div>
      ) : null}

      {/* Analytical Charts Grid */}
      {metrics ? (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="flex flex-col lg:col-span-2">
              <PatientVolumeChart data={metrics.volumeTrends} />
            </div>
            <div className="flex flex-col">
              <RevenueBreakdownChart
                cash={metrics.kpis.cashCollected}
                card={metrics.kpis.cardCollected}
                bank={metrics.kpis.bankCollected}
                total={metrics.kpis.totalCollected}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="flex flex-col">
              <DoctorWorkloadChart doctors={metrics.doctorWorkload} />
            </div>
            <div className="flex flex-col">
              <HourlyArrivalChart data={metrics.hourlyDistribution} />
            </div>
          </div>
        </>
      ) : null}

      {/* Active Operational Sessions */}
      {metrics ? (
        <DashboardLiveSessions sessions={metrics.recentSessions} />
      ) : null}

      {/* Module Shortcuts Hub */}
      <DashboardRecentActivity />
    </div>
  );
}
