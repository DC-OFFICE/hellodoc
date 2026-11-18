/**
 * LOCAL-ONLY proof of schema creation/data separation (NOT security isolation).
 * Run `npm run db:poc` from repository root after db:up.
 * Production tenant provisioning MUST use audited migrations, locked-down DB
 * roles, a tenant registry, and cross-tenant authorization tests.
 */
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL required');
const parsed = new URL(url);
const host = parsed.hostname;
if (process.env.NODE_ENV === 'production' || !['localhost','127.0.0.1','::1'].includes(host)) {
  throw new Error('POC must run against LOCAL development Postgres only');
}

const pool = new pg.Pool({connectionString:url, max: 2});
const schemas = ['clinic_poc_kandy', 'clinic_poc_matale'];
try {
  const client = await pool.connect();
  try {
    for (const name of schemas) {
      // Only hard-coded names; never interpolate untrusted user input into SQL identifiers.
      await client.query(`CREATE SCHEMA IF NOT EXISTS "${name}"`);
      await client.query(`CREATE TABLE IF NOT EXISTS "${name}".tenant_probe (id INTEGER PRIMARY KEY, label TEXT NOT NULL)`);
      await client.query(`INSERT INTO "${name}".tenant_probe (id, label) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET label=excluded.label`,[name]);
    }
    for (const name of schemas) {
      await client.query('BEGIN');
      try {
        await client.query(`SET LOCAL search_path TO "${name}", pg_catalog`);
        const result = await client.query('SELECT label FROM tenant_probe WHERE id = 1');
        if (result.rows[0]?.label !== name) throw new Error(`Unexpected data for ${name}`);
        console.log(`${name}: read own record ✓`);
        await client.query('COMMIT');
      } catch(e){await client.query('ROLLBACK'); throw e;}
    }
    console.log('POC confirmed distinct namespaces, NOT access-control isolation.');
    console.log('NEXT: test restricted DB roles, dynamic Prisma routing and per-tenant migration strategy before real customer data.');
  } finally {client.release();}
} finally {await pool.end();}
