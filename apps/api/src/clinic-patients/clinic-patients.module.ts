import { Module } from '@nestjs/common';
import { TenantProvisioningModule } from '../tenant-provisioning/tenant-provisioning.module.js';
import { PatientsController } from './patients.controller.js';
import { PatientsService } from './patients.service.js';

@Module({
  imports: [TenantProvisioningModule],
  controllers: [PatientsController],
  providers: [PatientsService],
  exports: [PatientsService],
})
export class ClinicPatientsModule {}
