-- AI Novel Workbench tables

CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    title TEXT NOT NULL,
    synopsis TEXT NOT NULL,
    prompt TEXT NOT NULL,
    ai_model TEXT DEFAULT 'default',
    status TEXT DEFAULT 'generating' NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
    updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000) NOT NULL
);

CREATE TABLE IF NOT EXISTS volumes (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    book_id INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    title TEXT NOT NULL,
    theme TEXT,
    synopsis TEXT,
    chapters TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS prompts (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    book_id INTEGER,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);
