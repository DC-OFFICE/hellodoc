import { Module } from '@nestjs/common';
import { ClinicRegistrationController } from './clinic-registration.controller.js';
import { ClinicRegistrationService } from './clinic-registration.service.js';

@Module({
  controllers: [ClinicRegistrationController],
  providers: [ClinicRegistrationService],
  exports: [ClinicRegistrationService],
})
export class ClinicRegistrationModule {}
