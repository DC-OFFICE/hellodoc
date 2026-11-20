import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { AuditService } from '../audit/audit.service.js';
import type { ClinicContext } from '../clinic-context/clinic-context.service.js';
import { PrismaPlatformService } from '../platform/prisma-platform.service.js';
import { TenantSqlClient } from '../tenant-provisioning/tenant-sql.client.js';
import { scoreDuplicateCandidate } from './patient-duplicate.js';
import { formatPatientNumber, maskPhone, normalizePhone } from './patient-phone.js';
import {
  CheckDuplicatesDto,
  CreatePatientDto,
  DeactivatePatientDto,
  ListPatientsQueryDto,
  PatientContactInputDto,
  ReactivatePatientDto,
  SearchPatientsDto,
  UpdatePatientDto,
} from './dto/patient.dto.js';

type PatientRow = {
  id: string;
  patient_number: string;
  full_name: string;
  preferred_name: string | null;
  date_of_birth: Date | string | null;
  approximate_age_years: number | null;
  age_recorded_on: Date | string | null;
  sex: string | null;
  address: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  contact_exception_reason: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
  created_by: string;
  updated_by: string | null;
  deactivated_at: Date | null;
  deactivated_by: string | null;
  deactivation_reason: string | null;
};

type ContactRow = {
  id: string;
  patient_id: string;
  contact_type: string;
  display_value: string;
  normalized_value: string;
  contact_person_name: string | null;
  relationship: string | null;
  is_primary: boolean;
  created_at: Date;
  updated_at: Date;
};

function toDateOnlyIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(value);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s.slice(0, 10);
}

function todayIso(): string {
  return toDateOnlyIso(new Date())!;
}

function cleanOptional(value?: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function mapContact(row: ContactRow) {
  return {
    id: row.id,
    contactType: row.contact_type,
    displayValue: row.display_value,
    normalizedValue: row.normalized_value,
    contactPersonName: row.contact_person_name,
    relationship: row.relationship,
    isPrimary: row.is_primary,
  };
}

function mapPatient(row: PatientRow, contacts: ContactRow[] = []) {
  const primary = contacts.find((c) => c.is_primary) ?? contacts[0] ?? null;
  return {
    id: row.id,
    patientNumber: row.patient_number,
    fullName: row.full_name,
    preferredName: row.preferred_name,
    dateOfBirth: toDateOnlyIso(row.date_of_birth),
    approximateAgeYears: row.approximate_age_years,
    ageRecordedOn: toDateOnlyIso(row.age_recorded_on),
    sex: row.sex,
    address: row.address,
    status: row.status,
    contactExceptionReason: row.contact_exception_reason,
    primaryContact: primary
      ? {
          displayValue: primary.display_value,
          contactType: primary.contact_type,
          masked: maskPhone(primary.normalized_value),
        }
      : null,
    contacts: contacts.map(mapContact),
    version: row.version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    deactivatedAt: row.deactivated_at?.toISOString() ?? null,
    deactivatedBy: row.deactivated_by,
    deactivationReason: row.deactivation_reason,
  };
}

function validateDobAge(dto: {
  dateOfBirth?: string | null;
  approximateAgeYears?: number | null;
}) {
  const dob = cleanOptional(dto.dateOfBirth ?? null);
  let age =
    dto.approximateAgeYears === undefined || dto.approximateAgeYears === null
      ? null
      : dto.approximateAgeYears;

  // When DOB is provided, it is the authoritative birth record.
  // We keep age as null in the DB to strictly satisfy the PostgreSQL constraint patients_dob_or_age_chk,
  // without throwing an error when the UI calculated and passed both.
  if (dob && age != null) {
    age = null;
  }
  if (dob) {
    const parsed = new Date(`${dob}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Invalid date of birth');
    }
    if (parsed.getTime() > Date.now()) {
      throw new BadRequestException('Date of birth cannot be in the future');
    }
    const year = parsed.getFullYear();
    if (year < 1900) throw new BadRequestException('Date of birth is unrealistically old');
  }
  if (age != null && (age < 0 || age > 130)) {
    throw new BadRequestException('Approximate age must be between 0 and 130');
  }
  return { dob, age, ageRecordedOn: age != null ? todayIso() : null };
}

function normalizeContacts(inputs: PatientContactInputDto[] | undefined) {
  if (!inputs?.length) return [];
  const out = inputs.map((c, index) => {
    const normalized = normalizePhone(c.value);
    if (!normalized) throw new BadRequestException(`Invalid phone number: ${c.value}`);
    return {
      contactType: c.contactType,
      displayValue: c.value.trim(),
      normalizedValue: normalized,
      contactPersonName: cleanOptional(c.contactPersonName),
      relationship: cleanOptional(c.relationship),
      isPrimary: Boolean(c.isPrimary) || index === 0,
    };
  });
  // Ensure exactly one primary
  const primaryIdx = out.findIndex((c) => c.isPrimary);
  out.forEach((c, i) => {
    c.isPrimary = i === (primaryIdx >= 0 ? primaryIdx : 0);
  });
  return out;
}

@Injectable()
export class PatientsService {
  constructor(
    private readonly sql: TenantSqlClient,
    private readonly audit: AuditService,
    private readonly prisma: PrismaPlatformService,
  ) {}

  private async loadContacts(client: PoolClient, quotedSchema: string, patientIds: string[]) {
    if (!patientIds.length) return new Map<string, ContactRow[]>();
    const result = await client.query<ContactRow>(
      `SELECT * FROM ${quotedSchema}.patient_contacts
       WHERE patient_id = ANY($1::uuid[])
       ORDER BY is_primary DESC, created_at ASC`,
      [patientIds],
    );
    const map = new Map<string, ContactRow[]>();
    for (const row of result.rows) {
      const list = map.get(row.patient_id) ?? [];
      list.push(row);
      map.set(row.patient_id, list);
    }
    return map;
  }

  private async getRow(client: PoolClient, quotedSchema: string, id: string) {
    const result = await client.query<PatientRow>(
      `SELECT * FROM ${quotedSchema}.patients WHERE id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async list(ctx: ClinicContext, query: ListPatientsQueryDto) {
    const limit = query.limit ?? 25;
    const offset = query.offset ?? 0;
    const status = query.status ?? 'ACTIVE';
    const q = query.q?.trim();
    const sortBy = query.sortBy ?? 'createdAt';
    const sortDir = query.sortDir === 'asc' ? 'ASC' : 'DESC';
    const sortCol =
      sortBy === 'name'
        ? 'lower(full_name)'
        : sortBy === 'patientNumber'
          ? 'patient_number'
          : 'created_at';

    const params: unknown[] = [];
    const where: string[] = [];
    if (status !== 'ALL') {
      params.push(status);
      where.push(`status = $${params.length}`);
    }
    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      where.push(
        `(lower(full_name) LIKE $${params.length} OR lower(coalesce(preferred_name,'')) LIKE $${params.length} OR lower(patient_number) LIKE $${params.length})`,
      );
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(limit, offset);

    return this.sql.withClient(async (client) => {
      const result = await client.query<PatientRow>(
        `SELECT * FROM ${ctx.quotedSchema}.patients
         ${whereSql}
         ORDER BY ${sortCol} ${sortDir}
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      const count = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM ${ctx.quotedSchema}.patients ${whereSql}`,
        params.slice(0, params.length - 2),
      );
      const contacts = await this.loadContacts(
        client,
        ctx.quotedSchema,
        result.rows.map((r) => r.id),
      );
      return {
        items: result.rows.map((row) => mapPatient(row, contacts.get(row.id) ?? [])),
        total: Number(count.rows[0]?.count ?? 0),
        limit,
        offset,
      };
    });
  }

  async search(ctx: ClinicContext, dto: SearchPatientsDto) {
    const limit = dto.limit ?? 25;
    const offset = dto.offset ?? 0;
    const status = dto.status ?? 'ALL';
    const q = dto.q?.trim();
    const patientNumber = dto.patientNumber?.trim().toUpperCase();
    const phoneNorm = dto.phone ? normalizePhone(dto.phone) : null;
    if (dto.phone && !phoneNorm) {
      throw new BadRequestException('Invalid phone number');
    }
    if (!q && !phoneNorm && !patientNumber) {
      throw new BadRequestException('Provide q, phone, or patientNumber');
    }

    const params: unknown[] = [];
    const where: string[] = [];
    if (status !== 'ALL') {
      params.push(status);
      where.push(`p.status = $${params.length}`);
    }
    if (patientNumber) {
      params.push(patientNumber);
      where.push(`upper(p.patient_number) = $${params.length}`);
    }
    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      where.push(
        `(lower(p.full_name) LIKE $${params.length} OR lower(coalesce(p.preferred_name,'')) LIKE $${params.length} OR lower(p.patient_number) LIKE $${params.length})`,
      );
    }
    if (phoneNorm) {
      params.push(phoneNorm);
      where.push(
        `EXISTS (
          SELECT 1 FROM ${ctx.quotedSchema}.patient_contacts c
          WHERE c.patient_id = p.id AND c.normalized_value = $${params.length}
        )`,
      );
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(limit, offset);

    return this.sql.withClient(async (client) => {
      const result = await client.query<PatientRow>(
        `SELECT p.* FROM ${ctx.quotedSchema}.patients p
         ${whereSql}
         ORDER BY p.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      const count = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM ${ctx.quotedSchema}.patients p ${whereSql}`,
        params.slice(0, params.length - 2),
      );
      const contacts = await this.loadContacts(
        client,
        ctx.quotedSchema,
        result.rows.map((r) => r.id),
      );
      return {
        items: result.rows.map((row) => mapPatient(row, contacts.get(row.id) ?? [])),
        total: Number(count.rows[0]?.count ?? 0),
        limit,
        offset,
      };
    });
  }

  async checkDuplicates(ctx: ClinicContext, dto: CheckDuplicatesDto) {
    const fullName = dto.fullName.trim().replace(/\s+/g, ' ');
    const phoneNorm = dto.primaryPhone ? normalizePhone(dto.primaryPhone) : null;
    if (dto.primaryPhone && !phoneNorm) {
      throw new BadRequestException('Invalid phone number');
    }
    const { dob, age } = validateDobAge(dto);

    return this.sql.withClient(async (client) => {
      const candidates = await client.query<PatientRow>(
        `SELECT p.* FROM ${ctx.quotedSchema}.patients p
         WHERE lower(p.full_name) = lower($1)
            OR ($2::text IS NOT NULL AND EXISTS (
                 SELECT 1 FROM ${ctx.quotedSchema}.patient_contacts c
                 WHERE c.patient_id = p.id AND c.normalized_value = $2
               ))
         ORDER BY p.created_at DESC
         LIMIT 25`,
        [fullName, phoneNorm],
      );

      const contacts = await this.loadContacts(
        client,
        ctx.quotedSchema,
        candidates.rows.map((r) => r.id),
      );

      const matches = candidates.rows
        .map((row) => {
          const rowContacts = contacts.get(row.id) ?? [];
          const primary = rowContacts.find((c) => c.is_primary) ?? rowContacts[0];
          const sharedPhone = Boolean(
            phoneNorm && rowContacts.some((c) => c.normalized_value === phoneNorm),
          );
          return scoreDuplicateCandidate({
            incomingName: fullName,
            incomingDob: dob,
            incomingAge: age,
            candidate: {
              id: row.id,
              patientNumber: row.patient_number,
              fullName: row.full_name,
              dateOfBirth: toDateOnlyIso(row.date_of_birth),
              approximateAgeYears: row.approximate_age_years,
              primaryContactMasked: primary ? maskPhone(primary.normalized_value) : null,
              status: row.status,
              sharedPhone,
            },
          });
        })
        .filter((m): m is NonNullable<typeof m> => Boolean(m))
        .sort((a, b) => {
          const rank = { STRONG: 0, SHARED_PHONE: 1, WEAK: 2 };
          return rank[a.strength] - rank[b.strength];
        })
        .slice(0, 10);

      return {
        matches,
        hasStrongMatch: matches.some((m) => m.strength === 'STRONG'),
        hasSharedPhone: matches.some((m) => m.strength === 'SHARED_PHONE'),
      };
    });
  }

  async get(ctx: ClinicContext, id: string) {
    return this.sql.withClient(async (client) => {
      const row = await this.getRow(client, ctx.quotedSchema, id);
      if (!row) throw new NotFoundException('Patient not found');
      const contacts = await this.loadContacts(client, ctx.quotedSchema, [id]);
      return mapPatient(row, contacts.get(id) ?? []);
    });
  }

  async create(ctx: ClinicContext, dto: CreatePatientDto) {
    const fullName = dto.fullName.trim().replace(/\s+/g, ' ');
    if (fullName.length < 2) throw new BadRequestException('Full name is required');
    const preferredName = cleanOptional(dto.preferredName);
    const address = cleanOptional(dto.address);
    const sex = dto.sex ?? null;
    const { dob, age, ageRecordedOn } = validateDobAge(dto);
    const contacts = normalizeContacts(dto.contacts);
    const exception = cleanOptional(dto.contactExceptionReason);
    if (!contacts.length && !exception) {
      throw new BadRequestException(
        'Provide at least one contact method or a contact exception reason',
      );
    }

    const primaryPhone = contacts.find((c) => c.isPrimary)?.normalizedValue ?? null;
    const dupes = await this.checkDuplicates(ctx, {
      fullName,
      primaryPhone: primaryPhone ?? undefined,
      dateOfBirth: dob ?? undefined,
      approximateAgeYears: age ?? undefined,
    });

    if (dupes.hasStrongMatch && !dto.confirmDuplicate) {
      throw new ConflictException({
        message: 'Possible existing patient found. Confirm to continue registration.',
        code: 'POSSIBLE_DUPLICATE',
        matches: dupes.matches.filter((m) => m.strength === 'STRONG'),
      });
    }
    if (dupes.hasSharedPhone && !dto.confirmSharedPhone && !dto.confirmDuplicate) {
      throw new ConflictException({
        message: 'Another patient uses this phone number. Confirm these are different people.',
        code: 'SHARED_PHONE',
        matches: dupes.matches.filter((m) => m.strength === 'SHARED_PHONE'),
      });
    }

    return this.sql.withClient(async (client) => {
      await client.query('BEGIN');
      try {
        if (dto.idempotencyKey) {
          const existing = await client.query<{ patient_id: string }>(
            `SELECT patient_id FROM ${ctx.quotedSchema}.patient_idempotency WHERE idempotency_key = $1`,
            [dto.idempotencyKey],
          );
          if (existing.rows[0]) {
            const row = await this.getRow(client, ctx.quotedSchema, existing.rows[0].patient_id);
            await client.query('COMMIT');
            if (!row) throw new ConflictException('Idempotency key points to missing patient');
            const c = await this.loadContacts(client, ctx.quotedSchema, [row.id]);
            return mapPatient(row, c.get(row.id) ?? []);
          }
        }

        const seq = await client.query<{ value: number }>(
          `UPDATE ${ctx.quotedSchema}.patient_reg_seq
           SET value = value + 1
           WHERE name = 'patient'
           RETURNING value`,
        );
        const next = seq.rows[0]?.value;
        if (!next) throw new Error('Patient registration sequence missing');
        const patientNumber = formatPatientNumber(next);
        const id = randomUUID();

        const inserted = await client.query<PatientRow>(
          `INSERT INTO ${ctx.quotedSchema}.patients
            (id, patient_number, full_name, preferred_name, date_of_birth,
             approximate_age_years, age_recorded_on, sex, address, status,
             contact_exception_reason, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5::date,$6,$7::date,$8,$9,'ACTIVE',$10,$11,$11)
           RETURNING *`,
          [
            id,
            patientNumber,
            fullName,
            preferredName,
            dob,
            age,
            ageRecordedOn,
            sex,
            address,
            exception,
            ctx.userId,
          ],
        );

        for (const contact of contacts) {
          await client.query(
            `INSERT INTO ${ctx.quotedSchema}.patient_contacts
              (id, patient_id, contact_type, display_value, normalized_value,
               contact_person_name, relationship, is_primary)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              randomUUID(),
              id,
              contact.contactType,
              contact.displayValue,
              contact.normalizedValue,
              contact.contactPersonName,
              contact.relationship,
              contact.isPrimary,
            ],
          );
        }

        if (dto.idempotencyKey) {
          await client.query(
            `INSERT INTO ${ctx.quotedSchema}.patient_idempotency (idempotency_key, patient_id)
             VALUES ($1,$2)`,
            [dto.idempotencyKey, id],
          );
        }

        await client.query('COMMIT');

        await this.audit.record({
          actorId: ctx.userId,
          action: 'patient.created',
          targetType: 'patient',
          targetId: id,
          metadata: {
            tenantId: ctx.tenantId,
            patientNumber,
            confirmedDuplicate: Boolean(dto.confirmDuplicate),
            confirmedSharedPhone: Boolean(dto.confirmSharedPhone),
            changedFields: ['fullName', 'contacts'],
          },
        });

        const contactRows = await this.sql.withClient((c) =>
          this.loadContacts(c, ctx.quotedSchema, [id]),
        );
        return mapPatient(inserted.rows[0]!, contactRows.get(id) ?? []);
      } catch (error) {
        await client.query('ROLLBACK');
        if ((error as { code?: string }).code === '23505') {
          throw new ConflictException('Patient number conflict; retry registration');
        }
        throw error;
      }
    });
  }

  async update(ctx: ClinicContext, id: string, dto: UpdatePatientDto) {
    const fullName = dto.fullName.trim().replace(/\s+/g, ' ');
    if (fullName.length < 2) throw new BadRequestException('Full name is required');
    const preferredName = cleanOptional(dto.preferredName);
    const address = dto.address === undefined ? undefined : cleanOptional(dto.address);
    const sex = dto.sex === undefined ? undefined : dto.sex;
    const { dob, age, ageRecordedOn } = validateDobAge({
      dateOfBirth: dto.dateOfBirth,
      approximateAgeYears: dto.approximateAgeYears,
    });
    const contacts =
      dto.contacts === undefined ? undefined : normalizeContacts(dto.contacts);
    const exception =
      dto.contactExceptionReason === undefined
        ? undefined
        : cleanOptional(dto.contactExceptionReason);

    return this.sql.withClient(async (client) => {
      await client.query('BEGIN');
      try {
        const current = await this.getRow(client, ctx.quotedSchema, id);
        if (!current) throw new NotFoundException('Patient not found');
        if (current.version !== dto.version) {
          throw new ConflictException(
            'Patient was updated by someone else. Refresh and review changes before saving.',
          );
        }

        const nextContacts =
          contacts ??
          (await this.loadContacts(client, ctx.quotedSchema, [id])).get(id)?.map((c) => ({
            contactType: c.contact_type as PatientContactInputDto['contactType'],
            displayValue: c.display_value,
            normalizedValue: c.normalized_value,
            contactPersonName: c.contact_person_name,
            relationship: c.relationship,
            isPrimary: c.is_primary,
          })) ??
          [];
        const nextException =
          exception === undefined ? current.contact_exception_reason : exception;
        if (!nextContacts.length && !nextException) {
          throw new BadRequestException(
            'Provide at least one contact method or a contact exception reason',
          );
        }

        let nextDob = toDateOnlyIso(current.date_of_birth);
        let nextAge = current.approximate_age_years;
        let nextAgeRecordedOn = toDateOnlyIso(current.age_recorded_on);
        if (dto.dateOfBirth !== undefined || dto.approximateAgeYears !== undefined) {
          if (dob) {
            nextDob = dob;
            nextAge = null;
            nextAgeRecordedOn = null;
          } else if (age != null) {
            nextDob = null;
            nextAge = age;
            nextAgeRecordedOn = ageRecordedOn;
          } else {
            // Explicit clear of both age fields / DOB
            nextDob = dto.dateOfBirth === null || dto.dateOfBirth === undefined ? null : dob;
            nextAge = null;
            nextAgeRecordedOn = null;
          }
        }

        const updated = await client.query<PatientRow>(
          `UPDATE ${ctx.quotedSchema}.patients SET
             full_name = $2,
             preferred_name = $3,
             date_of_birth = $4::date,
             approximate_age_years = $5,
             age_recorded_on = $6::date,
             sex = $7,
             address = COALESCE($8, address),
             contact_exception_reason = $9,
             updated_at = NOW(),
             updated_by = $10,
             version = version + 1
           WHERE id = $1 AND version = $11
           RETURNING *`,
          [
            id,
            fullName,
            preferredName,
            nextDob,
            nextAge,
            nextAgeRecordedOn,
            sex === undefined ? current.sex : sex,
            address === undefined ? null : address,
            nextException,
            ctx.userId,
            dto.version,
          ],
        );
        if (!updated.rows[0]) {
          throw new ConflictException(
            'Patient was updated by someone else. Refresh and review changes before saving.',
          );
        }

        if (contacts) {
          await client.query(
            `DELETE FROM ${ctx.quotedSchema}.patient_contacts WHERE patient_id = $1`,
            [id],
          );
          for (const contact of contacts) {
            await client.query(
              `INSERT INTO ${ctx.quotedSchema}.patient_contacts
                (id, patient_id, contact_type, display_value, normalized_value,
                 contact_person_name, relationship, is_primary)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
              [
                randomUUID(),
                id,
                contact.contactType,
                contact.displayValue,
                contact.normalizedValue,
                contact.contactPersonName,
                contact.relationship,
                contact.isPrimary,
              ],
            );
          }
        }

        await client.query('COMMIT');

        await this.audit.record({
          actorId: ctx.userId,
          action: 'patient.updated',
          targetType: 'patient',
          targetId: id,
          metadata: {
            tenantId: ctx.tenantId,
            patientNumber: updated.rows[0].patient_number,
            changedFields: [
              'fullName',
              'preferredName',
              'dateOfBirth',
              'approximateAgeYears',
              'sex',
              'address',
              'contacts',
            ],
            previousVersion: dto.version,
            nextVersion: updated.rows[0].version,
          },
        });

        return this.get(ctx, id);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  async deactivate(ctx: ClinicContext, id: string, dto: DeactivatePatientDto) {
    const reason = dto.reason.trim();
    if (reason.length < 3) throw new BadRequestException('Deactivation reason is required');

    return this.sql.withClient(async (client) => {
      const current = await this.getRow(client, ctx.quotedSchema, id);
      if (!current) throw new NotFoundException('Patient not found');
      if (current.status === 'INACTIVE') {
        const contacts = await this.loadContacts(client, ctx.quotedSchema, [id]);
        return mapPatient(current, contacts.get(id) ?? []);
      }

      const updated = await client.query<PatientRow>(
        `UPDATE ${ctx.quotedSchema}.patients SET
           status = 'INACTIVE',
           deactivated_at = NOW(),
           deactivated_by = $2,
           deactivation_reason = $3,
           updated_at = NOW(),
           updated_by = $2,
           version = version + 1
         WHERE id = $1
         RETURNING *`,
        [id, ctx.userId, reason],
      );
      await this.audit.record({
        actorId: ctx.userId,
        action: 'patient.deactivated',
        targetType: 'patient',
        targetId: id,
        metadata: { tenantId: ctx.tenantId, reason },
      });
      const contacts = await this.loadContacts(client, ctx.quotedSchema, [id]);
      return mapPatient(updated.rows[0]!, contacts.get(id) ?? []);
    });
  }

  async reactivate(ctx: ClinicContext, id: string, dto: ReactivatePatientDto) {
    return this.sql.withClient(async (client) => {
      const current = await this.getRow(client, ctx.quotedSchema, id);
      if (!current) throw new NotFoundException('Patient not found');
      if (current.status === 'ACTIVE') {
        const contacts = await this.loadContacts(client, ctx.quotedSchema, [id]);
        return mapPatient(current, contacts.get(id) ?? []);
      }

      const updated = await client.query<PatientRow>(
        `UPDATE ${ctx.quotedSchema}.patients SET
           status = 'ACTIVE',
           deactivated_at = NULL,
           deactivated_by = NULL,
           deactivation_reason = NULL,
           updated_at = NOW(),
           updated_by = $2,
           version = version + 1
         WHERE id = $1
         RETURNING *`,
        [id, ctx.userId],
      );
      await this.audit.record({
        actorId: ctx.userId,
        action: 'patient.reactivated',
        targetType: 'patient',
        targetId: id,
        metadata: { tenantId: ctx.tenantId, note: dto.note ?? null },
      });
      const contacts = await this.loadContacts(client, ctx.quotedSchema, [id]);
      return mapPatient(updated.rows[0]!, contacts.get(id) ?? []);
    });
  }

  async auditHistory(ctx: ClinicContext, id: string) {
    // Ensure patient belongs to this clinic schema before exposing platform audit rows.
    await this.get(ctx, id);
    const rows = await this.prisma.auditLog.findMany({
      where: { targetType: 'patient', targetId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        action: true,
        actorId: true,
        createdAt: true,
        metadata: true,
      },
    });
    return {
      items: rows
        .filter((row) => {
          const meta = row.metadata as { tenantId?: string } | null;
          return !meta?.tenantId || meta.tenantId === ctx.tenantId;
        })
        .map((row) => ({
          id: row.id,
          action: row.action,
          actorId: row.actorId,
          createdAt: row.createdAt.toISOString(),
          metadata: {
            // Strip potentially sensitive before/after payloads; keep operational fields only.
            changedFields: (row.metadata as { changedFields?: string[] } | null)?.changedFields,
            patientNumber: (row.metadata as { patientNumber?: string } | null)?.patientNumber,
            previousVersion: (row.metadata as { previousVersion?: number } | null)?.previousVersion,
            nextVersion: (row.metadata as { nextVersion?: number } | null)?.nextVersion,
            confirmedDuplicate: (row.metadata as { confirmedDuplicate?: boolean } | null)
              ?.confirmedDuplicate,
            reason: (row.metadata as { reason?: string } | null)?.reason,
          },
        })),
    };
  }
}
