import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentSession, Roles } from '../auth/decorators.js';
import type { AuthenticatedSession } from '../auth/session.service.js';
import { ClinicContextService } from '../clinic-context/clinic-context.service.js';
import {
  CancelSessionDto,
  CreateSessionDto,
  ListSessionsQueryDto,
  UpdateSessionDto,
} from './dto/session.dto.js';
import { SessionsService } from './sessions.service.js';

@Controller('clinic/sessions')
export class SessionsController {
  constructor(
    private readonly sessions: SessionsService,
    private readonly clinicContext: ClinicContextService,
  ) {}

  @Roles('clinic_manager', 'clinic_receptionist')
  @Get()
  async list(
    @CurrentSession() session: AuthenticatedSession,
    @Query() query: ListSessionsQueryDto,
  ) {
    const ctx = await this.clinicContext.resolveFrontDesk(session);
    return this.sessions.list(ctx, query);
  }

  @Roles('clinic_manager')
  @Post()
  async create(@CurrentSession() session: AuthenticatedSession, @Body() dto: CreateSessionDto) {
    const ctx = await this.clinicContext.resolve(session);
    return this.sessions.create(ctx, dto);
  }

  @Roles('clinic_manager', 'clinic_receptionist')
  @Get(':id')
  async get(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.clinicContext.resolveFrontDesk(session);
    return this.sessions.get(ctx, id);
  }

  @Roles('clinic_manager')
  @Patch(':id')
  async update(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSessionDto,
  ) {
    const ctx = await this.clinicContext.resolve(session);
    return this.sessions.update(ctx, id, dto);
  }

  @Roles('clinic_manager')
  @Post(':id/cancel')
  async cancel(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelSessionDto,
  ) {
    const ctx = await this.clinicContext.resolve(session);
    return this.sessions.cancel(ctx, id, dto);
  }
}
