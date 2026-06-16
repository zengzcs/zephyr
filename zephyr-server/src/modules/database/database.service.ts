import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { db } from './database';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    console.log('✅ Database connected (Bun:SQLite)');
  }

  async onModuleDestroy() {
    console.log('🔌 Database disconnected');
  }

  getDb() {
    return db;
  }
}
