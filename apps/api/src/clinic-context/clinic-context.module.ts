import { Global, Module } from '@nestjs/common';
import { TenantProvisioningModule } from '../tenant-provisioning/tenant-provisioning.module.js';
import { ClinicContextService } from './clinic-context.service.js';

@Global()
@Module({
  imports: [TenantProvisioningModule],
  providers: [ClinicContextService],
  exports: [ClinicContextService],
})
export class ClinicContextModule {}
