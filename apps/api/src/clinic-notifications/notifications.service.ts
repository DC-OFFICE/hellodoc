import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { AuditService } from '../audit/audit.service.js';
import type { ClinicContext } from '../clinic-context/clinic-context.service.js';
import { QueueService } from '../clinic-queue/queue.service.js';
import { maskPhone } from '../clinic-patients/patient-phone.js';
import { assertSafeClinicSchemaName, quoteIdent } from '../common/identifiers.js';
import { PrismaPlatformService } from '../platform/prisma-platform.service.js';
import { PlatformSmsGatewayService } from '../platform-sms/platform-sms-gateway.service.js';
import { gatewaySkipReason } from '../platform-sms/sms-gateway.types.js';
import { TenantSqlClient } from '../tenant-provisioning/tenant-sql.client.js';
import {
  ListNotificationsQueryDto,
  UpdateNotificationSettingsDto,
} from './dto/notifications.dto.js';
import {
  formatQueueDisplay,
  formatSessionDate,
  renderTemplate,
} from './notification-render.js';
import { encryptPayload, hashRecipient } from './payload-crypto.js';
import { SmsDispatcherService } from './sms-dispatcher.service.js';

export type NotificationEventType =
  | 'BOOKING_CONFIRMATION'
  | 'CANCELLATION'
  | 'RESCHEDULE'
  | 'APPROACHING_TURN'
  | 'SESSION_DELAY';

type SettingsRow = {
  id: string;
  enabled: boolean;
  booking_confirmation_enabled: boolean;
  cancellation_enabled: boolean;
  reschedule_enabled: boolean;
  approaching_turn_enabled: boolean;
  delay_alert_enabled: boolean;
  approaching_threshold: number;
  approved_sender_id: string | null;
  language: string;
};

type ContactRow = {
  id: string;
  contact_type: string;
  normalized_value: string;
  display_value: string;
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly sql: TenantSqlClient,
    private readonly audit: AuditService,
    @Inject(forwardRef(() => QueueService)) private readonly queue: QueueService,
    private readonly dispatcher: SmsDispatcherService,
    private readonly gateway: PlatformSmsGatewayService,
    private readonly prisma: PrismaPlatformService,
  ) {}

  private mapSettings(row: SettingsRow) {
    return {
      id: row.id,
      enabled: row.enabled,
      bookingConfirmationEnabled: row.booking_confirmation_enabled,
      cancellationEnabled: row.cancellation_enabled,
      rescheduleEnabled: row.reschedule_enabled,
      approachingTurnEnabled: row.approaching_turn_enabled,
      delayAlertEnabled: row.delay_alert_enabled,
      approachingThreshold: row.approaching_threshold,
      approvedSenderId: row.approved_sender_id,
      language: row.language,
    };
  }

  async getSettings(ctx: ClinicContext) {
    return this.sql.withClient(async (client) => {
      const row = await this.ensureSettings(client, ctx.quotedSchema);
      return this.mapSettings(row);
    });
  }

  async updateSettings(ctx: ClinicContext, dto: UpdateNotificationSettingsDto) {
    return this.sql.withClient(async (client) => {
      const current = await this.ensureSettings(client, ctx.quotedSchema);
      const updated = await client.query<SettingsRow>(
        `UPDATE ${ctx.quotedSchema}.notification_settings SET
           enabled = COALESCE($2, enabled),
           booking_confirmation_enabled = COALESCE($3, booking_confirmation_enabled),
           cancellation_enabled = COALESCE($4, cancellation_enabled),
           reschedule_enabled = COALESCE($5, reschedule_enabled),
           approaching_turn_enabled = COALESCE($6, approaching_turn_enabled),
           delay_alert_enabled = COALESCE($7, delay_alert_enabled),
           approaching_threshold = COALESCE($8, approaching_threshold),
           language = COALESCE($9, language),
           updated_at = NOW(),
           updated_by = $10
         WHERE id = $1
         RETURNING *`,
        [
          current.id,
          dto.enabled ?? null,
          dto.bookingConfirmationEnabled ?? null,
          dto.cancellationEnabled ?? null,
          dto.rescheduleEnabled ?? null,
          dto.approachingTurnEnabled ?? null,
          dto.delayAlertEnabled ?? null,
          dto.approachingThreshold ?? null,
          dto.language ?? null,
          ctx.userId,
        ],
      );
      await this.audit.record({
        actorId: ctx.userId,
        action: 'notification_settings.updated',
        targetType: 'notification_settings',
        targetId: current.id,
        metadata: { tenantId: ctx.tenantId, patch: dto },
      });
      return this.mapSettings(updated.rows[0]!);
    });
  }

  async list(ctx: ClinicContext, query: ListNotificationsQueryDto) {
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;
    return this.sql.withClient(async (client) => {
      const params: unknown[] = [];
      const where: string[] = [];
      if (query.status) {
        params.push(query.status);
        where.push(`status = $${params.length}`);
      }
      if (query.eventType) {
        params.push(query.eventType);
        where.push(`event_type = $${params.length}`);
      }
      if (query.appointmentId) {
        params.push(query.appointmentId);
        where.push(`appointment_id = $${params.length}`);
      }
      if (query.patientId) {
        params.push(query.patientId);
        where.push(`patient_id = $${params.length}`);
      }
      params.push(limit);
      const limitIdx = params.length;
      params.push(offset);
      const offsetIdx = params.length;
      const result = await client.query(
        `SELECT id, appointment_id, session_id, event_type, recipient_masked, status,
                attempts, provider_message_id, provider_name, error_category,
                estimated_cost, created_at, updated_at, submitted_at, finalized_at
         FROM ${ctx.quotedSchema}.notification_outbox
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY created_at DESC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        params,
      );
      return {
        items: result.rows.map((r) => ({
          id: r.id,
          appointmentId: r.appointment_id,
          sessionId: r.session_id,
          eventType: r.event_type,
          recipientMasked: r.recipient_masked,
          status: r.status,
          attempts: r.attempts,
          providerMessageId: r.provider_message_id,
          providerName: r.provider_name,
          errorCategory: r.error_category,
          estimatedCost: r.estimated_cost != null ? Number(r.estimated_cost) : null,
          createdAt: r.created_at?.toISOString?.() ?? r.created_at,
          updatedAt: r.updated_at?.toISOString?.() ?? r.updated_at,
          submittedAt: r.submitted_at?.toISOString?.() ?? r.submitted_at,
          finalizedAt: r.finalized_at?.toISOString?.() ?? r.finalized_at,
        })),
        limit,
        offset,
      };
    });
  }

  async listForTenant(tenantId: string, query: ListNotificationsQueryDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { schemaName: true, clinicName: true },
    });
    if (!tenant) {
      throw new NotFoundException({ code: 'CLINIC_NOT_FOUND', message: 'Clinic not found' });
    }
    const schemaName = assertSafeClinicSchemaName(tenant.schemaName);
    const ctx = {
      userId: '',
      tenantId,
      clinicName: tenant.clinicName,
      schemaName,
      quotedSchema: quoteIdent(schemaName),
      role: 'CLINIC_MANAGER',
      doctorId: null,
    } satisfies ClinicContext;
    const page = await this.list(ctx, query);
    return { clinicName: tenant.clinicName, ...page };
  }

  async getOne(ctx: ClinicContext, id: string) {
    return this.sql.withClient(async (client) => {
      const row = await client.query(
        `SELECT * FROM ${ctx.quotedSchema}.notification_outbox WHERE id = $1`,
        [id],
      );
      if (!row.rows[0]) throw new NotFoundException({ code: 'NOTIFICATION_NOT_FOUND', message: 'Not found' });
      const events = await client.query(
        `SELECT id, provider_reference, reported_status, occurred_at, recorded_at
         FROM ${ctx.quotedSchema}.notification_delivery_events
         WHERE notification_id = $1
         ORDER BY recorded_at ASC`,
        [id],
      );
      const r = row.rows[0];
      return {
        id: r.id,
        appointmentId: r.appointment_id,
        eventType: r.event_type,
        recipientMasked: r.recipient_masked,
        status: r.status,
        attempts: r.attempts,
        maxAttempts: r.max_attempts,
        providerMessageId: r.provider_message_id,
        providerName: r.provider_name,
        errorCategory: r.error_category,
        errorMessage: r.error_message,
        estimatedCost: r.estimated_cost != null ? Number(r.estimated_cost) : null,
        createdAt: r.created_at?.toISOString?.() ?? r.created_at,
        updatedAt: r.updated_at?.toISOString?.() ?? r.updated_at,
        deliveryEvents: events.rows.map((e) => ({
          id: e.id,
          providerReference: e.provider_reference,
          reportedStatus: e.reported_status,
          occurredAt: e.occurred_at?.toISOString?.() ?? e.occurred_at,
          recordedAt: e.recorded_at?.toISOString?.() ?? e.recorded_at,
        })),
      };
    });
  }

  async retry(ctx: ClinicContext, id: string) {
    return this.sql.withClient(async (client) => {
      await client.query('BEGIN');
      try {
        const row = await client.query<{
          id: string;
          status: string;
          attempts: number;
          max_attempts: number;
        }>(
          `SELECT id, status, attempts, max_attempts
           FROM ${ctx.quotedSchema}.notification_outbox
           WHERE id = $1
           FOR UPDATE`,
          [id],
        );
        if (!row.rows[0]) throw new NotFoundException({ code: 'NOTIFICATION_NOT_FOUND', message: 'Not found' });
        const n = row.rows[0];
        if (!['FAILED', 'UNCERTAIN'].includes(n.status)) {
          throw new BadRequestException({
            code: 'RETRY_NOT_ALLOWED',
            message: 'Only FAILED or UNCERTAIN notifications can be retried',
          });
        }
        if (n.attempts >= n.max_attempts) {
          throw new BadRequestException({
            code: 'RETRY_EXHAUSTED',
            message: 'Maximum attempts reached',
          });
        }
        await client.query(
          `UPDATE ${ctx.quotedSchema}.notification_outbox
           SET status = 'PENDING', next_attempt_at = NOW(), claimed_until = NULL,
               claimed_by = NULL, updated_at = NOW(), error_category = NULL, error_message = NULL
           WHERE id = $1`,
          [id],
        );
        await client.query(
          `UPDATE platform.sms_dispatch_index
           SET status = 'PENDING', next_attempt_at = NOW(), claimed_until = NULL,
               claimed_by = NULL, updated_at = NOW()
           WHERE tenant_id = $1 AND tenant_outbox_id = $2`,
          [ctx.tenantId, id],
        );
        await client.query('COMMIT');
        this.dispatcher.kick();
        return this.getOne(ctx, id);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  /** Enqueue after successful booking commit (or inside TX before commit). */
  async enqueueForAppointment(
    client: PoolClient,
    ctx: ClinicContext,
    input: {
      appointmentId: string;
      eventType: NotificationEventType;
      dedupeKey: string;
      includeTrackingLink: boolean;
      suppressPendingApproaching?: boolean;
      delayHint?: string | null;
      peopleAhead?: number | null;
    },
  ): Promise<'ENQUEUED' | 'SKIPPED'> {
    const settings = await this.ensureSettings(client, ctx.quotedSchema);
    if (!settings.enabled) return 'SKIPPED';
    if (input.eventType === 'BOOKING_CONFIRMATION' && !settings.booking_confirmation_enabled) {
      return 'SKIPPED';
    }
    if (input.eventType === 'CANCELLATION' && !settings.cancellation_enabled) return 'SKIPPED';
    if (input.eventType === 'RESCHEDULE' && !settings.reschedule_enabled) return 'SKIPPED';
    if (input.eventType === 'APPROACHING_TURN' && !settings.approaching_turn_enabled) {
      return 'SKIPPED';
    }
    if (input.eventType === 'SESSION_DELAY' && !settings.delay_alert_enabled) return 'SKIPPED';

    if (input.suppressPendingApproaching) {
      await this.cancelPendingByAppointment(
        client,
        ctx,
        input.appointmentId,
        ['APPROACHING_TURN'],
      );
    }

    const appt = await client.query<{
      id: string;
      patient_id: string;
      session_id: string;
      queue_number: number;
      status: string;
      local_date: Date | string;
      start_at: Date;
      end_at: Date;
    }>(
      `SELECT a.id, a.patient_id, a.session_id, a.queue_number, a.status,
              s.local_date, s.start_at, s.end_at
       FROM ${ctx.quotedSchema}.appointments a
       JOIN ${ctx.quotedSchema}.consultation_sessions s ON s.id = a.session_id
       WHERE a.id = $1`,
      [input.appointmentId],
    );
    if (!appt.rows[0]) return 'SKIPPED';
    const row = appt.rows[0];

    if (input.eventType === 'APPROACHING_TURN' && row.status !== 'CONFIRMED') {
      return 'SKIPPED';
    }

    const contact = await this.resolveMobileContact(client, ctx.quotedSchema, row.patient_id);
    if (!contact) {
      await this.insertSkipped(
        client,
        ctx,
        {
          appointmentId: row.id,
          sessionId: row.session_id,
          patientId: row.patient_id,
          eventType: input.eventType,
          dedupeKey: input.dedupeKey,
          reason: 'NO_MOBILE_CONTACT',
        },
      );
      return 'SKIPPED';
    }

    const runtime = await this.gateway.getRuntimeConfig();
    const platformBlock = gatewaySkipReason(runtime);
    if (platformBlock) {
      await this.insertSkipped(client, ctx, {
        appointmentId: row.id,
        sessionId: row.session_id,
        patientId: row.patient_id,
        eventType: input.eventType,
        dedupeKey: input.dedupeKey,
        reason: platformBlock,
        contactId: contact.id,
        recipientMasked: maskPhone(contact.normalized_value),
        recipientHash: hashRecipient(contact.normalized_value),
      });
      return 'SKIPPED';
    }

    let trackingUrl: string | undefined;
    if (input.includeTrackingLink) {
      const issued = await this.queue.issueTrackingTokenInTx(client, {
        quotedSchema: ctx.quotedSchema,
        tenantId: ctx.tenantId,
        appointmentId: row.id,
        sessionEndAt: row.end_at,
        createdBy: ctx.userId,
      });
      trackingUrl = issued.url;
    }

    const template = await client.query<{ template_body: string; version: number }>(
      `SELECT template_body, version FROM ${ctx.quotedSchema}.notification_templates
       WHERE event_type = $1 AND language = $2 AND enabled = TRUE AND approval_status = 'APPROVED'
       ORDER BY version DESC
       LIMIT 1`,
      [input.eventType, settings.language],
    );
    if (!template.rows[0]) return 'SKIPPED';

    const message = renderTemplate(template.rows[0].template_body, {
      queueDisplay: formatQueueDisplay(row.queue_number),
      sessionDate: formatSessionDate(row.local_date, row.start_at),
      trackingUrl,
      peopleAhead:
        input.peopleAhead != null ? String(input.peopleAhead) : undefined,
      delayHint: input.delayHint ? `: ${input.delayHint}` : '',
      clinicName: ctx.clinicName,
    });

    const payload = encryptPayload({
      toE164: contact.normalized_value,
      message,
      senderId: runtime.senderId || settings.approved_sender_id || process.env.SMS_DEFAULT_SENDER_ID || 'HelloDoc',
      trackingUrl: trackingUrl ?? null,
    });
    if (!payload) {
      await this.insertSkipped(client, ctx, {
        appointmentId: row.id,
        sessionId: row.session_id,
        patientId: row.patient_id,
        eventType: input.eventType,
        dedupeKey: input.dedupeKey,
        reason: 'MISSING_ENCRYPTION_KEY',
        contactId: contact.id,
        recipientMasked: maskPhone(contact.normalized_value),
        recipientHash: hashRecipient(contact.normalized_value),
      });
      return 'SKIPPED';
    }

    const outboxId = randomUUID();
    const inserted = await client.query(
      `INSERT INTO ${ctx.quotedSchema}.notification_outbox
        (id, appointment_id, session_id, patient_id, contact_id, event_type, template_version,
         recipient_masked, recipient_e164_hash, payload_ciphertext, payload_nonce,
         status, dedupe_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'PENDING',$12)
       ON CONFLICT (dedupe_key) DO NOTHING
       RETURNING id`,
      [
        outboxId,
        row.id,
        row.session_id,
        row.patient_id,
        contact.id,
        input.eventType,
        template.rows[0].version,
        maskPhone(contact.normalized_value),
        hashRecipient(contact.normalized_value),
        payload.ciphertext,
        payload.nonce,
        input.dedupeKey,
      ],
    );
    if ((inserted.rowCount ?? 0) === 0) return 'SKIPPED';

    await client.query(
      `INSERT INTO platform.sms_dispatch_index
        (id, tenant_id, tenant_outbox_id, status, next_attempt_at)
       VALUES ($1,$2,$3,'PENDING',NOW())
       ON CONFLICT (tenant_id, tenant_outbox_id) DO NOTHING`,
      [randomUUID(), ctx.tenantId, outboxId],
    );
    return 'ENQUEUED';
  }

  async suppressApproaching(client: PoolClient, ctx: ClinicContext, appointmentId: string) {
    await this.cancelPendingByAppointment(client, ctx, appointmentId, ['APPROACHING_TURN']);
  }

  async evaluateApproachingForSession(ctx: ClinicContext, sessionId: string) {
    return this.sql.withClient(async (client) => {
      await client.query('BEGIN');
      try {
        const settings = await this.ensureSettings(client, ctx.quotedSchema);
        if (!settings.enabled || !settings.approaching_turn_enabled) {
          await client.query('COMMIT');
          return { enqueued: 0 };
        }
        const threshold = settings.approaching_threshold;
        const waiting = await client.query<{
          appointment_id: string;
          queue_number: number;
          state: string;
        }>(
          `SELECT q.appointment_id, q.queue_number, q.state
           FROM ${ctx.quotedSchema}.queue_entries q
           JOIN ${ctx.quotedSchema}.appointments a ON a.id = q.appointment_id
           WHERE q.session_id = $1 AND q.state = 'WAITING' AND a.status = 'CONFIRMED'
           ORDER BY q.queue_number ASC`,
          [sessionId],
        );
        let enqueued = 0;
        for (let i = 0; i < waiting.rows.length; i += 1) {
          const peopleAhead = i;
          if (peopleAhead > threshold) continue;
          const apptId = waiting.rows[i]!.appointment_id;
          const result = await this.enqueueForAppointment(client, ctx, {
            appointmentId: apptId,
            eventType: 'APPROACHING_TURN',
            dedupeKey: `APPROACHING_TURN:${apptId}:t${threshold}`,
            includeTrackingLink: true,
            peopleAhead,
          });
          if (result === 'ENQUEUED') enqueued += 1;
        }
        await client.query('COMMIT');
        if (enqueued > 0) this.dispatcher.kick();
        return { enqueued };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  async enqueueSessionDelay(
    ctx: ClinicContext,
    sessionId: string,
    reason: string | null,
    revisedStartHint: string | null,
  ) {
    return this.sql.withClient(async (client) => {
      await client.query('BEGIN');
      try {
        const settings = await this.ensureSettings(client, ctx.quotedSchema);
        if (!settings.enabled || !settings.delay_alert_enabled) {
          await client.query('COMMIT');
          return { enqueued: 0 };
        }
        const appts = await client.query<{ id: string }>(
          `SELECT a.id
           FROM ${ctx.quotedSchema}.appointments a
           JOIN ${ctx.quotedSchema}.queue_entries q ON q.appointment_id = a.id
           WHERE a.session_id = $1
             AND a.status = 'CONFIRMED'
             AND q.state IN ('RESERVED','WAITING','CALLED','HELD')`,
          [sessionId],
        );
        const dayKey = new Date().toISOString().slice(0, 10);
        const hint = [reason, revisedStartHint].filter(Boolean).join(' — ') || null;
        let enqueued = 0;
        for (const a of appts.rows) {
          const result = await this.enqueueForAppointment(client, ctx, {
            appointmentId: a.id,
            eventType: 'SESSION_DELAY',
            dedupeKey: `SESSION_DELAY:${a.id}:${dayKey}`,
            includeTrackingLink: true,
            delayHint: hint,
          });
          if (result === 'ENQUEUED') enqueued += 1;
        }
        await client.query('COMMIT');
        if (enqueued > 0) this.dispatcher.kick();
        return { enqueued };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  private async ensureSettings(client: PoolClient, quotedSchema: string) {
    const existing = await client.query<SettingsRow>(
      `SELECT * FROM ${quotedSchema}.notification_settings LIMIT 1`,
    );
    if (existing.rows[0]) return existing.rows[0];
    const inserted = await client.query<SettingsRow>(
      `INSERT INTO ${quotedSchema}.notification_settings (id)
       VALUES ($1)
       RETURNING *`,
      [randomUUID()],
    );
    return inserted.rows[0]!;
  }

  private async resolveMobileContact(
    client: PoolClient,
    quotedSchema: string,
    patientId: string,
  ): Promise<ContactRow | null> {
    const result = await client.query<ContactRow>(
      `SELECT id, contact_type, normalized_value, display_value
       FROM ${quotedSchema}.patient_contacts
       WHERE patient_id = $1
         AND contact_type IN ('MOBILE', 'GUARDIAN_MOBILE')
         AND normalized_value LIKE '+94%'
       ORDER BY is_primary DESC, created_at ASC
       LIMIT 1`,
      [patientId],
    );
    return result.rows[0] ?? null;
  }

  private async cancelPendingByAppointment(
    client: PoolClient,
    ctx: ClinicContext,
    appointmentId: string,
    eventTypes: NotificationEventType[],
  ) {
    const cancelled = await client.query<{ id: string }>(
      `UPDATE ${ctx.quotedSchema}.notification_outbox
       SET status = 'CANCELLED', updated_at = NOW(), finalized_at = NOW()
       WHERE appointment_id = $1
         AND event_type = ANY($2::text[])
         AND status = 'PENDING'
       RETURNING id`,
      [appointmentId, eventTypes],
    );
    if ((cancelled.rowCount ?? 0) > 0) {
      await client.query(
        `UPDATE platform.sms_dispatch_index
         SET status = 'CANCELLED', updated_at = NOW(), claimed_until = NULL
         WHERE tenant_id = $1 AND tenant_outbox_id = ANY($2::uuid[])`,
        [ctx.tenantId, cancelled.rows.map((r) => r.id)],
      );
    }
  }

  private async insertSkipped(
    client: PoolClient,
    ctx: ClinicContext,
    input: {
      appointmentId: string;
      sessionId: string;
      patientId: string;
      eventType: NotificationEventType;
      dedupeKey: string;
      reason: string;
      contactId?: string;
      recipientMasked?: string;
      recipientHash?: string;
    },
  ) {
    await client.query(
      `INSERT INTO ${ctx.quotedSchema}.notification_outbox
        (id, appointment_id, session_id, patient_id, contact_id, event_type, template_version,
         recipient_masked, recipient_e164_hash, status, dedupe_key, error_category, finalized_at)
       VALUES ($1,$2,$3,$4,$5,$6,1,$7,$8,'SKIPPED',$9,$10,NOW())
       ON CONFLICT (dedupe_key) DO NOTHING`,
      [
        randomUUID(),
        input.appointmentId,
        input.sessionId,
        input.patientId,
        input.contactId ?? null,
        input.eventType,
        input.recipientMasked ?? 'n/a',
        input.recipientHash ?? createHash('sha256').update(input.dedupeKey).digest('hex'),
        input.dedupeKey,
        input.reason,
      ],
    );
  }
}
