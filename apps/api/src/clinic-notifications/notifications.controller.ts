import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentSession, Roles } from '../auth/decorators.js';
import type { AuthenticatedSession } from '../auth/session.service.js';
import { ClinicContextService } from '../clinic-context/clinic-context.service.js';
import {
  ListNotificationsQueryDto,
  UpdateNotificationSettingsDto,
} from './dto/notifications.dto.js';
import { NotificationsService } from './notifications.service.js';

@Controller()
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly clinicContext: ClinicContextService,
  ) {}

  @Roles('clinic_manager')
  @Get('clinic/notification-settings')
  async getSettings(@CurrentSession() session: AuthenticatedSession) {
    const ctx = await this.clinicContext.resolve(session);
    return this.notifications.getSettings(ctx);
  }

  @Roles('clinic_manager')
  @Patch('clinic/notification-settings')
  async updateSettings(
    @CurrentSession() session: AuthenticatedSession,
    @Body() dto: UpdateNotificationSettingsDto,
  ) {
    const ctx = await this.clinicContext.resolve(session);
    return this.notifications.updateSettings(ctx, dto);
  }

  @Roles('clinic_manager')
  @Get('clinic/notifications')
  async list(
    @CurrentSession() session: AuthenticatedSession,
    @Query() query: ListNotificationsQueryDto,
  ) {
    const ctx = await this.clinicContext.resolve(session);
    return this.notifications.list(ctx, query);
  }

  @Roles('clinic_manager')
  @Get('clinic/notifications/:id')
  async getOne(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.clinicContext.resolve(session);
    return this.notifications.getOne(ctx, id);
  }

  @Roles('clinic_manager')
  @Post('clinic/notifications/:id/retry')
  async retry(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.clinicContext.resolve(session);
    return this.notifications.retry(ctx, id);
  }
}
