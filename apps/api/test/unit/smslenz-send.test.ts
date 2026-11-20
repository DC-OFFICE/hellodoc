import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sendSmslenzMessage } from '../../src/clinic-notifications/sms/smslenz-send.js';

const credentials = {
  baseUrl: 'https://smslenz.lk',
  userId: '1862',
  apiKey: 'secret-key',
  readTimeoutMs: 1000,
};

const request = {
  toE164: '+94771234567',
  senderId: 'DARTCODES',
  message: 'Queue A001',
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('smslenz send', () => {
  it('accepts a successful campaign id and keeps the +94 contact', async () => {
    let sentBody = '';
    const result = await sendSmslenzMessage(credentials, request, async (_url, init) => {
      sentBody = String(init?.body ?? '');
      return jsonResponse(200, {
        success: true,
        message: 'SMS sent successfully',
        data: { status: 'success', campaign_id: 42 },
      });
    });
    assert.equal(result.outcome, 'ACCEPTED');
    if (result.outcome === 'ACCEPTED') assert.equal(result.providerMessageId, '42');
    assert.match(sentBody, /secret-key/);
    assert.match(sentBody, /\+94771234567/);
  });

  it('maps 401 to a permanent failure and redacts the key', async () => {
    const result = await sendSmslenzMessage(credentials, request, async () =>
      jsonResponse(401, { success: false, message: 'bad secret-key' }),
    );
    assert.equal(result.outcome, 'PERMANENT_FAILURE');
    if (result.outcome === 'PERMANENT_FAILURE') {
      assert.equal(result.errorCategory, 'PROVIDER_HTTP_4XX');
      assert.equal(result.errorMessage.includes('secret-key'), false);
      assert.match(result.errorMessage, /\[redacted\]/);
    }
  });

  it('maps 429 to a temporary failure', async () => {
    const result = await sendSmslenzMessage(credentials, request, async () =>
      jsonResponse(429, { success: false, message: 'slow down' }),
    );
    assert.equal(result.outcome, 'TEMPORARY_FAILURE');
    if (result.outcome === 'TEMPORARY_FAILURE') assert.equal(result.errorCategory, 'PROVIDER_HTTP_5XX');
  });

  it('maps an aborted request to uncertain', async () => {
    const result = await sendSmslenzMessage(credentials, request, async () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    });
    assert.equal(result.outcome, 'UNCERTAIN');
    if (result.outcome === 'UNCERTAIN') assert.equal(result.errorCategory, 'TIMEOUT');
  });
});
