/**
 * Integration tests against local PostgreSQL.
 * Skipped automatically when DATABASE_URL is unreachable.
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import pg from 'pg';
import { createClinicSchemaName, assertSafeClinicSchemaName } from '../../src/common/identifiers.js';

const databaseUrl = process.env.DATABASE_URL;
let pool: pg.Pool | null = null;
let dbReady = false;

describe('phase1 postgres readiness', () => {
  before(async () => {
    if (!databaseUrl) return;
    pool = new pg.Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 2000 });
    try {
      await pool.query('SELECT 1');
      dbReady = true;
    } catch {
      dbReady = false;
    }
  });

  after(async () => {
    await pool?.end();
  });

  it('connects to local PostgreSQL when available', async (t) => {
    if (!dbReady) {
      t.skip('PostgreSQL not reachable with current DATABASE_URL');
      return;
    }
    const result = await pool!.query('SELECT current_database() AS db');
    assert.ok(result.rows[0]?.db);
  });

  it('rejects SQL identifier injection patterns', () => {
    assert.throws(() => assertSafeClinicSchemaName("clinic_abc'; DROP TABLE platform.\"PlatformUser\"; --"));
    // Schema names are clinic_<slug>_<6digits>, not legacy clinic_<uuid32>.
    const name = createClinicSchemaName('Hello Medi Help');
    assert.match(name, /^clinic_[a-z0-9_]+_\d{6}$/);
    assert.doesNotThrow(() => assertSafeClinicSchemaName(name));
  });
});

