import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentSession, Roles } from '../auth/decorators.js';
import type { AuthenticatedSession } from '../auth/session.service.js';
import { ClinicContextService } from '../clinic-context/clinic-context.service.js';
import {
  CancelAppointmentDto,
  CreateAppointmentDto,
  ListAppointmentsQueryDto,
  RescheduleAppointmentDto,
} from './dto/appointment.dto.js';
import { AppointmentsService } from './appointments.service.js';

@Controller('clinic/appointments')
export class AppointmentsController {
  constructor(
    private readonly appointments: AppointmentsService,
    private readonly clinicContext: ClinicContextService,
  ) {}

  @Roles('clinic_manager', 'clinic_receptionist')
  @Get()
  @Header('Cache-Control', 'no-store')
  async list(
    @CurrentSession() session: AuthenticatedSession,
    @Query() query: ListAppointmentsQueryDto,
  ) {
    const ctx = await this.clinicContext.resolveFrontDesk(session);
    return this.appointments.list(ctx, query);
  }

  @Roles('clinic_manager', 'clinic_receptionist')
  @Post()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async create(
    @CurrentSession() session: AuthenticatedSession,
    @Body() dto: CreateAppointmentDto,
  ) {
    const ctx = await this.clinicContext.resolveFrontDesk(session);
    return this.appointments.create(ctx, dto);
  }

  @Roles('clinic_manager', 'clinic_receptionist')
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  async get(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.clinicContext.resolveFrontDesk(session);
    return this.appointments.get(ctx, id);
  }

  @Roles('clinic_manager', 'clinic_receptionist')
  @Post(':id/cancel')
  async cancel(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelAppointmentDto,
  ) {
    const ctx = await this.clinicContext.resolveFrontDesk(session);
    return this.appointments.cancel(ctx, id, dto);
  }

  @Roles('clinic_manager', 'clinic_receptionist')
  @Post(':id/reschedule')
  async reschedule(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RescheduleAppointmentDto,
  ) {
    const ctx = await this.clinicContext.resolveFrontDesk(session);
    return this.appointments.reschedule(ctx, id, dto);
  }
}

@Controller('clinic/sessions')
export class SessionBookingController {
  constructor(
    private readonly appointments: AppointmentsService,
    private readonly clinicContext: ClinicContextService,
  ) {}

  @Roles('clinic_manager', 'clinic_receptionist')
  @Get(':id/availability')
  @Header('Cache-Control', 'no-store')
  async availability(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.clinicContext.resolveFrontDesk(session);
    return this.appointments.availability(ctx, id);
  }

  @Roles('clinic_manager', 'clinic_receptionist')
  @Get(':id/appointments')
  @Header('Cache-Control', 'no-store')
  async list(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.clinicContext.resolveFrontDesk(session);
    return this.appointments.listForSession(ctx, id);
  }
}
