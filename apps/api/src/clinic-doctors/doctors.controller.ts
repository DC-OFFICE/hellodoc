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
import { DoctorsService } from './doctors.service.js';
import { CreateDoctorDto, ListDoctorsQueryDto, UpdateDoctorDto } from './dto/doctor.dto.js';

@Controller('clinic/doctors')
export class DoctorsController {
  constructor(
    private readonly doctors: DoctorsService,
    private readonly clinicContext: ClinicContextService,
  ) {}

  @Roles('clinic_manager', 'clinic_receptionist')
  @Get()
  async list(@CurrentSession() session: AuthenticatedSession, @Query() query: ListDoctorsQueryDto) {
    const ctx = await this.clinicContext.resolveFrontDesk(session);
    return this.doctors.list(ctx, query);
  }

  @Roles('clinic_manager')
  @Post()
  async create(@CurrentSession() session: AuthenticatedSession, @Body() dto: CreateDoctorDto) {
    const ctx = await this.clinicContext.resolve(session);
    return this.doctors.create(ctx, dto);
  }

  @Roles('clinic_manager', 'clinic_receptionist')
  @Get(':id')
  async get(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.clinicContext.resolveFrontDesk(session);
    return this.doctors.get(ctx, id);
  }

  @Roles('clinic_manager')
  @Patch(':id')
  async update(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDoctorDto,
  ) {
    const ctx = await this.clinicContext.resolve(session);
    return this.doctors.update(ctx, id, dto);
  }

  @Roles('clinic_manager')
  @Post(':id/deactivate')
  async deactivate(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.clinicContext.resolve(session);
    return this.doctors.deactivate(ctx, id);
  }

  @Roles('clinic_manager')
  @Post(':id/reactivate')
  async reactivate(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.clinicContext.resolve(session);
    return this.doctors.reactivate(ctx, id);
  }
}
