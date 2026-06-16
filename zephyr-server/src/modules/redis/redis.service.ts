import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;

  constructor() {
    const host = process.env.REDIS_HOST || 'localhost';
    const port = parseInt(process.env.REDIS_PORT || '6379', 10);
    const password = process.env.REDIS_PASSWORD || undefined;
    const db = parseInt(process.env.REDIS_DB || '0', 10);

    this.client = new Redis(port, host, {
      password,
      db,
      retryStrategy: (times) => {
        if (times > 5) {
          console.warn('⚠️ Redis retry limit reached, continuing without cache');
          return null;
        }
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    this.client.on('error', (err) => {
      console.error('❌ Redis error:', err.message);
    });
  }

  async onModuleInit() {
    try {
      await this.client.connect();
      console.log('✅ Redis connected');
    } catch (error) {
      console.warn('⚠️ Redis connection failed, running without cache');
    }
  }

  async onModuleDestroy() {
    await this.client.quit();
    console.log('🔌 Redis disconnected');
  }

  getClient(): Redis {
    return this.client;
  }

  // Cache operations
  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    try {
      if (ttl) {
        await this.client.setex(key, ttl, JSON.stringify(value));
      } else {
        await this.client.set(key, JSON.stringify(value));
      }
    } catch (error) {
      console.error('Redis set error:', error);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      console.error('Redis del error:', error);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      return (await this.client.exists(key)) === 1;
    } catch {
      return false;
    }
  }

  // Session operations
  async setSession(sessionId: string, data: unknown, ttl: number): Promise<void> {
    await this.set(`session:${sessionId}`, data, ttl);
  }

  async getSession<T>(sessionId: string): Promise<T | null> {
    return this.get<T>(`session:${sessionId}`);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.del(`session:${sessionId}`);
  }

  // Rate limiting
  async incrementRateLimit(key: string, ttl: number): Promise<number> {
    try {
      const count = await this.client.incr(key);
      if (count === 1) {
        await this.client.expire(key, ttl);
      }
      return count;
    } catch {
      return 0;
    }
  }

  async checkRateLimit(key: string, limit: number): boolean {
    const count = await this.incrementRateLimit(key, 60);
    return count <= limit;
  }
}
