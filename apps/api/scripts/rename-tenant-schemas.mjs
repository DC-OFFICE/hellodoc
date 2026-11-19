/**
 * One-time rename of legacy clinic_<uuid32> schemas to clinic_<slug>_<6digits>.
 * Stop the API before running:
 *   npm run tenants:rename-schemas -w @hellodoc/api
 */
import 'dotenv/config';
import { randomInt } from 'node:crypto';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const LEGACY = /^clinic_[a-f0-9]{32}$/;
const NEW_FORMAT = /^clinic_[a-z0-9]+(?:_[a-z0-9]+)*_[0-9]{6}$/;
const PG_IDENT_MAX = 63;

function slugify(name) {
  const base = name
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  return base.length > 0 ? base : 'clinic';
}

function schemaSlug(clinicName) {
  const raw = slugify(clinicName);
  const maxSlug = PG_IDENT_MAX - 'clinic_'.length - 1 - 6;
  return raw.slice(0, maxSlug).replace(/_+$/g, '') || 'clinic';
}

function quoteIdent(name) {
  if (!LEGACY.test(name) && !NEW_FORMAT.test(name)) {
    throw new Error(`Unsafe schema: ${name}`);
  }
  return `"${name.replace(/"/g, '""')}"`;
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
const client = await pool.connect();

try {
  const tenants = await client.query(
    `SELECT id::text, "clinicName", "schemaName", status
     FROM platform."Tenant"
     WHERE status IN ('ACTIVE','SUSPENDED','PROVISIONING','FAILED')
     ORDER BY "createdAt" ASC`,
  );

  for (const tenant of tenants.rows) {
    const oldName = tenant.schemaName;
    if (NEW_FORMAT.test(oldName)) {
      console.log(`skip (already new): ${tenant.clinicName} → ${oldName}`);
      continue;
    }
    if (!LEGACY.test(oldName)) {
      console.error(`skip (unknown format): ${tenant.clinicName} → ${oldName}`);
      continue;
    }

    let newName = null;
    for (let i = 0; i < 32; i += 1) {
      const suffix = String(randomInt(100000, 1000000));
      const candidate = `clinic_${schemaSlug(tenant.clinicName)}_${suffix}`;
      if (!NEW_FORMAT.test(candidate)) continue;
      const taken = await client.query(
        `SELECT 1 FROM platform."Tenant" WHERE "schemaName" = $1
         UNION ALL
         SELECT 1 FROM pg_namespace WHERE nspname = $1
         LIMIT 1`,
        [candidate],
      );
      if ((taken.rowCount ?? 0) === 0) {
        newName = candidate;
        break;
      }
    }
    if (!newName) {
      throw new Error(`Could not allocate schema name for ${tenant.clinicName}`);
    }

    console.log(`rename: ${tenant.clinicName}\n  ${oldName}\n  → ${newName}`);
    await client.query('BEGIN');
    try {
      await client.query(`ALTER SCHEMA ${quoteIdent(oldName)} RENAME TO ${quoteIdent(newName)}`);
      await client.query(
        `UPDATE platform."Tenant" SET "schemaName" = $2, "updatedAt" = NOW() WHERE id = $1::uuid`,
        [tenant.id, newName],
      );
      await client.query(
        `UPDATE platform."ProvisioningRecord" SET "schemaName" = $2, "updatedAt" = NOW()
         WHERE "tenantId" = $1::uuid`,
        [tenant.id, newName],
      );
      await client.query('COMMIT');
      console.log('  ok');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  console.log('\nTenant schema rename complete.');
} finally {
  client.release();
  await pool.end();
}
