import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function SessionsPageHeader() {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1">
        <p className="text-xs font-semibold tracking-[0.16em] text-teal-700 uppercase">
          Clinic Management / Consultation Sessions
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Consultation Sessions
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Manage doctor schedules, availability and consultation periods.
        </p>
      </div>
      <Link to="/sessions/new" className="shrink-0">
        <Button type="button" className="w-full sm:w-auto">
          <Plus className="size-4" />
          Create Session
        </Button>
      </Link>
    </div>
  );
}
