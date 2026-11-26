import { Link } from 'react-router-dom';
import { CalendarClock, Play, ArrowRight, UserCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { DashboardSessionItem } from '../types';

interface DashboardLiveSessionsProps {
  sessions: DashboardSessionItem[];
}

export function DashboardLiveSessions({ sessions }: DashboardLiveSessionsProps) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
        return <Badge tone="active">LIVE OPEN</Badge>;
      case 'SCHEDULED':
        return <Badge tone="default">SCHEDULED</Badge>;
      case 'PAUSED':
        return <Badge tone="pending">PAUSED</Badge>;
      case 'CLOSED':
        return <Badge tone="suspended">CLOSED</Badge>;
      default:
        return <Badge tone="default">{status}</Badge>;
    }
  };

  return (
    <Card className="shadow-xs">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-base font-semibold">Active & Upcoming Sessions</CardTitle>
          <CardDescription>Live consultation capacity and queue progress</CardDescription>
        </div>
        <Button asChild variant="outline" size="sm" className="h-8 text-xs cursor-pointer">
          <Link to="/sessions">
            All Sessions
            <ArrowRight className="ml-1.5 size-3.5" />
          </Link>
        </Button>
      </CardHeader>

      <CardContent className="pt-1">
        {sessions.length === 0 ? (
          <div className="flex h-36 flex-col items-center justify-center rounded-lg border border-dashed border-border p-6 text-center">
            <CalendarClock className="mb-2 size-8 text-muted-foreground/60" />
            <p className="text-sm font-medium text-foreground">No sessions scheduled for this period</p>
            <p className="mt-1 text-xs text-muted-foreground">Create consultation sessions to start booking patients.</p>
            <Button asChild size="sm" className="mt-3 text-xs">
              <Link to="/sessions">Create Session</Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {sessions.map((session) => {
              const bookedPct = session.capacity > 0 ? Math.round((session.bookedCount / session.capacity) * 100) : 0;
              const isFull = bookedPct >= 100;

              return (
                <div
                  key={session.id}
                  className="rounded-lg border border-border bg-card p-3.5 transition-all hover:border-primary/40 hover:shadow-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground text-sm">{session.doctorName}</p>
                      <p className="text-xs text-muted-foreground">{session.localDate} · {session.timeRange}</p>
                    </div>
                    {getStatusBadge(session.status)}
                  </div>

                  {/* Capacity progress */}
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Booked Capacity</span>
                      <span className="font-semibold text-foreground tabular-nums">
                        {session.bookedCount} / {session.capacity} ({bookedPct}%)
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-500',
                          isFull ? 'bg-amber-500' : 'bg-primary',
                        )}
                        style={{ width: `${Math.min(100, bookedPct)}%` }}
                      />
                    </div>
                  </div>

                  {/* Actions footer */}
                  <div className="mt-3.5 flex items-center justify-between border-t border-border/60 pt-2.5">
                    <span className="text-[11px] text-muted-foreground">
                      <UserCheck className="mr-1 inline size-3 text-emerald-500" />
                      {session.completedCount} seen
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
                        <Link to={`/sessions?detail=${session.id}`}>Details</Link>
                      </Button>
                      <Button asChild size="sm" className="h-7 px-2 text-xs">
                        <Link to={`/sessions/${session.id}/queue`}>
                          <Play className="mr-1 size-3" />
                          Live Queue
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
