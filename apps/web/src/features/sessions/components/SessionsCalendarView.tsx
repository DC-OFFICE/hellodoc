import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ConsultationSession } from '@/lib/clinic-types';
import {
  addDaysIso,
  clinicTodayIso,
  formatSessionTime,
  startOfWeekIso,
  weekDates,
} from '../utils/session-formatters';
import { SessionStatusBadge } from './SessionStatusBadge';

export function SessionsCalendarView({
  sessions,
  weekStart,
  onWeekChange,
  onCreateDate,
  onSelectSession,
}: {
  sessions: ConsultationSession[];
  weekStart: string;
  onWeekChange: (weekStart: string) => void;
  onCreateDate?: (date: string) => void;
  onSelectSession?: (sessionId: string) => void;
}) {
  const today = clinicTodayIso();
  const days = weekDates(weekStart);
  const byDate = new Map<string, ConsultationSession[]>();
  for (const session of sessions) {
    const list = byDate.get(session.localDate) ?? [];
    list.push(session);
    byDate.set(session.localDate, list);
  }

  const weekLabel = `${days[0]} → ${days[6]}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">Week view</p>
          <p className="text-xs text-muted-foreground">{weekLabel} · Asia/Colombo</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onWeekChange(addDaysIso(weekStart, -7))}
            aria-label="Previous week"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onWeekChange(startOfWeekIso(today))}
          >
            Today
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onWeekChange(addDaysIso(weekStart, 7))}
            aria-label="Next week"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* Desktop / tablet week grid */}
      <div className="hidden gap-2 md:grid md:grid-cols-7">
        {days.map((date) => {
          const daySessions = byDate.get(date) ?? [];
          const isToday = date === today;
          return (
            <div
              key={date}
              className={cn(
                'min-h-40 rounded-lg border bg-white p-2',
                isToday && 'border-teal-300 ring-1 ring-teal-100',
              )}
            >
              <div className="mb-2 flex items-center justify-between gap-1">
                <p className="text-xs font-semibold text-slate-700">
                  {new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })}
                </p>
                <button
                  type="button"
                  className="text-[10px] font-medium text-primary hover:underline"
                  onClick={() => onCreateDate?.(date)}
                >
                  + Add
                </button>
              </div>
              <div className="space-y-1.5">
                {daySessions.length === 0 ? (
                  <p className="px-1 py-6 text-center text-[11px] text-muted-foreground">No sessions</p>
                ) : (
                  daySessions.map((session) => (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => onSelectSession?.(session.id)}
                      className={cn(
                        'block w-full rounded-md border px-2 py-1.5 text-left text-xs transition-colors hover:bg-teal-50 cursor-pointer',
                        session.status === 'CANCELLED' && 'border-red-100 bg-red-50/50 opacity-80',
                      )}
                    >
                      <p className="truncate font-medium text-slate-900">
                        {session.doctorDisplayName}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatSessionTime(session.startAt, session.endAt, session.timezone)}
                      </p>
                      <div className="mt-1">
                        <SessionStatusBadge status={session.status} />
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile agenda */}
      <div className="space-y-3 md:hidden">
        {days.map((date) => {
          const daySessions = byDate.get(date) ?? [];
          return (
            <div key={date} className="rounded-lg border bg-white p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold">
                  {new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'short',
                  })}
                </p>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => onCreateDate?.(date)}
                >
                  + Add
                </button>
              </div>
              {daySessions.length === 0 ? (
                <p className="text-xs text-muted-foreground">No sessions</p>
              ) : (
                <div className="space-y-2">
                  {daySessions.map((session) => (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => onSelectSession?.(session.id)}
                      className="flex w-full items-start justify-between gap-2 rounded-md border px-3 py-2 text-left hover:bg-muted/50 cursor-pointer"
                    >
                      <div>
                        <p className="text-sm font-medium">{session.doctorDisplayName}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatSessionTime(session.startAt, session.endAt, session.timezone)}
                        </p>
                      </div>
                      <SessionStatusBadge status={session.status} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
