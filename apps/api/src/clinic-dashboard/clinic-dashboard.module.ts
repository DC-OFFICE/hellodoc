import { Module } from '@nestjs/common';
import { ClinicContextModule } from '../clinic-context/clinic-context.module.js';
import { TenantProvisioningModule } from '../tenant-provisioning/tenant-provisioning.module.js';
import { ClinicDashboardController } from './clinic-dashboard.controller.js';
import { ClinicDashboardService } from './clinic-dashboard.service.js';

@Module({
  imports: [TenantProvisioningModule, ClinicContextModule],
  controllers: [ClinicDashboardController],
  providers: [ClinicDashboardService],
})
export class ClinicDashboardModule {}
