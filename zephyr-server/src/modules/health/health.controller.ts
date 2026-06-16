import { Controller, Get } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { DatabaseService } from '../database/database.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly redisService: RedisService,
    private readonly databaseService: DatabaseService,
  ) {}

  @Get()
  async check() {
    const result: Record<string, any> = {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };

    // Check database
    try {
      this.databaseService.getRawDb().exec('SELECT 1');
      result.database = 'connected';
    } catch {
      result.database = 'disconnected';
      result.status = 'degraded';
    }

    // Check Redis
    try {
      await this.redisService.getClient().ping();
      result.redis = 'connected';
    } catch {
      result.redis = 'disconnected';
      result.status = 'degraded';
    }

    return result;
  }
}
