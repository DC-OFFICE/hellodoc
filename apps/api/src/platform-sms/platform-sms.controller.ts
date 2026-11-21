import { Controller, Get, Put, Post, Body, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { CurrentSession, Roles } from '../auth/decorators.js';
import type { AuthenticatedSession } from '../auth/session.service.js';
import { NotificationsService } from '../clinic-notifications/notifications.service.js';
import { ListNotificationsQueryDto } from '../clinic-notifications/dto/notifications.dto.js';
import { ListClinicSmsUsageDto } from './dto/list-clinic-sms-usage.dto.js';
import { UpdateSmsGatewayDto } from './dto/update-sms-gateway.dto.js';
import { PlatformSmsGatewayService } from './platform-sms-gateway.service.js';

@Controller('platform')
export class PlatformSmsController {
  constructor(
    private readonly gateway: PlatformSmsGatewayService,
    private readonly notifications: NotificationsService,
  ) {}

  @Roles('platform_admin')
  @Get('sms-gateway')
  getGateway() {
    return this.gateway.getPublic();
  }

  @Roles('platform_admin')
  @Get('sms-gateway/clinic-usage')
  clinicUsage(@Query() query: ListClinicSmsUsageDto) {
    return this.gateway.getClinicUsage(query);
  }

  @Roles('platform_admin')
  @Put('sms-gateway')
  updateGateway(
    @CurrentSession() session: AuthenticatedSession,
    @Body() dto: UpdateSmsGatewayDto,
  ) {
    return this.gateway.update(dto, session.userId);
  }

  @Roles('platform_admin')
  @Post('sms-gateway/test')
  testGateway() {
    return this.gateway.testConnection();
  }

  @Roles('platform_admin')
  @Get('clinics/:tenantId/notifications')
  clinicNotifications(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.notifications.listForTenant(tenantId, query);
  }
}
