import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentSession, Public, Roles } from '../auth/decorators.js';
import type { AuthenticatedSession } from '../auth/session.service.js';
import { ClinicContextService } from '../clinic-context/clinic-context.service.js';
import { ClinicalService } from './clinical.service.js';
import {
  AcceptDoctorInviteDto,
  AddendumDto,
  AllergyDto,
  AllergyStatusDto,
  CreateEncounterDto,
  HistoryDto,
  InviteDoctorDto,
  ReviewCredentialsDto,
  SaveEncounterDraftDto,
  SavePrescriptionDraftDto,
  SignDto,
  VitalsDto,
  VoidPrescriptionDto,
} from './dto/clinical.dto.js';

@Controller()
export class ClinicalController {
  constructor(
    private readonly clinical: ClinicalService,
    private readonly clinicContext: ClinicContextService,
  ) {}

  @Roles('clinic_manager')
  @Post('clinic/doctors/:id/invitations')
  async invite(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InviteDoctorDto,
  ) {
    const ctx = await this.clinicContext.resolve(session);
    return this.clinical.invite(ctx, id, dto);
  }

  @Public()
  @Post('doctor/invitations/accept')
  async accept(@Body() dto: AcceptDoctorInviteDto) {
    return this.clinical.accept(dto);
  }

  @Roles('clinic_manager')
  @Post('clinic/doctors/:id/credential-review')
  async review(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewCredentialsDto,
  ) {
    const ctx = await this.clinicContext.resolve(session);
    return this.clinical.reviewCredentials(ctx, id, dto);
  }

  @Roles('clinic_doctor')
  @Get('doctor/worklist')
  @Header('Cache-Control', 'no-store')
  async worklist(@CurrentSession() session: AuthenticatedSession) {
    const ctx = await this.clinicContext.resolveDoctor(session);
    return this.clinical.worklist(ctx);
  }

  @Roles('clinic_doctor')
  @Post('clinic/encounters')
  async createEncounter(
    @CurrentSession() session: AuthenticatedSession,
    @Body() dto: CreateEncounterDto,
  ) {
    const ctx = await this.clinicContext.resolveDoctor(session);
    return this.clinical.createEncounter(ctx, dto);
  }

  @Roles('clinic_doctor')
  @Get('clinic/encounters/:id')
  @Header('Cache-Control', 'no-store')
  async getEncounter(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.clinicContext.resolveDoctor(session);
    return this.clinical.getEncounter(ctx, id);
  }

  @Roles('clinic_doctor')
  @Post('clinic/encounters/:id/draft')
  async saveDraft(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveEncounterDraftDto,
  ) {
    const ctx = await this.clinicContext.resolveDoctor(session);
    return this.clinical.saveDraft(ctx, id, dto);
  }

  @Roles('clinic_doctor')
  @Post('clinic/encounters/:id/sign')
  async signEncounter(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SignDto,
  ) {
    const ctx = await this.clinicContext.resolveDoctor(session);
    return this.clinical.signEncounter(ctx, id, dto);
  }

  @Roles('clinic_doctor')
  @Post('clinic/encounters/:id/addenda')
  async addendum(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddendumDto,
  ) {
    const ctx = await this.clinicContext.resolveDoctor(session);
    return this.clinical.addendum(ctx, id, dto);
  }

  @Roles('clinic_doctor')
  @Post('clinic/encounters/:id/vitals')
  async vitals(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VitalsDto,
  ) {
    const ctx = await this.clinicContext.resolveDoctor(session);
    return this.clinical.recordVitals(ctx, id, dto);
  }

  @Roles('clinic_doctor')
  @Get('clinic/patients/:id/clinical-history')
  @Header('Cache-Control', 'no-store')
  async history(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.clinicContext.resolveDoctor(session);
    return this.clinical.clinicalHistory(ctx, id);
  }

  @Roles('clinic_doctor')
  @Post('clinic/allergies')
  async allergy(@CurrentSession() session: AuthenticatedSession, @Body() dto: AllergyDto) {
    const ctx = await this.clinicContext.resolveDoctor(session);
    return this.clinical.addAllergy(ctx, dto);
  }

  @Roles('clinic_doctor')
  @Post('clinic/patients/:id/allergy-status')
  async allergyStatus(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AllergyStatusDto,
  ) {
    const ctx = await this.clinicContext.resolveDoctor(session);
    return this.clinical.setAllergyStatus(ctx, id, dto);
  }

  @Roles('clinic_doctor')
  @Post('clinic/medical-history')
  async historyWrite(@CurrentSession() session: AuthenticatedSession, @Body() dto: HistoryDto) {
    const ctx = await this.clinicContext.resolveDoctor(session);
    return this.clinical.addHistory(ctx, dto);
  }

  @Roles('clinic_doctor')
  @Post('clinic/encounters/:id/prescriptions')
  async createRx(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.clinicContext.resolveDoctor(session);
    return this.clinical.createPrescription(ctx, id);
  }

  @Roles('clinic_doctor')
  @Get('clinic/prescriptions/:id')
  @Header('Cache-Control', 'no-store')
  async getRx(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.clinicContext.resolveDoctor(session);
    return this.clinical.getPrescription(ctx, id);
  }

  @Roles('clinic_doctor')
  @Post('clinic/prescriptions/:id/draft')
  async saveRx(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SavePrescriptionDraftDto,
  ) {
    const ctx = await this.clinicContext.resolveDoctor(session);
    return this.clinical.savePrescription(ctx, id, dto);
  }

  @Roles('clinic_doctor')
  @Post('clinic/prescriptions/:id/sign')
  async signRx(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SignDto,
  ) {
    const ctx = await this.clinicContext.resolveDoctor(session);
    return this.clinical.signPrescription(ctx, id, dto);
  }

  @Roles('clinic_doctor')
  @Post('clinic/prescriptions/:id/void')
  async voidRx(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidPrescriptionDto,
  ) {
    const ctx = await this.clinicContext.resolveDoctor(session);
    return this.clinical.voidPrescription(ctx, id, dto);
  }

  @Roles('clinic_doctor')
  @Post('clinic/prescriptions/:id/revise')
  async reviseRx(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.clinicContext.resolveDoctor(session);
    return this.clinical.revisePrescription(ctx, id);
  }

  @Roles('clinic_doctor')
  @Get('clinic/prescriptions/:id/print')
  async printRx(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const ctx = await this.clinicContext.resolveDoctor(session);
    const html = await this.clinical.prescriptionHtml(ctx, id);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }
}
