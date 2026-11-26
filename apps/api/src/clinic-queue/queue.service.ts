import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { AuditService } from '../audit/audit.service.js';
import type { ClinicContext } from '../clinic-context/clinic-context.service.js';
import { assertSafeClinicSchemaName, quoteIdent } from '../common/identifiers.js';
import { TenantSqlClient } from '../tenant-provisioning/tenant-sql.client.js';
import { QueueEventsHub } from './queue-events.hub.js';
import {
  assertQueueTransition,
  estimateWaitMinutes,
  isCallableSessionStatus,
  type QueueState,
} from './queue-state.js';
import { CloseSessionDto, DelaySessionDto, ReasonDto, RequiredReasonDto } from './dto/queue.dto.js';

type QueueEntryRow = {
  id: string;
  appointment_id: string;
  session_id: string;
  queue_number: number;
  state: QueueState;
  checked_in_at: Date | null;
  called_at: Date | null;
  service_started_at: Date | null;
  finished_at: Date | null;
  skipped_at: Date | null;
  held_at: Date | null;
  no_show_at: Date | null;
  skip_reason: string | null;
  hold_reason: string | null;
  version: number;
  patient_full_name?: string;
  patient_number?: string;
  appointment_status?: string;
  booking_reference?: string;
};

type SessionRow = {
  id: string;
  doctor_id: string;
  doctor_display_name: string | null;
  local_date: Date | string;
  start_at: Date;
  end_at: Date;
  timezone: string;
  capacity: number;
  status: string;
  expected_duration_minutes: number;
  version: number;
  clinic_name?: string;
};

function httpError(code: string, message: string, kind: 'bad' | 'conflict' | 'notfound' = 'bad') {
  const body = { message, code };
  if (kind === 'conflict') throw new ConflictException(body);
  if (kind === 'notfound') throw new NotFoundException(body);
  throw new BadRequestException(body);
}

function mapEntry(row: QueueEntryRow) {
  return {
    id: row.id,
    appointmentId: row.appointment_id,
    sessionId: row.session_id,
    queueNumber: row.queue_number,
    queueDisplay: String(row.queue_number).padStart(3, '0'),
    state: row.state,
    checkedInAt: row.checked_in_at?.toISOString() ?? null,
    calledAt: row.called_at?.toISOString() ?? null,
    serviceStartedAt: row.service_started_at?.toISOString() ?? null,
    finishedAt: row.finished_at?.toISOString() ?? null,
    skippedAt: row.skipped_at?.toISOString() ?? null,
    heldAt: row.held_at?.toISOString() ?? null,
    noShowAt: row.no_show_at?.toISOString() ?? null,
    skipReason: row.skip_reason,
    holdReason: row.hold_reason,
    version: row.version,
    patientFullName: row.patient_full_name ?? null,
    patientNumber: row.patient_number ?? null,
    appointmentStatus: row.appointment_status ?? null,
    bookingReference: row.booking_reference ?? null,
  };
}

@Injectable()
export class QueueService {
  constructor(
    private readonly sql: TenantSqlClient,
    private readonly audit: AuditService,
    private readonly hub: QueueEventsHub,
  ) {}

  async ensureReservedEntry(
    client: PoolClient,
    quotedSchema: string,
    appointment: { id: string; session_id: string; queue_number: number },
  ) {
    await client.query(
      `INSERT INTO ${quotedSchema}.queue_entries
        (id, appointment_id, session_id, queue_number, state)
       VALUES ($1,$2,$3,$4,'RESERVED')
       ON CONFLICT (appointment_id) DO NOTHING`,
      [randomUUID(), appointment.id, appointment.session_id, appointment.queue_number],
    );
  }

  async invalidateForAppointment(
    client: PoolClient,
    quotedSchema: string,
    appointmentId: string,
  ) {
    await client.query(
      `UPDATE ${quotedSchema}.queue_entries
       SET state = 'INVALIDATED', updated_at = NOW(), version = version + 1
       WHERE appointment_id = $1
         AND state NOT IN ('COMPLETED', 'INVALIDATED')`,
      [appointmentId],
    );
    const tokens = await client.query<{ id: string; token_hash: string }>(
      `UPDATE ${quotedSchema}.appointment_tracking_tokens
       SET revoked_at = COALESCE(revoked_at, NOW())
       WHERE appointment_id = $1 AND revoked_at IS NULL
       RETURNING id, token_hash`,
      [appointmentId],
    );
    if ((tokens.rowCount ?? 0) > 0) {
      const hashes = tokens.rows.map((r) => r.token_hash);
      await client.query(
        `UPDATE platform.tracking_token_index
         SET revoked_at = COALESCE(revoked_at, NOW())
         WHERE token_hash = ANY($1::text[]) AND revoked_at IS NULL`,
        [hashes],
      );
    }
  }

  /**
   * Issues a new tracking token for an appointment inside an open transaction.
   * Writes tenant token + platform routing index. Returns raw URL once (not re-readable).
   */
  async issueTrackingTokenInTx(
    client: PoolClient,
    input: {
      quotedSchema: string;
      tenantId: string;
      appointmentId: string;
      sessionEndAt: Date;
      createdBy: string;
    },
  ): Promise<{ tokenId: string; tokenHash: string; rawToken: string; url: string; expiresAt: Date }> {
    const publicOrigin = (process.env.PUBLIC_WEB_ORIGIN ?? process.env.CORS_ORIGIN ?? 'http://localhost:5173')
      .split(',')[0]
      .trim();
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(input.sessionEndAt.getTime() + 48 * 60 * 60 * 1000);
    const tokenId = randomUUID();

    const previous = await client.query<{ token_hash: string }>(
      `UPDATE ${input.quotedSchema}.appointment_tracking_tokens
       SET revoked_at = NOW()
       WHERE appointment_id = $1 AND revoked_at IS NULL
       RETURNING token_hash`,
      [input.appointmentId],
    );
    if ((previous.rowCount ?? 0) > 0) {
      await client.query(
        `UPDATE platform.tracking_token_index
         SET revoked_at = COALESCE(revoked_at, NOW())
         WHERE token_hash = ANY($1::text[]) AND revoked_at IS NULL`,
        [previous.rows.map((r) => r.token_hash)],
      );
    }

    await client.query(
      `INSERT INTO ${input.quotedSchema}.appointment_tracking_tokens
        (id, appointment_id, token_hash, expires_at, created_by)
       VALUES ($1,$2,$3,$4,$5)`,
      [tokenId, input.appointmentId, tokenHash, expiresAt, input.createdBy],
    );
    await client.query(
      `INSERT INTO platform.tracking_token_index
        (token_hash, tenant_id, tenant_token_reference, expires_at)
       VALUES ($1,$2,$3,$4)`,
      [tokenHash, input.tenantId, tokenId, expiresAt],
    );

    return {
      tokenId,
      tokenHash,
      rawToken,
      url: `${publicOrigin}/track/${rawToken}`,
      expiresAt,
    };
  }

  private async lockSession(client: PoolClient, quotedSchema: string, sessionId: string) {
    const result = await client.query<SessionRow>(
      `SELECT s.id, s.doctor_id, d.display_name AS doctor_display_name, s.local_date,
              s.start_at, s.end_at, s.timezone, s.capacity, s.status,
              s.expected_duration_minutes, s.version
       FROM ${quotedSchema}.consultation_sessions s
       JOIN ${quotedSchema}.doctors d ON d.id = s.doctor_id
       WHERE s.id = $1
       FOR UPDATE OF s`,
      [sessionId],
    );
    return result.rows[0] ?? null;
  }

  private async lockEntry(client: PoolClient, quotedSchema: string, entryId: string) {
    const result = await client.query<QueueEntryRow>(
      `SELECT q.*, p.full_name AS patient_full_name, p.patient_number,
              a.status AS appointment_status, a.booking_reference
       FROM ${quotedSchema}.queue_entries q
       JOIN ${quotedSchema}.appointments a ON a.id = q.appointment_id
       JOIN ${quotedSchema}.patients p ON p.id = a.patient_id
       WHERE q.id = $1
       FOR UPDATE OF q`,
      [entryId],
    );
    return result.rows[0] ?? null;
  }

  private async appendEvent(
    client: PoolClient,
    quotedSchema: string,
    input: {
      sessionId: string;
      queueEntryId?: string | null;
      appointmentId?: string | null;
      eventType: string;
      actorId: string | null;
      payload?: Record<string, unknown>;
    },
  ) {
    const result = await client.query<{ id: string }>(
      `INSERT INTO ${quotedSchema}.queue_events
        (session_id, queue_entry_id, appointment_id, event_type, actor_id, payload)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb)
       RETURNING id::text`,
      [
        input.sessionId,
        input.queueEntryId ?? null,
        input.appointmentId ?? null,
        input.eventType,
        input.actorId,
        JSON.stringify(input.payload ?? {}),
      ],
    );
    return Number(result.rows[0]?.id ?? 0);
  }

  private async transition(
    client: PoolClient,
    quotedSchema: string,
    entry: QueueEntryRow,
    to: QueueState,
    patch: {
      checked_in_at?: Date;
      called_at?: Date;
      service_started_at?: Date;
      finished_at?: Date;
      skipped_at?: Date;
      held_at?: Date;
      no_show_at?: Date;
      skip_reason?: string | null;
      hold_reason?: string | null;
    },
    expectedVersion: number,
  ) {
    assertQueueTransition(entry.state, to);
    const result = await client.query<QueueEntryRow>(
      `UPDATE ${quotedSchema}.queue_entries SET
         state = $2,
         checked_in_at = COALESCE($4, checked_in_at),
         called_at = COALESCE($5, called_at),
         service_started_at = COALESCE($6, service_started_at),
         finished_at = COALESCE($7, finished_at),
         skipped_at = COALESCE($8, skipped_at),
         held_at = COALESCE($9, held_at),
         no_show_at = COALESCE($10, no_show_at),
         skip_reason = COALESCE($11, skip_reason),
         hold_reason = COALESCE($12, hold_reason),
         updated_at = NOW(),
         version = version + 1
       WHERE id = $1 AND version = $3
       RETURNING *`,
      [
        entry.id,
        to,
        expectedVersion,
        patch.checked_in_at ?? null,
        patch.called_at ?? null,
        patch.service_started_at ?? null,
        patch.finished_at ?? null,
        patch.skipped_at ?? null,
        patch.held_at ?? null,
        patch.no_show_at ?? null,
        patch.skip_reason ?? null,
        patch.hold_reason ?? null,
      ],
    );
    if (!result.rows[0]) {
      httpError('CONCURRENT_QUEUE_UPDATE', 'Queue entry changed; refresh and retry', 'conflict');
    }
    return result.rows[0];
  }

  async getBoard(ctx: ClinicContext, sessionId: string) {
    return this.sql.withClient(async (client) => {
      const session = await client.query<SessionRow>(
        `SELECT s.id, s.doctor_id, d.display_name AS doctor_display_name, s.local_date,
                s.start_at, s.end_at, s.timezone, s.capacity, s.status,
                s.expected_duration_minutes, s.version
         FROM ${ctx.quotedSchema}.consultation_sessions s
         JOIN ${ctx.quotedSchema}.doctors d ON d.id = s.doctor_id
         WHERE s.id = $1`,
        [sessionId],
      );
      if (!session.rows[0]) httpError('SESSION_NOT_FOUND', 'Session not found', 'notfound');
      const entries = await client.query<QueueEntryRow>(
        `SELECT q.*, p.full_name AS patient_full_name, p.patient_number,
                a.status AS appointment_status, a.booking_reference
         FROM ${ctx.quotedSchema}.queue_entries q
         JOIN ${ctx.quotedSchema}.appointments a ON a.id = q.appointment_id
         JOIN ${ctx.quotedSchema}.patients p ON p.id = a.patient_id
         WHERE q.session_id = $1
         ORDER BY q.queue_number ASC`,
        [sessionId],
      );
      const revision = await client.query<{ id: string }>(
        `SELECT COALESCE(MAX(id), 0)::text AS id FROM ${ctx.quotedSchema}.queue_events WHERE session_id = $1`,
        [sessionId],
      );
      const mapped = entries.rows.map(mapEntry);
      const called = mapped.find((e) => e.state === 'CALLED') ?? null;
      const inService = mapped.find((e) => e.state === 'IN_SERVICE') ?? null;
      return {
        revision: Number(revision.rows[0]?.id ?? 0),
        session: {
          id: session.rows[0].id,
          doctorId: session.rows[0].doctor_id,
          doctorDisplayName: session.rows[0].doctor_display_name,
          localDate:
            session.rows[0].local_date instanceof Date
              ? session.rows[0].local_date.toISOString().slice(0, 10)
              : String(session.rows[0].local_date).slice(0, 10),
          startAt: session.rows[0].start_at.toISOString(),
          endAt: session.rows[0].end_at.toISOString(),
          timezone: session.rows[0].timezone,
          capacity: session.rows[0].capacity,
          status: session.rows[0].status,
          expectedDurationMinutes: session.rows[0].expected_duration_minutes,
          version: session.rows[0].version,
        },
        currentCalled: called,
        currentInService: inService,
        waiting: mapped.filter((e) => e.state === 'WAITING'),
        called: mapped.filter((e) => e.state === 'CALLED'),
        inService: mapped.filter((e) => e.state === 'IN_SERVICE'),
        completed: mapped.filter((e) => e.state === 'COMPLETED'),
        held: mapped.filter((e) => e.state === 'HELD'),
        skipped: mapped.filter((e) => e.state === 'SKIPPED'),
        reserved: mapped.filter((e) => e.state === 'RESERVED'),
        noShow: mapped.filter((e) => e.state === 'NO_SHOW'),
        entries: mapped,
      };
    });
  }

  async checkIn(ctx: ClinicContext, appointmentId: string) {
    return this.sql.withClient(async (client) => {
      await client.query('BEGIN');
      try {
        const appt = await client.query<{
          id: string;
          session_id: string;
          status: string;
          queue_number: number;
        }>(
          `SELECT id, session_id, status, queue_number
           FROM ${ctx.quotedSchema}.appointments WHERE id = $1 FOR UPDATE`,
          [appointmentId],
        );
        if (!appt.rows[0]) httpError('APPOINTMENT_NOT_FOUND', 'Appointment not found', 'notfound');
        if (appt.rows[0].status !== 'CONFIRMED') {
          httpError('APPOINTMENT_CANCELLED', 'Appointment is not active', 'conflict');
        }
        await this.lockSession(client, ctx.quotedSchema, appt.rows[0].session_id);
        await this.ensureReservedEntry(client, ctx.quotedSchema, appt.rows[0]);
        const entry = await client.query<QueueEntryRow>(
          `SELECT * FROM ${ctx.quotedSchema}.queue_entries WHERE appointment_id = $1 FOR UPDATE`,
          [appointmentId],
        );
        const row = entry.rows[0];
        if (!row) httpError('QUEUE_ENTRY_NOT_FOUND', 'Queue entry not found', 'notfound');
        if (row.state === 'WAITING') {
          await client.query('COMMIT');
          return this.getBoard(ctx, row.session_id);
        }
        await this.transition(client, ctx.quotedSchema, row, 'WAITING', {
          checked_in_at: new Date(),
        }, row.version);
        const revision = await this.appendEvent(client, ctx.quotedSchema, {
          sessionId: row.session_id,
          queueEntryId: row.id,
          appointmentId,
          eventType: 'CHECKED_IN',
          actorId: ctx.userId,
          payload: { queueNumber: row.queue_number },
        });
        await client.query('COMMIT');
        await this.hub.notifyCommitted({
          schemaName: ctx.schemaName,
          sessionId: row.session_id,
          revision,
          eventType: 'CHECKED_IN',
        });
        await this.audit.record({
          actorId: ctx.userId,
          action: 'queue.checked_in',
          targetType: 'appointment',
          targetId: appointmentId,
          metadata: { tenantId: ctx.tenantId, queueNumber: row.queue_number },
        });
        return this.getBoard(ctx, row.session_id);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  async callNext(ctx: ClinicContext, sessionId: string) {
    return this.sql.withClient(async (client) => {
      await client.query('BEGIN');
      try {
        const session = await this.lockSession(client, ctx.quotedSchema, sessionId);
        if (!session) httpError('SESSION_NOT_FOUND', 'Session not found', 'notfound');
        if (!isCallableSessionStatus(session.status)) {
          httpError(
            session.status === 'PAUSED' ? 'SESSION_PAUSED' : 'SESSION_NOT_OPEN',
            'Session is not open for calling',
            'conflict',
          );
        }
        const active = await client.query(
          `SELECT id FROM ${ctx.quotedSchema}.queue_entries
           WHERE session_id = $1 AND state IN ('CALLED', 'IN_SERVICE')
           LIMIT 1`,
          [sessionId],
        );
        if ((active.rowCount ?? 0) > 0) {
          httpError('ACTIVE_TURN_EXISTS', 'A patient is already called or in service', 'conflict');
        }
        const next = await client.query<QueueEntryRow>(
          `SELECT q.*
           FROM ${ctx.quotedSchema}.queue_entries q
           JOIN ${ctx.quotedSchema}.appointments a ON a.id = q.appointment_id
           WHERE q.session_id = $1 AND q.state = 'WAITING' AND a.status = 'CONFIRMED'
           ORDER BY q.queue_number ASC
           LIMIT 1
           FOR UPDATE OF q SKIP LOCKED`,
          [sessionId],
        );
        const row = next.rows[0];
        if (!row) httpError('PATIENT_NOT_CHECKED_IN', 'No waiting patients to call', 'conflict');
        await this.transition(client, ctx.quotedSchema, row, 'CALLED', {
          called_at: new Date(),
        }, row.version);
        const revision = await this.appendEvent(client, ctx.quotedSchema, {
          sessionId,
          queueEntryId: row.id,
          appointmentId: row.appointment_id,
          eventType: 'CALLED',
          actorId: ctx.userId,
          payload: { queueNumber: row.queue_number },
        });
        await client.query('COMMIT');
        await this.hub.notifyCommitted({
          schemaName: ctx.schemaName,
          sessionId,
          revision,
          eventType: 'CALLED',
        });
        await this.audit.record({
          actorId: ctx.userId,
          action: 'queue.called',
          targetType: 'queue_entry',
          targetId: row.id,
          metadata: { tenantId: ctx.tenantId, queueNumber: row.queue_number },
        });
        return this.getBoard(ctx, sessionId);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  private async mutateEntry(
    ctx: ClinicContext,
    entryId: string,
    to: QueueState,
    eventType: string,
    patch: {
      checked_in_at?: Date;
      called_at?: Date;
      service_started_at?: Date;
      finished_at?: Date;
      skipped_at?: Date;
      held_at?: Date;
      no_show_at?: Date;
      skip_reason?: string | null;
      hold_reason?: string | null;
    },
    auditAction: string,
  ) {
    return this.sql.withClient(async (client) => {
      await client.query('BEGIN');
      try {
        const entry = await this.lockEntry(client, ctx.quotedSchema, entryId);
        if (!entry) httpError('QUEUE_ENTRY_NOT_FOUND', 'Queue entry not found', 'notfound');
        if (entry.appointment_status !== 'CONFIRMED' && to !== 'INVALIDATED') {
          httpError('APPOINTMENT_CANCELLED', 'Appointment is not active', 'conflict');
        }
        await this.lockSession(client, ctx.quotedSchema, entry.session_id);
        await this.transition(client, ctx.quotedSchema, entry, to, patch, entry.version);
        const revision = await this.appendEvent(client, ctx.quotedSchema, {
          sessionId: entry.session_id,
          queueEntryId: entry.id,
          appointmentId: entry.appointment_id,
          eventType,
          actorId: ctx.userId,
          payload: { queueNumber: entry.queue_number, to },
        });
        await client.query('COMMIT');
        await this.hub.notifyCommitted({
          schemaName: ctx.schemaName,
          sessionId: entry.session_id,
          revision,
          eventType,
        });
        await this.audit.record({
          actorId: ctx.userId,
          action: auditAction,
          targetType: 'queue_entry',
          targetId: entryId,
          metadata: { tenantId: ctx.tenantId, queueNumber: entry.queue_number },
        });
        return this.getBoard(ctx, entry.session_id);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  recall(ctx: ClinicContext, entryId: string) {
    return this.mutateEntry(ctx, entryId, 'CALLED', 'RECALLED', { called_at: new Date() }, 'queue.recalled');
  }

  hold(ctx: ClinicContext, entryId: string, dto: ReasonDto) {
    return this.mutateEntry(
      ctx,
      entryId,
      'HELD',
      'HELD',
      { held_at: new Date(), hold_reason: dto.reason?.trim() || null },
      'queue.held',
    );
  }

  skip(ctx: ClinicContext, entryId: string, dto: RequiredReasonDto) {
    return this.mutateEntry(
      ctx,
      entryId,
      'SKIPPED',
      'SKIPPED',
      { skipped_at: new Date(), skip_reason: dto.reason.trim() },
      'queue.skipped',
    );
  }

  restore(ctx: ClinicContext, entryId: string) {
    return this.mutateEntry(ctx, entryId, 'WAITING', 'RESTORED', {}, 'queue.restored');
  }

  startTurn(ctx: ClinicContext, entryId: string) {
    return this.mutateEntry(
      ctx,
      entryId,
      'IN_SERVICE',
      'STARTED',
      { service_started_at: new Date() },
      'queue.started',
    );
  }

  finishTurn(ctx: ClinicContext, entryId: string) {
    return this.mutateEntry(
      ctx,
      entryId,
      'COMPLETED',
      'FINISHED',
      { finished_at: new Date() },
      'queue.finished',
    );
  }

  async openSession(ctx: ClinicContext, sessionId: string) {
    return this.setSessionStatus(ctx, sessionId, 'OPEN', 'session.opened');
  }

  async pauseSession(ctx: ClinicContext, sessionId: string, dto: ReasonDto) {
    return this.setSessionStatus(ctx, sessionId, 'PAUSED', 'session.paused', {
      reason: dto.reason ?? null,
    });
  }

  async resumeSession(ctx: ClinicContext, sessionId: string) {
    return this.setSessionStatus(ctx, sessionId, 'OPEN', 'session.resumed');
  }

  async delaySession(ctx: ClinicContext, sessionId: string, dto: DelaySessionDto) {
    return this.setSessionStatus(ctx, sessionId, 'DELAYED', 'session.delayed', {
      reason: dto.reason,
      revisedStartHint: dto.revisedStartHint ?? null,
    });
  }

  async closeSession(ctx: ClinicContext, sessionId: string, dto: CloseSessionDto) {
    return this.sql.withClient(async (client) => {
      await client.query('BEGIN');
      try {
        const session = await this.lockSession(client, ctx.quotedSchema, sessionId);
        if (!session) httpError('SESSION_NOT_FOUND', 'Session not found', 'notfound');
        if (!['OPEN', 'PAUSED', 'DELAYED'].includes(session.status)) {
          httpError('SESSION_NOT_OPEN', 'Only an open session can be completed', 'conflict');
        }
        const active = await client.query(
          `SELECT count(*)::int AS c FROM ${ctx.quotedSchema}.queue_entries
           WHERE session_id = $1 AND state IN ('CALLED','IN_SERVICE')`,
          [sessionId],
        );
        if ((active.rows[0]?.c ?? 0) > 0) {
          httpError(
            'SESSION_NOT_OPEN',
            'A patient is still being called or seen. Finish that consultation before completing the session.',
            'conflict',
          );
        }
        const unresolved = await client.query(
          `SELECT count(*)::int AS c FROM ${ctx.quotedSchema}.queue_entries
           WHERE session_id = $1 AND state IN ('WAITING','CALLED','IN_SERVICE','HELD','RESERVED')`,
          [sessionId],
        );
        const count = unresolved.rows[0]?.c ?? 0;
        if (count > 0 && dto.unresolvedPolicy === 'MARK_NO_SHOW') {
          await client.query(
            `UPDATE ${ctx.quotedSchema}.queue_entries
             SET state = 'NO_SHOW', no_show_at = NOW(), updated_at = NOW(), version = version + 1
             WHERE session_id = $1 AND state IN ('WAITING','RESERVED','HELD','SKIPPED')`,
            [sessionId],
          );
        } else if (count > 0 && dto.unresolvedPolicy !== 'KEEP_WAITING') {
          httpError(
            'SESSION_NOT_OPEN',
            'Session still has unresolved queue entries; confirm close policy',
            'conflict',
          );
        }
        await client.query(
          `UPDATE ${ctx.quotedSchema}.consultation_sessions
           SET status = 'CLOSED', updated_at = NOW(), updated_by = $2, version = version + 1
           WHERE id = $1`,
          [sessionId, ctx.userId],
        );
        const revision = await this.appendEvent(client, ctx.quotedSchema, {
          sessionId,
          eventType: 'SESSION_CLOSED',
          actorId: ctx.userId,
          payload: { note: dto.note ?? null, unresolvedPolicy: dto.unresolvedPolicy ?? null },
        });
        await client.query('COMMIT');
        await this.hub.notifyCommitted({
          schemaName: ctx.schemaName,
          sessionId,
          revision,
          eventType: 'SESSION_CLOSED',
        });
        return this.getBoard(ctx, sessionId);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  private async setSessionStatus(
    ctx: ClinicContext,
    sessionId: string,
    status: string,
    auditAction: string,
    payload: Record<string, unknown> = {},
  ) {
    return this.sql.withClient(async (client) => {
      await client.query('BEGIN');
      try {
        const session = await this.lockSession(client, ctx.quotedSchema, sessionId);
        if (!session) httpError('SESSION_NOT_FOUND', 'Session not found', 'notfound');
        if (session.status === 'CANCELLED') {
          httpError('SESSION_NOT_OPEN', 'Cancelled session cannot change status', 'conflict');
        }
        await client.query(
          `UPDATE ${ctx.quotedSchema}.consultation_sessions
           SET status = $2, updated_at = NOW(), updated_by = $3, version = version + 1
           WHERE id = $1`,
          [sessionId, status, ctx.userId],
        );
        const revision = await this.appendEvent(client, ctx.quotedSchema, {
          sessionId,
          eventType: `SESSION_${status}`,
          actorId: ctx.userId,
          payload,
        });
        await client.query('COMMIT');
        await this.hub.notifyCommitted({
          schemaName: ctx.schemaName,
          sessionId,
          revision,
          eventType: `SESSION_${status}`,
        });
        await this.audit.record({
          actorId: ctx.userId,
          action: auditAction,
          targetType: 'consultation_session',
          targetId: sessionId,
          metadata: { tenantId: ctx.tenantId, ...payload },
        });
        return this.getBoard(ctx, sessionId);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  async createTrackingLink(ctx: ClinicContext, appointmentId: string) {
    return this.sql.withClient(async (client) => {
      await client.query('BEGIN');
      try {
        const appt = await client.query<{
          id: string;
          status: string;
          session_id: string;
          end_at: Date;
        }>(
          `SELECT a.id, a.status, a.session_id, s.end_at
           FROM ${ctx.quotedSchema}.appointments a
           JOIN ${ctx.quotedSchema}.consultation_sessions s ON s.id = a.session_id
           WHERE a.id = $1
           FOR UPDATE OF a`,
          [appointmentId],
        );
        if (!appt.rows[0]) httpError('APPOINTMENT_NOT_FOUND', 'Appointment not found', 'notfound');
        if (appt.rows[0].status !== 'CONFIRMED') {
          httpError('APPOINTMENT_CANCELLED', 'Cannot create tracking link for inactive appointment', 'conflict');
        }

        const issued = await this.issueTrackingTokenInTx(client, {
          quotedSchema: ctx.quotedSchema,
          tenantId: ctx.tenantId,
          appointmentId,
          sessionEndAt: appt.rows[0].end_at,
          createdBy: ctx.userId,
        });
        await client.query('COMMIT');

        await this.audit.record({
          actorId: ctx.userId,
          action: 'tracking_link.created',
          targetType: 'appointment',
          targetId: appointmentId,
          metadata: { tenantId: ctx.tenantId, expiresAt: issued.expiresAt.toISOString() },
        });
        return {
          url: issued.url,
          expiresAt: issued.expiresAt.toISOString(),
        };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  async publicTrack(token: string) {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    return this.sql.withClient(async (client) => {
      const route = await client.query<{
        tenant_id: string;
        tenant_token_reference: string;
        schema_name: string;
        expires_at: Date;
        revoked_at: Date | null;
      }>(
        `SELECT i.tenant_id, i.tenant_token_reference, t."schemaName" AS schema_name,
                i.expires_at, i.revoked_at
         FROM platform.tracking_token_index i
         JOIN platform."Tenant" t ON t.id = i.tenant_id
         WHERE i.token_hash = $1
         LIMIT 1`,
        [tokenHash],
      );
      if (!route.rows[0]) {
        httpError('TRACKING_LINK_EXPIRED', 'Tracking link is invalid or expired', 'notfound');
      }
      const row = route.rows[0];
      if (row.revoked_at || row.expires_at.getTime() < Date.now() || row.schema_name == null) {
        httpError('TRACKING_LINK_EXPIRED', 'Tracking link is invalid or expired', 'notfound');
      }

      let schemaName: string;
      try {
        schemaName = assertSafeClinicSchemaName(row.schema_name);
      } catch {
        httpError('TRACKING_LINK_EXPIRED', 'Tracking link is invalid or expired', 'notfound');
        return undefined as never;
      }
      const quoted = quoteIdent(schemaName);

      const found = await client.query<{
        appointment_id: string;
        expires_at: Date;
        revoked_at: Date | null;
      }>(
        `SELECT appointment_id, expires_at, revoked_at
         FROM ${quoted}.appointment_tracking_tokens
         WHERE id = $1 AND token_hash = $2
         LIMIT 1`,
        [row.tenant_token_reference, tokenHash],
      );
      if (
        !found.rows[0] ||
        found.rows[0].revoked_at ||
        found.rows[0].expires_at.getTime() < Date.now()
      ) {
        httpError('TRACKING_LINK_EXPIRED', 'Tracking link is invalid or expired', 'notfound');
      }
      return this.buildPublicSnapshot(
        client,
        quoted,
        schemaName,
        found.rows[0]!.appointment_id,
      );
    });
  }

  private async buildPublicSnapshot(
    client: PoolClient,
    quotedSchema: string,
    schemaName: string,
    appointmentId: string,
  ) {
    const row = await client.query<{
      queue_number: number;
      appointment_status: string;
      doctor_display_name: string | null;
      clinic_name: string | null;
      local_date: Date | string;
      start_at: Date;
      end_at: Date;
      session_status: string;
      expected_duration_minutes: number;
      queue_state: QueueState | null;
      session_id: string;
    }>(
      `SELECT a.queue_number, a.status AS appointment_status,
              d.display_name AS doctor_display_name,
              cp.clinic_name AS clinic_name,
              s.local_date, s.start_at, s.end_at, s.status AS session_status,
              s.expected_duration_minutes, q.state AS queue_state, s.id AS session_id
       FROM ${quotedSchema}.appointments a
       JOIN ${quotedSchema}.consultation_sessions s ON s.id = a.session_id
       JOIN ${quotedSchema}.doctors d ON d.id = s.doctor_id
       LEFT JOIN ${quotedSchema}.clinic_profile cp ON TRUE
       LEFT JOIN ${quotedSchema}.queue_entries q ON q.appointment_id = a.id
       WHERE a.id = $1`,
      [appointmentId],
    );
    if (!row.rows[0]) httpError('TRACKING_LINK_EXPIRED', 'Tracking link is invalid or expired', 'notfound');
    const data = row.rows[0];
    const current = await client.query<{ queue_number: number; state: string }>(
      `SELECT queue_number, state FROM ${quotedSchema}.queue_entries
       WHERE session_id = $1 AND state IN ('CALLED','IN_SERVICE')
       ORDER BY CASE state WHEN 'IN_SERVICE' THEN 0 ELSE 1 END
       LIMIT 1`,
      [data.session_id],
    );
    const ahead = await client.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM ${quotedSchema}.queue_entries
       WHERE session_id = $1 AND state = 'WAITING' AND queue_number < $2`,
      [data.session_id, data.queue_number],
    );
    const peopleAhead = Number(ahead.rows[0]?.c ?? 0);
    const estimate = estimateWaitMinutes({
      sessionStatus: data.session_status,
      peopleAhead,
      avgMinutes: data.expected_duration_minutes,
      hasActiveTurn: Boolean(current.rows[0]),
    });
    const revision = await client.query<{ id: string }>(
      `SELECT COALESCE(MAX(id),0)::text AS id FROM ${quotedSchema}.queue_events WHERE session_id = $1`,
      [data.session_id],
    );
    const localDate =
      data.local_date instanceof Date
        ? data.local_date.toISOString().slice(0, 10)
        : String(data.local_date).slice(0, 10);

    return {
      revision: Number(revision.rows[0]?.id ?? 0),
      clinicName: data.clinic_name ?? 'Clinic',
      doctorDisplayName: data.doctor_display_name,
      localDate,
      startAt: data.start_at.toISOString(),
      endAt: data.end_at.toISOString(),
      sessionStatus: data.session_status,
      yourQueueNumber: data.queue_number,
      yourQueueDisplay: String(data.queue_number).padStart(3, '0'),
      yourState: data.appointment_status !== 'CONFIRMED' ? 'INVALIDATED' : data.queue_state,
      appointmentStatus: data.appointment_status,
      nowServingNumber: current.rows[0]?.queue_number ?? null,
      nowServingDisplay: current.rows[0]
        ? String(current.rows[0].queue_number).padStart(3, '0')
        : null,
      nowServingState: current.rows[0]?.state ?? null,
      peopleAhead: data.queue_state === 'WAITING' ? peopleAhead : null,
      estimate,
      schemaHint: schemaName, // internal only for SSE filter — strip in controller response
      sessionId: data.session_id,
      updatedAt: new Date().toISOString(),
    };
  }

  get hubStream() {
    return this.hub.stream$;
  }
}
