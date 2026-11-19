import { Module, forwardRef } from '@nestjs/common';
import { ClinicNotificationsModule } from '../clinic-notifications/clinic-notifications.module.js';
import { TenantProvisioningModule } from '../tenant-provisioning/tenant-provisioning.module.js';
import { QueueController } from './queue.controller.js';
import { QueueEventsHub } from './queue-events.hub.js';
import { QueueService } from './queue.service.js';

@Module({
  imports: [TenantProvisioningModule, forwardRef(() => ClinicNotificationsModule)],
  controllers: [QueueController],
  providers: [QueueService, QueueEventsHub],
  exports: [QueueService],
})
export class ClinicQueueModule {}
