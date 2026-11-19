import { Module, forwardRef } from '@nestjs/common';
import { ClinicQueueModule } from '../clinic-queue/clinic-queue.module.js';
import { TenantProvisioningModule } from '../tenant-provisioning/tenant-provisioning.module.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { FakeSmsProvider } from './sms/fake-sms.provider.js';
import { SMS_PROVIDER } from './sms/sms-provider.token.js';
import type { SmsProvider } from './sms/sms-provider.js';
import { TextLkSmsProvider } from './sms/textlk-sms.provider.js';
import { SmsDispatcherService } from './sms-dispatcher.service.js';

function createSmsProvider(): SmsProvider {
  const name = (process.env.SMS_PROVIDER ?? 'fake').toLowerCase();
  if (name === 'textlk') return new TextLkSmsProvider();
  return new FakeSmsProvider();
}

@Module({
  imports: [TenantProvisioningModule, forwardRef(() => ClinicQueueModule)],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    SmsDispatcherService,
    FakeSmsProvider,
    TextLkSmsProvider,
    { provide: SMS_PROVIDER, useFactory: createSmsProvider },
  ],
  exports: [NotificationsService, SmsDispatcherService, SMS_PROVIDER],
})
export class ClinicNotificationsModule {}
