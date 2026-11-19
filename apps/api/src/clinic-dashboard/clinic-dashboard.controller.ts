import { Controller, Get } from '@nestjs/common';
import { CurrentSession, Roles } from '../auth/decorators.js';
import type { AuthenticatedSession } from '../auth/session.service.js';
import { PrismaPlatformService } from '../platform/prisma-platform.service.js';
import { TenantProvisioningService } from '../tenant-provisioning/tenant-provisioning.service.js';
import { UnauthorizedException } from '@nestjs/common';

@Controller('clinic')
export class ClinicDashboardController {
  constructor(
    private readonly prisma: PrismaPlatformService,
    private readonly provisioning: TenantProvisioningService,
  ) {}

  @Roles('clinic_manager', 'clinic_doctor', 'clinic_cashier', 'clinic_receptionist')
  @Get('me')
  async me(@CurrentSession() session: AuthenticatedSession) {
    if (!session.activeTenantId) throw new UnauthorizedException('Authentication required');

    const membership = await this.prisma.tenantMembership.findFirst({
      where: {
        userId: session.userId,
        tenantId: session.activeTenantId,
        active: true,
        role: { in: ['CLINIC_MANAGER', 'CLINIC_DOCTOR', 'CLINIC_CASHIER', 'CLINIC_RECEPTIONIST'] },
      },
      include: { tenant: true },
    });

    if (!membership || membership.tenant.status !== 'ACTIVE') {
      throw new UnauthorizedException('Authentication required');
    }

    // Prefer tenant schema profile; fall back to registry name if profile read fails.
    let clinicName = membership.tenant.clinicName;
    try {
      const profile = await this.provisioning.getClinicProfile(
        membership.tenant.schemaName,
        membership.tenant.id,
      );
      clinicName = profile.clinicName;
    } catch {
      // Keep registry name; never expose another tenant.
    }

    return {
      tenantId: membership.tenant.id,
      clinicName,
      status: membership.tenant.status,
    };
  }
}
