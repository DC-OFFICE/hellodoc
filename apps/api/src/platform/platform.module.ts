import { Module } from '@nestjs/common';
import { ClinicRegistrationModule } from '../clinic-registration/clinic-registration.module.js';
import { TenantProvisioningModule } from '../tenant-provisioning/tenant-provisioning.module.js';
import { PlatformController } from './platform.controller.js';

@Module({
  imports: [ClinicRegistrationModule, TenantProvisioningModule],
  controllers: [PlatformController],
})
export class PlatformModule {}
