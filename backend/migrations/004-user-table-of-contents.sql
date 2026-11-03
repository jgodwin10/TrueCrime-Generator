-- Per-account table of contents format (heading, entry style, detail).
-- Safe to run more than once. The API also applies this on startup.
ALTER TABLE users ADD COLUMN IF NOT EXISTS "tableOfContents" JSONB;
