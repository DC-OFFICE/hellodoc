import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const tones: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-800 border-amber-200',
  active: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  suspended: 'bg-slate-100 text-slate-700 border-slate-200',
  failed: 'bg-red-50 text-red-800 border-red-200',
  rejected: 'bg-red-50 text-red-800 border-red-200',
  default: 'bg-teal-50 text-teal-800 border-teal-200',
};

export function Badge({
  tone = 'default',
  className,
  ...props
}: ComponentProps<'span'> & { tone?: keyof typeof tones }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        tones[tone] ?? tones.default,
        className,
      )}
      {...props}
    />
  );
}
