import { Module } from '@nestjs/common';
import { ClinicAuthModule } from '../clinic-auth/clinic-auth.module.js';
import { PlatformAuthController } from './platform-auth.controller.js';
import { PlatformAuthService } from './platform-auth.service.js';

@Module({
  imports: [ClinicAuthModule],
  controllers: [PlatformAuthController],
  providers: [PlatformAuthService],
  exports: [PlatformAuthService],
})
export class PlatformAuthModule {}
