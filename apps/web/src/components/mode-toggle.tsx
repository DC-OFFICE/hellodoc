import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Light / dark controls for the app header (shadcn + next-themes). */
export function ModeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex items-center gap-0.5">
        <Button type="button" variant="ghost" size="icon-sm" className="size-8" disabled aria-hidden />
        <Button type="button" variant="ghost" size="icon-sm" className="size-8" disabled aria-hidden />
      </div>
    );
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="Theme">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={cn('size-8', !isDark && 'bg-accent text-accent-foreground')}
        aria-label="Light theme"
        aria-pressed={!isDark}
        onClick={() => setTheme('light')}
      >
        <Sun className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={cn('size-8', isDark && 'bg-accent text-accent-foreground')}
        aria-label="Dark theme"
        aria-pressed={isDark}
        onClick={() => setTheme('dark')}
      >
        <Moon className="size-4" />
      </Button>
    </div>
  );
}
