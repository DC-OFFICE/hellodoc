import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;

describe('clinical tenant SQL foundation', { skip: !databaseUrl }, () => {
  it('creates encounter and prescription tables and does not default allergies to NKA', async () => {
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      const schemas = await client.query<{ nspname: string }>(
        `select nspname from pg_namespace where nspname like 'clinic_%' order by nspname limit 2`,
      );
      assert.ok(schemas.rows.length >= 2);
      for (const row of schemas.rows) {
        const tables = await client.query(
          `select table_name from information_schema.tables
           where table_schema = $1
             and table_name in ('clinical_encounters','prescriptions','doctor_user_links','patient_allergy_status')`,
          [row.nspname],
        );
        assert.equal(tables.rowCount, 4);
      }
      const def = await client.query<{ column_default: string }>(
        `select column_default from information_schema.columns
         where table_schema = $1 and table_name = 'patient_allergy_status' and column_name = 'status'`,
        [schemas.rows[0]!.nspname],
      );
      assert.match(def.rows[0]?.column_default ?? '', /UNKNOWN/);
    } finally {
      await client.end();
    }
  });
});
