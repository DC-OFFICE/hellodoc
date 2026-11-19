import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { SmsProvider, SmsSendRequest, SmsSendResult } from './sms-provider.js';

/**
 * Deterministic local provider for automated tests and local development.
 * Never performs network I/O.
 */
@Injectable()
export class FakeSmsProvider implements SmsProvider {
  readonly name = 'fake';
  readonly sent: Array<SmsSendRequest & { id: string; at: string }> = [];

  async sendMessage(request: SmsSendRequest): Promise<SmsSendResult> {
    if (request.toE164.endsWith('0000')) {
      return {
        outcome: 'PERMANENT_FAILURE',
        providerMessageId: null,
        errorCategory: 'INVALID_RECIPIENT',
        errorMessage: 'Fake provider rejected test number ending in 0000',
      };
    }
    if (request.toE164.endsWith('9999')) {
      return {
        outcome: 'TEMPORARY_FAILURE',
        providerMessageId: null,
        errorCategory: 'PROVIDER_UNAVAILABLE',
        errorMessage: 'Fake provider temporary outage',
      };
    }
    if (request.toE164.endsWith('8888')) {
      return {
        outcome: 'UNCERTAIN',
        providerMessageId: `fake-uncertain-${randomUUID()}`,
        errorCategory: 'TIMEOUT_AFTER_ACCEPT',
        errorMessage: 'Fake provider timed out after possible accept',
      };
    }
    const id = `fake-${randomUUID()}`;
    this.sent.push({ ...request, id, at: new Date().toISOString() });
    return {
      outcome: 'ACCEPTED',
      providerMessageId: id,
      estimatedCost: 1,
      rawStatus: 'queued',
    };
  }
}
