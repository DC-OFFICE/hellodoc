import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertQueueTransition,
  estimateWaitMinutes,
  isCallableSessionStatus,
} from '../../src/clinic-queue/queue-state.js';

describe('queue state machine', () => {
  it('allows documented transitions and recall', () => {
    assert.doesNotThrow(() => assertQueueTransition('RESERVED', 'WAITING'));
    assert.doesNotThrow(() => assertQueueTransition('WAITING', 'CALLED'));
    assert.doesNotThrow(() => assertQueueTransition('CALLED', 'CALLED'));
    assert.doesNotThrow(() => assertQueueTransition('CALLED', 'IN_SERVICE'));
    assert.doesNotThrow(() => assertQueueTransition('IN_SERVICE', 'COMPLETED'));
    assert.throws(() => assertQueueTransition('COMPLETED', 'WAITING'));
    assert.throws(() => assertQueueTransition('IN_SERVICE', 'SKIPPED'));
  });

  it('only OPEN sessions are callable', () => {
    assert.equal(isCallableSessionStatus('OPEN'), true);
    assert.equal(isCallableSessionStatus('PAUSED'), false);
    assert.equal(isCallableSessionStatus('SCHEDULED'), false);
  });

  it('returns unavailable estimates when paused', () => {
    const estimate = estimateWaitMinutes({
      sessionStatus: 'PAUSED',
      peopleAhead: 3,
      avgMinutes: 10,
      hasActiveTurn: true,
    });
    assert.equal(estimate.available, false);
  });

  it('returns a bounded wait range for active sessions', () => {
    const estimate = estimateWaitMinutes({
      sessionStatus: 'OPEN',
      peopleAhead: 2,
      avgMinutes: 10,
      hasActiveTurn: true,
    });
    assert.equal(estimate.available, true);
    assert.ok((estimate.minutesLow ?? 0) >= 0);
    assert.ok((estimate.minutesHigh ?? 0) >= (estimate.minutesLow ?? 0));
  });
});
