-- AI Novel Workbench: chapter body versioning support

CREATE TABLE IF NOT EXISTS chapter_body_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    book_id INTEGER NOT NULL,
    volume_index INTEGER NOT NULL,
    chapter_index INTEGER NOT NULL,
    body TEXT NOT NULL,
    refine_prompt TEXT,
    created_at TEXT DEFAULT (datetime('now')) NOT NULL,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chapter_body_versions_lookup
    ON chapter_body_versions(book_id, volume_index, chapter_index, created_at DESC);
