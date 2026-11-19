import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Client } from 'pg';
import { Subject } from 'rxjs';
import { TenantSqlClient } from '../tenant-provisioning/tenant-sql.client.js';

export type QueueNotifyPayload = {
  schemaName: string;
  sessionId: string;
  revision: number;
  eventType: string;
};

@Injectable()
export class QueueEventsHub implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueEventsHub.name);
  private readonly subject = new Subject<QueueNotifyPayload>();
  private listener: Client | null = null;
  private stopped = false;

  constructor(private readonly sql: TenantSqlClient) {}

  get stream$() {
    return this.subject.asObservable();
  }

  /** Local fan-out after a successful commit (works for single-process). */
  publish(payload: QueueNotifyPayload) {
    this.subject.next(payload);
  }

  async onModuleInit() {
    const url = process.env.DATABASE_URL;
    if (!url) return;
    try {
      this.listener = new Client({ connectionString: url });
      await this.listener.connect();
      await this.listener.query('LISTEN hellodoc_queue');
      this.listener.on('notification', (msg) => {
        if (!msg.payload) return;
        try {
          const parsed = JSON.parse(msg.payload) as QueueNotifyPayload;
          if (parsed?.sessionId && parsed?.schemaName) this.subject.next(parsed);
        } catch {
          /* ignore malformed notify payloads */
        }
      });
      this.listener.on('error', (err) => {
        this.logger.warn(`Queue LISTEN client error: ${err.message}`);
      });
    } catch (error) {
      this.logger.warn(
        `Queue LISTEN/NOTIFY unavailable: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  async onModuleDestroy() {
    this.stopped = true;
    this.subject.complete();
    try {
      await this.listener?.end();
    } catch {
      /* ignore */
    }
  }

  async notifyCommitted(payload: QueueNotifyPayload) {
    this.publish(payload);
    try {
      await this.sql.withClient(async (client) => {
        await client.query(`SELECT pg_notify('hellodoc_queue', $1)`, [JSON.stringify(payload)]);
      });
    } catch (error) {
      if (!this.stopped) {
        this.logger.warn(
          `pg_notify failed: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      }
    }
  }
}
