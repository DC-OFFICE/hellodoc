import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import type { ClinicContext } from '../clinic-context/clinic-context.service.js';
import { TenantSqlClient } from '../tenant-provisioning/tenant-sql.client.js';
import { CreateScheduleTemplatesDto, MaterializeScheduleDto } from './dto/schedule.dto.js';

const DEFAULT_TZ = 'Asia/Colombo';
const DEFAULT_HORIZON_DAYS = 90;

type TemplateRow = {
  id: string;
  doctor_id: string;
  weekday: number;
  local_start_time: string;
  local_end_time: string;
  effective_from: string;
  effective_until: string | null;
  default_capacity: number;
  expected_duration_minutes: number;
  timezone: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  created_by: string;
  updated_by: string | null;
};

function mapTemplate(row: TemplateRow) {
  return {
    id: row.id,
    doctorId: row.doctor_id,
    weekday: row.weekday,
    localStartTime: String(row.local_start_time).slice(0, 5),
    localEndTime: String(row.local_end_time).slice(0, 5),
    effectiveFrom: String(row.effective_from).slice(0, 10),
    effectiveUntil: row.effective_until ? String(row.effective_until).slice(0, 10) : null,
    defaultCapacity: row.default_capacity,
    expectedDurationMinutes: row.expected_duration_minutes,
    timezone: row.timezone,
    isActive: row.is_active,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

@Injectable()
export class SchedulesService {
  constructor(
    private readonly sql: TenantSqlClient,
    private readonly audit: AuditService,
  ) {}

  async listForDoctor(ctx: ClinicContext, doctorId: string) {
    return this.sql.withClient(async (client) => {
      await this.requireDoctor(client, ctx, doctorId);
      const result = await client.query<TemplateRow>(
        `SELECT * FROM ${ctx.quotedSchema}.schedule_templates
         WHERE doctor_id = $1
         ORDER BY weekday ASC, local_start_time ASC`,
        [doctorId],
      );
      return result.rows.map(mapTemplate);
    });
  }

  async createForDoctor(ctx: ClinicContext, doctorId: string, dto: CreateScheduleTemplatesDto) {
    for (const slot of dto.slots) {
      if (slot.localEndTime <= slot.localStartTime) {
        throw new BadRequestException('Each slot end time must be after start time');
      }
    }

    const timezone = dto.timezone?.trim() || DEFAULT_TZ;
    const capacity = dto.defaultCapacity ?? 20;
    const duration = dto.expectedDurationMinutes ?? 10;

    return this.sql.withClient(async (client) => {
      await this.requireDoctor(client, ctx, doctorId, true);

      const created = [];
      for (const slot of dto.slots) {
        const id = randomUUID();
        const inserted = await client.query<TemplateRow>(
          `INSERT INTO ${ctx.quotedSchema}.schedule_templates
            (id, doctor_id, weekday, local_start_time, local_end_time, effective_from,
             effective_until, default_capacity, expected_duration_minutes, timezone,
             is_active, created_by, updated_by)
           VALUES ($1,$2,$3,$4::time,$5::time,$6::date,$7::date,$8,$9,$10,true,$11,$11)
           RETURNING *`,
          [
            id,
            doctorId,
            slot.weekday,
            slot.localStartTime,
            slot.localEndTime,
            dto.effectiveFrom,
            dto.effectiveUntil ?? null,
            capacity,
            duration,
            timezone,
            ctx.userId,
          ],
        );
        created.push(mapTemplate(inserted.rows[0]!));
      }

      await this.audit.record({
        actorId: ctx.userId,
        action: 'schedule_template.created',
        targetType: 'doctor',
        targetId: doctorId,
        metadata: { tenantId: ctx.tenantId, count: created.length },
      });

      let materializeResult = null;
      if (dto.materialize !== false) {
        materializeResult = await this.materializeTemplates(client, ctx, created.map((t) => t.id), DEFAULT_HORIZON_DAYS);
      }

      return { templates: created, materialize: materializeResult };
    });
  }

  async deactivate(ctx: ClinicContext, templateId: string) {
    return this.sql.withClient(async (client) => {
      const updated = await client.query<TemplateRow>(
        `UPDATE ${ctx.quotedSchema}.schedule_templates
         SET is_active = false, updated_by = $2, updated_at = NOW()
         WHERE id = $1 AND is_active = true
         RETURNING *`,
        [templateId, ctx.userId],
      );
      if (!updated.rows[0]) throw new NotFoundException('Active schedule template not found');
      await this.audit.record({
        actorId: ctx.userId,
        action: 'schedule_template.deactivated',
        targetType: 'schedule_template',
        targetId: templateId,
        metadata: { tenantId: ctx.tenantId },
      });
      return mapTemplate(updated.rows[0]);
    });
  }

  async materialize(ctx: ClinicContext, templateId: string, dto: MaterializeScheduleDto) {
    const horizonDays = dto.horizonDays ?? DEFAULT_HORIZON_DAYS;
    return this.sql.withClient(async (client) => {
      const template = await client.query<TemplateRow>(
        `SELECT * FROM ${ctx.quotedSchema}.schedule_templates WHERE id = $1`,
        [templateId],
      );
      if (!template.rows[0]) throw new NotFoundException('Schedule template not found');
      if (!template.rows[0].is_active) {
        throw new BadRequestException('Inactive templates cannot generate sessions');
      }
      const result = await this.materializeTemplates(client, ctx, [templateId], horizonDays);
      await this.audit.record({
        actorId: ctx.userId,
        action: 'schedule_template.materialized',
        targetType: 'schedule_template',
        targetId: templateId,
        metadata: { tenantId: ctx.tenantId, ...result },
      });
      return result;
    });
  }

  private async materializeTemplates(
    client: {
      query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
    },
    ctx: ClinicContext,
    templateIds: string[],
    horizonDays: number,
  ) {
    let created = 0;
    let skippedExisting = 0;
    let skippedConflicts = 0;
    const conflicts: Array<{ date: string; templateId: string; message: string }> = [];

    for (const templateId of templateIds) {
      const templateRes = await client.query(
        `SELECT * FROM ${ctx.quotedSchema}.schedule_templates WHERE id = $1`,
        [templateId],
      );
      const template = templateRes.rows[0] as TemplateRow | undefined;
      if (!template || !template.is_active) continue;

      const doctor = await client.query(
        `SELECT status FROM ${ctx.quotedSchema}.doctors WHERE id = $1`,
        [template.doctor_id],
      );
      if (!doctor.rows[0] || doctor.rows[0].status !== 'ACTIVE') continue;

      const dates = await client.query(
        `SELECT to_char(d::date, 'YYYY-MM-DD') AS d
         FROM generate_series(
           GREATEST($1::date, CURRENT_DATE),
           LEAST(COALESCE($2::date, CURRENT_DATE + ($3::int || ' days')::interval), CURRENT_DATE + ($3::int || ' days')::interval),
           '1 day'::interval
         ) AS g(d)
         WHERE EXTRACT(DOW FROM d) = $4`,
        [
          template.effective_from,
          template.effective_until,
          horizonDays,
          template.weekday,
        ],
      );

      for (const row of dates.rows as Array<{ d: string }>) {
        const d = row.d;
        const occurrenceKey = `${template.id}:${d}`;
        const existing = await client.query(
          `SELECT 1 FROM ${ctx.quotedSchema}.consultation_sessions WHERE occurrence_key = $1`,
          [occurrenceKey],
        );
        if ((existing.rowCount ?? 0) > 0) {
          skippedExisting += 1;
          continue;
        }

        const bounds = await client.query(
          `SELECT
             (($1::date + $2::time) AT TIME ZONE $4) AS start_at,
             (($1::date + $3::time) AT TIME ZONE $4) AS end_at`,
          [
            d,
            String(template.local_start_time).slice(0, 8),
            String(template.local_end_time).slice(0, 8),
            template.timezone || DEFAULT_TZ,
          ],
        );
        const startAt = bounds.rows[0]?.start_at as Date | undefined;
        const endAt = bounds.rows[0]?.end_at as Date | undefined;
        if (!startAt || !endAt || startAt.getTime() <= Date.now()) {
          skippedExisting += 1;
          continue;
        }

        try {
          await client.query(
            `INSERT INTO ${ctx.quotedSchema}.consultation_sessions
              (id, doctor_id, local_date, start_at, end_at, timezone, capacity,
               expected_duration_minutes, status, schedule_template_id, occurrence_key,
               created_by, updated_by)
             VALUES ($1,$2,$3::date,$4,$5,$6,$7,$8,'SCHEDULED',$9,$10,$11,$11)`,
            [
              randomUUID(),
              template.doctor_id,
              d,
              startAt,
              endAt,
              template.timezone || DEFAULT_TZ,
              template.default_capacity,
              template.expected_duration_minutes,
              template.id,
              occurrenceKey,
              ctx.userId,
            ],
          );
          created += 1;
        } catch (error) {
          if ((error as { code?: string }).code === '23P01') {
            skippedConflicts += 1;
            conflicts.push({
              date: d,
              templateId: template.id,
              message: 'Overlaps an existing session',
            });
            continue;
          }
          throw error;
        }
      }
    }

    return {
      created,
      skippedExisting,
      skippedConflicts,
      conflicts,
      horizonDays,
    };
  }

  private async requireDoctor(
    client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }> },
    ctx: ClinicContext,
    doctorId: string,
    requireActive = false,
  ) {
    const doctor = await client.query(
      `SELECT id, status FROM ${ctx.quotedSchema}.doctors WHERE id = $1`,
      [doctorId],
    );
    if (!doctor.rows[0]) throw new NotFoundException('Doctor not found');
    if (requireActive && doctor.rows[0].status !== 'ACTIVE') {
      throw new BadRequestException('Inactive doctors cannot receive schedule templates');
    }
  }
}
