import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import { hashToken, generateSessionToken } from '../common/crypto.util.js';
import { normalizeEmail } from '../common/identifiers.js';
import { PasswordService } from '../common/password.service.js';
import { SessionService } from '../auth/session.service.js';
import { PrismaPlatformService } from '../platform/prisma-platform.service.js';

@Injectable()
export class PlatformAuthService {
  constructor(
    private readonly prisma: PrismaPlatformService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  async login(email: string, password: string, meta: { ip?: string; userAgent?: string }) {
    const emailNormalized = normalizeEmail(email);
    const user = await this.prisma.platformUser.findUnique({
      where: { emailNormalized },
      include: { platformAdmin: true },
    });

    const invalid = () => {
      throw new UnauthorizedException('Invalid email or password');
    };

    if (!user?.active || !user.platformAdmin?.active) {
      // Spend comparable time on failed path.
      await this.passwords.verify(
        '$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        password,
      ).catch(() => false);
      invalid();
    }

    const ok = await this.passwords.verify(user!.passwordHash, password);
    if (!ok) invalid();

    const mfa = await this.prisma.$queryRawUnsafe<Array<{ confirmed_at: Date | null }>>(
      `SELECT confirmed_at FROM platform.user_mfa WHERE user_id = $1::uuid`,
      user!.id,
    );
    if (mfa[0]?.confirmed_at) {
      const mfaToken = generateSessionToken();
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO platform.mfa_challenges (id, user_id, token_hash, tenant_id, expires_at)
         VALUES ($1::uuid, $2::uuid, $3, NULL, $4)`,
        randomUUID(),
        user!.id,
        hashToken(mfaToken),
        new Date(Date.now() + 5 * 60 * 1000),
      );
      return { mfaRequired: true as const, mfaToken };
    }

    const session = await this.sessions.createSession({
      userId: user!.id,
      context: 'platform',
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    await this.audit.record({
      actorId: user!.id,
      action: 'platform.login',
      targetType: 'platform_user',
      targetId: user!.id,
    });

    return {
      token: session.token,
      expiresAt: session.expiresAt,
      user: {
        id: user!.id,
        name: user!.name,
        email: user!.email,
        role: 'platform_admin',
      },
    };
  }

  async me(userId: string) {
    const user = await this.prisma.platformUser.findUnique({
      where: { id: userId },
      include: { platformAdmin: true },
    });
    if (!user?.active || !user.platformAdmin?.active) {
      throw new UnauthorizedException('Authentication required');
    }
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: 'platform_admin' as const,
    };
  }
}
