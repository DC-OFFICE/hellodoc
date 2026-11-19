import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compareMoney, lineAmounts, parseMoneyToCents, subtractMoney } from '../../src/common/money.js';
import { acceptedTotpStep, base32Decode, generateTotpSecret, hotp, totpCode, verifyTotp } from '../../src/common/totp.js';

describe('money', () => {
  it('calculates consultation lines in cents and rejects over-discount', () => {
    const line = lineAmounts({ quantity: 1, unitPrice: '2000.00', discount: '0.00' });
    assert.equal(line.total, '2000.00');
    const taxed = lineAmounts({
      quantity: 1,
      unitPrice: '100.00',
      discount: '0.00',
      taxRatePercent: '8',
    });
    assert.equal(taxed.tax, '8.00');
    assert.equal(taxed.total, '108.00');
    assert.throws(() => parseMoneyToCents('-1.00'));
    assert.throws(() => lineAmounts({ quantity: 1, unitPrice: '10.00', discount: '10.01' }));
    assert.equal(compareMoney(subtractMoney('2000.00', '1000.00'), '1000.00'), 0);
  });
});

describe('totp', () => {
  it('accepts the current code and rejects a wrong code', () => {
    const secret = base32Decode(generateTotpSecret());
    const now = Date.UTC(2026, 10, 18, 10, 0, 0);
    const code = totpCode(secret, now);
    assert.equal(verifyTotp(secret, code, now), true);
    if (code !== '000000') assert.equal(verifyTotp(secret, '000000', now), false);
    assert.equal(hotp(secret, 1n).length, 6);
  });

  it('returns the accepted time step so a code cannot be replayed in the same window', () => {
    const secret = base32Decode(generateTotpSecret());
    const now = Date.UTC(2026, 10, 18, 10, 0, 15);
    const code = totpCode(secret, now);
    const step = acceptedTotpStep(secret, code, now);
    assert.equal(step, BigInt(Math.floor(now / 30_000)));
    const stillAccepted = acceptedTotpStep(secret, code, now + 30_000);
    assert.ok(stillAccepted !== null && stillAccepted <= step!);
    assert.equal(acceptedTotpStep(secret, '111111', now), null);
  });
});
