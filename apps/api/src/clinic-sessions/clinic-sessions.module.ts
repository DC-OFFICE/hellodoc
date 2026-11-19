import { Module } from '@nestjs/common';
import { TenantProvisioningModule } from '../tenant-provisioning/tenant-provisioning.module.js';
import { SessionsController } from './sessions.controller.js';
import { SessionsService } from './sessions.service.js';

@Module({
  imports: [TenantProvisioningModule],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class ClinicSessionsModule {}
