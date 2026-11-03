-- Per-account copyright page details (holder, publisher, contact, edition,
-- extra notice). Safe to run more than once.
ALTER TABLE users ADD COLUMN IF NOT EXISTS copyright JSONB;
