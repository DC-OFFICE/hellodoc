import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FakeSmsProvider } from '../../src/clinic-notifications/sms/fake-sms.provider.js';

describe('fake sms provider', () => {
  it('accepts normal numbers and marks special suffixes', async () => {
    const provider = new FakeSmsProvider();
    const ok = await provider.sendMessage({
      toE164: '+94771112233',
      senderId: 'HelloDoc',
      message: 'test',
    });
    assert.equal(ok.outcome, 'ACCEPTED');

    const permanent = await provider.sendMessage({
      toE164: '+94771110000',
      senderId: 'HelloDoc',
      message: 'test',
    });
    assert.equal(permanent.outcome, 'PERMANENT_FAILURE');

    const temporary = await provider.sendMessage({
      toE164: '+94771119999',
      senderId: 'HelloDoc',
      message: 'test',
    });
    assert.equal(temporary.outcome, 'TEMPORARY_FAILURE');

    const uncertain = await provider.sendMessage({
      toE164: '+94771118888',
      senderId: 'HelloDoc',
      message: 'test',
    });
    assert.equal(uncertain.outcome, 'UNCERTAIN');
  });
});
