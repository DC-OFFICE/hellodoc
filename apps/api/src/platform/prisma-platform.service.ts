import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * Platform/registry client only; never query patient data from this service.
 * Tenant query implementation intentionally remains blocked until the
 * schema-per-tenant POC passes with isolated DB roles and migrations.
 */
@Injectable()
export class PrismaPlatformService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL must be configured for platform Prisma client');
    }
    super({ adapter: new PrismaPg({ connectionString }) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
