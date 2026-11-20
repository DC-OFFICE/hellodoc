import { CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function SessionEmptyState({
  variant,
  onReset,
  onCreate,
}: {
  variant: 'empty' | 'filtered';
  onReset?: () => void;
  onCreate?: () => void;
}) {
  if (variant === 'filtered') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
        <p className="text-sm font-medium text-foreground">No sessions match your filters.</p>
        <p className="text-sm text-muted-foreground">
          Try adjusting search, doctor, dates or status.
        </p>
        {onReset ? (
          <Button type="button" variant="secondary" onClick={onReset}>
            Reset filters
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <CalendarPlus className="size-5" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">No consultation sessions yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Create your first session to start organizing doctor availability.
        </p>
      </div>
      <Button type="button" onClick={onCreate}>
        <CalendarPlus className="size-4" />
        Create Session
      </Button>
    </div>
  );
}
