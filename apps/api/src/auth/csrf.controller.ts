import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { randomBytes } from 'node:crypto';
import { Public } from './decorators.js';
import { setCsrfCookie } from './cookie.util.js';

@Controller('csrf')
export class CsrfController {
  @Public()
  @Get()
  getToken(@Res({ passthrough: true }) res: Response) {
    const token = randomBytes(32).toString('base64url');
    setCsrfCookie(res, token);
    return { csrfToken: token };
  }
}
