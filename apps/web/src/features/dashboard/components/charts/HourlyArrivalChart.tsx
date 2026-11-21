import { Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { HourlyArrivalItem } from '../../types';

interface HourlyArrivalChartProps {
  data: HourlyArrivalItem[];
}

export function HourlyArrivalChart({ data }: HourlyArrivalChartProps) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <Card className="shadow-xs">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold">Peak Patient Arrival Hours</CardTitle>
            <CardDescription>Hourly check-in rush distribution (08:00 AM - 09:00 PM)</CardDescription>
          </div>
          <div className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Clock className="size-3.5" />
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-2">
        <div className="flex h-36 items-end justify-between gap-1.5 pt-4">
          {data.map((item) => {
            const heightPct = Math.max((item.count / maxCount) * 100, 4);
            const isPeak = item.count === maxCount && item.count > 0;

            return (
              <div key={item.hour} className="group relative flex flex-1 flex-col items-center">
                {/* Tooltip on hover */}
                <div className="pointer-events-none absolute -top-7 opacity-0 transition-opacity group-hover:opacity-100 rounded bg-popover px-1.5 py-0.5 text-[10px] font-medium text-popover-foreground shadow-xs border border-border whitespace-nowrap">
                  {item.label}: {item.count}
                </div>

                {/* Bar */}
                <div
                  className={`w-full rounded-t-sm transition-all duration-300 ${
                    isPeak
                      ? 'bg-primary'
                      : 'bg-primary/30 hover:bg-primary/60'
                  }`}
                  style={{ height: `${heightPct}%` }}
                />

                {/* Hour Label */}
                <span className="mt-2 text-[10px] text-muted-foreground">
                  {item.hour % 2 === 0 ? item.label.split(' ')[0] : ''}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
