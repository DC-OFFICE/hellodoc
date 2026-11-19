import { Injectable, Logger } from '@nestjs/common';
import type { SmsProvider, SmsSendRequest, SmsSendResult } from './sms-provider.js';

/**
 * Text.lk OAuth Bearer SMS adapter.
 * Docs: https://text.lk/docs/send-sms/ — POST https://app.text.lk/api/v3/sms/send
 *
 * Acceptance by Text.lk is NOT proof of handset delivery. Outcomes map to ACCEPTED / failures.
 */
@Injectable()
export class TextLkSmsProvider implements SmsProvider {
  readonly name = 'textlk';
  private readonly logger = new Logger(TextLkSmsProvider.name);
  private readonly endpoint =
    process.env.TEXTLK_API_URL?.trim() || 'https://app.text.lk/api/v3/sms/send';
  private readonly timeoutMs = Number(process.env.SMS_HTTP_TIMEOUT_MS ?? 12_000);

  async sendMessage(request: SmsSendRequest): Promise<SmsSendResult> {
    const token = process.env.TEXTLK_API_TOKEN?.trim();
    if (!token) {
      return {
        outcome: 'PERMANENT_FAILURE',
        providerMessageId: null,
        errorCategory: 'MISSING_CREDENTIALS',
        errorMessage: 'TEXTLK_API_TOKEN is not configured',
      };
    }

    // Text.lk expects numbers like 9471xxxxxxx (no plus).
    const recipient = request.toE164.replace(/^\+/, '');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          recipient,
          sender_id: request.senderId,
          type: 'plain',
          message: request.message,
        }),
        signal: controller.signal,
      });

      const contentType = res.headers.get('content-type') ?? '';
      const body = contentType.includes('application/json')
        ? ((await res.json()) as Record<string, unknown>)
        : null;

      if (!res.ok) {
        const message =
          typeof body?.message === 'string' ? body.message : `HTTP ${res.status}`;
        const temporary = res.status >= 500 || res.status === 429;
        return {
          outcome: temporary ? 'TEMPORARY_FAILURE' : 'PERMANENT_FAILURE',
          providerMessageId: null,
          errorCategory: temporary ? 'PROVIDER_HTTP_5XX' : 'PROVIDER_HTTP_4XX',
          errorMessage: message,
        };
      }

      const data = (body?.data ?? {}) as Record<string, unknown>;
      const providerMessageId =
        (typeof data.uid === 'string' && data.uid) ||
        (typeof data.sms_id === 'string' && data.sms_id) ||
        null;
      const costRaw = data.cost;
      const estimatedCost =
        typeof costRaw === 'number'
          ? costRaw
          : typeof costRaw === 'string'
            ? Number(costRaw)
            : null;

      // Provider "success" means accepted/queued — treat as ACCEPTED, not DELIVERED.
      return {
        outcome: 'ACCEPTED',
        providerMessageId,
        estimatedCost: Number.isFinite(estimatedCost) ? estimatedCost : null,
        rawStatus: typeof data.status === 'string' ? data.status : 'accepted',
      };
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      this.logger.warn(`Text.lk send failed: ${aborted ? 'timeout' : 'network'}`);
      return {
        outcome: aborted ? 'UNCERTAIN' : 'TEMPORARY_FAILURE',
        providerMessageId: null,
        errorCategory: aborted ? 'TIMEOUT' : 'NETWORK',
        errorMessage: aborted
          ? 'Provider request timed out; delivery may be uncertain'
          : error instanceof Error
            ? error.message
            : 'Network error',
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
