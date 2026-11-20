import { Injectable } from '@nestjs/common';
import { PlatformSmsGatewayService } from '../../platform-sms/platform-sms-gateway.service.js';
import { FakeSmsProvider } from './fake-sms.provider.js';
import type { SmsProvider, SmsSendRequest, SmsSendResult } from './sms-provider.js';
import { SmslenzSmsProvider } from './smslenz-sms.provider.js';
import { TextLkSmsProvider } from './textlk-sms.provider.js';

/**
 * Text.lk stays available when SMS_PROVIDER=textlk.
 * Otherwise a saved, enabled SMSLenz gateway sends. A disabled gateway does not fall through to fake.
 */
@Injectable()
export class RoutedSmsProvider implements SmsProvider {
  private activeName = 'fake';

  constructor(
    private readonly fake: FakeSmsProvider,
    private readonly textlk: TextLkSmsProvider,
    private readonly smslenz: SmslenzSmsProvider,
    private readonly gateway: PlatformSmsGatewayService,
  ) {}

  get name(): string {
    return this.activeName;
  }

  async sendMessage(request: SmsSendRequest): Promise<SmsSendResult> {
    const provider = await this.pick();
    this.activeName = provider.name;
    return provider.sendMessage(request);
  }

  private async pick(): Promise<SmsProvider> {
    const env = (process.env.SMS_PROVIDER ?? 'fake').toLowerCase();
    if (env === 'textlk') return this.textlk;
    const runtime = await this.gateway.getRuntimeConfig();
    if (runtime.canSend) return this.smslenz;
    return this.fake;
  }
}
