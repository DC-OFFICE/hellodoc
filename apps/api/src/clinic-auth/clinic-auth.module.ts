import { Module } from '@nestjs/common';
import { ClinicAuthController } from './clinic-auth.controller.js';
import { ClinicAuthService } from './clinic-auth.service.js';

@Module({
  controllers: [ClinicAuthController],
  providers: [ClinicAuthService],
  exports: [ClinicAuthService],
})
export class ClinicAuthModule {}
