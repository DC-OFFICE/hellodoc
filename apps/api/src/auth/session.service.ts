import { Injectable, UnauthorizedException } from '@nestjs/common';
import { generateSessionToken, hashOptional, hashToken } from '../common/crypto.util.js';
import { PrismaPlatformService } from '../platform/prisma-platform.service.js';

export type SessionContext = 'platform' | 'clinic';

export type AuthenticatedSession = {
  sessionId: string;
  userId: string;
  context: SessionContext;
  activeTenantId: string | null;
  email: string;
  name: string;
  isPlatformAdmin: boolean;
};

const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaPlatformService) {}

  async createSession(input: {
    userId: string;
    context: SessionContext;
    activeTenantId?: string | null;
    ip?: string;
    userAgent?: string;
  }): Promise<{ token: string; expiresAt: Date }> {
    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await this.prisma.authSession.create({
      data: {
        userId: input.userId,
        tokenHash: hashToken(token),
        context: input.context,
        activeTenantId: input.activeTenantId ?? null,
        expiresAt,
        ipHash: hashOptional(input.ip),
        userAgentHash: hashOptional(input.userAgent),
      },
    });
    return { token, expiresAt };
  }

  async resolveSession(token: string | undefined | null): Promise<AuthenticatedSession> {
    if (!token) throw new UnauthorizedException('Authentication required');
    const tokenHash = hashToken(token);
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: { platformAdmin: true },
        },
      },
    });
    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Authentication required');
    }
    if (!session.user.active) {
      throw new UnauthorizedException('Authentication required');
    }
    await this.prisma.authSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });
    return {
      sessionId: session.id,
      userId: session.userId,
      context: session.context as SessionContext,
      activeTenantId: session.activeTenantId,
      email: session.user.email,
      name: session.user.name,
      isPlatformAdmin: Boolean(session.user.platformAdmin?.active),
    };
  }

  async revokeSession(token: string | undefined | null): Promise<void> {
    if (!token) return;
    await this.prisma.authSession.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeUserSessions(userId: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeTenantSessions(tenantId: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { activeTenantId: tenantId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
