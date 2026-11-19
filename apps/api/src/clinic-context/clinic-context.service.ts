import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { assertSafeClinicSchemaName, quoteIdent } from '../common/identifiers.js';

export type ClinicRole = 'CLINIC_MANAGER' | 'CLINIC_DOCTOR' | 'CLINIC_CASHIER' | 'CLINIC_RECEPTIONIST';
import type { AuthenticatedSession } from '../auth/session.service.js';
import { PrismaPlatformService } from '../platform/prisma-platform.service.js';
import { TenantSqlClient } from '../tenant-provisioning/tenant-sql.client.js';

export type ClinicContext = {
  userId: string;
  tenantId: string;
  clinicName: string;
  schemaName: string;
  quotedSchema: string;
  role: ClinicRole;
  doctorId: string | null;
};

@Injectable()
export class ClinicContextService {
  constructor(
    private readonly prisma: PrismaPlatformService,
    private readonly sql: TenantSqlClient,
  ) {}

  async resolve(session: AuthenticatedSession): Promise<ClinicContext> {
    return this.resolveRole(session, ['CLINIC_MANAGER']);
  }

  async resolveFinance(session: AuthenticatedSession): Promise<ClinicContext> {
    return this.resolveRole(session, ['CLINIC_MANAGER', 'CLINIC_CASHIER']);
  }

  async resolveFrontDesk(session: AuthenticatedSession): Promise<ClinicContext> {
    return this.resolveRole(session, ['CLINIC_MANAGER', 'CLINIC_RECEPTIONIST']);
  }

  /** Patient directory reads for booking and invoicing. Not for clinical notes. */
  async resolvePatientDirectory(session: AuthenticatedSession): Promise<ClinicContext> {
    return this.resolveRole(session, ['CLINIC_MANAGER', 'CLINIC_RECEPTIONIST', 'CLINIC_CASHIER']);
  }

  async resolveDoctor(session: AuthenticatedSession): Promise<ClinicContext & { doctorId: string }> {
    const ctx = await this.resolveRole(session, ['CLINIC_DOCTOR']);
    const link = await this.sql.withClient(async (client) => {
      const result = await client.query<{ doctor_id: string; status: string; credential_review_status: string }>(
        `SELECT l.doctor_id, d.status, d.credential_review_status
         FROM ${ctx.quotedSchema}.doctor_user_links l
         JOIN ${ctx.quotedSchema}.doctors d ON d.id = l.doctor_id
         WHERE l.user_id = $1 AND l.active = TRUE`,
        [ctx.userId],
      );
      return result.rows[0] ?? null;
    });
    if (!link || link.status !== 'ACTIVE' || link.credential_review_status === 'SUSPENDED') {
      throw new ForbiddenException({
        code: 'DOCTOR_PROFILE_NOT_LINKED',
        message: 'Doctor profile is not linked or is not active',
      });
    }
    return { ...ctx, doctorId: link.doctor_id };
  }

  private async resolveRole(session: AuthenticatedSession, roles: ClinicRole[]): Promise<ClinicContext> {
    if (!session.activeTenantId || session.context !== 'clinic') {
      throw new UnauthorizedException('Authentication required');
    }

    const memberships = await this.prisma.tenantMembership.findMany({
      where: {
        userId: session.userId,
        tenantId: session.activeTenantId,
        active: true,
        role: { in: roles },
      },
      include: { tenant: true },
    });
    const membership =
      memberships.find((row) => row.role === 'CLINIC_MANAGER') ??
      memberships.find((row) => row.role === 'CLINIC_RECEPTIONIST') ??
      memberships[0];

    if (!membership || membership.tenant.status !== 'ACTIVE') {
      throw new ForbiddenException({
        code: 'CLINICAL_ACCESS_DENIED',
        message: 'This account cannot perform that action',
      });
    }

    if (process.env.MFA_REQUIRED === 'true') {
      const confirmed = await this.prisma.$queryRawUnsafe<Array<{ confirmed_at: Date | null }>>(
        `SELECT confirmed_at FROM platform.user_mfa WHERE user_id = $1::uuid`,
        session.userId,
      );
      if (!confirmed[0]?.confirmed_at) {
        throw new ForbiddenException({
          code: 'MFA_ENROLLMENT_REQUIRED',
          message: 'Multi-factor authentication must be enabled before this action',
        });
      }
    }

    const schemaName = assertSafeClinicSchemaName(membership.tenant.schemaName);
    return {
      userId: session.userId,
      tenantId: membership.tenant.id,
      clinicName: membership.tenant.clinicName,
      schemaName,
      quotedSchema: quoteIdent(schemaName),
      role: membership.role as ClinicRole,
      doctorId: null,
    };
  }
}
