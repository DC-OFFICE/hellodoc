import { Injectable, OnModuleDestroy } from '@nestjs/common';
import pg from 'pg';
import { pgPoolOptions } from '../common/pg-pool-options.js';

@Injectable()
export class TenantSqlClient implements OnModuleDestroy {
  private readonly pool: pg.Pool;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL must be configured for tenant SQL client');
    }
    this.pool = new pg.Pool(pgPoolOptions(connectionString));
  }

  async withClient<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
