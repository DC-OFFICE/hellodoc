export type SessionStatus = 'SCHEDULED' | 'CANCELLED' | string;

export function sessionStatusLabel(status: SessionStatus): string {
  if (status === 'SCHEDULED') return 'Scheduled';
  if (status === 'CANCELLED') return 'Cancelled';
  if (status === 'OPEN') return 'Open';
  if (status === 'PAUSED') return 'Paused';
  if (status === 'DELAYED') return 'Delayed';
  if (status === 'CLOSED') return 'Closed';
  return status;
}

export function sessionStatusTone(
  status: SessionStatus,
): 'default' | 'active' | 'rejected' | 'suspended' {
  if (status === 'SCHEDULED') return 'default';
  if (status === 'CANCELLED') return 'rejected';
  if (status === 'OPEN') return 'active';
  return 'suspended';
}

export function canModifySession(status: string, startAt: string): boolean {
  return status === 'SCHEDULED' && new Date(startAt).getTime() > Date.now();
}
