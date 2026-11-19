import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CurrentSession, Roles } from '../auth/decorators.js';
import type { AuthenticatedSession } from '../auth/session.service.js';
import { ClinicRegistrationService } from '../clinic-registration/clinic-registration.service.js';
import { TenantProvisioningService } from '../tenant-provisioning/tenant-provisioning.service.js';
import { PrismaPlatformService } from './prisma-platform.service.js';

@Controller('platform')
export class PlatformController {
  constructor(
    private readonly prisma: PrismaPlatformService,
    private readonly registrations: ClinicRegistrationService,
    private readonly provisioning: TenantProvisioningService,
  ) {}

  @Roles('platform_admin')
  @Get('clinics')
  async listClinics() {
    const clinics = await this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        clinicName: true,
        slug: true,
        schemaName: true,
        status: true,
        registrationStatus: true,
        provisioningStatus: true,
        createdAt: true,
        registration: {
          select: { email: true, mobile: true, ownerName: true },
        },
      },
    });
    const totals = {
      total: clinics.length,
      pending: await this.prisma.clinicRegistration.count({ where: { status: 'PENDING_APPROVAL' } }),
      active: clinics.filter((c) => c.status === 'ACTIVE').length,
      suspended: clinics.filter((c) => c.status === 'SUSPENDED').length,
      failed: clinics.filter((c) => c.status === 'FAILED').length,
    };
    return { totals, clinics };
  }

  @Roles('platform_admin')
  @Get('registrations')
  listRegistrations() {
    return this.registrations.listRegistrations();
  }

  @Roles('platform_admin')
  @Post('registrations/:id/approve')
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    return this.provisioning.approveRegistration(id, session.userId);
  }

  @Roles('platform_admin')
  @Post('registrations/:id/reject')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentSession() session: AuthenticatedSession,
    @Body() body: { reason?: string },
  ) {
    return this.registrations.reject(id, session.userId, body?.reason);
  }

  @Roles('platform_admin')
  @Post('clinics/:id/suspend')
  suspend(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    return this.provisioning.suspendTenant(id, session.userId);
  }

  @Roles('platform_admin')
  @Post('clinics/:id/reactivate')
  reactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    return this.provisioning.reactivateTenant(id, session.userId);
  }
}
