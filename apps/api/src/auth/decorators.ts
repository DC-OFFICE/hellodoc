import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AuthenticatedSession } from './session.service.js';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
export type RequiredRole = 'platform_admin' | 'clinic_manager' | 'clinic_doctor' | 'clinic_cashier' | 'clinic_receptionist';
export const Roles = (...roles: RequiredRole[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentSession = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedSession => {
    const request = ctx.switchToHttp().getRequest<{ session?: AuthenticatedSession }>();
    return request.session as AuthenticatedSession;
  },
);
