import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { assertSafeClinicSchemaName, quoteIdent } from '../common/identifiers.js';
import { TenantSqlClient } from '../tenant-provisioning/tenant-sql.client.js';
import { QueueEventsHub } from './queue-events.hub.js';

const POLL_MS = Number(process.env.SESSION_AUTO_CLOSE_POLL_MS ?? 60_000);
const TZ = 'Asia/Colombo';
/** Only one API instance runs a pass at a time. */
const LOCK_KEY = 'hellodoc_session_auto_close';

/**
 * Closes open sessions after their scheduled end time.
 * - As soon as the end time has passed and nobody is waiting, called, held or in consultation.
 * - Backstop: once the session's clinic day is over, even if patients were left waiting.
 * On close, bookings that never checked in and anyone still waiting are marked no-show.
 * Patients currently called or in consultation are left untouched.
 */
@Injectable()
export class SessionAutoCloseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SessionAutoCloseService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly sql: TenantSqlClient,
    private readonly hub: QueueEventsHub,
  ) {}

  onModuleInit() {
    if (process.env.SESSION_AUTO_CLOSE_ENABLED === 'false') {
      this.logger.log('Session auto-close disabled (SESSION_AUTO_CLOSE_ENABLED=false)');
      return;
    }
    this.timer = setInterval(() => void this.tick(), POLL_MS);
    this.timer.unref?.();
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.sql.withClient(async (client) => {
        const lock = await client.query<{ locked: boolean }>(
          `SELECT pg_try_advisory_lock(hashtext($1)) AS locked`,
          [LOCK_KEY],
        );
        if (!lock.rows[0]?.locked) return;
        try {
          const tenants = await client.query<{ schemaName: string }>(
            `SELECT "schemaName" FROM platform."Tenant" WHERE status = 'ACTIVE' AND "schemaName" IS NOT NULL`,
          );
          for (const tenant of tenants.rows) {
            try {
              await this.closeDueSessions(assertSafeClinicSchemaName(tenant.schemaName));
            } catch (error) {
              this.logger.warn(
                `Auto-close failed for ${tenant.schemaName}: ${error instanceof Error ? error.message : 'unknown'}`,
              );
            }
          }
        } finally {
          await client.query(`SELECT pg_advisory_unlock(hashtext($1))`, [LOCK_KEY]);
        }
      });
    } catch (error) {
      this.logger.warn(`Auto-close tick failed: ${error instanceof Error ? error.message : 'unknown'}`);
    } finally {
      this.running = false;
    }
  }

  private async closeDueSessions(schemaName: string) {
    const schema = quoteIdent(schemaName);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
    const closed = await this.sql.withClient(async (client) => {
      await client.query('BEGIN');
      try {
        const due = await client.query<{ id: string }>(
          `SELECT s.id FROM ${schema}.consultation_sessions s
           WHERE s.status IN ('OPEN', 'PAUSED')
             AND s.end_at <= NOW()
             AND (
               s.local_date < $1::date
               OR NOT EXISTS (
                 SELECT 1 FROM ${schema}.queue_entries q
                 WHERE q.session_id = s.id AND q.state IN ('WAITING', 'CALLED', 'IN_SERVICE', 'HELD')
               )
             )
           FOR UPDATE SKIP LOCKED`,
          [today],
        );
        const result: Array<{ sessionId: string; revision: number }> = [];
        for (const { id } of due.rows) {
          const noShows = await client.query(
            `UPDATE ${schema}.queue_entries
             SET state = 'NO_SHOW', no_show_at = NOW(), updated_at = NOW(), version = version + 1
             WHERE session_id = $1 AND state IN ('WAITING', 'RESERVED', 'HELD', 'SKIPPED')`,
            [id],
          );
          await client.query(
            `UPDATE ${schema}.consultation_sessions
             SET status = 'CLOSED', updated_at = NOW(), version = version + 1
             WHERE id = $1`,
            [id],
          );
          const event = await client.query<{ id: string }>(
            `INSERT INTO ${schema}.queue_events (session_id, event_type, actor_id, payload)
             VALUES ($1, 'SESSION_CLOSED', NULL, $2::jsonb)
             RETURNING id::text`,
            [id, JSON.stringify({ automatic: true, reason: 'Session end time passed', noShows: noShows.rowCount ?? 0 })],
          );
          result.push({ sessionId: id, revision: Number(event.rows[0]?.id ?? 0) });
        }
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
    for (const item of closed) {
      await this.hub.notifyCommitted({
        schemaName,
        sessionId: item.sessionId,
        revision: item.revision,
        eventType: 'SESSION_CLOSED',
      });
    }
    if (closed.length) this.logger.log(`Auto-closed ${closed.length} session(s) in ${schemaName}`);
  }
}
