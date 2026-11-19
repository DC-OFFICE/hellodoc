/**
 * SMS notification schema + dispatch index foundation checks.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;

describe('sms notifications tenant SQL foundation', { skip: !databaseUrl }, () => {
  it('has notification tables on clinic schemas and platform dispatch index', async () => {
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      const platform = await client.query(
        `select table_name from information_schema.tables
         where table_schema = 'platform'
           and table_name in ('tracking_token_index','sms_dispatch_index')`,
      );
      assert.equal(platform.rowCount, 2);

      const schemas = await client.query<{ nspname: string }>(
        `SELECT t."schemaName" AS nspname
         FROM platform."Tenant" t
         WHERE t.status = 'ACTIVE'
           AND t."schemaName" LIKE 'clinic_%'
         ORDER BY t."createdAt" ASC
         LIMIT 2`,
      );
      assert.ok(schemas.rows.length >= 1);
      for (const row of schemas.rows) {
        const tables = await client.query(
          `select table_name from information_schema.tables
           where table_schema = $1
             and table_name in (
               'notification_settings','notification_templates',
               'notification_outbox','notification_delivery_events'
             )`,
          [row.nspname],
        );
        assert.equal(tables.rowCount, 4, `missing SMS tables in ${row.nspname}`);
        const migrated = await client.query(
          `select 1 from "${row.nspname.replace(/"/g, '""')}".schema_migration
           where version = '007_sms_notifications'`,
        );
        assert.equal(migrated.rowCount, 1);
      }
    } finally {
      await client.end();
    }
  });

  it('platform tracking_token_index never stores patient identity columns', async () => {
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      const cols = await client.query<{ column_name: string }>(
        `select column_name from information_schema.columns
         where table_schema = 'platform' and table_name = 'tracking_token_index'`,
      );
      const names = cols.rows.map((r) => r.column_name);
      assert.ok(names.includes('token_hash'));
      assert.ok(names.includes('tenant_id'));
      assert.equal(names.includes('patient_id'), false);
      assert.equal(names.includes('phone'), false);
      assert.equal(names.includes('appointment_id'), false);
    } finally {
      await client.end();
    }
  });
});
