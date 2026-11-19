import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import type { ClinicContext } from '../clinic-context/clinic-context.service.js';
import { normalizeEmail } from '../common/identifiers.js';
import { validatePasswordStrength } from '../common/password-policy.js';
import { PasswordService } from '../common/password.service.js';
import { PrismaPlatformService } from '../platform/prisma-platform.service.js';
import { TenantSqlClient } from '../tenant-provisioning/tenant-sql.client.js';
import type {
  AcceptDoctorInviteDto,
  AddendumDto,
  AllergyDto,
  AllergyStatusDto,
  CreateEncounterDto,
  HistoryDto,
  InviteDoctorDto,
  ReviewCredentialsDto,
  SaveEncounterDraftDto,
  SavePrescriptionDraftDto,
  SignDto,
  VitalsDto,
  VoidPrescriptionDto,
} from './dto/clinical.dto.js';

function deny(code: string, message: string, status: 'bad' | 'conflict' | 'forbidden' | 'missing' = 'bad'): never {
  const body = { code, message };
  if (status === 'conflict') throw new ConflictException(body);
  if (status === 'forbidden') throw new ForbiddenException(body);
  if (status === 'missing') throw new NotFoundException(body);
  throw new BadRequestException(body);
}

@Injectable()
export class ClinicalService {
  constructor(
    private readonly sql: TenantSqlClient,
    private readonly prisma: PrismaPlatformService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
  ) {}

  async invite(ctx: ClinicContext, doctorId: string, dto: InviteDoctorDto) {
    const email = normalizeEmail(dto.email);
    const doctor = await this.sql.withClient(async (client) => {
      const row = await client.query(
        `SELECT id, status FROM ${ctx.quotedSchema}.doctors WHERE id = $1`,
        [doctorId],
      );
      return row.rows[0] as { id: string; status: string } | undefined;
    });
    if (!doctor || doctor.status !== 'ACTIVE') deny('DOCTOR_PROFILE_NOT_LINKED', 'Doctor profile not found', 'missing');

    const raw = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(raw).digest('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await this.prisma.$executeRawUnsafe(
      `UPDATE platform.doctor_invitations
       SET revoked_at = NOW()
       WHERE tenant_id = $1::uuid AND doctor_profile_id = $2::uuid AND accepted_at IS NULL AND revoked_at IS NULL`,
      ctx.tenantId,
      doctorId,
    );
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO platform.doctor_invitations
        (id, token_hash, tenant_id, doctor_profile_id, email_normalized, expires_at, created_by)
       VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5, $6, $7::uuid)`,
      randomUUID(),
      tokenHash,
      ctx.tenantId,
      doctorId,
      email,
      expiresAt,
      ctx.userId,
    );
    await this.audit.record({
      actorId: ctx.userId,
      action: 'doctor.invited',
      targetType: 'doctor',
      targetId: doctorId,
      metadata: { tenantId: ctx.tenantId, email },
    });
    const origin = (process.env.PUBLIC_WEB_ORIGIN ?? 'http://localhost:5173').split(',')[0]!.trim();
    return { acceptUrl: `${origin}/doctor/accept?token=${raw}`, expiresAt: expiresAt.toISOString() };
  }

  async accept(dto: AcceptDoctorInviteDto) {
    const weakness = validatePasswordStrength(dto.password);
    if (weakness) deny('INVALID_CLINICAL_TRANSITION', weakness);
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        tenant_id: string;
        doctor_profile_id: string;
        email_normalized: string;
        expires_at: Date;
        schemaName: string;
      }>
    >(
      `SELECT i.id, i.tenant_id, i.doctor_profile_id, i.email_normalized, i.expires_at, t."schemaName"
       FROM platform.doctor_invitations i
       JOIN platform."Tenant" t ON t.id = i.tenant_id
       WHERE i.token_hash = $1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL
       LIMIT 1`,
      tokenHash,
    );
    const invite = rows[0];
    if (!invite || new Date(invite.expires_at).getTime() < Date.now()) {
      deny('CLINICAL_ACCESS_DENIED', 'Invitation is invalid or expired', 'forbidden');
    }
    const passwordHash = await this.passwords.hash(dto.password);
    let user = await this.prisma.platformUser.findUnique({
      where: { emailNormalized: invite.email_normalized },
    });
    if (!user) {
      user = await this.prisma.platformUser.create({
        data: {
          name: dto.name.trim(),
          email: invite.email_normalized,
          emailNormalized: invite.email_normalized,
          passwordHash,
        },
      });
    } else {
      const ok = await this.passwords.verify(user.passwordHash, dto.password);
      if (!ok) deny('CLINICAL_ACCESS_DENIED', 'Existing account password did not match', 'forbidden');
    }
    await this.prisma.tenantMembership.upsert({
      where: {
        tenantId_userId_role: {
          tenantId: invite.tenant_id,
          userId: user.id,
          role: 'CLINIC_DOCTOR',
        },
      },
      update: { active: true },
      create: {
        tenantId: invite.tenant_id,
        userId: user.id,
        role: 'CLINIC_DOCTOR',
      },
    });
    const schema = `"${invite.schemaName.replace(/"/g, '""')}"`;
    await this.sql.withClient(async (client) => {
      const clash = await client.query(
        `SELECT doctor_id, user_id FROM ${schema}.doctor_user_links
         WHERE doctor_id = $1 OR user_id = $2`,
        [invite.doctor_profile_id, user!.id],
      );
      const row = clash.rows[0] as { doctor_id: string; user_id: string } | undefined;
      if (row && (row.doctor_id !== invite.doctor_profile_id || row.user_id !== user!.id)) {
        deny('DOCTOR_PROFILE_NOT_LINKED', 'Doctor or user is already linked to a different account', 'conflict');
      }
      await client.query(
        `INSERT INTO ${schema}.doctor_user_links (id, doctor_id, user_id)
         VALUES ($1,$2,$3)
         ON CONFLICT (doctor_id) DO UPDATE SET active = TRUE, user_id = EXCLUDED.user_id`,
        [randomUUID(), invite.doctor_profile_id, user!.id],
      );
    });
    await this.prisma.$executeRawUnsafe(
      `UPDATE platform.doctor_invitations SET accepted_at = NOW() WHERE id = $1::uuid AND accepted_at IS NULL`,
      invite.id,
    );
    await this.audit.record({
      actorId: user.id,
      action: 'doctor.invitation_accepted',
      targetType: 'doctor',
      targetId: invite.doctor_profile_id,
      metadata: { tenantId: invite.tenant_id },
    });
    return { accepted: true };
  }

  async reviewCredentials(ctx: ClinicContext, doctorId: string, dto: ReviewCredentialsDto) {
    const updated = await this.sql.withClient(async (client) => {
      const result = await client.query(
        `UPDATE ${ctx.quotedSchema}.doctors
         SET credential_review_status = $2, updated_at = NOW(), updated_by = $3
         WHERE id = $1
         RETURNING id, credential_review_status`,
        [doctorId, dto.status, ctx.userId],
      );
      return result.rows[0];
    });
    if (!updated) deny('DOCTOR_PROFILE_NOT_LINKED', 'Doctor not found', 'missing');
    await this.audit.record({
      actorId: ctx.userId,
      action: 'doctor.credentials_reviewed',
      targetType: 'doctor',
      targetId: doctorId,
      metadata: { tenantId: ctx.tenantId, status: dto.status, note: dto.note ?? null },
    });
    return updated;
  }

  async worklist(ctx: ClinicContext & { doctorId: string }) {
    return this.sql.withClient(async (client) => {
      const rows = await client.query(
        `SELECT a.id AS appointment_id, a.queue_number, a.status AS appointment_status,
                p.id AS patient_id, p.full_name, p.patient_number,
                s.id AS session_id, s.local_date, s.start_at, s.status AS session_status,
                q.state AS queue_state, e.id AS encounter_id, e.status AS encounter_status
         FROM ${ctx.quotedSchema}.appointments a
         JOIN ${ctx.quotedSchema}.consultation_sessions s ON s.id = a.session_id
         JOIN ${ctx.quotedSchema}.patients p ON p.id = a.patient_id
         LEFT JOIN ${ctx.quotedSchema}.queue_entries q ON q.appointment_id = a.id
         LEFT JOIN ${ctx.quotedSchema}.clinical_encounters e ON e.appointment_id = a.id
         WHERE s.doctor_id = $1
           AND a.status = 'CONFIRMED'
           AND s.local_date = (NOW() AT TIME ZONE COALESCE(s.timezone, 'Asia/Colombo'))::date
         ORDER BY a.queue_number ASC`,
        [ctx.doctorId],
      );
      return { doctorId: ctx.doctorId, clinicName: ctx.clinicName, items: rows.rows };
    });
  }

  async createEncounter(ctx: ClinicContext & { doctorId: string }, dto: CreateEncounterDto) {
    return this.sql.withClient(async (client) => {
      const appt = await client.query<{
        id: string;
        patient_id: string;
        session_id: string;
        doctor_id: string;
        queue_state: string | null;
      }>(
        `SELECT a.id, a.patient_id, a.session_id, s.doctor_id, q.state AS queue_state
         FROM ${ctx.quotedSchema}.appointments a
         JOIN ${ctx.quotedSchema}.consultation_sessions s ON s.id = a.session_id
         LEFT JOIN ${ctx.quotedSchema}.queue_entries q ON q.appointment_id = a.id
         WHERE a.id = $1 AND a.status = 'CONFIRMED'`,
        [dto.appointmentId],
      );
      const row = appt.rows[0];
      if (!row) deny('ENCOUNTER_NOT_FOUND', 'Appointment not found', 'missing');
      if (row.doctor_id !== ctx.doctorId) deny('APPOINTMENT_NOT_ASSIGNED', 'Appointment is not assigned to you', 'forbidden');
      if (!row.queue_state || !['CALLED', 'IN_SERVICE', 'COMPLETED'].includes(row.queue_state)) {
        deny('INVALID_CLINICAL_TRANSITION', 'Consultation can start after the patient is called');
      }
      const existing = await client.query(
        `SELECT id FROM ${ctx.quotedSchema}.clinical_encounters WHERE appointment_id = $1`,
        [row.id],
      );
      if (existing.rows[0]) return this.getEncounter(ctx, existing.rows[0].id as string);
      const id = randomUUID();
      await client.query(
        `INSERT INTO ${ctx.quotedSchema}.clinical_encounters
          (id, appointment_id, patient_id, doctor_id, session_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, row.id, row.patient_id, ctx.doctorId, row.session_id, ctx.userId],
      );
      await this.auditClinical(client, ctx, 'encounter.created', 'encounter', id);
      return this.getEncounter(ctx, id);
    });
  }

  async getEncounter(ctx: ClinicContext & { doctorId: string }, id: string) {
    return this.sql.withClient(async (client) => {
      const encounter = await this.loadOwned(client, ctx, id);
      const vitals = await client.query(
        `SELECT * FROM ${ctx.quotedSchema}.encounter_vitals WHERE encounter_id = $1 ORDER BY recorded_at DESC`,
        [id],
      );
      const addenda = await client.query(
        `SELECT * FROM ${ctx.quotedSchema}.clinical_addenda WHERE encounter_id = $1 ORDER BY created_at ASC`,
        [id],
      );
      const allergies = await this.allergyBundle(client, ctx.quotedSchema, encounter.patient_id as string);
      await this.auditClinical(client, ctx, 'encounter.read', 'encounter', id);
      return { ...encounter, vitals: vitals.rows, addenda: addenda.rows, allergies };
    });
  }

  async saveDraft(ctx: ClinicContext & { doctorId: string }, id: string, dto: SaveEncounterDraftDto) {
    return this.sql.withClient(async (client) => {
      const current = await this.loadOwned(client, ctx, id);
      if (current.status !== 'DRAFT') deny('ENCOUNTER_ALREADY_SIGNED', 'Signed records cannot be edited', 'conflict');
      const updated = await client.query(
        `UPDATE ${ctx.quotedSchema}.clinical_encounters SET
           chief_complaint = $3,
           history_present_illness = $4,
           examination_findings = $5,
           assessment = $6,
           treatment_plan = $7,
           follow_up_instructions = $8,
           updated_by = $9,
           updated_at = NOW(),
           version = version + 1
         WHERE id = $1 AND version = $2 AND status = 'DRAFT'
         RETURNING id`,
        [
          id,
          dto.version,
          dto.chiefComplaint ?? null,
          dto.historyPresentIllness ?? null,
          dto.examinationFindings ?? null,
          dto.assessment ?? null,
          dto.treatmentPlan ?? null,
          dto.followUpInstructions ?? null,
          ctx.userId,
        ],
      );
      if (!updated.rows[0]) deny('VERSION_CONFLICT', 'Encounter changed; reload and retry', 'conflict');
      return this.getEncounter(ctx, id);
    });
  }

  async signEncounter(ctx: ClinicContext & { doctorId: string }, id: string, dto: SignDto) {
    await this.assertVerified(ctx);
    return this.sql.withClient(async (client) => {
      const updated = await client.query(
        `UPDATE ${ctx.quotedSchema}.clinical_encounters
         SET status = 'SIGNED', signed_by = $3, signed_at = NOW(), updated_at = NOW(), version = version + 1
         WHERE id = $1 AND doctor_id = $2 AND status = 'DRAFT' AND version = $4
         RETURNING id`,
        [id, ctx.doctorId, ctx.userId, dto.version],
      );
      if (!updated.rows[0]) deny('INVALID_CLINICAL_TRANSITION', 'Encounter cannot be signed', 'conflict');
      await this.auditClinical(client, ctx, 'encounter.signed', 'encounter', id);
      return this.getEncounter(ctx, id);
    });
  }

  async addendum(ctx: ClinicContext & { doctorId: string }, id: string, dto: AddendumDto) {
    await this.assertVerified(ctx);
    return this.sql.withClient(async (client) => {
      const current = await this.loadOwned(client, ctx, id);
      if (current.status !== 'SIGNED') deny('INVALID_CLINICAL_TRANSITION', 'Addenda apply to signed records');
      await client.query(
        `INSERT INTO ${ctx.quotedSchema}.clinical_addenda (id, encounter_id, body, reason, author_id)
         VALUES ($1,$2,$3,$4,$5)`,
        [randomUUID(), id, dto.body.trim(), dto.reason.trim(), ctx.userId],
      );
      return this.getEncounter(ctx, id);
    });
  }

  async recordVitals(ctx: ClinicContext & { doctorId: string }, id: string, dto: VitalsDto) {
    return this.sql.withClient(async (client) => {
      const current = await this.loadOwned(client, ctx, id);
      if (current.status !== 'DRAFT') deny('ENCOUNTER_ALREADY_SIGNED', 'Signed records cannot be edited', 'conflict');
      await client.query(
        `INSERT INTO ${ctx.quotedSchema}.encounter_vitals
          (id, encounter_id, systolic_mmhg, diastolic_mmhg, pulse_bpm, temperature_c,
           weight_kg, height_cm, spo2_percent, respiratory_rate, recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          randomUUID(),
          id,
          dto.systolicMmhg ?? null,
          dto.diastolicMmhg ?? null,
          dto.pulseBpm ?? null,
          dto.temperatureC ?? null,
          dto.weightKg ?? null,
          dto.heightCm ?? null,
          dto.spo2Percent ?? null,
          dto.respiratoryRate ?? null,
          ctx.userId,
        ],
      );
      return this.getEncounter(ctx, id);
    });
  }

  async clinicalHistory(ctx: ClinicContext & { doctorId: string }, patientId: string) {
    return this.sql.withClient(async (client) => {
      const related = await client.query(
        `SELECT 1 FROM ${ctx.quotedSchema}.appointments a
         JOIN ${ctx.quotedSchema}.consultation_sessions s ON s.id = a.session_id
         WHERE a.patient_id = $1 AND s.doctor_id = $2
         LIMIT 1`,
        [patientId, ctx.doctorId],
      );
      if (!related.rows[0]) deny('CLINICAL_ACCESS_DENIED', 'No treatment relationship', 'forbidden');
      const encounters = await client.query(
        `SELECT id, status, chief_complaint, assessment, signed_at, created_at
         FROM ${ctx.quotedSchema}.clinical_encounters
         WHERE patient_id = $1 AND doctor_id = $2
         ORDER BY created_at DESC`,
        [patientId, ctx.doctorId],
      );
      const history = await client.query(
        `SELECT id, category, summary, created_at FROM ${ctx.quotedSchema}.patient_medical_history
         WHERE patient_id = $1 ORDER BY created_at DESC`,
        [patientId],
      );
      const allergies = await this.allergyBundle(client, ctx.quotedSchema, patientId);
      await this.auditClinical(client, ctx, 'history.read', 'patient', patientId);
      return { encounters: encounters.rows, history: history.rows, allergies };
    });
  }

  async addAllergy(ctx: ClinicContext & { doctorId: string }, dto: AllergyDto) {
    return this.sql.withClient(async (client) => {
      await client.query(
        `INSERT INTO ${ctx.quotedSchema}.patient_allergies
          (id, patient_id, substance, reaction, severity, information_source, recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          randomUUID(),
          dto.patientId,
          dto.substance.trim(),
          dto.reaction ?? null,
          dto.severity ?? null,
          dto.informationSource ?? null,
          ctx.userId,
        ],
      );
      await client.query(
        `INSERT INTO ${ctx.quotedSchema}.patient_allergy_status (patient_id, status, updated_at)
         VALUES ($1, 'ALLERGIES_RECORDED', NOW())
         ON CONFLICT (patient_id) DO UPDATE SET status = 'ALLERGIES_RECORDED', updated_at = NOW()`,
        [dto.patientId],
      );
      return this.allergyBundle(client, ctx.quotedSchema, dto.patientId);
    });
  }

  async setAllergyStatus(ctx: ClinicContext & { doctorId: string }, patientId: string, dto: AllergyStatusDto) {
    if (dto.status === 'NO_KNOWN_ALLERGIES') {
      const active = await this.sql.withClient(async (client) =>
        client.query(
          `SELECT 1 FROM ${ctx.quotedSchema}.patient_allergies
           WHERE patient_id = $1 AND status = 'ACTIVE' LIMIT 1`,
          [patientId],
        ),
      );
      if ((active.rowCount ?? 0) > 0) {
        deny('INVALID_CLINICAL_TRANSITION', 'Active allergies are recorded; cannot mark no known allergies');
      }
    }
    return this.sql.withClient(async (client) => {
      await client.query(
        `INSERT INTO ${ctx.quotedSchema}.patient_allergy_status
          (patient_id, status, confirmed_by, confirmed_at, updated_at)
         VALUES ($1,$2,$3,NOW(),NOW())
         ON CONFLICT (patient_id) DO UPDATE
           SET status = EXCLUDED.status, confirmed_by = EXCLUDED.confirmed_by,
               confirmed_at = EXCLUDED.confirmed_at, updated_at = NOW()`,
        [patientId, dto.status, ctx.userId],
      );
      return this.allergyBundle(client, ctx.quotedSchema, patientId);
    });
  }

  async addHistory(ctx: ClinicContext & { doctorId: string }, dto: HistoryDto) {
    return this.sql.withClient(async (client) => {
      const id = randomUUID();
      await client.query(
        `INSERT INTO ${ctx.quotedSchema}.patient_medical_history
          (id, patient_id, category, summary, recorded_by)
         VALUES ($1,$2,$3,$4,$5)`,
        [id, dto.patientId, dto.category, dto.summary.trim(), ctx.userId],
      );
      return { id };
    });
  }

  async createPrescription(ctx: ClinicContext & { doctorId: string }, encounterId: string) {
    return this.sql.withClient(async (client) => {
      const encounter = await this.loadOwned(client, ctx, encounterId);
      const id = randomUUID();
      await client.query(
        `INSERT INTO ${ctx.quotedSchema}.prescriptions
          (id, encounter_id, patient_id, doctor_id, created_by)
         VALUES ($1,$2,$3,$4,$5)`,
        [id, encounterId, encounter.patient_id, ctx.doctorId, ctx.userId],
      );
      return this.getPrescription(ctx, id);
    });
  }

  async savePrescription(ctx: ClinicContext & { doctorId: string }, id: string, dto: SavePrescriptionDraftDto) {
    if (!dto.items?.length) deny('INVALID_CLINICAL_TRANSITION', 'At least one medicine is required');
    return this.sql.withClient(async (client) => {
      const current = await client.query(
        `SELECT id, status, doctor_id, version FROM ${ctx.quotedSchema}.prescriptions WHERE id = $1`,
        [id],
      );
      const rx = current.rows[0] as { status: string; doctor_id: string } | undefined;
      if (!rx || rx.doctor_id !== ctx.doctorId) deny('CLINICAL_ACCESS_DENIED', 'Prescription not found', 'missing');
      if (rx.status !== 'DRAFT') deny('ENCOUNTER_ALREADY_SIGNED', 'Signed prescriptions cannot be edited', 'conflict');
      const updated = await client.query(
        `UPDATE ${ctx.quotedSchema}.prescriptions
         SET clinical_instructions = $3, updated_at = NOW(), version = version + 1
         WHERE id = $1 AND version = $2 AND status = 'DRAFT'
         RETURNING id`,
        [id, dto.version, dto.clinicalInstructions ?? null],
      );
      if (!updated.rows[0]) deny('VERSION_CONFLICT', 'Prescription changed; reload and retry', 'conflict');
      await client.query(`DELETE FROM ${ctx.quotedSchema}.prescription_items WHERE prescription_id = $1`, [id]);
      let order = 1;
      for (const item of dto.items) {
        await client.query(
          `INSERT INTO ${ctx.quotedSchema}.prescription_items
            (id, prescription_id, sort_order, medicine_name, strength, dosage_form, dose, route,
             frequency, duration, quantity, instructions)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            randomUUID(),
            id,
            order,
            item.medicineName.trim(),
            item.strength ?? null,
            item.dosageForm ?? null,
            item.dose.trim(),
            item.route ?? null,
            item.frequency.trim(),
            item.duration ?? null,
            item.quantity ?? null,
            item.instructions ?? null,
          ],
        );
        order += 1;
      }
      return this.getPrescription(ctx, id);
    });
  }

  async signPrescription(ctx: ClinicContext & { doctorId: string }, id: string, dto: SignDto) {
    await this.assertVerified(ctx);
    return this.sql.withClient(async (client) => {
      const items = await client.query(
        `SELECT 1 FROM ${ctx.quotedSchema}.prescription_items WHERE prescription_id = $1`,
        [id],
      );
      if ((items.rowCount ?? 0) === 0) deny('INVALID_CLINICAL_TRANSITION', 'Prescription has no medicines');
      const updated = await client.query(
        `UPDATE ${ctx.quotedSchema}.prescriptions
         SET status = 'SIGNED', signed_by = $3, signed_at = NOW(), updated_at = NOW(), version = version + 1
         WHERE id = $1 AND doctor_id = $2 AND status = 'DRAFT' AND version = $4
         RETURNING id`,
        [id, ctx.doctorId, ctx.userId, dto.version],
      );
      if (!updated.rows[0]) deny('INVALID_CLINICAL_TRANSITION', 'Prescription cannot be signed', 'conflict');
      return this.getPrescription(ctx, id);
    });
  }

  async voidPrescription(ctx: ClinicContext & { doctorId: string }, id: string, dto: VoidPrescriptionDto) {
    await this.assertVerified(ctx);
    return this.sql.withClient(async (client) => {
      const updated = await client.query(
        `UPDATE ${ctx.quotedSchema}.prescriptions
         SET status = 'VOIDED', void_reason = $3, updated_at = NOW(), version = version + 1
         WHERE id = $1 AND doctor_id = $2 AND status = 'SIGNED'
         RETURNING id`,
        [id, ctx.doctorId, dto.reason.trim()],
      );
      if (!updated.rows[0]) deny('INVALID_CLINICAL_TRANSITION', 'Only a signed prescription can be voided', 'conflict');
      return this.getPrescription(ctx, id);
    });
  }

  async revisePrescription(ctx: ClinicContext & { doctorId: string }, id: string) {
    await this.assertVerified(ctx);
    return this.sql.withClient(async (client) => {
      const current = await client.query<{
        id: string;
        encounter_id: string;
        patient_id: string;
        status: string;
        doctor_id: string;
      }>(
        `SELECT id, encounter_id, patient_id, status, doctor_id
         FROM ${ctx.quotedSchema}.prescriptions WHERE id = $1`,
        [id],
      );
      const rx = current.rows[0];
      if (!rx || rx.doctor_id !== ctx.doctorId) deny('CLINICAL_ACCESS_DENIED', 'Prescription not found', 'missing');
      if (rx.status !== 'SIGNED') deny('INVALID_CLINICAL_TRANSITION', 'Only a signed prescription can be revised');
      const nextId = randomUUID();
      await client.query(
        `UPDATE ${ctx.quotedSchema}.prescriptions SET status = 'SUPERSEDED', updated_at = NOW() WHERE id = $1`,
        [id],
      );
      await client.query(
        `INSERT INTO ${ctx.quotedSchema}.prescriptions
          (id, encounter_id, patient_id, doctor_id, created_by, supersedes_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [nextId, rx.encounter_id, rx.patient_id, ctx.doctorId, ctx.userId, id],
      );
      await client.query(
        `INSERT INTO ${ctx.quotedSchema}.prescription_items
          (id, prescription_id, sort_order, medicine_name, strength, dosage_form, dose, route,
           frequency, duration, quantity, instructions)
         SELECT gen_random_uuid(), $2, sort_order, medicine_name, strength, dosage_form, dose, route,
                frequency, duration, quantity, instructions
         FROM ${ctx.quotedSchema}.prescription_items WHERE prescription_id = $1`,
        [id, nextId],
      );
      return this.getPrescription(ctx, nextId);
    });
  }

  async getPrescription(ctx: ClinicContext & { doctorId: string }, id: string) {
    return this.sql.withClient(async (client) => {
      const rx = await client.query(
        `SELECT * FROM ${ctx.quotedSchema}.prescriptions WHERE id = $1 AND doctor_id = $2`,
        [id, ctx.doctorId],
      );
      if (!rx.rows[0]) deny('CLINICAL_ACCESS_DENIED', 'Prescription not found', 'missing');
      const items = await client.query(
        `SELECT * FROM ${ctx.quotedSchema}.prescription_items WHERE prescription_id = $1 ORDER BY sort_order`,
        [id],
      );
      return { ...rx.rows[0], items: items.rows };
    });
  }

  async prescriptionHtml(ctx: ClinicContext & { doctorId: string }, id: string) {
    const rx = await this.getPrescription(ctx, id);
    const clinic = await this.sql.withClient(async (client) => {
      const profile = await client.query(`SELECT clinic_name FROM ${ctx.quotedSchema}.clinic_profile LIMIT 1`);
      const doctor = await client.query(
        `SELECT display_name, registration_number, credential_review_status
         FROM ${ctx.quotedSchema}.doctors WHERE id = $1`,
        [ctx.doctorId],
      );
      const patient = await client.query(
        `SELECT full_name, patient_number FROM ${ctx.quotedSchema}.patients WHERE id = $1`,
        [rx.patient_id],
      );
      return { profile: profile.rows[0], doctor: doctor.rows[0], patient: patient.rows[0] };
    });
    const draft = rx.status !== 'SIGNED';
    const items = (rx.items as Array<Record<string, string | null>>)
      .map(
        (item, i) =>
          `<tr><td>${i + 1}</td><td>${esc(item.medicine_name)}</td><td>${esc(item.strength)}</td><td>${esc(item.dose)}</td><td>${esc(item.frequency)}</td><td>${esc(item.duration)}</td><td>${esc(item.instructions)}</td></tr>`,
      )
      .join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>Prescription</title>
      <style>body{font-family:sans-serif;margin:32px;color:#0f172a} table{width:100%;border-collapse:collapse} td,th{border:1px solid #cbd5e1;padding:6px;text-align:left} .draft{color:#b45309;font-size:28px;letter-spacing:.2em}</style>
      </head><body>
      ${draft ? '<p class="draft">DRAFT</p>' : ''}
      <h1>${esc(clinic.profile?.clinic_name ?? ctx.clinicName)}</h1>
      <p>${esc(clinic.profile?.clinic_name ?? ctx.clinicName)}</p>
      <p>Patient: ${esc(clinic.patient?.full_name)} (${esc(clinic.patient?.patient_number)})</p>
      <p>Prescriber: ${esc(clinic.doctor?.display_name)} ${clinic.doctor?.credential_review_status === 'VERIFIED' ? `· ${esc(clinic.doctor?.registration_number)}` : ''}</p>
      <p>Status: ${esc(rx.status)} · ${esc(rx.signed_at ?? rx.created_at)}</p>
      <table><thead><tr><th>#</th><th>Medicine</th><th>Strength</th><th>Dose</th><th>Frequency</th><th>Duration</th><th>Instructions</th></tr></thead><tbody>${items}</tbody></table>
      <p>${esc(rx.clinical_instructions)}</p>
      <p>This document is an authenticated clinic record, not a qualified digital signature.</p>
      </body></html>`;
  }

  private async assertVerified(ctx: ClinicContext & { doctorId: string }) {
    const row = await this.sql.withClient(async (client) => {
      const result = await client.query<{ credential_review_status: string }>(
        `SELECT credential_review_status FROM ${ctx.quotedSchema}.doctors WHERE id = $1`,
        [ctx.doctorId],
      );
      return result.rows[0];
    });
    if (row?.credential_review_status !== 'VERIFIED') {
      deny('CLINICAL_ACCESS_DENIED', 'Doctor credentials are not verified for signing', 'forbidden');
    }
  }

  private async loadOwned(
    client: { query: Function },
    ctx: ClinicContext & { doctorId: string },
    id: string,
  ) {
    const result = await client.query(
      `SELECT * FROM ${ctx.quotedSchema}.clinical_encounters WHERE id = $1 AND doctor_id = $2`,
      [id, ctx.doctorId],
    );
    if (!result.rows[0]) deny('CLINICAL_ACCESS_DENIED', 'Encounter not found', 'missing');
    return result.rows[0] as Record<string, unknown> & { status: string; patient_id: string };
  }

  private async allergyBundle(client: { query: Function }, schema: string, patientId: string) {
    const status = await client.query(
      `SELECT status FROM ${schema}.patient_allergy_status WHERE patient_id = $1`,
      [patientId],
    );
    const items = await client.query(
      `SELECT id, substance, reaction, severity, status FROM ${schema}.patient_allergies
       WHERE patient_id = $1 AND status = 'ACTIVE' ORDER BY created_at`,
      [patientId],
    );
    return { status: (status.rows[0]?.status as string | undefined) ?? 'UNKNOWN', items: items.rows };
  }

  private async auditClinical(
    client: { query: Function },
    ctx: ClinicContext,
    action: string,
    entityType: string,
    entityId: string,
  ) {
    await client.query(
      `INSERT INTO ${ctx.quotedSchema}.clinical_audit_events
        (id, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
      [randomUUID(), ctx.userId, action, entityType, entityId, JSON.stringify({ tenantId: ctx.tenantId })],
    );
  }
}

function esc(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
