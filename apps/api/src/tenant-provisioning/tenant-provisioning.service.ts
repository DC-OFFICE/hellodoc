import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { AuditService } from '../audit/audit.service.js';
import {
  assertNewClinicSchemaName,
  createClinicSchemaName,
  quoteIdent,
  slugifyClinicName,
} from '../common/identifiers.js';
import { PrismaPlatformService } from '../platform/prisma-platform.service.js';
import { SessionService } from '../auth/session.service.js';
import { TenantMigrationService } from '../tenant-migrations/tenant-migration.service.js';
import { TenantSqlClient } from './tenant-sql.client.js';

@Injectable()
export class TenantProvisioningService {
  constructor(
    private readonly prisma: PrismaPlatformService,
    private readonly sql: TenantSqlClient,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
    private readonly migrations: TenantMigrationService,
  ) {}

  async approveRegistration(registrationId: string, adminUserId: string) {
    const registration = await this.prisma.clinicRegistration.findUnique({
      where: { id: registrationId },
    });
    if (!registration) throw new NotFoundException('Registration not found');

    if (registration.status === 'APPROVED' && registration.tenantId) {
      const existing = await this.prisma.tenant.findUnique({ where: { id: registration.tenantId } });
      return {
        idempotent: true,
        tenantId: existing?.id,
        schemaName: existing?.schemaName,
        status: existing?.status,
      };
    }

    if (registration.status === 'REJECTED') {
      throw new BadRequestException('Rejected registrations cannot be approved');
    }
    if (registration.status !== 'PENDING_APPROVAL') {
      throw new ConflictException('Registration is not pending approval');
    }

    const tenantId = randomUUID();
    const schemaName = await this.allocateUniqueSchemaName(registration.clinicName);
    const slug = await this.uniqueSlug(registration.clinicName);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const locked = await tx.clinicRegistration.findUnique({ where: { id: registrationId } });
        if (!locked) throw new NotFoundException('Registration not found');
        if (locked.status === 'APPROVED' && locked.tenantId) {
          return { idempotent: true as const, tenantId: locked.tenantId };
        }
        if (locked.status !== 'PENDING_APPROVAL') {
          throw new ConflictException('Registration is not pending approval');
        }

        const tenant = await tx.tenant.create({
          data: {
            id: tenantId,
            clinicName: locked.clinicName,
            slug,
            schemaName,
            registrationStatus: 'APPROVED',
            provisioningStatus: 'PROVISIONING',
            status: 'PROVISIONING',
          },
        });

        await tx.provisioningRecord.create({
          data: {
            tenantId: tenant.id,
            schemaName,
            state: 'PROVISIONING',
            migrationVersion: this.migrations.listVersions().at(-1) ?? 'pending',
          },
        });

        let user = await tx.platformUser.findUnique({
          where: { emailNormalized: locked.emailNormalized },
        });
        if (!user) {
          user = await tx.platformUser.create({
            data: {
              name: locked.ownerName,
              email: locked.email,
              emailNormalized: locked.emailNormalized,
              passwordHash: locked.passwordHash,
              active: true,
            },
          });
        }

        await tx.tenantMembership.create({
          data: {
            tenantId: tenant.id,
            userId: user.id,
            role: 'CLINIC_MANAGER',
            active: true,
          },
        });

        await tx.clinicRegistration.update({
          where: { id: locked.id },
          data: {
            status: 'APPROVED',
            applicantUserId: user.id,
            tenantId: tenant.id,
            reviewedById: adminUserId,
            reviewedAt: new Date(),
          },
        });

        return { idempotent: false as const, tenantId: tenant.id, userId: user.id };
      });

      if (result.idempotent) {
        const existing = await this.prisma.tenant.findUnique({ where: { id: result.tenantId } });
        return {
          idempotent: true,
          tenantId: existing?.id,
          schemaName: existing?.schemaName,
          status: existing?.status,
        };
      }

      await this.provisionSchema({
        tenantId: result.tenantId,
        schemaName,
        clinicName: registration.clinicName,
        adminUserId,
      });

      const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: result.tenantId } });
      return {
        idempotent: false,
        tenantId: tenant.id,
        schemaName: tenant.schemaName,
        status: tenant.status,
      };
    } catch (error) {
      await this.markProvisioningFailed(tenantId, schemaName, error);
      throw error;
    }
  }

  private async provisionSchema(input: {
    tenantId: string;
    schemaName: string;
    clinicName: string;
    adminUserId: string;
  }): Promise<void> {
    const quoted = quoteIdent(input.schemaName);
    await this.sql.withClient(async (client) => {
      await client.query('BEGIN');
      try {
        const exists = await client.query(
          `SELECT 1 FROM pg_namespace WHERE nspname = $1`,
          [input.schemaName],
        );
        if ((exists.rowCount ?? 0) > 0) {
          throw new ConflictException('Tenant schema already exists');
        }

        await client.query(`CREATE SCHEMA ${quoted} AUTHORIZATION CURRENT_USER`);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });

    const migrationResult = await this.migrations.applyToSchema(input.schemaName);

    await this.sql.withClient(async (client) => {
      await client.query(
        `INSERT INTO ${quoted}.clinic_profile (id, platform_tenant_id, clinic_name)
         VALUES ($1, $2, $3)
         ON CONFLICT (platform_tenant_id) DO NOTHING`,
        [randomUUID(), input.tenantId, input.clinicName],
      );
      const verify = await client.query<{ clinic_name: string; platform_tenant_id: string }>(
        `SELECT clinic_name, platform_tenant_id::text AS platform_tenant_id
         FROM ${quoted}.clinic_profile
         WHERE platform_tenant_id = $1`,
        [input.tenantId],
      );
      if (
        verify.rows[0]?.clinic_name !== input.clinicName ||
        verify.rows[0]?.platform_tenant_id !== input.tenantId
      ) {
        throw new Error('Provisioning verification failed');
      }
    });

    const latestVersion =
      migrationResult.applied.at(-1) ??
      migrationResult.already.at(-1) ??
      this.migrations.listVersions().at(-1) ??
      'unknown';

    await this.prisma.$transaction(async (tx) => {
      await tx.tenant.update({
        where: { id: input.tenantId },
        data: {
          status: 'ACTIVE',
          provisioningStatus: 'ACTIVE',
          registrationStatus: 'APPROVED',
        },
      });
      await tx.provisioningRecord.updateMany({
        where: { tenantId: input.tenantId, state: 'PROVISIONING' },
        data: {
          state: 'ACTIVE',
          migrationVersion: latestVersion,
          completedAt: new Date(),
          failureReason: null,
        },
      });
    });

    await this.audit.record({
      actorId: input.adminUserId,
      action: 'tenant.provisioned',
      targetType: 'tenant',
      targetId: input.tenantId,
      metadata: { schemaName: input.schemaName },
    });
  }

  private async markProvisioningFailed(
    tenantId: string,
    schemaName: string,
    error: unknown,
  ): Promise<void> {
    const reason = error instanceof Error ? error.message.slice(0, 300) : 'Provisioning failed';
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return;
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        status: 'FAILED',
        provisioningStatus: 'FAILED',
      },
    });
    await this.prisma.provisioningRecord.updateMany({
      where: { tenantId, schemaName },
      data: {
        state: 'FAILED',
        failureReason: reason,
      },
    });
    await this.audit.record({
      action: 'tenant.provisioning_failed',
      targetType: 'tenant',
      targetId: tenantId,
      metadata: { reason },
    });
  }

  async getClinicProfile(schemaName: string, tenantId: string): Promise<{ clinicName: string }> {
    const quoted = quoteIdent(schemaName);
    return this.sql.withClient(async (client: pg.PoolClient) => {
      const result = await client.query<{ clinic_name: string }>(
        `SELECT clinic_name FROM ${quoted}.clinic_profile WHERE platform_tenant_id = $1 LIMIT 1`,
        [tenantId],
      );
      if (!result.rows[0]) {
        throw new NotFoundException('Clinic profile not found');
      }
      return { clinicName: result.rows[0].clinic_name };
    });
  }

  async suspendTenant(tenantId: string, adminUserId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Clinic not found');
    if (tenant.status !== 'ACTIVE' && tenant.status !== 'SUSPENDED') {
      throw new BadRequestException('Only active clinics can be suspended');
    }
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'SUSPENDED' },
    });
    await this.sessions.revokeTenantSessions(tenantId);
    await this.audit.record({
      actorId: adminUserId,
      action: 'tenant.suspended',
      targetType: 'tenant',
      targetId: tenantId,
    });
    return { id: tenantId, status: 'SUSPENDED' };
  }

  async reactivateTenant(tenantId: string, adminUserId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Clinic not found');
    if (tenant.status !== 'SUSPENDED') {
      throw new BadRequestException('Only suspended clinics can be reactivated');
    }
    if (tenant.provisioningStatus !== 'ACTIVE') {
      throw new BadRequestException('Clinic provisioning is not active');
    }
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'ACTIVE' },
    });
    await this.audit.record({
      actorId: adminUserId,
      action: 'tenant.reactivated',
      targetType: 'tenant',
      targetId: tenantId,
    });
    return { id: tenantId, status: 'ACTIVE' };
  }

  private async allocateUniqueSchemaName(clinicName: string): Promise<string> {
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const candidate = assertNewClinicSchemaName(createClinicSchemaName(clinicName));
      const existingTenant = await this.prisma.tenant.findUnique({
        where: { schemaName: candidate },
      });
      if (existingTenant) continue;

      const exists = await this.sql.withClient(async (client) => {
        const result = await client.query(`SELECT 1 FROM pg_namespace WHERE nspname = $1`, [
          candidate,
        ]);
        return (result.rowCount ?? 0) > 0;
      });
      if (!exists) return candidate;
    }
    throw new ConflictException('Unable to allocate a unique clinic schema name');
  }

  private async uniqueSlug(clinicName: string): Promise<string> {
    const base = slugifyClinicName(clinicName).replace(/_/g, '-');
    for (let i = 0; i < 8; i += 1) {
      const candidate = i === 0 ? base : `${base}-${i + 1}`;
      const existing = await this.prisma.tenant.findUnique({ where: { slug: candidate } });
      if (!existing) return candidate;
    }
    return `${base}-${randomUUID().slice(0, 8)}`;
  }
}

