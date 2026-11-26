import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { addDaysIso, clinicTodayIso } from '../utils/session-formatters';

export type SessionViewMode = 'list' | 'calendar';
/** OPEN covers sessions in progress (open or paused). */
export type SessionStatusFilter = 'SCHEDULED' | 'OPEN' | 'CLOSED' | 'CANCELLED' | 'ALL';

export type SessionFilters = {
  q: string;
  doctorId: string;
  status: SessionStatusFilter;
  from: string;
  to: string;
  view: SessionViewMode;
  page: number;
  pageSize: number;
};

const DEFAULT_PAGE_SIZE = 10;

function parsePositiveInt(value: string | null, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function useSessionFilters() {
  const [params, setParams] = useSearchParams();
  const today = clinicTodayIso();

  const filters: SessionFilters = useMemo(() => {
    const status = (params.get('status') as SessionStatusFilter) || 'SCHEDULED';
    const view = (params.get('view') as SessionViewMode) || 'list';
    return {
      q: params.get('q') ?? '',
      doctorId: params.get('doctorId') ?? '',
      status: ['SCHEDULED', 'OPEN', 'CLOSED', 'CANCELLED', 'ALL'].includes(status) ? status : 'SCHEDULED',
      from: params.get('from') ?? today,
      to: params.get('to') ?? addDaysIso(today, 90),
      view: view === 'calendar' ? 'calendar' : 'list',
      page: parsePositiveInt(params.get('page'), 1),
      pageSize: parsePositiveInt(params.get('pageSize'), DEFAULT_PAGE_SIZE),
    };
  }, [params, today]);

  const patch = useCallback(
    (next: Partial<SessionFilters>, options?: { resetPage?: boolean }) => {
      setParams(
        (prev) => {
          const merged = { ...Object.fromEntries(prev.entries()), ...serialize(next) };
          if (options?.resetPage !== false && !('page' in next)) {
            merged.page = '1';
          }
          // drop empties
          const out = new URLSearchParams();
          for (const [k, v] of Object.entries(merged)) {
            if (v != null && String(v).length > 0) out.set(k, String(v));
          }
          return out;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const reset = useCallback(() => {
    const t = clinicTodayIso();
    setParams(
      {
        status: 'SCHEDULED',
        from: t,
        to: addDaysIso(t, 90),
        view: filters.view,
        page: '1',
        pageSize: String(DEFAULT_PAGE_SIZE),
      },
      { replace: true },
    );
  }, [filters.view, setParams]);

  return { filters, patch, reset };
}

function serialize(partial: Partial<SessionFilters>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(partial)) {
    if (value == null) continue;
    out[key] = String(value);
  }
  return out;
}
