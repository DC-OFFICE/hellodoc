import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { CSRF_COOKIE } from './auth.constants.js';
import { Public } from './decorators.js';
import { setCsrfCookie } from './cookie.util.js';

const CSRF_TOKEN = /^[A-Za-z0-9_-]{43}$/;

@Controller('csrf')
export class CsrfController {
  @Public()
  @Get()
  getToken(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query('rotate') rotate?: string,
  ) {
    const existing = req.cookies?.[CSRF_COOKIE];
    const reuse =
      rotate !== '1' &&
      typeof existing === 'string' &&
      CSRF_TOKEN.test(existing);
    const token = reuse ? existing : randomBytes(32).toString('base64url');
    setCsrfCookie(res, token);
    return { csrfToken: token };
  }
}
