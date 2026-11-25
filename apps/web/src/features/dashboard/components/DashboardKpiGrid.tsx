import { ArrowDownRight, ArrowUpRight, CheckCircle2, Clock, DollarSign, Hourglass, Users, UserPlus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { DashboardKpis } from '../types';

interface DashboardKpiGridProps {
  kpis: DashboardKpis;
  loading?: boolean;
}

export function DashboardKpiGrid({ kpis }: DashboardKpiGridProps) {
  const renderDelta = (delta: number | null) => {
    if (delta === null) return null;
    const isPositive = delta >= 0;
    return (
      <div
        className={cn(
          'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
          isPositive
            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            : 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
        )}
      >
        {isPositive ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
        <span>{Math.abs(delta)}%</span>
        <span className="font-normal opacity-75">vs prev</span>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {/* 1. Patient Visits */}
      <Card className="shadow-xs transition-shadow hover:shadow-md">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Patient Visits
            </span>
            <div className="flex size-9 items-center justify-center rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
              <Users className="size-4" />
            </div>
          </div>

          <div className="mt-3 flex items-baseline justify-between">
            <div className="text-3xl font-bold tracking-tight text-foreground tabular-nums">
              {kpis.totalAppointments}
            </div>
            {renderDelta(kpis.deltas.appointmentsPct)}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-1.5 pt-3 border-t border-border/60 text-xs">
            <span className="inline-flex items-center gap-1 rounded bg-teal-500/10 px-1.5 py-0.5 text-[11px] font-medium text-teal-700 dark:text-teal-300">
              <CheckCircle2 className="size-3" />
              {kpis.completedAppointments} Done
            </span>
            <span className="inline-flex items-center gap-1 rounded bg-sky-500/10 px-1.5 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300">
              <Hourglass className="size-3" />
              {kpis.waitingAppointments} Waiting
            </span>
            {kpis.cancelledAppointments > 0 ? (
              <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-[11px] font-medium text-rose-700 dark:text-rose-300">
                {kpis.cancelledAppointments} Cancelled
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* 2. Total Collected Revenue */}
      <Card className="shadow-xs transition-shadow hover:shadow-md">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Collections (LKR)
            </span>
            <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <DollarSign className="size-4" />
            </div>
          </div>

          <div className="mt-3 flex items-baseline justify-between">
            <div className="text-3xl font-bold tracking-tight text-foreground tabular-nums">
              {kpis.totalCollected}
            </div>
            {renderDelta(kpis.deltas.collectedPct)}
          </div>

          <div className="mt-4 flex items-center justify-between pt-3 border-t border-border/60 text-xs text-muted-foreground">
            <span>Invoiced: <strong className="text-foreground">{kpis.totalInvoiced}</strong></span>
            <span>Due: <strong className={cn(parseFloat(kpis.outstandingBalance) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-foreground')}>{kpis.outstandingBalance}</strong></span>
          </div>
        </CardContent>
      </Card>

      {/* 3. Wait Times & Capacity */}
      <Card className="shadow-xs transition-shadow hover:shadow-md">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Queue & Service Speed
            </span>
            <div className="flex size-9 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
              <Clock className="size-4" />
            </div>
          </div>

          <div className="mt-3 flex items-baseline justify-between">
            <div className="text-3xl font-bold tracking-tight text-foreground tabular-nums">
              {kpis.averageWaitMinutes} <span className="text-lg font-normal text-muted-foreground">min</span>
            </div>
            <Badge tone="default" className="text-xs font-medium">
              Avg Wait
            </Badge>
          </div>

          <div className="mt-4 pt-3 border-t border-border/60">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
              <span>Slot Utilization</span>
              <span className="font-semibold text-foreground">{kpis.capacityUtilizationPct}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-teal-500 transition-all duration-500"
                style={{ width: `${Math.min(100, kpis.capacityUtilizationPct)}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 4. Patient Growth & Retention */}
      <Card className="shadow-xs transition-shadow hover:shadow-md">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Patient Base
            </span>
            <div className="flex size-9 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <UserPlus className="size-4" />
            </div>
          </div>

          <div className="mt-3 flex items-baseline justify-between">
            <div className="text-3xl font-bold tracking-tight text-foreground tabular-nums">
              {kpis.newPatientsCount}
            </div>
            <Badge tone="active" className="text-[11px] font-medium">
              New Registrations
            </Badge>
          </div>

          <div className="mt-4 flex items-center justify-between pt-3 border-t border-border/60 text-xs text-muted-foreground">
            <span>Returning Visits:</span>
            <strong className="text-foreground">{kpis.returningPatientsCount} patients</strong>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
