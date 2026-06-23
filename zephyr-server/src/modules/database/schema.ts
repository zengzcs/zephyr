import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

// AI Novel Workbench tables

// --- books ---
export const books = sqliteTable('books', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  synopsis: text('synopsis').notNull(),
  prompt: text('prompt').notNull(),
  style: text('style').default('默认'),
  aiModel: text('ai_model').default('default'),
  status: text('status').default('generating').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(new Date()).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).default(new Date()).notNull(),
});

// --- volumes ---
// Represents a volume within a book. The `chapters` JSON stores the outline-level
// chapter metadata (title, synopsis) for quick reference. This table is managed
// by the outline system (generate/refine) and is NOT the authoritative source
// for chapter bodies.
export const volumes = sqliteTable('volumes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  bookId: integer('book_id').references(() => books.id, { onDelete: 'cascade' }).notNull(),
  order: integer('order').notNull(),
  title: text('title').notNull(),
  theme: text('theme'),
  synopsis: text('synopsis'),
  chapters: text('chapters', { mode: 'json' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(new Date()).notNull(),
});

// --- prompts ---
export const prompts = sqliteTable('prompts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  bookId: integer('book_id').references(() => books.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  content: text('content', { mode: 'json' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(new Date()).notNull(),
});

// --- outline_versions ---
// Each outline version is a "time capsule" of the book outline at a point in time.
// It stores the outline JSON (title, synopsis, style, volumes) and a user prompt.
// This replaces the old `versions` table.
export const outlineVersions = sqliteTable('outline_versions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  bookId: integer('book_id').references(() => books.id, { onDelete: 'cascade' }).notNull(),
  title: text('title').notNull(),
  synopsis: text('synopsis').notNull(),
  style: text('style'),
  outlineJson: text('outline_json').notNull(),
  refinePrompt: text('refine_prompt'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(new Date()).notNull(),
}, (table) => ({
  bookIdx: index('idx_outline_versions_book').on(table.bookId),
}));

// --- chapters ---
// Each chapter belongs to exactly one outline version. This is the core of the
// new design: chapters are a first-class entity, not buried in JSON.
// When an outline is refined, old chapters become historical and new chapters
// are created linked to the new outline version.
export const chapters = sqliteTable('chapters', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  outlineVersionId: integer('outline_version_id')
    .references(() => outlineVersions.id, { onDelete: 'cascade' }).notNull(),
  bookId: integer('book_id').references(() => books.id, { onDelete: 'cascade' }).notNull(),
  volumeIndex: integer('volume_index').notNull(),
  chapterIndex: integer('chapter_index').notNull(),
  title: text('title').notNull(),
  synopsis: text('synopsis'),
}, (table) => ({
  // Fast lookup: "all chapters for a chapter body version query"
  chapterBookIdx: index('idx_chapters_book').on(table.bookId),
  // Fast lookup: "all chapters in a specific outline version"
  chapterOutlineIdx: index('idx_chapters_outline').on(table.outlineVersionId),
  // Unique chapter identity within an outline version
  chapterUniqueIdx: index('idx_chapters_unique').on(table.outlineVersionId, table.volumeIndex, table.chapterIndex),
}));

// --- chapter_bodies ---
// Tracks the body text history of each chapter. Each entry is a version of the
// chapter's prose. The latest entry per chapter is the "current" body.
export const chapterBodies = sqliteTable('chapter_bodies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  chapterId: integer('chapter_id')
    .references(() => chapters.id, { onDelete: 'cascade' }).notNull(),
  body: text('body').notNull(),
  refinePrompt: text('refine_prompt'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(new Date()).notNull(),
}, (table) => ({
  // Fast lookup: "all body versions for a chapter"
  bodyChapterIdx: index('idx_chapter_bodies_chapter').on(table.chapterId),
  // Fast lookup: "current body for a chapter (latest)"
  bodyChapterLatestIdx: index('idx_chapter_bodies_latest').on(table.chapterId, table.createdAt),
}));

// --- characters ---
// Stores AI-generated female character cards. Each character is a complete card
// with detailed attributes for novel workbench integration.
export const characters = sqliteTable('characters', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  prompt: text('prompt').notNull(), // The user inspiration prompt
  cardJson: text('card_json', { mode: 'json' }).notNull(), // Full character card data
  image: text('image'), // Base64-encoded character image
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(new Date()).notNull(),
});
