import { HeartPulse } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ModeToggle } from '@/components/mode-toggle';

export function BrandHeader({
  right,
  subtitle = 'by DartCodes (Pvt) Ltd',
}: {
  right?: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <Link to="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <HeartPulse size={22} />
          </div>
          <div>
            <div className="text-xl font-bold tracking-tight text-foreground">
              HelloDoc<span className="text-primary">.</span>
            </div>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          {right}
          <ModeToggle />
        </div>
      </div>
    </header>
  );
}
