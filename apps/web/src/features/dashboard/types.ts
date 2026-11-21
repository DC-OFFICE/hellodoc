export type DashboardKpis = {
  totalAppointments: number;
  completedAppointments: number;
  waitingAppointments: number;
  inConsultationAppointments: number;
  cancelledAppointments: number;
  noShowAppointments: number;
  totalInvoiced: string;
  totalCollected: string;
  cashCollected: string;
  cardCollected: string;
  bankCollected: string;
  totalRefunded: string;
  outstandingBalance: string;
  newPatientsCount: number;
  returningPatientsCount: number;
  capacityUtilizationPct: number;
  averageWaitMinutes: number;
  deltas: {
    appointmentsPct: number | null;
    revenuePct: number | null;
    collectedPct: number | null;
  };
};

export type DashboardTrendPoint = {
  date: string;
  booked: number;
  completed: number;
  cancelled: number;
  revenue: number;
};

export type DoctorProductivityItem = {
  doctorId: string;
  doctorName: string;
  specialization?: string | null;
  sessionCount: number;
  patientCount: number;
  completedCount: number;
  revenue: number;
};

export type HourlyArrivalItem = {
  hour: number;
  label: string;
  count: number;
};

export type DashboardSessionItem = {
  id: string;
  doctorId: string;
  doctorName: string;
  localDate: string;
  timeRange: string;
  capacity: number;
  bookedCount: number;
  completedCount: number;
  status: string;
};

export type DashboardMetricsResponse = {
  timezone: string;
  from: string;
  to: string;
  preset: string;
  kpis: DashboardKpis;
  volumeTrends: DashboardTrendPoint[];
  doctorWorkload: DoctorProductivityItem[];
  hourlyDistribution: HourlyArrivalItem[];
  recentSessions: DashboardSessionItem[];
};

export type DashboardPreset = 'today' | 'yesterday' | '7days' | 'month' | 'custom';

export type DashboardFilters = {
  preset: DashboardPreset;
  from: string;
  to: string;
  doctorId: string;
  sessionId: string;
};
