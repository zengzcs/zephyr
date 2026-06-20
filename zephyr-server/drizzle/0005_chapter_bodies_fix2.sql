-- AI Novel Workbench: migration 5 - chapter_bodies migration (fixed)

-- Create nums table
CREATE TEMP TABLE IF NOT EXISTS nums(n INTEGER);
WITH RECURSIVE cnt(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM cnt WHERE x < 100)
INSERT INTO nums SELECT x FROM cnt;

-- Create mapping: (book_id, volume_index+1, chapter_index+1) → chapter_id
-- chapter_body_versions uses 0-based indices, chapters uses 1-based
CREATE TEMP TABLE IF NOT EXISTS ch_map (
    book_id INTEGER NOT NULL,
    volume_index INTEGER NOT NULL,
    chapter_index INTEGER NOT NULL,
    chapter_id INTEGER NOT NULL
);

INSERT INTO ch_map (book_id, volume_index, chapter_index, chapter_id)
SELECT DISTINCT
    ov.book_id,
    n1.n - 1 AS volume_index,
    n2.n - 1 AS chapter_index,
    ch.id AS chapter_id
FROM outline_versions ov
JOIN (
    SELECT book_id, MAX(created_at) as latest
    FROM outline_versions
    GROUP BY book_id
) latest ON latest.book_id = ov.book_id AND latest.latest = ov.created_at
CROSS JOIN nums n1
CROSS JOIN nums n2
CROSS JOIN chapters ch
WHERE ov.id = ch.outline_version_id
  AND ch.volume_index = n1.n
  AND ch.chapter_index = n2.n
  AND json_extract(ov.outline_json, '$.volumes[' || n1.n || '].chapters[' || n2.n || '].title') IS NOT NULL
  AND json_extract(ov.outline_json, '$.volumes[' || n1.n || '].chapters[' || n2.n || '].title') != '';

-- Migrate chapter_bodies
INSERT INTO chapter_bodies (chapter_id, body, refine_prompt, created_at)
SELECT
    cm.chapter_id,
    cbv.body,
    cbv.refine_prompt,
    cbv.created_at
FROM chapter_body_versions cbv
JOIN ch_map cm ON cm.book_id = cbv.book_id
  AND cm.volume_index = cbv.volume_index
  AND cm.chapter_index = cbv.chapter_index
WHERE cbv.body IS NOT NULL AND cbv.body != '';

SELECT 'Chapter bodies migrated: ' || COUNT(*) FROM chapter_bodies;

DROP TABLE IF EXISTS nums;
DROP TABLE IF EXISTS ch_map;
