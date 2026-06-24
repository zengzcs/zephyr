import { Injectable, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Database } = require('bun:sqlite');

export interface LogEntry {
  id?: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  module?: string;
  message: string;
  data?: Record<string, any> | string;
  created_at?: number;
}

@Injectable()
export class LogService implements OnModuleInit {
  private logDir: string;
  private maxLogsInDb = 10000; // 最多保留 10000 条日志在数据库中

  constructor() {
    this.logDir = path.join(process.cwd(), 'data', 'logs');
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  async onModuleInit() {
    console.log('📋 LogService initialized');
  }

  /**
   * 记录日志到 SQLite
   */
  log(entry: LogEntry) {
    try {
      const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'data', 'zephyr.db');
      const db = new Database(dbPath);

      const dataStr = entry.data ? JSON.stringify(entry.data) : null;

      db.run(
        `INSERT INTO logs (level, module, message, data, created_at) VALUES (?, ?, ?, ?, ?)`,
        entry.level,
        entry.module || 'unknown',
        entry.message,
        dataStr,
        entry.created_at || Math.floor(Date.now() / 1000),
      );

      // 定期清理旧日志
      this.cleanup();

      db.close();
    } catch (error) {
      // 日志记录失败不影响主流程
      console.error('❌ Failed to write log:', error);
    }
  }

  /**
   * 记录不同级别的日志
   */
  info(message: string, data?: any, module?: string) {
    this.log({ level: 'info', message, data, module });
  }

  warn(message: string, data?: any, module?: string) {
    this.log({ level: 'warn', message, data, module });
  }

  error(message: string, data?: any, module?: string) {
    this.log({ level: 'error', message, data, module });
  }

  debug(message: string, data?: any, module?: string) {
    this.log({ level: 'debug', message, data, module });
  }

  /**
   * 清理旧日志，归档到压缩文件
   */
  private cleanup() {
    try {
      const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'data', 'zephyr.db');
      const db = new Database(dbPath);

      // 获取日志总数
      const count = db.prepare('SELECT COUNT(*) as count FROM logs').get() as { count: number };

      if (count.count > this.maxLogsInDb) {
        // 获取要归档的日志 ID 范围
        const oldestLogs = db.prepare(
          `SELECT id, level, module, message, data, created_at FROM logs WHERE id <= (
            SELECT id FROM logs ORDER BY id ASC LIMIT 1 OFFSET ?
          ) ORDER BY created_at ASC`,
          count.count - this.maxLogsInDb,
        ).all() as LogEntry[];

        if (oldestLogs.length > 0) {
          // 归档到压缩文件
          this.archiveLogs(oldestLogs);

          // 删除已归档的日志
          db.run(`DELETE FROM logs WHERE id <= ?`, oldestLogs[oldestLogs.length - 1].id);
        }
      }

      db.close();
    } catch (error) {
      console.error('❌ Log cleanup failed:', error);
    }
  }

  /**
   * 将日志归档到压缩的 JSON 文件
   */
  private archiveLogs(logs: LogEntry[]) {
    const now = new Date();
    const filename = `logs_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.json.gz`;
    const filepath = path.join(this.logDir, filename);

    try {
      const json = JSON.stringify(logs, null, 2);
      const compressed = zlib.gzipSync(Buffer.from(json, 'utf-8'));

      fs.writeFileSync(filepath, compressed);
      console.log(`📦 Archived ${logs.length} logs to ${filepath}`);

      // 只保留最近 7 天的归档文件
      this.cleanupArchives();
    } catch (error) {
      console.error('❌ Log archive failed:', error);
    }
  }

  /**
   * 清理超过 7 天的归档文件
   */
  private cleanupArchives() {
    try {
      const files = fs.readdirSync(this.logDir).filter(f => f.endsWith('.json.gz'));
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

      for (const file of files) {
        const stats = fs.statSync(path.join(this.logDir, file));
        if (stats.mtimeMs < cutoff) {
          fs.unlinkSync(path.join(this.logDir, file));
          console.log(`🗑️ Deleted old archive: ${file}`);
        }
      }
    } catch (error) {
      console.error('❌ Archive cleanup failed:', error);
    }
  }

  /**
   * 查询日志（用于 API）
   */
  queryLogs(
    page = 1,
    pageSize = 50,
    level?: string,
    module?: string,
  ) {
    try {
      const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'data', 'zephyr.db');
      const db = new Database(dbPath);

      let query = 'SELECT * FROM logs WHERE 1=1';
      const params: any[] = [];

      if (level) {
        query += ' AND level = ?';
        params.push(level);
      }

      if (module) {
        query += ' AND module = ?';
        params.push(module);
      }

      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(pageSize, (page - 1) * pageSize);

      const logs = db.prepare(query).all(...params) as LogEntry[];
      const total = db.prepare('SELECT COUNT(*) as count FROM logs WHERE 1=1').get() as { count: number };

      db.close();

      return {
        logs,
        total: total.count,
        page,
        pageSize,
        totalPages: Math.ceil(total.count / pageSize),
      };
    } catch (error) {
      console.error('❌ Log query failed:', error);
      return { logs: [], total: 0, page, pageSize, totalPages: 0 };
    }
  }

  /**
   * 获取日志统计信息
   */
  getLogStats() {
    try {
      const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'data', 'zephyr.db');
      const db = new Database(dbPath);

      const stats = db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN level = 'info' THEN 1 ELSE 0 END) as info_count,
          SUM(CASE WHEN level = 'warn' THEN 1 ELSE 0 END) as warn_count,
          SUM(CASE WHEN level = 'error' THEN 1 ELSE 0 END) as error_count,
          SUM(CASE WHEN level = 'debug' THEN 1 ELSE 0 END) as debug_count
        FROM logs
      `).get() as {
        total: number;
        info_count: number;
        warn_count: number;
        error_count: number;
        debug_count: number;
      };

      // 获取归档文件信息
      const archives = fs.readdirSync(this.logDir).filter(f => f.endsWith('.json.gz'));
      const archiveSize = archives.length;

      db.close();

      return {
        ...stats,
        archive_count: archiveSize,
        archive_size: archiveSize,
      };
    } catch (error) {
      console.error('❌ Log stats failed:', error);
      return { total: 0, info_count: 0, warn_count: 0, error_count: 0, debug_count: 0, archive_count: 0, archive_size: 0 };
    }
  }

  /**
   * 清空日志
   */
  clearLogs() {
    try {
      const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'data', 'zephyr.db');
      const db = new Database(dbPath);

      db.run('DELETE FROM logs');
      db.close();

      console.log('🗑️ All logs cleared');
    } catch (error) {
      console.error('❌ Log clear failed:', error);
    }
  }
}
