import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { DashboardTrendPoint } from '../../types';

interface PatientVolumeChartProps {
  data: DashboardTrendPoint[];
}

export function PatientVolumeChart({ data }: PatientVolumeChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <Card className="flex h-full flex-col shadow-xs">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Patient Visit Trends</CardTitle>
          <CardDescription>Daily consultation volume and completions</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          No appointment trend data for this selection.
        </CardContent>
      </Card>
    );
  }

  const maxVal = Math.max(...data.map((d) => Math.max(d.booked, d.completed, d.cancelled, 1)), 5);
  const chartHeight = 180;
  const paddingY = 20;

  return (
    <Card className="flex h-full flex-col shadow-xs">
      <CardHeader className="flex flex-col gap-2 pb-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base font-semibold">Patient Visit Trends</CardTitle>
          <CardDescription>Daily consultation volume and completions</CardDescription>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-xs bg-teal-500" />
            <span className="text-muted-foreground">Booked</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-xs bg-emerald-500" />
            <span className="text-muted-foreground">Completed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-xs bg-rose-400" />
            <span className="text-muted-foreground">Cancelled</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col justify-between pt-2">
        <div className="relative flex flex-1 flex-col justify-between">
          {/* Active tooltip on hover */}
          {hoveredIdx !== null && data[hoveredIdx] ? (
            <div
              className="pointer-events-none absolute -top-8 z-10 -translate-x-1/2 rounded-md border border-border bg-popover px-2.5 py-1 text-xs text-popover-foreground shadow-md transition-all"
              style={{
                left: `${((hoveredIdx + 0.5) / data.length) * 100}%`,
              }}
            >
              <div className="font-semibold">{data[hoveredIdx].date}</div>
              <div className="text-[11px] text-muted-foreground">
                Booked: <strong className="text-teal-600 dark:text-teal-400">{data[hoveredIdx].booked}</strong> · Done:{' '}
                <strong className="text-emerald-600 dark:text-emerald-400">{data[hoveredIdx].completed}</strong> · Cancelled:{' '}
                <strong className="text-rose-500">{data[hoveredIdx].cancelled}</strong>
              </div>
            </div>
          ) : null}

          <div className="h-48 w-full">
            <svg className="size-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 500 180">
              {/* Horizontal Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
                const y = chartHeight - pct * (chartHeight - paddingY);
                return (
                  <line
                    key={i}
                    x1="0"
                    y1={y}
                    x2="500"
                    y2={y}
                    stroke="currentColor"
                    strokeOpacity={0.08}
                    strokeDasharray="4 4"
                  />
                );
              })}

              {/* Data Bars */}
              {data.map((item, i) => {
                const barGroupWidth = 500 / data.length;
                const barWidth = Math.min(Math.max(barGroupWidth * 0.25, 6), 18);
                const centerX = i * barGroupWidth + barGroupWidth / 2;

                const bookedH = (item.booked / maxVal) * (chartHeight - paddingY);
                const completedH = (item.completed / maxVal) * (chartHeight - paddingY);
                const cancelledH = (item.cancelled / maxVal) * (chartHeight - paddingY);

                const bookedY = chartHeight - bookedH;
                const completedY = chartHeight - completedH;
                const cancelledY = chartHeight - cancelledH;

                return (
                  <g
                    key={item.date}
                    className="cursor-pointer transition-opacity hover:opacity-80"
                    onMouseEnter={() => setHoveredIdx(i)}
                    onMouseLeave={() => setHoveredIdx(null)}
                  >
                    {/* Hover column background highlight */}
                    <rect
                      x={i * barGroupWidth}
                      y="0"
                      width={barGroupWidth}
                      height={chartHeight}
                      fill="currentColor"
                      fillOpacity={hoveredIdx === i ? 0.05 : 0}
                    />

                    {/* Booked bar */}
                    <rect
                      x={centerX - barWidth * 1.5 - 2}
                      y={bookedY}
                      width={barWidth}
                      height={Math.max(bookedH, 2)}
                      rx="3"
                      className="fill-teal-500 transition-all duration-300"
                    />

                    {/* Completed bar */}
                    <rect
                      x={centerX - barWidth * 0.5}
                      y={completedY}
                      width={barWidth}
                      height={Math.max(completedH, 2)}
                      rx="3"
                      className="fill-emerald-500 transition-all duration-300"
                    />

                    {/* Cancelled bar */}
                    <rect
                      x={centerX + barWidth * 0.5 + 2}
                      y={cancelledY}
                      width={barWidth}
                      height={Math.max(cancelledH, 2)}
                      rx="3"
                      className="fill-rose-400 transition-all duration-300"
                    />
                  </g>
                );
              })}
            </svg>
          </div>

          {/* X Axis Date labels */}
          <div className={`mt-2 flex text-[11px] text-muted-foreground px-1 ${data.length === 1 ? 'justify-center' : 'justify-between'}`}>
            {data.length <= 7
              ? data.map((d) => <span key={d.date}>{d.date.slice(5)}</span>)
              : [
                data[0],
                data[Math.floor(data.length / 2)],
                data[data.length - 1],
              ].map((d, i) => (
                <span key={i}>{d?.date}</span>
              ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
