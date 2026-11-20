import { Injectable } from '@nestjs/common';
import { PlatformSmsGatewayService } from '../../platform-sms/platform-sms-gateway.service.js';
import type { SmsProvider, SmsSendRequest, SmsSendResult } from './sms-provider.js';
import { sendSmslenzMessage } from './smslenz-send.js';

@Injectable()
export class SmslenzSmsProvider implements SmsProvider {
  readonly name = 'smslenz';

  constructor(private readonly gateway: PlatformSmsGatewayService) {}

  async sendMessage(request: SmsSendRequest): Promise<SmsSendResult> {
    const runtime = await this.gateway.getRuntimeConfig();
    return sendSmslenzMessage(
      {
        baseUrl: runtime.baseUrl,
        userId: runtime.userId,
        apiKey: runtime.apiKey,
        readTimeoutMs: runtime.readTimeoutMs,
      },
      request,
    );
  }
}
