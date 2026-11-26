import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import type { ClinicContext } from '../clinic-context/clinic-context.service.js';
import { CatalogsService } from '../platform-catalogs/catalogs.service.js';
import { TenantSqlClient } from '../tenant-provisioning/tenant-sql.client.js';
import { CreateDoctorDto, ListDoctorsQueryDto, UpdateDoctorDto } from './dto/doctor.dto.js';

type DoctorRow = {
  id: string;
  full_name: string;
  display_name: string;
  registration_number: string;
  qualifications: string | null;
  specialization: string | null;
  specialization_id: string | null;
  qualification_id: string | null;
  specialization_name: string | null;
  qualification_name: string | null;
  contact_number: string | null;
  email: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  credential_review_status: 'PENDING_REVIEW' | 'VERIFIED' | 'SUSPENDED';
  created_at: Date;
  updated_at: Date;
  created_by: string;
  updated_by: string | null;
  version: number;
};

function mapDoctor(row: DoctorRow) {
  return {
    id: row.id,
    fullName: row.full_name,
    displayName: row.display_name,
    registrationNumber: row.registration_number,
    specializationId: row.specialization_id,
    qualificationId: row.qualification_id,
    specialization: row.specialization_name ?? row.specialization,
    qualifications: row.qualification_name ?? row.qualifications,
    contactNumber: row.contact_number,
    email: row.email,
    status: row.status,
    credentialReviewStatus: row.credential_review_status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    version: row.version,
  };
}

function cleanOptional(value?: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

@Injectable()
export class DoctorsService {
  constructor(
    private readonly sql: TenantSqlClient,
    private readonly audit: AuditService,
    private readonly catalogs: CatalogsService,
  ) {}

  async list(ctx: ClinicContext, query: ListDoctorsQueryDto) {
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;
    const status = query.status ?? 'ALL';
    const q = query.q?.trim();

    const params: unknown[] = [];
    const where: string[] = [];
    if (status !== 'ALL') {
      params.push(status);
      where.push(`status = $${params.length}`);
    }
    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      where.push(
        `(lower(full_name) LIKE $${params.length} OR lower(display_name) LIKE $${params.length} OR lower(coalesce(registration_number,'')) LIKE $${params.length} OR lower(coalesce(specialization_name,'')) LIKE $${params.length})`,
      );
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(limit, offset);

    return this.sql.withClient(async (client) => {
      const result = await client.query<DoctorRow>(
        `SELECT * FROM ${ctx.quotedSchema}.doctors
         ${whereSql}
         ORDER BY lower(display_name) ASC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      const count = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM ${ctx.quotedSchema}.doctors ${whereSql}`,
        params.slice(0, params.length - 2),
      );
      return {
        items: result.rows.map(mapDoctor),
        total: Number(count.rows[0]?.count ?? 0),
        limit,
        offset,
      };
    });
  }

  async get(ctx: ClinicContext, id: string) {
    return this.sql.withClient(async (client) => {
      const result = await client.query<DoctorRow>(
        `SELECT * FROM ${ctx.quotedSchema}.doctors WHERE id = $1`,
        [id],
      );
      if (!result.rows[0]) throw new NotFoundException('Doctor not found');
      return mapDoctor(result.rows[0]);
    });
  }

  async create(ctx: ClinicContext, dto: CreateDoctorDto) {
    const fullName = dto.fullName.trim().replace(/\s+/g, ' ');
    if (!fullName) throw new BadRequestException('Full name is required');
    const displayName = (dto.displayName?.trim() || fullName).replace(/\s+/g, ' ');
    const contactNumber = cleanOptional(dto.contactNumber);
    const email = cleanOptional(dto.email)?.toLowerCase() ?? null;

    const specialization = await this.catalogs.requireActive('specialization', dto.specializationId);
    const qualification = await this.catalogs.requireActive('qualification', dto.qualificationId);

    return this.sql.withClient(async (client) => {
      await client.query('BEGIN');
      try {
        const dup = await client.query<{ id: string; display_name: string }>(
          `SELECT id, display_name FROM ${ctx.quotedSchema}.doctors
           WHERE lower(full_name) = lower($1)
           LIMIT 5`,
          [fullName],
        );
        if (dup.rows.length > 0 && !dto.confirmDuplicate) {
          throw new ConflictException(
            'A similar doctor record already exists. Confirm to create anyway.',
          );
        }

        const seq = await client.query<{ value: number }>(
          `UPDATE ${ctx.quotedSchema}.doctor_reg_seq
           SET value = value + 1
           WHERE name = 'doctor'
           RETURNING value`,
        );
        const next = seq.rows[0]?.value;
        if (!next) throw new Error('Doctor registration sequence missing');
        const registrationNumber = `DOC-${String(next).padStart(6, '0')}`;

        const id = randomUUID();
        const inserted = await client.query<DoctorRow>(
          `INSERT INTO ${ctx.quotedSchema}.doctors
            (id, full_name, display_name, registration_number, qualifications, specialization,
             specialization_id, qualification_id, specialization_name, qualification_name,
             contact_number, email, status, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'ACTIVE',$13,$13)
           RETURNING *`,
          [
            id,
            fullName,
            displayName,
            registrationNumber,
            qualification.name,
            specialization.name,
            specialization.id,
            qualification.id,
            specialization.name,
            qualification.name,
            contactNumber,
            email,
            ctx.userId,
          ],
        );
        await client.query('COMMIT');
        await this.audit.record({
          actorId: ctx.userId,
          action: 'doctor.created',
          targetType: 'doctor',
          targetId: id,
          metadata: { tenantId: ctx.tenantId, displayName, registrationNumber },
        });
        return mapDoctor(inserted.rows[0]!);
      } catch (error) {
        await client.query('ROLLBACK');
        if ((error as { code?: string }).code === '23505') {
          throw new ConflictException('A doctor with this registration number already exists');
        }
        throw error;
      }
    });
  }

  async update(ctx: ClinicContext, id: string, dto: UpdateDoctorDto) {
    const fullName = dto.fullName.trim().replace(/\s+/g, ' ');
    if (!fullName) throw new BadRequestException('Full name is required');
    const displayName = (dto.displayName?.trim() || fullName).replace(/\s+/g, ' ');
    const specialization = await this.catalogs.requireActive('specialization', dto.specializationId);
    const qualification = await this.catalogs.requireActive('qualification', dto.qualificationId);

    return this.sql.withClient(async (client) => {
      const updated = await client.query<DoctorRow>(
        `UPDATE ${ctx.quotedSchema}.doctors SET
           full_name = $2,
           display_name = $3,
           specialization = $4,
           qualifications = $5,
           specialization_id = $6,
           qualification_id = $7,
           specialization_name = $4,
           qualification_name = $5,
           contact_number = $8,
           email = $9,
           updated_by = $10,
           updated_at = NOW(),
           version = version + 1
         WHERE id = $1 AND version = $11
         RETURNING *`,
        [
          id,
          fullName,
          displayName,
          specialization.name,
          qualification.name,
          specialization.id,
          qualification.id,
          cleanOptional(dto.contactNumber),
          cleanOptional(dto.email)?.toLowerCase() ?? null,
          ctx.userId,
          dto.version,
        ],
      );
      if (!updated.rows[0]) {
        const exists = await client.query(`SELECT 1 FROM ${ctx.quotedSchema}.doctors WHERE id = $1`, [
          id,
        ]);
        if ((exists.rowCount ?? 0) === 0) throw new NotFoundException('Doctor not found');
        throw new ConflictException('Doctor was modified by another user. Refresh and try again.');
      }
      await this.audit.record({
        actorId: ctx.userId,
        action: 'doctor.updated',
        targetType: 'doctor',
        targetId: id,
        metadata: { tenantId: ctx.tenantId },
      });
      return mapDoctor(updated.rows[0]);
    });
  }

  /** Future scheduled sessions for a doctor, split into unbooked (safe to cancel) and booked. */
  async futureSessions(ctx: ClinicContext, id: string) {
    return this.sql.withClient(async (client) => {
      const doctor = await client.query(`SELECT 1 FROM ${ctx.quotedSchema}.doctors WHERE id = $1`, [id]);
      if (!doctor.rows[0]) throw new NotFoundException('Doctor not found');
      return this.loadFutureSessions(client, ctx, id);
    });
  }

  private async loadFutureSessions(
    client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> },
    ctx: ClinicContext,
    id: string,
  ) {
    const rows = await client.query(
      `SELECT s.id, to_char(s.local_date, 'YYYY-MM-DD') AS local_date, s.start_at, s.end_at,
              (SELECT COUNT(*)::int FROM ${ctx.quotedSchema}.appointments a
               WHERE a.session_id = s.id AND a.status = 'CONFIRMED') AS bookings
       FROM ${ctx.quotedSchema}.consultation_sessions s
       WHERE s.doctor_id = $1 AND s.status = 'SCHEDULED' AND s.start_at > NOW()
       ORDER BY s.start_at ASC`,
      [id],
    );
    const sessions = rows.rows as Array<{ id: string; local_date: string; start_at: Date; end_at: Date; bookings: number }>;
    return {
      unbookedCount: sessions.filter((s) => s.bookings === 0).length,
      booked: sessions
        .filter((s) => s.bookings > 0)
        .map((s) => ({
          id: s.id,
          localDate: s.local_date,
          startAt: s.start_at.toISOString(),
          endAt: s.end_at.toISOString(),
          bookings: s.bookings,
        })),
    };
  }

  async deactivate(ctx: ClinicContext, id: string, options: { cancelFutureSessions?: boolean } = {}) {
    return this.sql.withClient(async (client) => {
      await client.query('BEGIN');
      try {
        const locked = await client.query(
          `SELECT id FROM ${ctx.quotedSchema}.doctors WHERE id = $1 AND status = 'ACTIVE' FOR UPDATE`,
          [id],
        );
        if (!locked.rows[0]) throw new NotFoundException('Active doctor not found');

        const future = await this.loadFutureSessions(client, ctx, id);
        if (future.booked.length > 0) {
          // Booked sessions are never cancelled here: patients would be dropped without notice.
          throw new ConflictException({
            code: 'DOCTOR_HAS_BOOKED_SESSIONS',
            message:
              `Doctor has ${future.booked.length} future session(s) with booked patients ` +
              `(${future.booked.map((s) => s.localDate).join(', ')}). ` +
              'Reschedule or cancel those appointments and sessions before deactivating.',
          });
        }
        if (future.unbookedCount > 0 && !options.cancelFutureSessions) {
          throw new ConflictException({
            code: 'DOCTOR_HAS_FUTURE_SESSIONS',
            message: `Doctor has ${future.unbookedCount} future scheduled session(s). Cancel them to deactivate the doctor.`,
          });
        }

        let cancelledSessions = 0;
        let deactivatedTemplates = 0;
        if (options.cancelFutureSessions) {
          const cancelled = await client.query(
            `UPDATE ${ctx.quotedSchema}.consultation_sessions s SET
               status = 'CANCELLED',
               cancellation_reason = 'Doctor deactivated',
               cancelled_at = NOW(),
               cancelled_by = $2,
               updated_by = $2,
               updated_at = NOW(),
               occurrence_key = NULL,
               version = version + 1
             WHERE s.doctor_id = $1 AND s.status = 'SCHEDULED' AND s.start_at > NOW()
               AND NOT EXISTS (
                 SELECT 1 FROM ${ctx.quotedSchema}.appointments a
                 WHERE a.session_id = s.id AND a.status = 'CONFIRMED'
               )`,
            [id, ctx.userId],
          );
          cancelledSessions = cancelled.rowCount ?? 0;
          // Stop weekly templates so no new sessions are generated for an inactive doctor.
          const templates = await client.query(
            `UPDATE ${ctx.quotedSchema}.schedule_templates
             SET is_active = false, updated_by = $2, updated_at = NOW()
             WHERE doctor_id = $1 AND is_active = true`,
            [id, ctx.userId],
          );
          deactivatedTemplates = templates.rowCount ?? 0;
        }

        const updated = await client.query<DoctorRow>(
          `UPDATE ${ctx.quotedSchema}.doctors
           SET status = 'INACTIVE', updated_by = $2, updated_at = NOW(), version = version + 1
           WHERE id = $1 AND status = 'ACTIVE'
           RETURNING *`,
          [id, ctx.userId],
        );
        if (!updated.rows[0]) throw new NotFoundException('Active doctor not found');
        await client.query('COMMIT');
        await this.audit.record({
          actorId: ctx.userId,
          action: 'doctor.deactivated',
          targetType: 'doctor',
          targetId: id,
          metadata: { tenantId: ctx.tenantId, cancelledSessions, deactivatedTemplates },
        });
        return { ...mapDoctor(updated.rows[0]), cancelledSessions, deactivatedTemplates };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  async reactivate(ctx: ClinicContext, id: string) {
    return this.sql.withClient(async (client) => {
      const updated = await client.query<DoctorRow>(
        `UPDATE ${ctx.quotedSchema}.doctors
         SET status = 'ACTIVE', updated_by = $2, updated_at = NOW(), version = version + 1
         WHERE id = $1 AND status = 'INACTIVE'
         RETURNING *`,
        [id, ctx.userId],
      );
      if (!updated.rows[0]) throw new NotFoundException('Inactive doctor not found');
      await this.audit.record({
        actorId: ctx.userId,
        action: 'doctor.reactivated',
        targetType: 'doctor',
        targetId: id,
        metadata: { tenantId: ctx.tenantId },
      });
      return mapDoctor(updated.rows[0]);
    });
  }
}
