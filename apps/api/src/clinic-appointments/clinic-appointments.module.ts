import { Module } from '@nestjs/common';
import { ClinicNotificationsModule } from '../clinic-notifications/clinic-notifications.module.js';
import { ClinicQueueModule } from '../clinic-queue/clinic-queue.module.js';
import { TenantProvisioningModule } from '../tenant-provisioning/tenant-provisioning.module.js';
import {
  AppointmentsController,
  SessionBookingController,
} from './appointments.controller.js';
import { AppointmentsService } from './appointments.service.js';

@Module({
  imports: [TenantProvisioningModule, ClinicQueueModule, ClinicNotificationsModule],
  controllers: [AppointmentsController, SessionBookingController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class ClinicAppointmentsModule {}
