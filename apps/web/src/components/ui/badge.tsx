import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const tones: Record<string, string> = {
  pending:
    'border-transparent bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  active:
    'border-transparent bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  suspended:
    'border-transparent bg-muted text-muted-foreground',
  failed:
    'border-transparent bg-destructive/10 text-destructive',
  rejected:
    'border-transparent bg-destructive/10 text-destructive',
  default:
    'border-transparent bg-primary/10 text-primary',
};

export function Badge({
  tone = 'default',
  className,
  ...props
}: ComponentProps<'span'> & { tone?: keyof typeof tones }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase',
        tones[tone] ?? tones.default,
        className,
      )}
      {...props}
    />
  );
}
