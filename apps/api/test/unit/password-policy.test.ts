import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validatePasswordStrength } from '../../src/common/password-policy.js';

describe('password policy', () => {
  it('accepts a strong password', () => {
    assert.equal(validatePasswordStrength('StrongPass1!'), null);
  });

  it('rejects weak passwords', () => {
    assert.ok(validatePasswordStrength('short'));
    assert.ok(validatePasswordStrength('alllowercase1!'));
    assert.ok(validatePasswordStrength('ALLUPPERCASE1!'));
    assert.ok(validatePasswordStrength('NoNumber!!!!'));
    assert.ok(validatePasswordStrength('NoSpecial1234'));
  });
});
