import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as path from 'path';
import * as fs from 'fs';

// Ensure data directory exists
const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/zephyr.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const sqlite = new (require('bun:sqlite').Database)(dbPath);
sqlite.exec('PRAGMA journal_mode = WAL');
sqlite.exec('PRAGMA foreign_keys = ON');

// Migration: add `style` column to `books` if not exists
try { sqlite.exec(`ALTER TABLE books ADD COLUMN style TEXT DEFAULT '默认'`); } catch {}

// Migration: create characters table for character card workbench
try {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prompt TEXT NOT NULL,
    card_json TEXT NOT NULL,
    created_at INTEGER DEFAULT (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
  )`);
} catch {}

// Migration: create character_versions table for version history
try {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS character_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id INTEGER NOT NULL REFERENCES characters(id),
    card_json TEXT NOT NULL,
    refine_prompt TEXT,
    created_at INTEGER DEFAULT (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
  )`);
} catch {}

export const db = drizzle(sqlite);

export type DatabaseType = typeof db;
export { sqlite };
