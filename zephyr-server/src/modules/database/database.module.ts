import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { LogModule } from './log.module';

@Module({
  imports: [LogModule],
  providers: [DatabaseService],
  exports: [DatabaseService, LogModule],
})
export class DatabaseModule {}
