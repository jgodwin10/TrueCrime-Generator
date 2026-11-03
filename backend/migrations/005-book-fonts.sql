-- Per-account heading and body fonts, and the fonts each book was made with.
-- Safe to run more than once. The API also applies this on startup.
ALTER TABLE users ADD COLUMN IF NOT EXISTS "fonts" JSONB;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS "fonts" JSONB;
