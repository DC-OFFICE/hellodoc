import { BadRequestException, Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentSession, Public, Roles } from '../auth/decorators.js';
import { clearSessionCookie, setSessionCookie } from '../auth/cookie.util.js';
import { PLATFORM_SESSION_COOKIE } from '../auth/auth.constants.js';
import type { AuthenticatedSession } from '../auth/session.service.js';
import { SessionService } from '../auth/session.service.js';
import { LoginDto } from './dto/login.dto.js';
import { ClinicAuthService } from '../clinic-auth/clinic-auth.service.js';
import { PlatformAuthService } from './platform-auth.service.js';

@Controller('platform-auth')
export class PlatformAuthController {
  constructor(
    private readonly auth: PlatformAuthService,
    private readonly sessions: SessionService,
    private readonly clinicAuth: ClinicAuthService,
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
    setSessionCookie(res, 'platform', result.token, result.expiresAt);
    return { user: result.user };
  }

  @Public()
  @Throttle({ default: { limit: Number(process.env.THROTTLE_LOGIN_LIMIT ?? 10), ttl: 60_000 } })
  @Post('mfa/verify')
  @HttpCode(200)
  async verifyMfa() {
    throw new BadRequestException('Two-factor authentication is disabled');
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[PLATFORM_SESSION_COOKIE] as string | undefined;
    await this.sessions.revokeSession(token);
    clearSessionCookie(res, 'platform');
    return { ok: true };
  }

  @Roles('platform_admin')
  @Get('me')
  me(@CurrentSession() session: AuthenticatedSession) {
    return this.auth.me(session.userId);
  }

  @Roles('platform_admin')
  @Post('mfa/enroll')
  async enroll() {
    throw new BadRequestException('Two-factor authentication is disabled');
  }

  @Roles('platform_admin')
  @Post('mfa/confirm')
  confirm() {
    throw new BadRequestException('Two-factor authentication is disabled');
  }

  @Roles('platform_admin')
  @Post('mfa/disable')
  async disable() {
    return { ok: true, mfaDisabled: true };
  }
}
