import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatQueueDisplay, renderTemplate } from '../../src/clinic-notifications/notification-render.js';

describe('notification template render', () => {
  it('substitutes queue and tracking placeholders', () => {
    const text = renderTemplate(
      'Queue {{queueDisplay}}. Track: {{trackingUrl}}.',
      { queueDisplay: formatQueueDisplay(18), sessionDate: '2026-11-20', trackingUrl: 'https://x/track/abc' },
    );
    assert.equal(text, 'Queue 018. Track: https://x/track/abc.');
  });
});
