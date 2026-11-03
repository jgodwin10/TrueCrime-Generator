-- Biography switch: store who each book is about. Author notes go in the
-- existing "description" column. Safe to run more than once.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS subject VARCHAR(255);
