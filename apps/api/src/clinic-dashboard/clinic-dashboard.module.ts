import { Module } from '@nestjs/common';
import { TenantProvisioningModule } from '../tenant-provisioning/tenant-provisioning.module.js';
import { ClinicDashboardController } from './clinic-dashboard.controller.js';

@Module({
  imports: [TenantProvisioningModule],
  controllers: [ClinicDashboardController],
})
export class ClinicDashboardModule {}
