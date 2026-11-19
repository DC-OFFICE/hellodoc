import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertTransition,
  formatBookingReference,
  formatQueueDisplay,
  isSessionBookable,
} from '../../src/clinic-appointments/appointment-rules.js';

describe('appointment rules', () => {
  it('formats queue display and booking references', () => {
    assert.equal(formatQueueDisplay(1), '001');
    assert.equal(formatQueueDisplay(18), '018');
    assert.equal(formatBookingReference(7), 'APT-000007');
  });

  it('allows booking SCHEDULED sessions before end', () => {
    const endAt = new Date(Date.now() + 60 * 60 * 1000);
    assert.equal(isSessionBookable({ status: 'SCHEDULED', endAt }), true);
    assert.equal(isSessionBookable({ status: 'CANCELLED', endAt }), false);
    assert.equal(
      isSessionBookable({ status: 'SCHEDULED', endAt: new Date(Date.now() - 1000) }),
      false,
    );
  });

  it('validates status transitions', () => {
    assert.doesNotThrow(() => assertTransition('CONFIRMED', 'CANCELLED'));
    assert.doesNotThrow(() => assertTransition('CONFIRMED', 'RESCHEDULED'));
    assert.throws(() => assertTransition('CANCELLED', 'CONFIRMED'));
  });
});
