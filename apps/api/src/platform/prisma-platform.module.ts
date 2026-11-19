import { Global, Module } from '@nestjs/common';
import { PrismaPlatformService } from './prisma-platform.service.js';

@Global()
@Module({
  providers: [PrismaPlatformService],
  exports: [PrismaPlatformService],
})
export class PrismaPlatformModule {}
