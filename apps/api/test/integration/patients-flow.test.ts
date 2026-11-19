/**
 * Patient management integration checks against live PostgreSQL.
 * Skips automatically when DATABASE_URL is missing.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import pg from 'pg';
import { normalizePhone } from '../../src/clinic-patients/patient-phone.js';
import { formatPatientNumber } from '../../src/clinic-patients/patient-phone.js';

const databaseUrl = process.env.DATABASE_URL;

describe('patients tenant SQL foundation', { skip: !databaseUrl }, () => {
  it('has patients tables on existing clinic schema and allocates unique numbers', async () => {
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      const schemas = await client.query<{ nspname: string }>(
        `select nspname from pg_namespace where nspname like 'clinic_%' order by nspname limit 1`,
      );
      assert.ok(schemas.rows[0], 'expected at least one clinic schema');
      const schema = schemas.rows[0].nspname;
      const quoted = `"${schema.replace(/"/g, '""')}"`;

      const tables = await client.query(
        `select table_name from information_schema.tables
         where table_schema = $1 and table_name in ('patients','patient_contacts','patient_reg_seq')`,
        [schema],
      );
      assert.equal(tables.rowCount, 3);

      await client.query('BEGIN');
      const seq1 = await client.query<{ value: number }>(
        `UPDATE ${quoted}.patient_reg_seq SET value = value + 1 WHERE name = 'patient' RETURNING value`,
      );
      const seq2 = await client.query<{ value: number }>(
        `UPDATE ${quoted}.patient_reg_seq SET value = value + 1 WHERE name = 'patient' RETURNING value`,
      );
      assert.notEqual(seq1.rows[0]?.value, seq2.rows[0]?.value);
      assert.equal(formatPatientNumber(seq1.rows[0]!.value).startsWith('PAT-'), true);

      // Roll back allocator bumps from the test itself
      await client.query('ROLLBACK');

      assert.equal(normalizePhone('0771234567'), normalizePhone('+94771234567'));
      void randomUUID;
    } finally {
      await client.end();
    }
  });
});
