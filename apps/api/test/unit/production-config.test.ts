import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertProductionConfig } from '../../src/common/production-config.js';

const safe = {
  NODE_ENV: 'production',
  SMS_PAYLOAD_ENCRYPTION_KEY: 'a'.repeat(48),
  CORS_ORIGIN: 'https://app.example.com',
  PUBLIC_WEB_ORIGIN: 'https://app.example.com',
  SMS_PROVIDER: 'textlk',
  SMS_DISPATCH_ENABLED: 'false',
};

describe('production configuration', () => {
  it('allows local development without production controls', () => {
    assert.deepEqual(assertProductionConfig({ NODE_ENV: 'development' }), []);
  });

  it('refuses a production boot that would use a development secret or invalid origins', () => {
    const problems = assertProductionConfig({
      ...safe,
      SMS_PAYLOAD_ENCRYPTION_KEY: 'dev-only-change-me',
      CORS_ORIGIN: 'http://localhost:5173',
      PUBLIC_WEB_ORIGIN: 'http://localhost:5173',
      SMS_PROVIDER: 'fake',
      SMS_DISPATCH_ENABLED: 'true',
    });
    assert.equal(problems.length, 4);
  });

  it('accepts an explicit production configuration', () => {
    assert.deepEqual(assertProductionConfig(safe), []);
  });
});
