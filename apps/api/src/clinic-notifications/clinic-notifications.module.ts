import { Module, forwardRef } from '@nestjs/common';
import { ClinicQueueModule } from '../clinic-queue/clinic-queue.module.js';
import { PlatformSmsModule } from '../platform-sms/platform-sms.module.js';
import { TenantProvisioningModule } from '../tenant-provisioning/tenant-provisioning.module.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { FakeSmsProvider } from './sms/fake-sms.provider.js';
import { RoutedSmsProvider } from './sms/routed-sms.provider.js';
import { SMS_PROVIDER } from './sms/sms-provider.token.js';
import { SmslenzSmsProvider } from './sms/smslenz-sms.provider.js';
import { TextLkSmsProvider } from './sms/textlk-sms.provider.js';
import { SmsDispatcherService } from './sms-dispatcher.service.js';

@Module({
  imports: [
    TenantProvisioningModule,
    forwardRef(() => ClinicQueueModule),
    forwardRef(() => PlatformSmsModule),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    SmsDispatcherService,
    FakeSmsProvider,
    TextLkSmsProvider,
    SmslenzSmsProvider,
    RoutedSmsProvider,
    { provide: SMS_PROVIDER, useExisting: RoutedSmsProvider },
  ],
  exports: [NotificationsService, SmsDispatcherService, SMS_PROVIDER],
})
export class ClinicNotificationsModule {}
