-- Google Play Books switch: books are now generated as EPUB + PDF.
-- Adds the new enum values to an existing database. Safe to run more than once.
-- Covers both the enum names from init-database.sql and the ones TypeORM
-- creates with synchronize (documents_type_enum / jobs_type_enum).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_type') THEN
    ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'EPUB';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'documents_type_enum') THEN
    ALTER TYPE documents_type_enum ADD VALUE IF NOT EXISTS 'EPUB';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'job_type') THEN
    ALTER TYPE job_type ADD VALUE IF NOT EXISTS 'EPUB_GENERATION';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'jobs_type_enum') THEN
    ALTER TYPE jobs_type_enum ADD VALUE IF NOT EXISTS 'EPUB_GENERATION';
  END IF;
END
$$;
