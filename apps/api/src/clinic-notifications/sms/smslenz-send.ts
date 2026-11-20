import type { SmsSendRequest, SmsSendResult } from './sms-provider.js';

export type SmslenzCredentials = {
  baseUrl: string;
  userId: string;
  apiKey: string;
  readTimeoutMs: number;
};

/**
 * SMSLenz send-sms. Acceptance is not proof of handset delivery.
 * Docs: https://www.smslenz.lk/developers/api
 */
export async function sendSmslenzMessage(
  credentials: SmslenzCredentials,
  request: SmsSendRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<SmsSendResult> {
  if (!credentials.apiKey || !credentials.userId) {
    return {
      outcome: 'PERMANENT_FAILURE',
      providerMessageId: null,
      errorCategory: 'MISSING_CREDENTIALS',
      errorMessage: 'SMSLenz user ID or API key is not configured',
    };
  }

  const contact = request.toE164.startsWith('+') ? request.toE164 : `+${request.toE164}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), credentials.readTimeoutMs);
  const endpoint = `${credentials.baseUrl.replace(/\/$/, '')}/api/send-sms`;

  try {
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        user_id: credentials.userId,
        api_key: credentials.apiKey,
        sender_id: request.senderId,
        contact,
        message: request.message,
      }),
      signal: controller.signal,
    });

    const contentType = res.headers.get('content-type') ?? '';
    const body = contentType.includes('application/json')
      ? ((await res.json()) as Record<string, unknown>)
      : null;
    const data = (body?.data ?? {}) as Record<string, unknown>;
    const providerMessage =
      typeof body?.message === 'string' ? redact(body.message, credentials.apiKey) : `HTTP ${res.status}`;

    if (!res.ok) {
      const temporary = res.status >= 500 || res.status === 429;
      return {
        outcome: temporary ? 'TEMPORARY_FAILURE' : 'PERMANENT_FAILURE',
        providerMessageId: campaignId(data),
        errorCategory: temporary ? 'PROVIDER_HTTP_5XX' : 'PROVIDER_HTTP_4XX',
        errorMessage: providerMessage,
      };
    }

    if (body?.success !== true) {
      return {
        outcome: 'PERMANENT_FAILURE',
        providerMessageId: campaignId(data),
        errorCategory: 'PROVIDER_REJECTED',
        errorMessage: providerMessage,
      };
    }

    return {
      outcome: 'ACCEPTED',
      providerMessageId: campaignId(data),
      estimatedCost: null,
      rawStatus: typeof data.status === 'string' ? data.status : 'success',
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return {
      outcome: aborted ? 'UNCERTAIN' : 'TEMPORARY_FAILURE',
      providerMessageId: null,
      errorCategory: aborted ? 'TIMEOUT' : 'NETWORK',
      errorMessage: aborted
        ? 'Provider request timed out; delivery may be uncertain'
        : 'Network error',
    };
  } finally {
    clearTimeout(timer);
  }
}

function redact(text: string, secret: string): string {
  if (!secret) return text;
  return text.split(secret).join('[redacted]');
}

function campaignId(data: Record<string, unknown>): string | null {
  if (typeof data.campaign_id === 'number' || typeof data.campaign_id === 'string') {
    return String(data.campaign_id);
  }
  return null;
}
