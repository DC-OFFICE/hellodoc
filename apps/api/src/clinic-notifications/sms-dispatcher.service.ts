import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { assertSafeClinicSchemaName, quoteIdent } from '../common/identifiers.js';
import { TenantSqlClient } from '../tenant-provisioning/tenant-sql.client.js';
import { PlatformSmsGatewayService } from '../platform-sms/platform-sms-gateway.service.js';
import { gatewaySkipReason } from '../platform-sms/sms-gateway.types.js';
import { decryptPayload } from './payload-crypto.js';
import type { SmsProvider } from './sms/sms-provider.js';
import { SMS_PROVIDER } from './sms/sms-provider.token.js';

const LEASE_MS = 60_000;
const POLL_MS = Number(process.env.SMS_DISPATCH_POLL_MS ?? 5_000);
const BATCH = Number(process.env.SMS_DISPATCH_BATCH ?? 10);

function backoffSeconds(attempts: number): number {
  // 30s, 60s, 120s, 240s, 480s (capped)
  return Math.min(480, 30 * 2 ** Math.max(0, attempts - 1));
}

@Injectable()
export class SmsDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SmsDispatcherService.name);
  private readonly workerId = `sms-${process.pid}-${randomUUID().slice(0, 8)}`;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = false;

  constructor(
    private readonly sql: TenantSqlClient,
    @Inject(SMS_PROVIDER) private readonly provider: SmsProvider,
    private readonly gateway: PlatformSmsGatewayService,
  ) {}

  onModuleInit() {
    if (process.env.SMS_DISPATCH_ENABLED === 'false') {
      this.logger.log('SMS dispatcher disabled (SMS_DISPATCH_ENABLED=false)');
      return;
    }
    this.timer = setInterval(() => void this.tick(), POLL_MS);
    // Unref so tests/process can exit; Nest keeps process alive via HTTP.
    this.timer.unref?.();
    void this.tick();
  }

  onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
  }

  kick() {
    void this.tick();
  }

  private async tick() {
    if (this.stopped || this.running) return;
    this.running = true;
    try {
      const claimed = await this.claimBatch();
      for (const job of claimed) {
        await this.processJob(job);
      }
    } catch (error) {
      this.logger.warn(
        `Dispatcher tick failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    } finally {
      this.running = false;
    }
  }

  private async claimBatch() {
    return this.sql.withClient(async (client) => {
      await client.query('BEGIN');
      try {
        const rows = await client.query<{
          id: string;
          tenant_id: string;
          tenant_outbox_id: string;
        }>(
          `WITH due AS (
             SELECT d.id
             FROM platform.sms_dispatch_index d
             WHERE d.status = 'PENDING'
               AND d.next_attempt_at <= NOW()
               AND (d.claimed_until IS NULL OR d.claimed_until < NOW())
             ORDER BY d.next_attempt_at ASC
             FOR UPDATE SKIP LOCKED
             LIMIT $1
           )
           UPDATE platform.sms_dispatch_index d
           SET claimed_until = NOW() + make_interval(secs => $2::int),
               claimed_by = $3,
               updated_at = NOW()
           FROM due
           WHERE d.id = due.id
           RETURNING d.id, d.tenant_id, d.tenant_outbox_id`,
          [BATCH, Math.ceil(LEASE_MS / 1000), this.workerId],
        );
        const withSchema: Array<{
          id: string;
          tenant_id: string;
          tenant_outbox_id: string;
          schema_name: string;
        }> = [];
        for (const row of rows.rows) {
          const tenant = await client.query<{ schemaName: string }>(
            `SELECT "schemaName" FROM platform."Tenant" WHERE id = $1`,
            [row.tenant_id],
          );
          if (!tenant.rows[0]) continue;
          withSchema.push({ ...row, schema_name: tenant.rows[0].schemaName });
        }
        await client.query('COMMIT');
        return withSchema;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  private async processJob(job: {
    id: string;
    tenant_id: string;
    tenant_outbox_id: string;
    schema_name: string;
  }) {
    let schemaName: string;
    try {
      schemaName = assertSafeClinicSchemaName(job.schema_name);
    } catch {
      await this.markDispatch(job.id, 'FAILED', null);
      return;
    }
    const quoted = quoteIdent(schemaName);

    await this.sql.withClient(async (client) => {
      await client.query('BEGIN');
      try {
        const outbox = await client.query<{
          id: string;
          status: string;
          attempts: number;
          max_attempts: number;
          payload_ciphertext: string | null;
          payload_nonce: string | null;
          event_type: string;
          appointment_id: string | null;
          dedupe_key: string;
        }>(
          `SELECT id, status, attempts, max_attempts, payload_ciphertext, payload_nonce,
                  event_type, appointment_id, dedupe_key
           FROM ${quoted}.notification_outbox
           WHERE id = $1
           FOR UPDATE`,
          [job.tenant_outbox_id],
        );
        const row = outbox.rows[0];
        if (!row || row.status !== 'PENDING') {
          await client.query(
            `UPDATE platform.sms_dispatch_index
             SET status = COALESCE($2, status), claimed_until = NULL, claimed_by = NULL, updated_at = NOW()
             WHERE id = $1`,
            [job.id, row?.status ?? 'CANCELLED'],
          );
          await client.query('COMMIT');
          return;
        }

        // Revalidate approaching-turn / delay before send.
        if (row.event_type === 'APPROACHING_TURN' && row.appointment_id) {
          const state = await client.query<{ state: string; status: string }>(
            `SELECT q.state, a.status
             FROM ${quoted}.queue_entries q
             JOIN ${quoted}.appointments a ON a.id = q.appointment_id
             WHERE a.id = $1`,
            [row.appointment_id],
          );
          const s = state.rows[0];
          if (
            !s ||
            s.status !== 'CONFIRMED' ||
            !['WAITING', 'RESERVED'].includes(s.state)
          ) {
            await client.query(
              `UPDATE ${quoted}.notification_outbox
               SET status = 'CANCELLED', finalized_at = NOW(), updated_at = NOW(),
                   error_category = 'STALE_QUEUE_STATE'
               WHERE id = $1`,
              [row.id],
            );
            await client.query(
              `UPDATE platform.sms_dispatch_index
               SET status = 'CANCELLED', claimed_until = NULL, claimed_by = NULL, updated_at = NOW()
               WHERE id = $1`,
              [job.id],
            );
            await client.query('COMMIT');
            return;
          }
        }

        const runtime = await this.gateway.getRuntimeConfig();
        const envProvider = (process.env.SMS_PROVIDER ?? 'fake').toLowerCase();
        const platformBlock = envProvider === 'textlk' ? null : gatewaySkipReason(runtime);
        if (platformBlock) {
          await client.query(
            `UPDATE ${quoted}.notification_outbox
             SET status = 'SKIPPED', finalized_at = NOW(), updated_at = NOW(),
                 error_category = $2, claimed_until = NULL, claimed_by = NULL
             WHERE id = $1`,
            [row.id, platformBlock],
          );
          await client.query(
            `UPDATE platform.sms_dispatch_index
             SET status = 'SKIPPED', claimed_until = NULL, claimed_by = NULL, updated_at = NOW()
             WHERE id = $1`,
            [job.id],
          );
          await client.query('COMMIT');
          return;
        }

        if (!row.payload_ciphertext || !row.payload_nonce) {
          await this.failPermanent(client, quoted, job, row.id, 'MISSING_PAYLOAD', 'Encrypted payload missing');
          await client.query('COMMIT');
          return;
        }

        const payload = decryptPayload(row.payload_ciphertext, row.payload_nonce);
        if (!payload || typeof payload.toE164 !== 'string' || typeof payload.message !== 'string') {
          await this.failPermanent(client, quoted, job, row.id, 'DECRYPT_FAILED', 'Unable to decrypt payload');
          await client.query('COMMIT');
          return;
        }

        const attempts = row.attempts + 1;
        await client.query(
          `UPDATE ${quoted}.notification_outbox
           SET attempts = $2, updated_at = NOW()
           WHERE id = $1`,
          [row.id, attempts],
        );
        await client.query('COMMIT');

        // External call OUTSIDE the DB transaction / locks.
        const result = await this.provider.sendMessage({
          toE164: payload.toE164,
          senderId: String(payload.senderId ?? process.env.SMS_DEFAULT_SENDER_ID ?? 'HelloDoc'),
          message: payload.message,
          clientReference: row.dedupe_key,
        });

        await this.sql.withClient(async (c2) => {
          await c2.query('BEGIN');
          try {
            if (result.outcome === 'ACCEPTED' || result.outcome === 'DELIVERED') {
              const status = result.outcome === 'DELIVERED' ? 'DELIVERED' : 'SUBMITTED';
              await c2.query(
                `UPDATE ${quoted}.notification_outbox SET
                   status = $2,
                   provider_message_id = $3,
                   provider_name = $4,
                   estimated_cost = $5,
                   submitted_at = COALESCE(submitted_at, NOW()),
                   finalized_at = CASE WHEN $2 = 'DELIVERED' THEN NOW() ELSE finalized_at END,
                   updated_at = NOW(),
                   claimed_until = NULL,
                   claimed_by = NULL,
                   error_category = NULL,
                   error_message = NULL
                 WHERE id = $1`,
                [
                  row.id,
                  status,
                  result.providerMessageId,
                  this.provider.name,
                  result.estimatedCost,
                ],
              );
              await c2.query(
                `INSERT INTO ${quoted}.notification_delivery_events
                  (id, notification_id, provider_reference, reported_status, raw_payload_redacted)
                 VALUES ($1,$2,$3,$4,$5::jsonb)`,
                [
                  randomUUID(),
                  row.id,
                  result.providerMessageId,
                  status,
                  JSON.stringify({ outcome: result.outcome, rawStatus: result.rawStatus }),
                ],
              );
              await c2.query(
                `UPDATE platform.sms_dispatch_index
                 SET status = $2, claimed_until = NULL, claimed_by = NULL, updated_at = NOW()
                 WHERE id = $1`,
                [job.id, status],
              );
            } else if (result.outcome === 'UNCERTAIN') {
              // Do not blindly retry — mark UNCERTAIN for staff review.
              await c2.query(
                `UPDATE ${quoted}.notification_outbox SET
                   status = 'UNCERTAIN',
                   provider_message_id = COALESCE($3, provider_message_id),
                   provider_name = $4,
                   error_category = $5,
                   error_message = $6,
                   submitted_at = COALESCE(submitted_at, NOW()),
                   finalized_at = NOW(),
                   updated_at = NOW(),
                   claimed_until = NULL,
                   claimed_by = NULL
                 WHERE id = $1`,
                [
                  row.id,
                  null,
                  result.providerMessageId,
                  this.provider.name,
                  result.errorCategory,
                  result.errorMessage,
                ],
              );
              await c2.query(
                `UPDATE platform.sms_dispatch_index
                 SET status = 'UNCERTAIN', claimed_until = NULL, claimed_by = NULL, updated_at = NOW()
                 WHERE id = $1`,
                [job.id],
              );
            } else if (result.outcome === 'TEMPORARY_FAILURE' && attempts < row.max_attempts) {
              const delay = backoffSeconds(attempts);
              await c2.query(
                `UPDATE ${quoted}.notification_outbox SET
                   status = 'PENDING',
                   next_attempt_at = NOW() + make_interval(secs => $2::int),
                   error_category = $3,
                   error_message = $4,
                   provider_name = $5,
                   updated_at = NOW(),
                   claimed_until = NULL,
                   claimed_by = NULL
                 WHERE id = $1`,
                [
                  row.id,
                  delay,
                  result.errorCategory,
                  result.errorMessage,
                  this.provider.name,
                ],
              );
              await c2.query(
                `UPDATE platform.sms_dispatch_index
                 SET status = 'PENDING',
                     next_attempt_at = NOW() + make_interval(secs => $2::int),
                     claimed_until = NULL,
                     claimed_by = NULL,
                     updated_at = NOW()
                 WHERE id = $1`,
                [job.id, delay],
              );
            } else {
              const category =
                'errorCategory' in result ? result.errorCategory : 'SEND_FAILED';
              const message =
                'errorMessage' in result ? result.errorMessage : 'Provider send failed';
              await this.failPermanent(c2, quoted, job, row.id, category, message);
            }
            await c2.query('COMMIT');
          } catch (error) {
            await c2.query('ROLLBACK');
            throw error;
          }
        });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  private async failPermanent(
    client: { query: Function },
    quoted: string,
    job: { id: string },
    outboxId: string,
    category: string,
    message: string,
  ) {
    await client.query(
      `UPDATE ${quoted}.notification_outbox SET
         status = 'FAILED',
         error_category = $2,
         error_message = $3,
         finalized_at = NOW(),
         updated_at = NOW(),
         claimed_until = NULL,
         claimed_by = NULL
       WHERE id = $1`,
      [outboxId, category, message],
    );
    await client.query(
      `UPDATE platform.sms_dispatch_index
       SET status = 'FAILED', claimed_until = NULL, claimed_by = NULL, updated_at = NOW()
       WHERE id = $1`,
      [job.id],
    );
  }

  private async markDispatch(id: string, status: string, nextAttemptAt: Date | null) {
    await this.sql.withClient(async (client) => {
      await client.query(
        `UPDATE platform.sms_dispatch_index
         SET status = $2,
             next_attempt_at = COALESCE($3, next_attempt_at),
             claimed_until = NULL,
             claimed_by = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [id, status, nextAttemptAt],
      );
    });
  }
}
