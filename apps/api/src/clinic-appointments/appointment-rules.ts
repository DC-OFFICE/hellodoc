export const APPOINTMENT_STATUSES = ['CONFIRMED', 'CANCELLED', 'RESCHEDULED'] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const BOOKING_SOURCES = ['PHONE', 'WALK_IN'] as const;
export type BookingSource = (typeof BOOKING_SOURCES)[number];

/** Sessions that may accept new bookings before end time. */
export const BOOKABLE_SESSION_STATUSES = new Set(['SCHEDULED', 'OPEN', 'PAUSED', 'DELAYED']);

export function assertTransition(
  from: AppointmentStatus,
  to: AppointmentStatus,
): void {
  const allowed: Record<AppointmentStatus, AppointmentStatus[]> = {
    CONFIRMED: ['CANCELLED', 'RESCHEDULED'],
    CANCELLED: [],
    RESCHEDULED: [],
  };
  if (!allowed[from].includes(to)) {
    const err = new Error(`Invalid status transition ${from} → ${to}`);
    (err as Error & { code: string }).code = 'INVALID_STATUS_TRANSITION';
    throw err;
  }
}

export function formatQueueDisplay(queueNumber: number): string {
  return String(queueNumber).padStart(3, '0');
}

export function formatBookingReference(seq: number): string {
  return `APT-${String(seq).padStart(6, '0')}`;
}

export function isSessionBookable(input: {
  status: string;
  endAt: Date;
  now?: Date;
}): boolean {
  if (!BOOKABLE_SESSION_STATUSES.has(input.status)) return false;
  const now = input.now ?? new Date();
  return input.endAt.getTime() > now.getTime();
}
