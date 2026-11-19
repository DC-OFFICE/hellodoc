import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { pgPoolOptions } from '../common/pg-pool-options.js';

/**
 * Platform/registry client only; never query patient data from this service.
 * Tenant query implementation intentionally remains blocked until the
 * schema-per-tenant POC passes with isolated DB roles and migrations.
 */
@Injectable()
export class PrismaPlatformService extends PrismaClient implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL must be configured for platform Prisma client');
    }
    const pool = new Pool(pgPoolOptions(connectionString));
    super({ adapter: new PrismaPg(pool) });
    this.pool = pool;
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    await this.pool.end();
  }
}
