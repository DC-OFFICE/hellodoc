export const PLATFORM_SMS_GATEWAY_ID = 'default';

export type SmsGatewayRuntime = {
  enabled: boolean;
  canSend: boolean;
  baseUrl: string;
  userId: string;
  senderId: string;
  apiKey: string;
  connectionTimeoutMs: number;
  readTimeoutMs: number;
};

export type SmsGatewayPublic = {
  enabled: boolean;
  baseUrl: string;
  userId: string;
  senderId: string;
  connectionTimeoutMs: number;
  readTimeoutMs: number;
  apiKeySet: boolean;
  apiKeyMask: string | null;
  updatedAt: string | null;
};

/** Null when the gateway can send. Otherwise the outbox skip reason. */
export function gatewaySkipReason(
  runtime: Pick<SmsGatewayRuntime, 'enabled' | 'canSend'>,
): 'PLATFORM_DISABLED' | 'GATEWAY_UNCONFIGURED' | null {
  if (runtime.canSend) return null;
  return runtime.enabled ? 'GATEWAY_UNCONFIGURED' : 'PLATFORM_DISABLED';
}
