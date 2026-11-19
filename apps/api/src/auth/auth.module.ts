import { Global, Module } from '@nestjs/common';
import { PasswordService } from '../common/password.service.js';
import { AuthGuard } from './auth.guard.js';
import { SessionService } from './session.service.js';

@Global()
@Module({
  providers: [SessionService, PasswordService, AuthGuard],
  exports: [SessionService, PasswordService, AuthGuard],
})
export class AuthModule {}
