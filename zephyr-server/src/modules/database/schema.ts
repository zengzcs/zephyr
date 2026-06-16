import { pgTable, text, integer, timestamp, boolean } from 'drizzle-orm/pg-core';
import { sqliteTable, text, integer, blob, integer as sqliteInt, sqliteBoolean } from 'drizzle-orm/sql-core';

// Users
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  avatar: text('avatar'),
  role: text('role').default('user').notNull(),
  isActive: sqliteBoolean('is_active').default(true).notNull(),
  lastLoginAt: timestamp('last_login_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Sessions (stored in Redis, but schema for reference)
export const sessions = sqliteTable('sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id).notNull(),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Audit log
export const auditLogs = sqliteTable('audit_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id),
  action: text('action').notNull(),
  entity: text('entity'),
  entityId: text('entity_id'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  details: text('details', { mode: 'json' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
