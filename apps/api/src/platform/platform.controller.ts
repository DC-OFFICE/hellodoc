import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentSession, Roles } from '../auth/decorators.js';
import type { AuthenticatedSession } from '../auth/session.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ClinicRegistrationService } from '../clinic-registration/clinic-registration.service.js';
import { TenantProvisioningService } from '../tenant-provisioning/tenant-provisioning.service.js';
import { ListClinicsQueryDto, ListRegistrationsQueryDto } from './dto/list-query.dto.js';
import { PrismaPlatformService } from './prisma-platform.service.js';

@Controller('platform')
export class PlatformController {
  constructor(
    private readonly prisma: PrismaPlatformService,
    private readonly registrations: ClinicRegistrationService,
    private readonly provisioning: TenantProvisioningService,
    private readonly audit: AuditService,
  ) {}

  @Roles('platform_admin')
  @Get('clinics')
  async listClinics(@Query() query: ListClinicsQueryDto) {
    const limit = Math.min(Math.max(query.limit ?? 10, 1), 100);
    const offset = Math.max(query.offset ?? 0, 0);
    const where = query.status ? { status: query.status } : {};
    const [total, items, grouped, pending] = await Promise.all([
      this.prisma.tenant.count({ where }),
      this.prisma.tenant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        select: {
          id: true,
          clinicName: true,
          slug: true,
          schemaName: true,
          status: true,
          smsEnabled: true,
          registrationStatus: true,
          provisioningStatus: true,
          createdAt: true,
          registration: {
            select: { email: true, mobile: true, ownerName: true },
          },
        },
      }),
      this.prisma.tenant.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.clinicRegistration.count({ where: { status: 'PENDING_APPROVAL' } }),
    ]);
    const countOf = (status: string) =>
      grouped.find((row) => row.status === status)?._count._all ?? 0;
    const totals = {
      total: grouped.reduce((sum, row) => sum + row._count._all, 0),
      pending,
      active: countOf('ACTIVE'),
      suspended: countOf('SUSPENDED'),
      failed: countOf('FAILED'),
    };
    return { totals, items, total, limit, offset };
  }

  @Roles('platform_admin')
  @Get('clinics/:id')
  async getClinic(@Param('id', ParseUUIDPipe) id: string) {
    const clinic = await this.prisma.tenant.findUnique({
      where: { id },
      select: {
        id: true,
        clinicName: true,
        slug: true,
        schemaName: true,
        status: true,
        smsEnabled: true,
        registrationStatus: true,
        provisioningStatus: true,
        createdAt: true,
        registration: {
          select: {
            ownerName: true,
            email: true,
            mobile: true,
            address: true,
            status: true,
            createdAt: true,
            rejectionReason: true,
          },
        },
      },
    });
    if (!clinic) {
      throw new NotFoundException({ code: 'CLINIC_NOT_FOUND', message: 'Clinic not found' });
    }
    return clinic;
  }

  @Roles('platform_admin')
  @Post('clinics/:id/toggle-sms')
  async toggleSms(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { enabled?: boolean },
    @CurrentSession() session: AuthenticatedSession,
  ) {
    const enabled = Boolean(body?.enabled);
    const updated = await this.prisma.tenant.update({
      where: { id },
      data: { smsEnabled: enabled },
    });
    await this.audit.record({
      actorId: session.userId,
      action: 'platform.clinic.sms_toggled',
      targetType: 'tenant',
      targetId: id,
      metadata: { smsEnabled: enabled },
    });
    return { id: updated.id, smsEnabled: updated.smsEnabled };
  }

  @Roles('platform_admin')
  @Get('registrations')
  listRegistrations(@Query() query: ListRegistrationsQueryDto) {
    return this.registrations.listRegistrations(query);
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
