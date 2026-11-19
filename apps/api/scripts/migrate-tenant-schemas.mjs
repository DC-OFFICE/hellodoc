/**
 * Apply pending clinic-schema migrations to all registered tenants.
 * Usage: npm run tenants:migrate -w @hellodoc/api
 */
import 'dotenv/config';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

/** New clinic_<slug>_<6digits> or legacy clinic_<uuid32>. */
const SAFE =
  /^(?:clinic_[a-z0-9]+(?:_[a-z0-9]+)*_[0-9]{6}|clinic_[a-f0-9]{32})$/;
const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'tenant-migrations');
const migrations = readdirSync(migrationsDir)
  .filter((f) => /^\d{3}_.+\.sql$/.test(f))
  .sort()
  .map((file) => ({
    version: file.replace(/\.sql$/, ''),
    sql: readFileSync(join(migrationsDir, file), 'utf8'),
  }));

const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
const client = await pool.connect();
try {
  const tenants = await client.query(
    `SELECT id::text, "schemaName", "clinicName", status
     FROM platform."Tenant"
     WHERE status IN ('ACTIVE','SUSPENDED','PROVISIONING')
     ORDER BY "createdAt" ASC`,
  );

  for (const tenant of tenants.rows) {
    const schemaName = tenant.schemaName;
    if (!SAFE.test(schemaName)) {
      console.error(`Skipping unsafe schema for tenant ${tenant.id}`);
      continue;
    }
    const quoted = `"${schemaName.replace(/"/g, '""')}"`;
    console.log(`\n→ ${tenant.clinicName} (${schemaName})`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${quoted}.schema_migration (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    for (const migration of migrations) {
      const existing = await client.query(
        `SELECT 1 FROM ${quoted}.schema_migration WHERE version = $1`,
        [migration.version],
      );
      if ((existing.rowCount ?? 0) > 0) {
        console.log(`  skip ${migration.version}`);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [schemaName]);
        await client.query(migration.sql.replaceAll('__SCHEMA__', quoted));
        await client.query('COMMIT');
        console.log(`  applied ${migration.version}`);
      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`  FAILED ${migration.version}:`, error instanceof Error ? error.message : error);
        throw error;
      }
    }
  }
  console.log('\nTenant schema migrations complete.');
} finally {
  client.release();
  await pool.end();
}
