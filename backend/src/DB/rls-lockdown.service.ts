// src/DB/rls-lockdown.service.ts
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { shouldEnableRls } from 'src/config/connections';

/**
 * Turns on row level security for the app's tables (Supabase by default).
 *
 * Supabase exposes the `public` schema through its REST API with a public
 * "anon" key. With RLS on and no policies, that API can't read or write
 * these tables. The app is unaffected: it connects as the tables' owner, and
 * owners bypass RLS.
 *
 * Runs after TypeORM has connected (and synchronized), so newly created
 * tables are covered on the same startup.
 */
@Injectable()
export class RlsLockdownService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RlsLockdownService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!shouldEnableRls()) return;

    const tables = this.dataSource.entityMetadatas.map((m) => ({
      schema: m.schema,
      name: m.tableName,
    }));

    let enabled = 0;
    for (const table of tables) {
      try {
        const rows: Array<{ relrowsecurity: boolean }> =
          await this.dataSource.query(
            `SELECT c.relrowsecurity
               FROM pg_class c
               JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE c.relname = $1
                AND n.nspname = COALESCE($2, current_schema())`,
            [table.name, table.schema ?? null],
          );

        // Table not created yet (e.g. synchronize off on an empty database)
        if (rows.length === 0 || rows[0].relrowsecurity) continue;

        const path = table.schema
          ? `"${table.schema}"."${table.name}"`
          : `"${table.name}"`;
        await this.dataSource.query(
          `ALTER TABLE ${path} ENABLE ROW LEVEL SECURITY`,
        );
        enabled++;
      } catch (error) {
        this.logger.warn(
          `Could not enable row level security on "${table.name}": ${(error as Error).message}`,
        );
      }
    }

    this.logger.log(
      enabled > 0
        ? `Row level security enabled on ${enabled} table(s)`
        : 'Row level security already enabled on all tables',
    );
  }
}
