import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('sms payload crypto', () => {
  it('round-trips encrypted payload when key is set', async () => {
    process.env.SMS_PAYLOAD_ENCRYPTION_KEY = 'unit-test-sms-payload-key';
    const { decryptPayload, encryptPayload } = await import(
      '../../src/clinic-notifications/payload-crypto.js'
    );
    const sealed = encryptPayload({ toE164: '+94771234567', message: 'hello' });
    assert.ok(sealed);
    const opened = decryptPayload(sealed!.ciphertext, sealed!.nonce);
    assert.deepEqual(opened, { toE164: '+94771234567', message: 'hello' });
  });
});
