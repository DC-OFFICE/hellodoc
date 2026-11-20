import { Module, forwardRef } from '@nestjs/common';
import { ClinicNotificationsModule } from '../clinic-notifications/clinic-notifications.module.js';
import { PlatformSmsController } from './platform-sms.controller.js';
import { PlatformSmsGatewayService } from './platform-sms-gateway.service.js';

@Module({
  imports: [forwardRef(() => ClinicNotificationsModule)],
  controllers: [PlatformSmsController],
  providers: [PlatformSmsGatewayService],
  exports: [PlatformSmsGatewayService],
})
export class PlatformSmsModule {}
