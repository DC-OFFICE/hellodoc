import { Module } from '@nestjs/common';
import { TenantProvisioningModule } from '../tenant-provisioning/tenant-provisioning.module.js';

/**
 * Tenant migrations are provided by TenantProvisioningModule
 * (shared TenantSqlClient + TenantMigrationService).
 */
@Module({
  imports: [TenantProvisioningModule],
  exports: [TenantProvisioningModule],
})
export class TenantMigrationModule {}
