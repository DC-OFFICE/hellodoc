import type { PoolConfig } from 'pg';

/**
 * Shared Pool options for platform Prisma adapter and tenant SQL client.
 * Render / managed Postgres typically require TLS; enable when DATABASE_SSL=true
 * or when NODE_ENV=production (unless DATABASE_SSL=false).
 */
export function pgPoolOptions(connectionString: string): PoolConfig {
  const explicit = process.env.DATABASE_SSL?.trim().toLowerCase();
  const useSsl =
    explicit === 'true' || (explicit !== 'false' && process.env.NODE_ENV === 'production');
  return {
    connectionString,
    max: Number(process.env.PG_POOL_MAX ?? 10),
    ssl: useSsl ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' } : undefined,
  };
}
