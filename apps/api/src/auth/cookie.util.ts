import type { Response } from 'express';
import {
  CLINIC_SESSION_COOKIE,
  CSRF_COOKIE,
  PLATFORM_SESSION_COOKIE,
} from './auth.constants.js';

const isProd = process.env.NODE_ENV === 'production';

/**
 * Split static-site + API hosts (e.g. Render *.onrender.com) need SameSite=None
 * so credentialed browser calls and EventSource include session cookies.
 * Same-site deployments keep Lax.
 */
function cookieSameSite(): 'lax' | 'none' {
  const raw = (process.env.COOKIE_SAMESITE ?? 'lax').trim().toLowerCase();
  return raw === 'none' ? 'none' : 'lax';
}

function cookieSecure(sameSite: 'lax' | 'none'): boolean {
  return sameSite === 'none' ? true : isProd;
}

export function setSessionCookie(
  res: Response,
  kind: 'clinic' | 'platform',
  token: string,
  expiresAt: Date,
): void {
  const name = kind === 'clinic' ? CLINIC_SESSION_COOKIE : PLATFORM_SESSION_COOKIE;
  const sameSite = cookieSameSite();
  res.cookie(name, token, {
    httpOnly: true,
    sameSite,
    secure: cookieSecure(sameSite),
    path: '/',
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: Response, kind: 'clinic' | 'platform'): void {
  const name = kind === 'clinic' ? CLINIC_SESSION_COOKIE : PLATFORM_SESSION_COOKIE;
  const sameSite = cookieSameSite();
  res.clearCookie(name, {
    httpOnly: true,
    sameSite,
    secure: cookieSecure(sameSite),
    path: '/',
  });
}

export function setCsrfCookie(res: Response, token: string): void {
  const sameSite = cookieSameSite();
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    sameSite,
    secure: cookieSecure(sameSite),
    path: '/',
  });
}

export function clearCsrfCookie(res: Response): void {
  const sameSite = cookieSameSite();
  res.clearCookie(CSRF_COOKIE, {
    httpOnly: false,
    sameSite,
    secure: cookieSecure(sameSite),
    path: '/',
  });
}
