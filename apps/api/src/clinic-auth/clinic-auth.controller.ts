import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CLINIC_SESSION_COOKIE } from '../auth/auth.constants.js';
import { clearSessionCookie, setSessionCookie } from '../auth/cookie.util.js';
import { CurrentSession, Public, Roles } from '../auth/decorators.js';
import type { AuthenticatedSession } from '../auth/session.service.js';
import { SessionService } from '../auth/session.service.js';
import { LoginDto } from '../platform-auth/dto/login.dto.js';
import { MfaCodeDto, MfaVerifyDto, DisableMfaDto } from '../clinic-billing/dto/billing.dto.js';
import { ClinicAuthService } from './clinic-auth.service.js';

@Controller('clinic-auth')
export class ClinicAuthController {
  constructor(
    private readonly auth: ClinicAuthService,
    private readonly sessions: SessionService,
  ) {}

  @Public()
  @Throttle({ default: { limit: Number(process.env.THROTTLE_LOGIN_LIMIT ?? 10), ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto.email, dto.password, {
      ip: req.ip,
      userAgent: req.header('user-agent') ?? undefined,
    });
    if ('mfaRequired' in result) {
      return { mfaRequired: true, mfaToken: result.mfaToken };
    }
    setSessionCookie(res, 'clinic', result.token, result.expiresAt);
    return { user: result.user };
  }

  @Public()
  @Throttle({ default: { limit: Number(process.env.THROTTLE_LOGIN_LIMIT ?? 10), ttl: 60_000 } })
  @Post('mfa/verify')
  @HttpCode(200)
  async verifyMfa(
    @Body() dto: MfaVerifyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.verifyMfaLogin(dto.mfaToken, dto.code, {
      ip: req.ip,
      userAgent: req.header('user-agent') ?? undefined,
    });
    setSessionCookie(res, 'clinic', result.token, result.expiresAt);
    return { user: result.user };
  }

  @Roles('clinic_manager', 'clinic_doctor', 'clinic_cashier', 'clinic_receptionist')
  @Post('mfa/enroll')
  enroll(@CurrentSession() session: AuthenticatedSession) {
    return this.auth.me(session).then((user) => this.auth.enrollMfa(session.userId, user.email));
  }

  @Roles('clinic_manager', 'clinic_doctor', 'clinic_cashier', 'clinic_receptionist')
  @Post('mfa/confirm')
  confirm(@CurrentSession() session: AuthenticatedSession, @Body() dto: MfaCodeDto) {
    return this.auth.confirmMfa(session.userId, dto.code);
  }

  @Roles('clinic_manager', 'clinic_doctor', 'clinic_cashier', 'clinic_receptionist')
  @Post('mfa/disable')
  async disable(
    @CurrentSession() session: AuthenticatedSession,
    @Body() dto: DisableMfaDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.disableMfa(session.userId, dto.password, dto.code);
    clearSessionCookie(res, 'clinic');
    return result;
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[CLINIC_SESSION_COOKIE] as string | undefined;
    await this.sessions.revokeSession(token);
    clearSessionCookie(res, 'clinic');
    return { ok: true };
  }

  @Roles('clinic_manager', 'clinic_doctor', 'clinic_cashier', 'clinic_receptionist')
  @Get('me')
  me(@CurrentSession() session: AuthenticatedSession) {
    return this.auth.me(session);
  }
}
