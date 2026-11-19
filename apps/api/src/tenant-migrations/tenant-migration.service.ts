import { Injectable, Logger } from '@nestjs/common';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSafeClinicSchemaName, quoteIdent } from '../common/identifiers.js';
import { PrismaPlatformService } from '../platform/prisma-platform.service.js';
import { TenantSqlClient } from '../tenant-provisioning/tenant-sql.client.js';

type MigrationFile = { version: string; sql: string };

@Injectable()
export class TenantMigrationService {
  private readonly logger = new Logger(TenantMigrationService.name);
  private readonly migrations: MigrationFile[];

  constructor(
    private readonly prisma: PrismaPlatformService,
    private readonly sql: TenantSqlClient,
  ) {
    this.migrations = this.loadMigrations();
  }

  listVersions(): string[] {
    return this.migrations.map((m) => m.version);
  }

  async applyToSchema(schemaName: string): Promise<{ applied: string[]; already: string[] }> {
    const safe = assertSafeClinicSchemaName(schemaName);
    const quoted = quoteIdent(safe);
    const applied: string[] = [];
    const already: string[] = [];

    await this.sql.withClient(async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${quoted}.schema_migration (
          version TEXT PRIMARY KEY,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      for (const migration of this.migrations) {
        const existing = await client.query(
          `SELECT 1 FROM ${quoted}.schema_migration WHERE version = $1`,
          [migration.version],
        );
        if ((existing.rowCount ?? 0) > 0) {
          already.push(migration.version);
          continue;
        }

        await client.query('BEGIN');
        try {
          // Advisory lock keyed by schema name hash to avoid concurrent migrators.
          await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [safe]);
          const again = await client.query(
            `SELECT 1 FROM ${quoted}.schema_migration WHERE version = $1`,
            [migration.version],
          );
          if ((again.rowCount ?? 0) > 0) {
            await client.query('COMMIT');
            already.push(migration.version);
            continue;
          }

          const script = migration.sql.replaceAll('__SCHEMA__', quoted);
          await client.query(script);
          await client.query('COMMIT');
          applied.push(migration.version);
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      }
    });

    return { applied, already };
  }

  async applyToAllActiveTenants(): Promise<
    Array<{ tenantId: string; schemaName: string; applied: string[]; already: string[]; error?: string }>
  > {
    const tenants = await this.prisma.tenant.findMany({
      where: { status: { in: ['ACTIVE', 'SUSPENDED', 'PROVISIONING'] } },
      select: { id: true, schemaName: true },
      orderBy: { createdAt: 'asc' },
    });

    const results = [];
    for (const tenant of tenants) {
      try {
        const result = await this.applyToSchema(tenant.schemaName);
        results.push({ tenantId: tenant.id, schemaName: tenant.schemaName, ...result });
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 300) : 'Migration failed';
        this.logger.error(`Tenant migration failed for ${tenant.schemaName}: ${message}`);
        results.push({
          tenantId: tenant.id,
          schemaName: tenant.schemaName,
          applied: [],
          already: [],
          error: message,
        });
      }
    }
    return results;
  }

  private loadMigrations(): MigrationFile[] {
    const here = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      join(process.cwd(), 'tenant-migrations'),
      join(process.cwd(), 'apps', 'api', 'tenant-migrations'),
      join(here, '..', '..', 'tenant-migrations'),
    ];
    const dir = candidates.find((p) => {
      try {
        readdirSync(p);
        return true;
      } catch {
        return false;
      }
    });
    if (!dir) throw new Error('tenant-migrations directory not found');

    return readdirSync(dir)
      .filter((f) => /^\d{3}_.+\.sql$/.test(f))
      .sort()
      .map((file) => ({
        version: file.replace(/\.sql$/, ''),
        sql: readFileSync(join(dir, file), 'utf8'),
      }));
  }
}
