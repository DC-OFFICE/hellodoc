import { Calendar, RotateCcw, User, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { DashboardFilters, DashboardPreset } from '../types';

type DoctorOption = {
  id: string;
  displayName: string;
};

type SessionOption = {
  id: string;
  doctorDisplayName: string | null;
  localDate: string;
  startAt?: string;
  endAt?: string;
};

interface DashboardFilterBarProps {
  filters: DashboardFilters;
  onChange: (patch: Partial<DashboardFilters>) => void;
  onReset: () => void;
  doctors: DoctorOption[];
  sessions: SessionOption[];
  loading?: boolean;
}

const PRESET_OPTIONS: { id: DashboardPreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'custom', label: 'Custom' },
];

export function DashboardFilterBar({
  filters,
  onChange,
  onReset,
  doctors,
  sessions,
  loading = false,
}: DashboardFilterBarProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Preset Buttons */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium text-muted-foreground">Range:</span>
          {PRESET_OPTIONS.map((opt) => (
            <Button
              key={opt.id}
              type="button"
              size="sm"
              variant={filters.preset === opt.id ? 'default' : 'outline'}
              className={cn(
                'h-8 text-xs font-medium cursor-pointer',
                filters.preset === opt.id ? 'shadow-xs' : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => onChange({ preset: opt.id })}
            >
              {opt.label}
            </Button>
          ))}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            onClick={onReset}
            disabled={loading}
          >
            <RotateCcw className="mr-1.5 size-3.5" />
            Reset filters
          </Button>
        </div>
      </div>

      {/* Secondary filter controls (Date pickers, Doctor, Session) */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {/* From / To dates are only shown for the Custom range */}
        {filters.preset === 'custom' ? (
          <>
            <div>
              <Label className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="size-3.5" />
                From Date
              </Label>
              <Input
                type="date"
                className="h-9 text-xs"
                value={filters.from}
                onChange={(e) => onChange({ from: e.target.value, preset: 'custom' })}
              />
            </div>

            <div>
              <Label className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="size-3.5" />
                To Date
              </Label>
              <Input
                type="date"
                className="h-9 text-xs"
                value={filters.to}
                onChange={(e) => onChange({ to: e.target.value, preset: 'custom' })}
              />
            </div>
          </>
        ) : null}

        {/* Doctor Filter */}
        <div>
          <Label className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <User className="size-3.5" />
            Doctor
          </Label>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs text-foreground shadow-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
            value={filters.doctorId}
            onChange={(e) => onChange({ doctorId: e.target.value, sessionId: 'all' })}
          >
            <option value="all">All doctors</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.displayName}
              </option>
            ))}
          </select>
        </div>

        {/* Session Filter */}
        <div>
          <Label className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3.5" />
            Consultation Session
          </Label>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs text-foreground shadow-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
            value={filters.sessionId}
            onChange={(e) => onChange({ sessionId: e.target.value })}
          >
            <option value="all">All sessions</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.localDate} · {s.doctorDisplayName || 'Clinic'}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
