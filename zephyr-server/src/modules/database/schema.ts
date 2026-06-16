import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// AI Novel Workbench tables
export const books = sqliteTable('books', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  synopsis: text('synopsis').notNull(),
  prompt: text('prompt').notNull(), // the one-sentence prompt used to generate
  aiModel: text('ai_model').default('default'),
  status: text('status').default('generating').notNull(), // generating | ready | editing
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(new Date()).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).default(new Date()).notNull(),
});

export const volumes = sqliteTable('volumes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  bookId: integer('book_id').references(() => books.id, { onDelete: 'cascade' }).notNull(),
  order: integer('order').notNull(),
  title: text('title').notNull(),
  theme: text('theme'),
  synopsis: text('synopsis'),
  chapters: text('chapters', { mode: 'json' }), // array of { order, title, synopsis }
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(new Date()).notNull(),
});

export const prompts = sqliteTable('prompts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  bookId: integer('book_id').references(() => books.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // system | user | assistant
  content: text('content', { mode: 'json' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(new Date()).notNull(),
});
