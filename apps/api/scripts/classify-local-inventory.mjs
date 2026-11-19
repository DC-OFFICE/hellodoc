/**
 * Read-only classification of local platform users and clinic schemas.
 * Does not delete or modify any records.
 *
 * Usage: node --env-file=.env scripts/classify-local-inventory.mjs
 */
import pg from 'pg';

const source = process.env.DATABASE_URL;
if (!source) {
  console.error('BLOCKED: DATABASE_URL is not set');
  process.exit(1);
}

const url = new URL(source);
url.searchParams.delete('schema');
const client = new pg.Client({ connectionString: url.toString() });
await client.connect();

try {
  const schemas = await client.query(`
    SELECT
      CASE
        WHEN nspname = 'platform' THEN 'platform'
        WHEN nspname = 'public' THEN 'public'
        WHEN nspname ~* 'e2e' THEN 'e2e_fixture'
        WHEN nspname LIKE 'clinic_bill_%' THEN 'billing_integration'
        WHEN nspname LIKE 'clinic_clin_%' THEN 'clinical_integration'
        WHEN nspname LIKE 'clinic_%' THEN 'clinic_other'
        ELSE 'other'
      END AS class,
      count(*)::int AS n
    FROM pg_namespace
    WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema'
    GROUP BY 1
    ORDER BY 2 DESC`);

  const users = await client.query(`
    SELECT
      CASE
        WHEN email ILIKE '%e2e%' OR email ILIKE '%@example.com' THEN 'synthetic_test'
        WHEN email ILIKE '%dartcodes%' OR email ILIKE '%hellodoc%' THEN 'ops_like'
        ELSE 'other_or_unknown'
      END AS class,
      count(*)::int AS n
    FROM platform."PlatformUser"
    GROUP BY 1
    ORDER BY 2 DESC`);

  const tenants = await client.query(`
    SELECT
      CASE
        WHEN "clinicName" ILIKE '%e2e%' THEN 'e2e'
        WHEN "clinicName" ILIKE '%bill%'
          OR "clinicName" ILIKE '%clin%'
          OR "clinicName" ILIKE '%test%'
          OR "clinicName" ILIKE '%poc%'
          OR "clinicName" ILIKE '%iso%' THEN 'integration_like'
        ELSE 'other'
      END AS class,
      count(*)::int AS n
    FROM platform."Tenant"
    GROUP BY 1
    ORDER BY 2 DESC`);

  const totals = await client.query(`
    SELECT
      (SELECT count(*)::int FROM information_schema.schemata
        WHERE schema_name NOT IN ('pg_catalog','information_schema','pg_toast')) AS schema_count,
      (SELECT count(*)::int FROM platform."PlatformUser") AS platform_users,
      (SELECT count(*)::int FROM platform."Tenant") AS tenants,
      (SELECT count(*)::int FROM platform."TenantMembership") AS memberships`);

  const nonTestUsers = await client.query(`
    SELECT left(email, 80) AS email, "createdAt"::date AS created, active
    FROM platform."PlatformUser"
    WHERE email NOT ILIKE '%e2e%'
      AND email NOT ILIKE '%@example.com'
    ORDER BY "createdAt"
    LIMIT 50`);

  const otherSchemas = await client.query(`
    SELECT nspname
    FROM pg_namespace
    WHERE nspname LIKE 'clinic_%'
      AND nspname !~* 'e2e'
      AND nspname NOT LIKE 'clinic_bill_%'
      AND nspname NOT LIKE 'clinic_clin_%'
    ORDER BY 1
    LIMIT 60`);

  console.log('INVENTORY_OK');
  console.log(JSON.stringify({
    totals: totals.rows[0],
    schemas: schemas.rows,
    users: users.rows,
    tenants: tenants.rows,
    nonTestUserSample: nonTestUsers.rows,
    clinicOtherSchemaSample: otherSchemas.rows.map((row) => row.nspname),
    note: 'Read-only classification only. No records were deleted. Do not copy this local DB to production without an approved cleanup plan.',
  }, null, 2));
} finally {
  await client.end();
}
