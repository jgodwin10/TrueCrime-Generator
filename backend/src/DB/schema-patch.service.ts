// src/DB/schema-patch.service.ts
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Additive columns from backend/migrations/, applied on startup so a deploy
 * with synchronize off doesn't break every query on a table whose entity
 * gained a column nobody migrated. Each statement must be safe to repeat.
 */
const PATCHES = [
  // 004-user-table-of-contents.sql
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS "tableOfContents" JSONB`,
  // 005-book-fonts.sql
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS "fonts" JSONB`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS "fonts" JSONB`,
];

@Injectable()
export class SchemaPatchService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SchemaPatchService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    for (const sql of PATCHES) {
      try {
        await this.dataSource.query(sql);
      } catch (error) {
        // e.g. the table doesn't exist yet on an empty database
        this.logger.warn(`Schema patch skipped (${sql}): ${(error as Error).message}`);
      }
    }
  }
}
