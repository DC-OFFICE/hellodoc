import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import { hashToken } from '../common/crypto.util.js';
import { generateSessionToken } from '../common/crypto.util.js';
import { normalizeEmail } from '../common/identifiers.js';
import { PasswordService } from '../common/password.service.js';
import { openSecret, sealSecret } from '../common/secret-box.js';
import { generateTotpSecret, otpauthUrl, base32Decode, acceptedTotpStep } from '../common/totp.js';
import { SessionService } from '../auth/session.service.js';
import { PrismaPlatformService } from '../platform/prisma-platform.service.js';

type PublicClinicRole = 'clinic_manager' | 'clinic_doctor' | 'clinic_cashier' | 'clinic_receptionist';

function publicRole(role: string): PublicClinicRole {
  if (role === 'CLINIC_DOCTOR') return 'clinic_doctor';
  if (role === 'CLINIC_CASHIER') return 'clinic_cashier';
  if (role === 'CLINIC_RECEPTIONIST') return 'clinic_receptionist';
  return 'clinic_manager';
}

@Injectable()
export class ClinicAuthService {
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
      include: {
        memberships: {
          where: { active: true, role: { in: ['CLINIC_MANAGER', 'CLINIC_DOCTOR', 'CLINIC_CASHIER', 'CLINIC_RECEPTIONIST'] } },
          include: { tenant: true },
        },
      },
    });

    const invalid = async () => {
      await this.passwords.verify(
        '$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        password,
      ).catch(() => false);
      throw new UnauthorizedException('Invalid email or password');
    };

    if (!user?.active) await invalid();

    const ok = await this.passwords.verify(user!.passwordHash, password);
    if (!ok) await invalid();

    const eligible = user!.memberships.filter((m) => m.tenant.status === 'ACTIVE');
    if (eligible.length === 0) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (eligible.length > 1) {
      throw new UnauthorizedException(
        'Multiple clinic memberships require explicit clinic selection (not available in Phase 1 UI)',
      );
    }

    const membership = eligible[0]!;
    const mfa = await this.prisma.$queryRawUnsafe<Array<{ confirmed_at: Date | null }>>(
      `SELECT confirmed_at FROM platform.user_mfa WHERE user_id = $1::uuid`,
      user!.id,
    );
    if (mfa[0]?.confirmed_at) {
      const mfaToken = generateSessionToken();
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO platform.mfa_challenges (id, user_id, token_hash, tenant_id, expires_at)
         VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5)`,
        randomUUID(),
        user!.id,
        hashToken(mfaToken),
        membership.tenantId,
        new Date(Date.now() + 5 * 60 * 1000),
      );
      return { mfaRequired: true as const, mfaToken };
    }

    const session = await this.sessions.createSession({
      userId: user!.id,
      context: 'clinic',
      activeTenantId: membership.tenantId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    await this.audit.record({
      actorId: user!.id,
      action: 'clinic.login',
      targetType: 'tenant',
      targetId: membership.tenantId,
    });

    return {
      token: session.token,
      expiresAt: session.expiresAt,
      user: {
        id: user!.id,
        name: user!.name,
        email: user!.email,
        role: publicRole(membership.role),
        tenantId: membership.tenantId,
        clinicName: membership.tenant.clinicName,
      },
    };
  }

  async me(session: { userId: string; activeTenantId: string | null }) {
    if (!session.activeTenantId) throw new UnauthorizedException('Authentication required');
    const membership = await this.prisma.tenantMembership.findFirst({
      where: {
        userId: session.userId,
        tenantId: session.activeTenantId,
        active: true,
        role: { in: ['CLINIC_MANAGER', 'CLINIC_DOCTOR', 'CLINIC_CASHIER', 'CLINIC_RECEPTIONIST'] },
      },
      include: { tenant: true, user: true },
    });
    if (!membership || membership.tenant.status !== 'ACTIVE' || !membership.user.active) {
      throw new UnauthorizedException('Authentication required');
    }
    return {
      id: membership.user.id,
      name: membership.user.name,
      email: membership.user.email,
      role: publicRole(membership.role),
      tenantId: membership.tenantId,
      clinicName: membership.tenant.clinicName,
    };
  }

  async enrollMfa(userId: string, email: string) {
    const existing = await this.prisma.$queryRawUnsafe<Array<{ confirmed_at: Date | null }>>(
      `SELECT confirmed_at FROM platform.user_mfa WHERE user_id = $1::uuid`,
      userId,
    );
    if (existing[0]?.confirmed_at) {
      throw new BadRequestException({ code: 'MFA_ALREADY_ENABLED', message: 'MFA is already enabled' });
    }
    const secret = generateTotpSecret();
    const sealed = sealSecret(secret);
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO platform.user_mfa (user_id, secret_ciphertext, secret_nonce)
       VALUES ($1::uuid, $2, $3)
       ON CONFLICT (user_id) DO UPDATE
         SET secret_ciphertext = EXCLUDED.secret_ciphertext,
             secret_nonce = EXCLUDED.secret_nonce,
             confirmed_at = NULL`,
      userId,
      sealed.ciphertext,
      sealed.nonce,
    );
    return { otpauthUrl: otpauthUrl(email, secret), secret };
  }

  async confirmMfa(userId: string, code: string) {
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ secret_ciphertext: string; secret_nonce: string; confirmed_at: Date | null }>
    >(
      `SELECT secret_ciphertext, secret_nonce, confirmed_at FROM platform.user_mfa WHERE user_id = $1::uuid`,
      userId,
    );
    const row = rows[0];
    if (!row) throw new BadRequestException({ code: 'MFA_NOT_ENROLLED', message: 'Start MFA enrollment first' });
    const secret = openSecret(row.secret_ciphertext, row.secret_nonce);
    const step = acceptedTotpStep(base32Decode(secret), code);
    if (step === null) {
      throw new ForbiddenException({ code: 'INVALID_MFA_CODE', message: 'The authentication code is not valid' });
    }
    await this.prisma.$executeRawUnsafe(
      `UPDATE platform.user_mfa SET confirmed_at = NOW(), last_accepted_step = $2::bigint WHERE user_id = $1::uuid`,
      userId,
      step.toString(),
    );
    const recoveryCodes = await this.replaceRecoveryCodes(userId);
    await this.sessions.revokeUserSessions(userId);
    await this.audit.record({ actorId: userId, action: 'auth.mfa_enabled', targetType: 'user', targetId: userId });
    return { enabled: true, recoveryCodes };
  }

  async disableMfa(userId: string, password: string, code: string) {
    const user = await this.prisma.platformUser.findUnique({ where: { id: userId } });
    if (!user || !(await this.passwords.verify(user.passwordHash, password))) {
      throw new ForbiddenException({ code: 'INVALID_MFA_CODE', message: 'Password was not accepted' });
    }
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ secret_ciphertext: string; secret_nonce: string; last_accepted_step: bigint | null }>
    >(
      `SELECT secret_ciphertext, secret_nonce, last_accepted_step FROM platform.user_mfa
       WHERE user_id = $1::uuid AND confirmed_at IS NOT NULL`,
      userId,
    );
    if (!rows[0]) throw new BadRequestException({ code: 'MFA_NOT_ENROLLED', message: 'MFA is not enabled' });
    const secret = openSecret(rows[0].secret_ciphertext, rows[0].secret_nonce);
    const step = acceptedTotpStep(base32Decode(secret), code);
    const previous = rows[0].last_accepted_step === null ? null : BigInt(rows[0].last_accepted_step);
    const freshTotp = step !== null && (previous === null || step > previous);
    if (!freshTotp) {
      const recovery = code.trim().toLowerCase();
      if (!/^[0-9a-f]{32}$/.test(recovery)) {
        throw new ForbiddenException({ code: 'INVALID_MFA_CODE', message: 'The authentication code is not valid' });
      }
      const used = await this.prisma.$executeRawUnsafe(
        `UPDATE platform.user_mfa_recovery_codes
         SET used_at = NOW()
         WHERE user_id = $1::uuid AND code_hash = $2 AND used_at IS NULL`,
        userId,
        createHash('sha256').update(recovery).digest('hex'),
      );
      if (Number(used) !== 1) {
        throw new ForbiddenException({ code: 'INVALID_MFA_CODE', message: 'The authentication code is not valid' });
      }
    }
    await this.prisma.$executeRawUnsafe(`DELETE FROM platform.user_mfa_recovery_codes WHERE user_id = $1::uuid`, userId);
    await this.prisma.$executeRawUnsafe(`DELETE FROM platform.user_mfa WHERE user_id = $1::uuid`, userId);
    await this.sessions.revokeUserSessions(userId);
    await this.audit.record({ actorId: userId, action: 'auth.mfa_disabled', targetType: 'user', targetId: userId });
    return { disabled: true };
  }

  async verifyMfaLogin(mfaToken: string, code: string, meta: { ip?: string; userAgent?: string }) {
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ id: string; user_id: string; tenant_id: string; expires_at: Date }>
    >(
      `SELECT id, user_id, tenant_id, expires_at
       FROM platform.mfa_challenges
       WHERE token_hash = $1 AND consumed_at IS NULL
       LIMIT 1`,
      hashToken(mfaToken),
    );
    const challenge = rows[0];
    if (!challenge || !challenge.tenant_id || new Date(challenge.expires_at).getTime() < Date.now()) {
      throw new UnauthorizedException('Authentication required');
    }
    const secretRow = await this.prisma.$queryRawUnsafe<
      Array<{ secret_ciphertext: string; secret_nonce: string; last_accepted_step: string | null }>
    >(
      `SELECT secret_ciphertext, secret_nonce, last_accepted_step::text
       FROM platform.user_mfa
       WHERE user_id = $1::uuid AND confirmed_at IS NOT NULL`,
      challenge.user_id,
    );
    if (!secretRow[0] || !(await this.acceptMfaProof(challenge.user_id, secretRow[0], code))) {
      throw new ForbiddenException({ code: 'INVALID_MFA_CODE', message: 'The authentication code is not valid' });
    }
    await this.prisma.$executeRawUnsafe(
      `UPDATE platform.mfa_challenges SET consumed_at = NOW() WHERE id = $1::uuid AND consumed_at IS NULL`,
      challenge.id,
    );
    const user = await this.prisma.platformUser.findUnique({ where: { id: challenge.user_id } });
    const membership = await this.prisma.tenantMembership.findFirst({
      where: { userId: challenge.user_id, tenantId: challenge.tenant_id, active: true },
      include: { tenant: true },
    });
    if (!user?.active || !membership || membership.tenant.status !== 'ACTIVE') {
      throw new UnauthorizedException('Authentication required');
    }
    const session = await this.sessions.createSession({
      userId: user.id,
      context: 'clinic',
      activeTenantId: membership.tenantId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    await this.audit.record({
      actorId: user.id,
      action: 'clinic.login',
      targetType: 'tenant',
      targetId: membership.tenantId,
      metadata: { mfa: true },
    });
    return {
      token: session.token,
      expiresAt: session.expiresAt,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: publicRole(membership.role),
        tenantId: membership.tenantId,
        clinicName: membership.tenant.clinicName,
      },
    };
  }

  async verifyPlatformMfaLogin(mfaToken: string, code: string, meta: { ip?: string; userAgent?: string }) {
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ id: string; user_id: string; tenant_id: string | null; expires_at: Date }>
    >(
      `SELECT id, user_id, tenant_id, expires_at
       FROM platform.mfa_challenges
       WHERE token_hash = $1 AND consumed_at IS NULL AND tenant_id IS NULL
       LIMIT 1`,
      hashToken(mfaToken),
    );
    const challenge = rows[0];
    if (!challenge || new Date(challenge.expires_at).getTime() < Date.now()) {
      throw new UnauthorizedException('Authentication required');
    }
    const secretRow = await this.prisma.$queryRawUnsafe<
      Array<{ secret_ciphertext: string; secret_nonce: string; last_accepted_step: string | null }>
    >(
      `SELECT secret_ciphertext, secret_nonce, last_accepted_step::text
       FROM platform.user_mfa WHERE user_id = $1::uuid AND confirmed_at IS NOT NULL`,
      challenge.user_id,
    );
    if (!secretRow[0] || !(await this.acceptMfaProof(challenge.user_id, secretRow[0], code))) {
      throw new ForbiddenException({ code: 'INVALID_MFA_CODE', message: 'The authentication code is not valid' });
    }
    await this.prisma.$executeRawUnsafe(
      `UPDATE platform.mfa_challenges SET consumed_at = NOW() WHERE id = $1::uuid AND consumed_at IS NULL`,
      challenge.id,
    );
    const user = await this.prisma.platformUser.findUnique({
      where: { id: challenge.user_id },
      include: { platformAdmin: true },
    });
    if (!user?.active || !user.platformAdmin?.active) throw new UnauthorizedException('Authentication required');
    const session = await this.sessions.createSession({
      userId: user.id,
      context: 'platform',
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    await this.audit.record({
      actorId: user.id,
      action: 'platform.login',
      targetType: 'platform_user',
      targetId: user.id,
      metadata: { mfa: true },
    });
    return {
      token: session.token,
      expiresAt: session.expiresAt,
      user: { id: user.id, name: user.name, email: user.email, role: 'platform_admin' as const },
    };
  }

  private async replaceRecoveryCodes(userId: string): Promise<string[]> {
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM platform.user_mfa_recovery_codes WHERE user_id = $1::uuid`,
      userId,
    );
    const codes: string[] = [];
    for (let index = 0; index < 8; index += 1) {
      const code = randomBytes(16).toString('hex');
      codes.push(code);
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO platform.user_mfa_recovery_codes (id, user_id, code_hash) VALUES ($1::uuid, $2::uuid, $3)`,
        randomUUID(),
        userId,
        createHash('sha256').update(code).digest('hex'),
      );
    }
    return codes;
  }

  private async acceptMfaProof(
    userId: string,
    secretRow: { secret_ciphertext: string; secret_nonce: string; last_accepted_step: string | null },
    code: string,
  ): Promise<boolean> {
    const step = acceptedTotpStep(base32Decode(openSecret(secretRow.secret_ciphertext, secretRow.secret_nonce)), code);
    if (step !== null) {
      const previous = secretRow.last_accepted_step === null ? null : BigInt(secretRow.last_accepted_step);
      if (previous !== null && step <= previous) return false;
      await this.prisma.$executeRawUnsafe(
        `UPDATE platform.user_mfa SET last_accepted_step = $2::bigint WHERE user_id = $1::uuid`,
        userId,
        step.toString(),
      );
      return true;
    }
    const recovery = code.trim().toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(recovery)) return false;
    const used = await this.prisma.$executeRawUnsafe(
      `UPDATE platform.user_mfa_recovery_codes
       SET used_at = NOW()
       WHERE user_id = $1::uuid AND code_hash = $2 AND used_at IS NULL`,
      userId,
      createHash('sha256').update(recovery).digest('hex'),
    );
    return Number(used) === 1;
  }
}
