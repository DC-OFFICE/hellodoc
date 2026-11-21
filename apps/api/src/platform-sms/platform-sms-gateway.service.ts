import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { openSecret, sealSecret } from '../common/secret-box.js';
import { PrismaPlatformService } from '../platform/prisma-platform.service.js';
import { ListClinicSmsUsageDto } from './dto/list-clinic-sms-usage.dto.js';
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

  async getClinicUsage(dto: ListClinicSmsUsageDto) {
    const limit = Math.min(Math.max(dto.limit ?? 10, 1), 100);
    const offset = Math.max(dto.offset ?? 0, 0);

    let fromDate: Date | null = null;
    let toDate: Date | null = null;

    if (dto.from || dto.to) {
      if (dto.from) {
        const d = new Date(dto.from);
        if (!isNaN(d.getTime())) {
          d.setUTCHours(0, 0, 0, 0);
          fromDate = d;
        }
      }
      if (dto.to) {
        const d = new Date(dto.to);
        if (!isNaN(d.getTime())) {
          d.setUTCHours(23, 59, 59, 999);
          toDate = d;
        }
      }
    } else if (dto.preset && dto.preset !== 'all') {
      const now = new Date();
      if (dto.preset === 'today') {
        fromDate = new Date(now);
        fromDate.setUTCHours(0, 0, 0, 0);
        toDate = new Date(now);
        toDate.setUTCHours(23, 59, 59, 999);
      } else if (dto.preset === 'yesterday') {
        fromDate = new Date(now);
        fromDate.setUTCDate(fromDate.getUTCDate() - 1);
        fromDate.setUTCHours(0, 0, 0, 0);
        toDate = new Date(fromDate);
        toDate.setUTCHours(23, 59, 59, 999);
      } else if (dto.preset === '7d') {
        fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        toDate = now;
      } else if (dto.preset === '30d') {
        fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        toDate = now;
      } else if (dto.preset === 'month') {
        fromDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
        toDate = now;
      }
    }

    const q = dto.q?.trim() || null;
    const smsEnabledFilter =
      dto.status === 'ENABLED' ? true : dto.status === 'DISABLED' ? false : null;

    const fromIso = fromDate ? fromDate.toISOString() : null;
    const toIso = toDate ? toDate.toISOString() : null;

    const itemsQuery = `
      SELECT 
        t."id" AS "clinicId",
        t."clinicName",
        t."slug",
        t."schemaName",
        t."smsEnabled",
        t."status" AS "tenantStatus",
        t."createdAt",
        COALESCE(stats.total_count, 0)::int AS "totalCount",
        COALESCE(stats.sent_count, 0)::int AS "totalSent",
        COALESCE(stats.delivered_count, 0)::int AS "delivered",
        COALESCE(stats.failed_count, 0)::int AS "failed",
        COALESCE(stats.skipped_count, 0)::int AS "skipped",
        stats.last_sent_at AS "lastSentAt"
      FROM "platform"."Tenant" t
      LEFT JOIN LATERAL (
        SELECT 
          COUNT(*) AS total_count,
          COUNT(*) FILTER (WHERE d.status IN ('SUBMITTED', 'DELIVERED')) AS sent_count,
          COUNT(*) FILTER (WHERE d.status = 'DELIVERED') AS delivered_count,
          COUNT(*) FILTER (WHERE d.status = 'FAILED') AS failed_count,
          COUNT(*) FILTER (WHERE d.status = 'SKIPPED') AS skipped_count,
          MAX(d.updated_at) AS last_sent_at
        FROM "platform"."sms_dispatch_index" d
        WHERE d.tenant_id = t.id
          AND ($1::timestamptz IS NULL OR d.created_at >= $1::timestamptz)
          AND ($2::timestamptz IS NULL OR d.created_at <= $2::timestamptz)
      ) stats ON true
      WHERE ($3::text IS NULL OR t."clinicName" ILIKE '%' || $3::text || '%' OR t."slug" ILIKE '%' || $3::text || '%')
        AND ($4::boolean IS NULL OR t."smsEnabled" = $4::boolean)
      ORDER BY COALESCE(stats.sent_count, 0) DESC, t."createdAt" DESC
      LIMIT $5 OFFSET $6
    `;

    const countQuery = `
      SELECT COUNT(*)::int AS count
      FROM "platform"."Tenant" t
      WHERE ($1::text IS NULL OR t."clinicName" ILIKE '%' || $1::text || '%' OR t."slug" ILIKE '%' || $1::text || '%')
        AND ($2::boolean IS NULL OR t."smsEnabled" = $2::boolean)
    `;

    const totalsQuery = `
      SELECT 
        COUNT(DISTINCT t.id)::int AS "totalClinics",
        COUNT(DISTINCT t.id) FILTER (WHERE t."smsEnabled" = true)::int AS "enabledClinics",
        COALESCE(SUM(stats.sent_count), 0)::int AS "totalSent",
        COALESCE(SUM(stats.delivered_count), 0)::int AS "totalDelivered",
        COALESCE(SUM(stats.failed_count), 0)::int AS "totalFailed",
        COALESCE(SUM(stats.skipped_count), 0)::int AS "totalSkipped"
      FROM "platform"."Tenant" t
      LEFT JOIN LATERAL (
        SELECT 
          COUNT(*) FILTER (WHERE d.status IN ('SUBMITTED', 'DELIVERED')) AS sent_count,
          COUNT(*) FILTER (WHERE d.status = 'DELIVERED') AS delivered_count,
          COUNT(*) FILTER (WHERE d.status = 'FAILED') AS failed_count,
          COUNT(*) FILTER (WHERE d.status = 'SKIPPED') AS skipped_count
        FROM "platform"."sms_dispatch_index" d
        WHERE d.tenant_id = t.id
          AND ($1::timestamptz IS NULL OR d.created_at >= $1::timestamptz)
          AND ($2::timestamptz IS NULL OR d.created_at <= $2::timestamptz)
      ) stats ON true
      WHERE ($3::text IS NULL OR t."clinicName" ILIKE '%' || $3::text || '%' OR t."slug" ILIKE '%' || $3::text || '%')
        AND ($4::boolean IS NULL OR t."smsEnabled" = $4::boolean)
    `;

    type ClinicDbRow = {
      clinicId: string;
      clinicName: string;
      slug: string;
      schemaName: string;
      smsEnabled: boolean;
      tenantStatus: string;
      createdAt: Date | string;
      totalCount: number;
      totalSent: number;
      delivered: number;
      failed: number;
      skipped: number;
      lastSentAt: Date | string | null;
    };

    type TotalsDbRow = {
      totalClinics: number;
      enabledClinics: number;
      totalSent: number;
      totalDelivered: number;
      totalFailed: number;
      totalSkipped: number;
    };

    const [rows, countRows, totalsRows] = await Promise.all([
      this.prisma.$queryRawUnsafe<ClinicDbRow[]>(
        itemsQuery,
        fromIso,
        toIso,
        q,
        smsEnabledFilter,
        limit,
        offset,
      ),
      this.prisma.$queryRawUnsafe<Array<{ count: number }>>(
        countQuery,
        q,
        smsEnabledFilter,
      ),
      this.prisma.$queryRawUnsafe<TotalsDbRow[]>(
        totalsQuery,
        fromIso,
        toIso,
        q,
        smsEnabledFilter,
      ),
    ]);

    const total = Number(countRows[0]?.count ?? 0);
    const agg = totalsRows[0];
    const totalSent = Number(agg?.totalSent ?? 0);
    const totalDelivered = Number(agg?.totalDelivered ?? 0);
    const deliveryRate =
      totalSent > 0 ? Number(((totalDelivered / totalSent) * 100).toFixed(1)) : 100;
    const UNIT_PRICE_LKR = 0.6; // SMSLenz standard per-credit rate in LKR
    const totalSpendLkr = Number((totalSent * UNIT_PRICE_LKR).toFixed(2));

    const items = rows.map((r) => {
      const sent = Number(r.totalSent ?? 0);
      const delivered = Number(r.delivered ?? 0);
      const failed = Number(r.failed ?? 0);
      const skipped = Number(r.skipped ?? 0);
      const credits = sent;
      const spendLkr = Number((sent * UNIT_PRICE_LKR).toFixed(2));
      const clinicDeliveryRate = sent > 0 ? Number(((delivered / sent) * 100).toFixed(1)) : 100;

      return {
        clinicId: r.clinicId,
        clinicName: r.clinicName,
        slug: r.slug,
        schemaName: r.schemaName,
        smsEnabled: r.smsEnabled,
        tenantStatus: r.tenantStatus,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
        totalSent: sent,
        delivered,
        failed,
        skipped,
        credits,
        spendLkr,
        deliveryRate: clinicDeliveryRate,
        lastSentAt: r.lastSentAt ? new Date(r.lastSentAt).toISOString() : null,
      };
    });

    return {
      totals: {
        totalClinics: Number(agg?.totalClinics ?? 0),
        enabledClinics: Number(agg?.enabledClinics ?? 0),
        totalSent,
        totalDelivered,
        totalFailed: Number(agg?.totalFailed ?? 0),
        totalSkipped: Number(agg?.totalSkipped ?? 0),
        totalSpendLkr,
        deliveryRate,
      },
      items,
      total,
      limit,
      offset,
      from: fromIso,
      to: toIso,
    };
  }

  private async ensureRow(): Promise<GatewayRow> {
    const existing = await this.prisma.platformSmsGateway.findUnique({
      where: { id: PLATFORM_SMS_GATEWAY_ID },
    });
    if (existing) return existing;

    let sealed = { ciphertext: '', nonce: '' };
    try {
      sealed = sealSecret('b706c1f8-0231-4d15-bb1a-d4616f3e3ef6');
    } catch {
      // Secret key may not be set in basic test harness
    }

    return this.prisma.platformSmsGateway.create({
      data: {
        id: PLATFORM_SMS_GATEWAY_ID,
        enabled: Boolean(sealed.ciphertext),
        baseUrl: 'https://smslenz.lk',
        userId: '1862',
        senderId: 'DARTCODES',
        connectionTimeoutMs: 30_000,
        readTimeoutMs: 30_000,
        apiKeyCiphertext: sealed.ciphertext,
        apiKeyNonce: sealed.nonce,
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
