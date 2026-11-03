// src/health.controller.ts
import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

// Liveness check for hosts and load balancers (Render, Docker): GET /api/health
@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Liveness check' })
  check() {
    return { status: 'ok', uptime: Math.round(process.uptime()) };
  }
}
