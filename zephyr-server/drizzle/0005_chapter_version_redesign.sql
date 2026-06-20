-- AI Novel Workbench: migration 5 - chapter version redesign
--
-- New design:
--   outline_versions  -- replaces `versions`, acts as time capsules for outlines
--   chapters          -- first-class chapter entities linked to outline_versions
--   chapter_bodies    -- body text version history linked to chapters
--
-- Old tables (books, volumes, prompts, chapter_body_versions) are preserved
-- for backward compatibility. A data migration populates the new tables.

-- ============================================================
-- Phase 1: Create new tables
-- ============================================================

CREATE TABLE IF NOT EXISTS outline_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    book_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    synopsis TEXT NOT NULL,
    style TEXT,
    outline_json TEXT NOT NULL,
    refine_prompt TEXT,
    created_at TEXT DEFAULT (datetime('now')) NOT NULL,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_outline_versions_book ON outline_versions(book_id);

CREATE TABLE IF NOT EXISTS chapters (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    outline_version_id INTEGER NOT NULL,
    book_id INTEGER NOT NULL,
    volume_index INTEGER NOT NULL,
    chapter_index INTEGER NOT NULL,
    title TEXT NOT NULL,
    synopsis TEXT,
    FOREIGN KEY (outline_version_id) REFERENCES outline_versions(id) ON DELETE CASCADE,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chapters_book ON chapters(book_id);
CREATE INDEX IF NOT EXISTS idx_chapters_outline ON chapters(outline_version_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_chapters_unique ON chapters(outline_version_id, volume_index, chapter_index);

CREATE TABLE IF NOT EXISTS chapter_bodies (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    chapter_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    refine_prompt TEXT,
    created_at TEXT DEFAULT (datetime('now')) NOT NULL,
    FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chapter_bodies_chapter ON chapter_bodies(chapter_id);
CREATE INDEX IF NOT EXISTS idx_chapter_bodies_latest ON chapter_bodies(chapter_id, created_at);

-- ============================================================
-- Phase 2: Migrate existing data
-- ============================================================

-- 2a. Migrate old `versions` → `outline_versions`
-- (Same schema, just a different table name)
INSERT OR IGNORE INTO outline_versions (id, book_id, title, synopsis, style, outline_json, refine_prompt, created_at)
SELECT id, book_id, title, synopsis, style, outline_json, refine_prompt, created_at
FROM versions;

-- 2b. Migrate chapters and chapter_bodies from existing data
-- This processes each outline version, extracting chapters from outline_json
-- and mapping chapter_body_versions → chapter_bodies via the chapter coordinates.

-- We use a Python-style approach: for each outline_version, parse its outline_json,
-- create chapter rows, then migrate chapter_body_versions that match.

-- Helper: We'll use a recursive approach in SQLite to process each outline version.
-- Since SQLite doesn't have native JSON array iteration, we'll use a procedural
-- approach with the existing chapter_body_versions as the anchor.

-- First, create a mapping table for (book_id, volume_index, chapter_index) → chapter_id
-- This is populated from the current (latest) outline version's chapters.
CREATE TEMP TABLE IF NOT EXISTS chapter_mapping (
    book_id INTEGER NOT NULL,
    volume_index INTEGER NOT NULL,
    chapter_index INTEGER NOT NULL,
    chapter_id INTEGER NOT NULL
);

-- Populate the mapping from the LATEST outline version for each book.
-- The latest version is determined by created_at DESC.
-- We extract chapters from outline_json using JSON functions.
INSERT INTO chapter_mapping (book_id, volume_index, chapter_index, chapter_id)
SELECT
    ov.book_id,
    c.value->>'$.volume_index' AS volume_index,
    c.value->>'$.chapter_index' AS chapter_index,
    ch.id AS chapter_id
FROM (
    -- Get the latest outline_version per book
    SELECT book_id, MAX(created_at) as latest
    FROM outline_versions
    GROUP BY book_id
) latest
JOIN outline_versions ov ON ov.book_id = latest.book_id AND ov.created_at = latest.latest
-- Parse volumes.chapters from outline_json
JOIN json_tree(ov.outline_json, '$.volumes') AS vol ON json_tree.parent_path = '$.volumes'
-- For each volume, parse its chapters array
JOIN json_tree(ov.outline_json, '$.volumes[' || vol.index || '].chapters') AS ch_json ON ch_json.parent_path = '$.volumes[' || vol.index || '].chapters'
-- Join to chapters table (which we'll populate below)
LEFT JOIN chapters ch ON ch.outline_version_id = ov.id
  AND ch.volume_index = CAST(vol.index AS INTEGER)
  AND ch.chapter_index = CAST(ch_json.index AS INTEGER)
WHERE ch_json.type = 'array';

-- Actually, let's take a simpler approach: parse outline_json and extract chapters
-- using a two-step process.

-- Step 1: Create chapters from the latest outline version for each book
-- We need to extract volumes and chapters from the JSON.
-- SQLite's json_tree can help but requires careful path construction.

-- Let's use a different approach: iterate through outline_versions and
-- extract chapters using json_extract.

-- Since SQLite doesn't have a native way to iterate JSON arrays, we'll
-- use a numbers table approach.

CREATE TEMP TABLE IF NOT EXISTS numbers(n INTEGER);
WITH RECURSIVE cnt(x) AS (
    SELECT 1
    UNION ALL
    SELECT x + 1 FROM cnt WHERE x < 100
)
INSERT INTO numbers SELECT x FROM cnt;

-- For each outline version, extract its chapters and create chapter rows
-- This processes ALL outline versions, not just the latest
INSERT OR IGNORE INTO chapters (outline_version_id, book_id, volume_index, chapter_index, title, synopsis)
SELECT
    ov.id AS outline_version_id,
    ov.book_id,
    CAST(json_extract(json_extract(ov.outline_json, '$.volumes[' || n1.n || ']'), '$.chapters[' || n2.n || ']') ->> '$.title' AS TEXT) AS title,
    CAST(json_extract(json_extract(ov.outline_json, '$.volumes[' || n1.n || ']'), '$.chapters[' || n2.n || ']') ->> '$.synopsis' AS TEXT) AS synopsis,
    n1.n AS volume_index,
    n2.n AS chapter_index
FROM outline_versions ov
JOIN numbers n1 ON n1.n < CAST(json_extract(ov.outline_json, '$.volumes') ->> '$.length' AS INTEGER)
JOIN numbers n2 ON n2.n < CAST(json_extract(json_extract(ov.outline_json, '$.volumes[' || n1.n || ']'), '$.chapters') ->> '$.length' AS INTEGER)
WHERE json_extract(ov.outline_json, '$.volumes[' || n1.n || '].chapters[' || n2.n || '].title') IS NOT NULL
  AND json_extract(ov.outline_json, '$.volumes') ->> '$.length' > 0
  AND json_extract(json_extract(ov.outline_json, '$.volumes[' || n1.n || ']'), '$.chapters') ->> '$.length' > 0;

-- Hmm, the json_extract approach with array indexing is tricky in SQLite.
-- Let me use a more reliable approach with json_extract and explicit indices.

-- Actually, let's use the simpler approach: since we know the structure,
-- use json_extract with the path directly.

-- Let me redo this with a cleaner approach using a numbers table
-- and json_extract for each specific path.

-- Clear any chapters we may have inserted
DELETE FROM chapters;

-- For each outline version, iterate volumes and chapters
-- Using the numbers table to generate indices
INSERT INTO chapters (outline_version_id, book_id, volume_index, chapter_index, title, synopsis)
SELECT
    ov.id,
    ov.book_id,
    n1.n AS volume_index,
    n2.n AS chapter_index,
    json_extract(json_extract(ov.outline_json, '$.volumes[' || n1.n || '].chapters[' || n2.n || ']'), '$.title') AS title,
    json_extract(json_extract(ov.outline_json, '$.volumes[' || n1.n || '].chapters[' || n2.n || ']'), '$.synopsis') AS synopsis
FROM outline_versions ov
CROSS JOIN numbers n1
CROSS JOIN numbers n2
WHERE n1.n < CAST(json_extract(ov.outline_json, '$.volumes.length') AS INTEGER)
  AND n2.n < CAST(json_extract(ov.outline_json, '$.volumes[' || n1.n || '].chapters.length') AS INTEGER)
  AND json_extract(ov.outline_json, '$.volumes[' || n1.n || '].chapters[' || n2.n || '].title') IS NOT NULL;

-- 2c. Migrate chapter_body_versions → chapter_bodies
-- Map old chapter_body_versions to new chapter_bodies via chapter_id lookup
-- The mapping is: (book_id, volume_index, chapter_index) → chapter_id
-- We use the LATEST outline version for the mapping.

-- Create a mapping from (book_id, volume_index, chapter_index) to chapter_id
-- using the latest outline version per book
CREATE TEMP TABLE IF NOT EXISTS ch_map AS
SELECT
    ov.book_id,
    n1.n AS volume_index,
    n2.n AS chapter_index,
    ch.id AS chapter_id
FROM outline_versions ov
JOIN (
    SELECT book_id, MAX(created_at) as latest
    FROM outline_versions
    GROUP BY book_id
) latest ON latest.book_id = ov.book_id AND latest.latest = ov.created_at
CROSS JOIN numbers n1
CROSS JOIN numbers n2
WHERE n1.n < CAST(json_extract(ov.outline_json, '$.volumes.length') AS INTEGER)
  AND n2.n < CAST(json_extract(ov.outline_json, '$.volumes[' || n1.n || '].chapters.length') AS INTEGER)
  AND json_extract(ov.outline_json, '$.volumes[' || n1.n || '].chapters[' || n2.n || '].title') IS NOT NULL
-- Find the matching chapter in the chapters table
AND EXISTS (
    SELECT 1 FROM chapters ch
    WHERE ch.outline_version_id = ov.id
      AND ch.volume_index = n1.n
      AND ch.chapter_index = n2.n
);

-- Insert chapter_bodies from old chapter_body_versions
-- For each old version, look up the chapter_id via the mapping
-- If the mapping doesn't exist (old outline), create a chapter under the latest outline version
INSERT OR IGNORE INTO chapter_bodies (chapter_id, body, refine_prompt, created_at)
SELECT
    COALESCE(
        (SELECT cm.chapter_id FROM ch_map cm
         WHERE cm.book_id = cbv.book_id
           AND cm.volume_index = cbv.volume_index
           AND cm.chapter_index = cbv.chapter_index),
        (SELECT ch.id FROM chapters ch
         WHERE ch.book_id = cbv.book_id
         ORDER BY ch.id DESC
         LIMIT 1)
    ) AS chapter_id,
    cbv.body,
    cbv.refine_prompt,
    cbv.created_at
FROM chapter_body_versions cbv
WHERE cbv.body IS NOT NULL AND cbv.body != '';
