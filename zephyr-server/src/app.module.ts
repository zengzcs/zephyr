import { Module } from '@nestjs/common';
import { DatabaseModule } from './modules/database/database.module';
import { RedisModule } from './modules/redis/redis.module';
import { HealthModule } from './modules/health/health.module';
import { MonitorModule } from './modules/monitor/monitor.module';

@Module({
  imports: [DatabaseModule, RedisModule, HealthModule, MonitorModule],
})
export class AppModule {}
