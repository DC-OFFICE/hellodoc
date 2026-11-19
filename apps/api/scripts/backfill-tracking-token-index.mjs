/**
 * Backfill platform.tracking_token_index from existing tenant token hashes.
 * Never reconstructs plaintext tokens.
 */
import 'dotenv/config';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const SAFE =
  /^(?:clinic_[a-z0-9]+(?:_[a-z0-9]+)*_[0-9]{6}|clinic_[a-f0-9]{32})$/;

const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
const client = await pool.connect();
try {
  const tenants = await client.query(
    `SELECT id::text, "schemaName"
     FROM platform."Tenant"
     WHERE status IN ('ACTIVE','SUSPENDED','PROVISIONING')`,
  );
  let inserted = 0;
  for (const tenant of tenants.rows) {
    if (!SAFE.test(tenant.schemaName)) continue;
    const quoted = `"${tenant.schemaName.replace(/"/g, '""')}"`;
    const exists = await client.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = $1 AND table_name = 'appointment_tracking_tokens'`,
      [tenant.schemaName],
    );
    if ((exists.rowCount ?? 0) === 0) continue;

    const result = await client.query(
      `INSERT INTO platform.tracking_token_index
        (token_hash, tenant_id, tenant_token_reference, expires_at, revoked_at, created_at)
       SELECT t.token_hash, $1::uuid, t.id, t.expires_at, t.revoked_at, t.created_at
       FROM ${quoted}.appointment_tracking_tokens t
       ON CONFLICT (token_hash) DO UPDATE SET
         revoked_at = COALESCE(EXCLUDED.revoked_at, platform.tracking_token_index.revoked_at),
         expires_at = EXCLUDED.expires_at
       RETURNING token_hash`,
      [tenant.id],
    );
    inserted += result.rowCount ?? 0;
    console.log(`${tenant.schemaName}: upserted ${result.rowCount ?? 0}`);
  }
  console.log(`Backfill complete. Rows touched: ${inserted}`);
} finally {
  client.release();
  await pool.end();
}
