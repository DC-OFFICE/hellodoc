import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { openSecret, sealSecret } from '../common/secret-box.js';
import { PrismaPlatformService } from '../platform/prisma-platform.service.js';
import { UpdateSmsGatewayDto } from './dto/update-sms-gateway.dto.js';
import {
  PLATFORM_SMS_GATEWAY_ID,
  type SmsGatewayPublic,
  type SmsGatewayRuntime,
} from './sms-gateway.types.js';

const CACHE_MS = 5_000;

type GatewayRow = {
  id: string;
  enabled: boolean;
  baseUrl: string;
  userId: string;
  senderId: string;
  connectionTimeoutMs: number;
  readTimeoutMs: number;
  apiKeyCiphertext: string;
  apiKeyNonce: string;
  updatedAt: Date;
};

@Injectable()
export class PlatformSmsGatewayService {
  private readonly logger = new Logger(PlatformSmsGatewayService.name);
  private cache: { at: number; value: SmsGatewayRuntime } | null = null;

  constructor(
    private readonly prisma: PrismaPlatformService,
    private readonly audit: AuditService,
  ) {}

  async getPublic(): Promise<SmsGatewayPublic> {
    const row = await this.ensureRow();
    const apiKey = this.readKey(row);
    return {
      enabled: row.enabled,
      baseUrl: row.baseUrl,
      userId: row.userId,
      senderId: row.senderId,
      connectionTimeoutMs: row.connectionTimeoutMs,
      readTimeoutMs: row.readTimeoutMs,
      apiKeySet: Boolean(apiKey),
      apiKeyMask: apiKey ? maskKey(apiKey) : null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async update(dto: UpdateSmsGatewayDto, actorId: string): Promise<SmsGatewayPublic> {
    const current = await this.ensureRow();
    const baseUrl = normalizeBaseUrl(dto.baseUrl);
    const userId = dto.userId.trim();
    const senderId = dto.senderId.trim();
    const nextKey = dto.apiKey?.trim() ?? '';
    const hasStoredKey = Boolean(current.apiKeyCiphertext && current.apiKeyNonce);
    if (dto.enabled && !nextKey && !hasStoredKey) {
      throw new BadRequestException({
        code: 'GATEWAY_KEY_REQUIRED',
        message: 'An API key is required before SMS sending can be enabled',
      });
    }
    if (dto.enabled && (!userId || !senderId)) {
      throw new BadRequestException({
        code: 'GATEWAY_INCOMPLETE',
        message: 'User ID and sender ID are required before SMS sending can be enabled',
      });
    }

    const sealed = nextKey ? sealSecret(nextKey) : null;
    await this.prisma.platformSmsGateway.update({
      where: { id: PLATFORM_SMS_GATEWAY_ID },
      data: {
        enabled: dto.enabled,
        baseUrl,
        userId,
        senderId,
        connectionTimeoutMs: dto.connectionTimeoutMs,
        readTimeoutMs: dto.readTimeoutMs,
        ...(sealed
          ? { apiKeyCiphertext: sealed.ciphertext, apiKeyNonce: sealed.nonce }
          : {}),
        updatedBy: actorId,
      },
    });
    this.cache = null;
    await this.audit.record({
      actorId,
      action: 'platform.sms_gateway.update',
      targetType: 'platform_sms_gateway',
      targetId: PLATFORM_SMS_GATEWAY_ID,
      metadata: {
        enabled: dto.enabled,
        baseUrl,
        userId,
        senderId,
        apiKeyUpdated: Boolean(sealed),
      },
    });
    return this.getPublic();
  }

  async getRuntimeConfig(): Promise<SmsGatewayRuntime> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.value;
    const row = await this.ensureRow();
    const apiKey = this.readKey(row);
    const value: SmsGatewayRuntime = {
      enabled: row.enabled,
      baseUrl: row.baseUrl,
      userId: row.userId.trim(),
      senderId: row.senderId.trim(),
      apiKey,
      connectionTimeoutMs: row.connectionTimeoutMs,
      readTimeoutMs: row.readTimeoutMs,
      canSend: Boolean(row.enabled && row.userId.trim() && row.senderId.trim() && apiKey),
    };
    this.cache = { at: Date.now(), value };
    return value;
  }

  /** Checks SMSLenz account status. Does not send an SMS. */
  async testConnection(): Promise<{ ok: boolean; message: string }> {
    const runtime = await this.getRuntimeConfig();
    if (!runtime.userId || !runtime.apiKey) {
      throw new BadRequestException({
        code: 'GATEWAY_KEY_REQUIRED',
        message: 'Save a user ID and API key before testing the connection',
      });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), runtime.readTimeoutMs);
    try {
      const res = await fetch(`${runtime.baseUrl}/api/account-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ user_id: runtime.userId, api_key: runtime.apiKey }),
        signal: controller.signal,
      });
      const body = await readJson(res);
      const message =
        typeof body?.message === 'string' ? redact(body.message, runtime.apiKey) : `HTTP ${res.status}`;
      const ok = res.ok && body?.success === true;
      return { ok, message: ok ? 'SMSLenz account is reachable' : message };
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      this.logger.warn(`SMSLenz account check failed: ${aborted ? 'timeout' : 'network'}`);
      return {
        ok: false,
        message: aborted ? 'SMSLenz account check timed out' : 'Could not reach SMSLenz',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private async ensureRow(): Promise<GatewayRow> {
    const existing = await this.prisma.platformSmsGateway.findUnique({
      where: { id: PLATFORM_SMS_GATEWAY_ID },
    });
    if (existing) return existing;
    return this.prisma.platformSmsGateway.create({
      data: {
        id: PLATFORM_SMS_GATEWAY_ID,
        enabled: false,
        baseUrl: 'https://smslenz.lk',
        userId: '',
        senderId: '',
        connectionTimeoutMs: 30_000,
        readTimeoutMs: 30_000,
        apiKeyCiphertext: '',
        apiKeyNonce: '',
      },
    });
  }

  private readKey(row: Pick<GatewayRow, 'apiKeyCiphertext' | 'apiKeyNonce'>): string {
    if (!row.apiKeyCiphertext || !row.apiKeyNonce) return '';
    try {
      return openSecret(row.apiKeyCiphertext, row.apiKeyNonce);
    } catch {
      this.logger.warn('Stored SMS gateway key could not be opened');
      return '';
    }
  }
}

function normalizeBaseUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new BadRequestException({
      code: 'GATEWAY_URL_INVALID',
      message: 'Base URL must be a valid https URL',
    });
  }
  if (parsed.protocol !== 'https:') {
    throw new BadRequestException({
      code: 'GATEWAY_URL_INVALID',
      message: 'Base URL must use https',
    });
  }
  return parsed.origin;
}

function maskKey(key: string): string {
  return `••••${key.slice(-4)}`;
}

export function redact(text: string, secret: string): string {
  if (!secret) return text;
  return text.split(secret).join('[redacted]');
}

async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return null;
  return (await res.json()) as Record<string, unknown>;
}
