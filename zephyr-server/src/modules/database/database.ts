import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

// Ensure data directory exists
const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/zephyr.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite);

export type DatabaseType = typeof db;
