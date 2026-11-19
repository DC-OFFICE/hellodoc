import { Module } from '@nestjs/common';
import { PlatformCatalogsModule } from '../platform-catalogs/platform-catalogs.module.js';
import { TenantProvisioningModule } from '../tenant-provisioning/tenant-provisioning.module.js';
import { DoctorsController } from './doctors.controller.js';
import { DoctorsService } from './doctors.service.js';

@Module({
  imports: [TenantProvisioningModule, PlatformCatalogsModule],
  controllers: [DoctorsController],
  providers: [DoctorsService],
  exports: [DoctorsService],
})
export class ClinicDoctorsModule {}
