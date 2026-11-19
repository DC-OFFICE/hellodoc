export const QUEUE_STATES = [
  'RESERVED',
  'WAITING',
  'CALLED',
  'IN_SERVICE',
  'COMPLETED',
  'HELD',
  'SKIPPED',
  'NO_SHOW',
  'INVALIDATED',
] as const;

export type QueueState = (typeof QUEUE_STATES)[number];

const TRANSITIONS: Record<QueueState, QueueState[]> = {
  RESERVED: ['WAITING', 'NO_SHOW', 'INVALIDATED'],
  WAITING: ['CALLED', 'HELD', 'SKIPPED', 'INVALIDATED'],
  CALLED: ['IN_SERVICE', 'CALLED', 'HELD', 'SKIPPED', 'INVALIDATED'],
  IN_SERVICE: ['COMPLETED', 'INVALIDATED'],
  COMPLETED: [],
  HELD: ['WAITING', 'INVALIDATED'],
  SKIPPED: ['WAITING', 'INVALIDATED'],
  NO_SHOW: [],
  INVALIDATED: [],
};

export function assertQueueTransition(from: QueueState, to: QueueState): void {
  if (from === to && from === 'CALLED') return; // recall
  if (!TRANSITIONS[from].includes(to)) {
    const err = new Error(`Invalid queue transition ${from} → ${to}`);
    (err as Error & { code: string }).code = 'INVALID_QUEUE_TRANSITION';
    throw err;
  }
}

export function isCallableSessionStatus(status: string): boolean {
  return status === 'OPEN';
}

export type WaitEstimate = {
  available: boolean;
  minutesLow: number | null;
  minutesHigh: number | null;
  label: string;
  reason: string | null;
};

export function estimateWaitMinutes(input: {
  sessionStatus: string;
  peopleAhead: number;
  avgMinutes: number;
  hasActiveTurn: boolean;
}): WaitEstimate {
  if (['PAUSED', 'DELAYED', 'CANCELLED', 'CLOSED'].includes(input.sessionStatus)) {
    return {
      available: false,
      minutesLow: null,
      minutesHigh: null,
      label: 'Estimated time currently unavailable',
      reason: `session_${input.sessionStatus.toLowerCase()}`,
    };
  }
  if (input.avgMinutes <= 0) {
    return {
      available: false,
      minutesLow: null,
      minutesHigh: null,
      label: 'Estimated time currently unavailable',
      reason: 'missing_duration',
    };
  }
  const units = input.peopleAhead + (input.hasActiveTurn ? 1 : 0);
  const mid = units * input.avgMinutes;
  const low = Math.max(0, Math.round(mid * 0.8));
  const high = Math.max(low + 5, Math.round(mid * 1.25));
  if (units === 0 && input.sessionStatus === 'OPEN') {
    return {
      available: true,
      minutesLow: 0,
      minutesHigh: Math.max(5, Math.round(input.avgMinutes * 0.5)),
      label: `Approximately 0–${Math.max(5, Math.round(input.avgMinutes * 0.5))} minutes`,
      reason: null,
    };
  }
  return {
    available: true,
    minutesLow: low,
    minutesHigh: high,
    label: `Approximately ${low}–${high} minutes`,
    reason: null,
  };
}
