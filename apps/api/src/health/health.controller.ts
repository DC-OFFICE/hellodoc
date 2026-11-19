import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../auth/decorators.js';
import { PrismaPlatformService } from '../platform/prisma-platform.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaPlatformService) {}

  @Public()
  @Get('live')
  live() {
    return { service: 'HelloDoc API', status: 'ok', check: 'liveness' };
  }

  @Public()
  @Get('ready')
  ready() {
    return this.databaseStatus();
  }

  @Public()
  @Get()
  status() {
    return this.databaseStatus();
  }

  private async databaseStatus() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        service: 'HelloDoc API',
        status: 'ok',
        checks: { liveness: 'up', database: 'up' },
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException({
        service: 'HelloDoc API',
        status: 'down',
        checks: { liveness: 'up', database: 'down' },
      });
    }
  }
}
