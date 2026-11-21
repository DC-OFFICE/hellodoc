import { Stethoscope } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { DoctorProductivityItem } from '../../types';

interface DoctorWorkloadChartProps {
  doctors: DoctorProductivityItem[];
}

export function DoctorWorkloadChart({ doctors }: DoctorWorkloadChartProps) {
  if (!doctors || doctors.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Doctor Workload</CardTitle>
          <CardDescription>Consultations completed per clinician</CardDescription>
        </CardHeader>
        <CardContent className="flex h-56 items-center justify-center text-sm text-muted-foreground">
          No doctor activity recorded for this period.
        </CardContent>
      </Card>
    );
  }

  const maxVal = Math.max(...doctors.map((d) => d.patientCount), 1);

  return (
    <Card className="shadow-xs">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Doctor Workload & Consultations</CardTitle>
        <CardDescription>Patient throughput across clinic practitioners</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 pt-1">
        {doctors.slice(0, 5).map((doc) => {
          const completedPct = Math.round((doc.completedCount / maxVal) * 100);
          const totalPct = Math.round((doc.patientCount / maxVal) * 100);

          return (
            <div key={doc.doctorId} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="flex size-6 items-center justify-center rounded bg-primary/10 text-primary font-medium">
                    <Stethoscope className="size-3" />
                  </div>
                  <div>
                    <span className="font-semibold text-foreground">{doc.doctorName}</span>
                    {doc.specialization ? (
                      <span className="ml-1.5 text-[11px] text-muted-foreground">· {doc.specialization}</span>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center gap-2 text-right">
                  <span className="text-[11px] text-muted-foreground">
                    {doc.sessionCount} session{doc.sessionCount !== 1 ? 's' : ''}
                  </span>
                  <span className="font-semibold text-foreground tabular-nums">
                    {doc.completedCount} / {doc.patientCount}
                  </span>
                </div>
              </div>

              {/* Stacked Progress Bar */}
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                {/* Total booked capacity bar */}
                <div
                  className="absolute h-full rounded-full bg-teal-500/20"
                  style={{ width: `${totalPct}%` }}
                />
                {/* Completed consultations bar */}
                <div
                  className="absolute h-full rounded-full bg-teal-500 transition-all duration-500"
                  style={{ width: `${completedPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
