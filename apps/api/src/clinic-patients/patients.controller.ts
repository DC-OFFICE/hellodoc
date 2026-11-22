import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentSession, Roles } from '../auth/decorators.js';
import type { AuthenticatedSession } from '../auth/session.service.js';
import { ClinicContextService } from '../clinic-context/clinic-context.service.js';
import {
  CheckDuplicatesDto,
  CreatePatientDto,
  DeactivatePatientDto,
  ListPatientsQueryDto,
  ReactivatePatientDto,
  SearchPatientsDto,
  UpdatePatientDto,
} from './dto/patient.dto.js';
import { PatientsService } from './patients.service.js';

@Controller('clinic/patients')
export class PatientsController {
  constructor(
    private readonly patients: PatientsService,
    private readonly clinicContext: ClinicContextService,
  ) {}

  @Roles('clinic_manager', 'clinic_receptionist', 'clinic_cashier')
  @Get()
  @Header('Cache-Control', 'no-store')
  async list(
    @CurrentSession() session: AuthenticatedSession,
    @Query() query: ListPatientsQueryDto,
  ) {
    const ctx = await this.clinicContext.resolvePatientDirectory(session);
    return this.patients.list(ctx, query);
  }

  @Roles('clinic_manager', 'clinic_receptionist', 'clinic_cashier')
  @Post('search')
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  async search(
    @CurrentSession() session: AuthenticatedSession,
    @Body() dto: SearchPatientsDto,
  ) {
    const ctx = await this.clinicContext.resolvePatientDirectory(session);
    return this.patients.search(ctx, dto);
  }

  @Roles('clinic_manager', 'clinic_receptionist')
  @Post('check-duplicates')
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  async checkDuplicates(
    @CurrentSession() session: AuthenticatedSession,
    @Body() dto: CheckDuplicatesDto,
  ) {
    const ctx = await this.clinicContext.resolveFrontDesk(session);
    return this.patients.checkDuplicates(ctx, dto);
  }

  @Roles('clinic_manager', 'clinic_receptionist')
  @Post()
  async create(
    @CurrentSession() session: AuthenticatedSession,
    @Body() dto: CreatePatientDto,
  ) {
    const ctx = await this.clinicContext.resolveFrontDesk(session);
    return this.patients.create(ctx, dto);
  }

  @Roles('clinic_manager', 'clinic_receptionist', 'clinic_cashier')
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  async get(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.clinicContext.resolvePatientDirectory(session);
    return this.patients.get(ctx, id);
  }

  @Roles('clinic_manager', 'clinic_receptionist', 'clinic_cashier')
  @Get(':id/related')
  @Header('Cache-Control', 'no-store')
  async related(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.clinicContext.resolvePatientDirectory(session);
    return this.patients.listRelatedByContact(ctx, id);
  }

  @Roles('clinic_manager', 'clinic_receptionist')
  @Patch(':id')
  async update(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePatientDto,
  ) {
    const ctx = await this.clinicContext.resolveFrontDesk(session);
    return this.patients.update(ctx, id, dto);
  }

  @Roles('clinic_manager', 'clinic_receptionist')
  @Post(':id/deactivate')
  async deactivate(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeactivatePatientDto,
  ) {
    const ctx = await this.clinicContext.resolveFrontDesk(session);
    return this.patients.deactivate(ctx, id, dto);
  }

  @Roles('clinic_manager', 'clinic_receptionist')
  @Post(':id/reactivate')
  async reactivate(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReactivatePatientDto,
  ) {
    const ctx = await this.clinicContext.resolveFrontDesk(session);
    return this.patients.reactivate(ctx, id, dto);
  }

  @Roles('clinic_manager', 'clinic_receptionist')
  @Get(':id/audit')
  @Header('Cache-Control', 'no-store')
  async audit(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.clinicContext.resolveFrontDesk(session);
    return this.patients.auditHistory(ctx, id);
  }
}
