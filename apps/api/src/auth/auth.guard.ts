import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { CLINIC_SESSION_COOKIE, CSRF_COOKIE, CSRF_HEADER, PLATFORM_SESSION_COOKIE } from './auth.constants.js';
import { IS_PUBLIC_KEY, ROLES_KEY, type RequiredRole } from './decorators.js';
import { SessionService, type AuthenticatedSession } from './session.service.js';
import { safeEqual } from '../common/crypto.util.js';
import { PrismaPlatformService } from '../platform/prisma-platform.service.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaPlatformService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const roles = this.reflector.getAllAndOverride<RequiredRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? [];

    const req = context.switchToHttp().getRequest<Request & { session?: AuthenticatedSession }>();
    const method = req.method.toUpperCase();

    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      this.assertCsrf(req);
    }

    if (isPublic && roles.length === 0) {
      return true;
    }

    const wantsPlatform = roles.includes('platform_admin');
    const cookieName = wantsPlatform ? PLATFORM_SESSION_COOKIE : CLINIC_SESSION_COOKIE;
    const token = req.cookies?.[cookieName] as string | undefined;

    let session: AuthenticatedSession;
    try {
      session = await this.sessions.resolveSession(token);
    } catch {
      throw new UnauthorizedException('Authentication required');
    }

    if (wantsPlatform) {
      if (session.context !== 'platform' || !session.isPlatformAdmin) {
        throw new ForbiddenException('Platform administrator access required');
      }
    }

    if (roles.includes('clinic_manager') || roles.includes('clinic_doctor') || roles.includes('clinic_cashier') || roles.includes('clinic_receptionist')) {
      if (session.context !== 'clinic' || !session.activeTenantId) {
        throw new ForbiddenException('Clinic access required');
      }
    }

    req.session = session;
    return true;
  }

  private assertCsrf(req: Request): void {
    const cookieToken = req.cookies?.[CSRF_COOKIE] as string | undefined;
    const headerToken = req.header(CSRF_HEADER);
    if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken)) {
      throw new ForbiddenException('Invalid CSRF token');
    }
  }
}
