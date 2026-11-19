import { Module } from '@nestjs/common';
import { TenantMigrationService } from '../tenant-migrations/tenant-migration.service.js';
import { TenantProvisioningService } from './tenant-provisioning.service.js';
import { TenantSqlClient } from './tenant-sql.client.js';

@Module({
  providers: [TenantSqlClient, TenantMigrationService, TenantProvisioningService],
  exports: [TenantProvisioningService, TenantSqlClient, TenantMigrationService],
})
export class TenantProvisioningModule {}
