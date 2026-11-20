import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.module.js';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthModule } from './auth/auth.module.js';
import { CsrfController } from './auth/csrf.controller.js';
import { ClinicAuthModule } from './clinic-auth/clinic-auth.module.js';
import { ClinicContextModule } from './clinic-context/clinic-context.module.js';
import { ClinicDashboardModule } from './clinic-dashboard/clinic-dashboard.module.js';
import { ClinicDoctorsModule } from './clinic-doctors/clinic-doctors.module.js';
import { ClinicAppointmentsModule } from './clinic-appointments/clinic-appointments.module.js';
import { ClinicPatientsModule } from './clinic-patients/clinic-patients.module.js';
import { ClinicBillingModule } from './clinic-billing/clinic-billing.module.js';
import { ClinicClinicalModule } from './clinic-clinical/clinic-clinical.module.js';
import { ClinicNotificationsModule } from './clinic-notifications/clinic-notifications.module.js';
import { ClinicQueueModule } from './clinic-queue/clinic-queue.module.js';
import { ClinicRegistrationModule } from './clinic-registration/clinic-registration.module.js';
import { ClinicSchedulesModule } from './clinic-schedules/clinic-schedules.module.js';
import { ClinicSessionsModule } from './clinic-sessions/clinic-sessions.module.js';
import { HealthModule } from './health/health.module.js';
import { PlatformAuthModule } from './platform-auth/platform-auth.module.js';
import { PlatformCatalogsModule } from './platform-catalogs/platform-catalogs.module.js';
import { PlatformSmsModule } from './platform-sms/platform-sms.module.js';
import { PlatformModule } from './platform/platform.module.js';
import { PrismaPlatformModule } from './platform/prisma-platform.module.js';
import { TenantProvisioningModule } from './tenant-provisioning/tenant-provisioning.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: Number(process.env.THROTTLE_LIMIT_PER_MINUTE ?? 120),
      },
    ]),
    PrismaPlatformModule,
    AuditModule,
    AuthModule,
    ClinicContextModule,
    HealthModule,
    ClinicRegistrationModule,
    PlatformAuthModule,
    ClinicAuthModule,
    PlatformModule,
    PlatformSmsModule,
    PlatformCatalogsModule,
    TenantProvisioningModule,
    ClinicDashboardModule,
    ClinicDoctorsModule,
    ClinicPatientsModule,
    ClinicAppointmentsModule,
    ClinicQueueModule,
    ClinicNotificationsModule,
    ClinicClinicalModule,
    ClinicBillingModule,
    ClinicSessionsModule,
    ClinicSchedulesModule,
  ],
  controllers: [CsrfController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
