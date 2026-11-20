import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function SessionsPageHeader({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Consultation Sessions
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Manage doctor schedules, availability and consultation periods.
        </p>
      </div>
      <Button type="button" className="w-full shrink-0 sm:w-auto" onClick={onCreate}>
        <Plus className="size-4" />
        Create Session
      </Button>
    </div>
  );
}
