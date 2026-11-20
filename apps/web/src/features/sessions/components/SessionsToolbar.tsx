import { useEffect, useState } from 'react';
import { Filter, LayoutGrid, List, RotateCcw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import type { Doctor } from '@/lib/clinic-types';
import type { SessionFilters, SessionStatusFilter, SessionViewMode } from '../hooks/useSessionFilters';

type Props = {
  filters: SessionFilters;
  doctors: Doctor[];
  onChange: (patch: Partial<SessionFilters>) => void;
  onApply: () => void;
  onReset: () => void;
};

function FilterFields({
  filters,
  doctors,
  onChange,
  searchDraft,
  setSearchDraft,
}: {
  filters: SessionFilters;
  doctors: Doctor[];
  onChange: (patch: Partial<SessionFilters>) => void;
  searchDraft: string;
  setSearchDraft: (v: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6 xl:items-end">
      <div className="xl:col-span-2">
        <Label htmlFor="session-search">Search</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="session-search"
            className="pl-8"
            placeholder="Search by doctor name…"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
          />
        </div>
      </div>
      <div>
        <Label>Doctor</Label>
        <Select
          value={filters.doctorId || 'all'}
          onValueChange={(v) => onChange({ doctorId: v === 'all' ? '' : v })}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="All doctors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All doctors</SelectItem>
            {doctors.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="from">From</Label>
        <Input
          id="from"
          type="date"
          value={filters.from}
          onChange={(e) => onChange({ from: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor="to">To</Label>
        <Input
          id="to"
          type="date"
          value={filters.to}
          onChange={(e) => onChange({ to: e.target.value })}
        />
      </div>
      <div>
        <Label>Status</Label>
        <Select
          value={filters.status}
          onValueChange={(v) => onChange({ status: v as SessionStatusFilter })}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="SCHEDULED">Scheduled</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export function SessionsToolbar({ filters, doctors, onChange, onApply, onReset }: Props) {
  const [searchDraft, setSearchDraft] = useState(filters.q);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => setSearchDraft(filters.q), [filters.q]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (searchDraft !== filters.q) onChange({ q: searchDraft });
    }, 250);
    return () => window.clearTimeout(handle);
  }, [searchDraft, filters.q, onChange]);

  const setView = (view: SessionViewMode) => onChange({ view });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">All sessions</h2>
          <p className="text-xs text-muted-foreground">Filter, sort and review consultation periods</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="hidden items-center rounded-md border border-border bg-muted/40 p-0.5 md:flex">
            <Button
              type="button"
              size="sm"
              variant={filters.view === 'list' ? 'default' : 'ghost'}
              onClick={() => setView('list')}
            >
              <List className="size-4" />
              List
            </Button>
            <Button
              type="button"
              size="sm"
              variant={filters.view === 'calendar' ? 'default' : 'ghost'}
              onClick={() => setView('calendar')}
            >
              <LayoutGrid className="size-4" />
              Calendar
            </Button>
          </div>
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button type="button" variant="secondary" size="sm" className="md:hidden">
                <Filter className="size-4" />
                Filters
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Session filters</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <FilterFields
                  filters={filters}
                  doctors={doctors}
                  onChange={onChange}
                  searchDraft={searchDraft}
                  setSearchDraft={setSearchDraft}
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    className="flex-1"
                    onClick={() => {
                      onApply();
                      setSheetOpen(false);
                    }}
                  >
                    Apply
                  </Button>
                  <Button type="button" variant="secondary" onClick={onReset}>
                    Reset
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
          <Button type="button" variant="secondary" size="sm" onClick={onReset}>
            <RotateCcw className="size-4" />
            Reset
          </Button>
          <Button type="button" size="sm" onClick={onApply}>
            Apply
          </Button>
        </div>
      </div>

      <div className="hidden md:block">
        <FilterFields
          filters={filters}
          doctors={doctors}
          onChange={onChange}
          searchDraft={searchDraft}
          setSearchDraft={setSearchDraft}
        />
      </div>

      <div className="flex items-center rounded-md border border-border bg-muted/40 p-0.5 md:hidden">
        <Button
          type="button"
          size="sm"
          className="flex-1"
          variant={filters.view === 'list' ? 'default' : 'ghost'}
          onClick={() => setView('list')}
        >
          <List className="size-4" />
          List
        </Button>
        <Button
          type="button"
          size="sm"
          className="flex-1"
          variant={filters.view === 'calendar' ? 'default' : 'ghost'}
          onClick={() => setView('calendar')}
        >
          <LayoutGrid className="size-4" />
          Calendar
        </Button>
      </div>
    </div>
  );
}
