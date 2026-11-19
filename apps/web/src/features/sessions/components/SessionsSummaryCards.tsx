import { CalendarClock, CalendarDays, Users, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export type SessionsSummary = {
  todayCount: number;
  upcomingCount: number;
  scheduledCapacity: number;
  cancelledCount: number;
  rangeLabel: string;
};

function SummaryCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string | number;
  hint: string;
}) {
  return (
    <Card className="shadow-none">
      <CardContent className="flex items-start gap-3 py-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-teal-50 text-teal-800">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {label}
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function SessionsSummaryCards({
  summary,
  loading,
}: {
  summary: SessionsSummary | null;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="shadow-none">
            <CardContent className="space-y-3 py-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard
        icon={CalendarDays}
        label="Today's sessions"
        value={summary.todayCount}
        hint="Clinic-local date (Asia/Colombo)"
      />
      <SummaryCard
        icon={CalendarClock}
        label="Upcoming"
        value={summary.upcomingCount}
        hint={summary.rangeLabel}
      />
      <SummaryCard
        icon={Users}
        label="Scheduled capacity"
        value={summary.scheduledCapacity}
        hint="Patient slots in upcoming window"
      />
      <SummaryCard
        icon={XCircle}
        label="Cancelled"
        value={summary.cancelledCount}
        hint={summary.rangeLabel}
      />
    </div>
  );
}
