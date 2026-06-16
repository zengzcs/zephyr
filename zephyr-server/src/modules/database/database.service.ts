import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { db, sqlite } from './database';

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

  /** Raw bun:sqlite instance for direct queries (prepare/run/all) */
  getRawDb() {
    return sqlite;
  }
}
