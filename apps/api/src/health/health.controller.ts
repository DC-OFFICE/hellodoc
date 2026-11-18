import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  getStatus() {
    return {
      service: 'HelloDoc API',
      status: 'ok',
      phase: 'project-foundation',
      timestamp: new Date().toISOString(),
    };
  }
}
