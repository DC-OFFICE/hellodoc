import { Link } from 'react-router-dom';
import { CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function SessionEmptyState({
  variant,
  onReset,
}: {
  variant: 'empty' | 'filtered';
  onReset?: () => void;
}) {
  if (variant === 'filtered') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
        <p className="text-sm font-medium text-slate-900">No sessions match your filters.</p>
        <p className="text-sm text-muted-foreground">Try adjusting search, doctor, dates or status.</p>
        {onReset ? (
          <Button type="button" variant="outline" onClick={onReset}>
            Reset filters
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-teal-50 text-teal-800">
        <CalendarPlus className="size-5" />
      </div>
      <div>
        <p className="text-sm font-medium text-slate-900">No consultation sessions yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Create your first session to start organizing doctor availability.
        </p>
      </div>
      <Link to="/sessions/new">
        <Button type="button">
          <CalendarPlus className="size-4" />
          Create Session
        </Button>
      </Link>
    </div>
  );
}
