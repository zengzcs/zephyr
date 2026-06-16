import { Module } from '@nestjs/common';
import { DatabaseModule } from './modules/database/database.module';
import { RedisModule } from './modules/redis/redis.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [DatabaseModule, RedisModule, HealthModule],
})
export class AppModule {}
