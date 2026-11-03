// src/config/connections.ts
// One place that turns environment variables into Redis/Postgres settings,
// so the API and the document worker connect the same way on every host:
//  - Hosted (Render, Upstash, Neon, ...): REDIS_URL / DATABASE_URL
//  - Docker / local: REDIS_HOST + REDIS_PORT, DATABASE_URL or DB_* parts
import type { RedisOptions } from 'ioredis';

type Env = Record<string, string | undefined>;

const isTrue = (value?: string) =>
  ['1', 'true', 'yes', 'require'].includes((value || '').toLowerCase());

/**
 * Redis connection options. REDIS_URL wins when set; a rediss:// URL (or
 * REDIS_TLS=true) turns on TLS, which hosted Redis usually needs from
 * outside its private network.
 */
export function redisOptions(env: Env = process.env): RedisOptions {
  if (env.REDIS_URL) {
    const url = new URL(env.REDIS_URL);
    const db = url.pathname.replace('/', '');
    return {
      host: url.hostname,
      port: Number(url.port || 6379),
      username: url.username ? decodeURIComponent(url.username) : undefined,
      password: url.password ? decodeURIComponent(url.password) : undefined,
      db: db ? Number(db) : undefined,
      tls: url.protocol === 'rediss:' || isTrue(env.REDIS_TLS) ? {} : undefined,
    };
  }

  return {
    host: env.REDIS_HOST || '127.0.0.1',
    port: Number(env.REDIS_PORT || 6379),
    password: env.REDIS_PASSWORD || undefined,
    tls: isTrue(env.REDIS_TLS) ? {} : undefined,
  };
}

/** host:port for logs — never includes credentials */
export function describeRedis(env: Env = process.env): string {
  const { host, port, tls } = redisOptions(env);
  return `${host}:${port}${tls ? ' (TLS)' : ''}`;
}

// Supabase: db.<ref>.supabase.co (direct) and *.pooler.supabase.com (pooler)
const SUPABASE_HOST = /\.supabase\.(co|com)$/i;

// URL params node-postgres reads itself and that would override our `ssl`
// object (e.g. sslmode=require silently turns on strict verification)
const SSL_URL_PARAMS = ['sslmode', 'ssl', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat'];

type DatabaseSsl = false | { rejectUnauthorized: boolean; ca?: string };

function databaseHost(env: Env): string | undefined {
  if (!env.DATABASE_URL) return env.DB_HOST;
  try {
    return new URL(env.DATABASE_URL).hostname;
  } catch {
    return undefined;
  }
}

/** Whether the configured database is hosted by Supabase */
export function isSupabase(env: Env = process.env): boolean {
  return SUPABASE_HOST.test(databaseHost(env) || '');
}

/** DB_SSL_CA may hold the PEM itself or a path to the .crt file */
function readCa(value: string): string {
  if (value.includes('-----BEGIN')) return value.replace(/\\n/g, '\n');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('fs') as typeof import('fs')).readFileSync(value, 'utf8');
}

/**
 * Postgres SSL, decided here rather than by URL params:
 *  - DB_SSL=true/false wins; otherwise sslmode in the URL; otherwise on for
 *    Supabase and off for everything else (Render's internal URL, Docker).
 *  - With DB_SSL_CA (Supabase: Database settings → SSL certificate) the
 *    certificate is verified; without it the connection is still encrypted.
 */
function databaseSsl(env: Env): DatabaseSsl {
  const sslmode = /[?&]sslmode=([a-z-]+)/i.exec(env.DATABASE_URL || '')?.[1];

  let enabled: boolean;
  if (env.DB_SSL !== undefined && env.DB_SSL !== '') enabled = isTrue(env.DB_SSL);
  else if (sslmode) enabled = sslmode.toLowerCase() !== 'disable';
  else enabled = isSupabase(env);

  if (!enabled) return false;
  if (env.DB_SSL_CA) return { rejectUnauthorized: true, ca: readCa(env.DB_SSL_CA) };
  return {
    rejectUnauthorized:
      isTrue(env.DB_SSL_REJECT_UNAUTHORIZED) ||
      /^verify-(ca|full)$/i.test(sslmode || ''),
  };
}

function stripSslParams(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    SSL_URL_PARAMS.forEach((param) => url.searchParams.delete(param));
    return url.toString();
  } catch {
    return rawUrl;
  }
}

export interface DatabaseConnection {
  url?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
  ssl: DatabaseSsl;
  /** Passed to node-postgres' pool */
  extra: { max: number };
}

/**
 * Connections per process. Supabase's pooler caps clients (15 on the
 * smallest plan) and the API and worker each hold a pool, so default lower
 * there.
 */
function poolMax(env: Env): number {
  const configured = Number(env.DB_POOL_MAX);
  if (configured > 0) return configured;
  return isSupabase(env) ? 5 : 10;
}

/** Postgres connection: DATABASE_URL, or DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD/DB_NAME */
export function databaseConnection(env: Env = process.env): DatabaseConnection {
  const ssl = databaseSsl(env);
  const extra = { max: poolMax(env) };

  if (env.DATABASE_URL) {
    return { url: stripSslParams(env.DATABASE_URL), ssl, extra };
  }

  return {
    host: env.DB_HOST,
    port: Number(env.DB_PORT || 5432),
    username: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    ssl,
    extra,
  };
}

/** host/db for logs — never includes credentials */
export function describeDatabase(env: Env = process.env): string {
  const conn = databaseConnection(env);
  const flags = [
    conn.ssl ? (conn.ssl.rejectUnauthorized ? 'SSL verified' : 'SSL') : '',
    `pool ${conn.extra.max}`,
  ]
    .filter(Boolean)
    .join(', ');
  if (conn.url) {
    try {
      const url = new URL(conn.url);
      return `${url.hostname}:${url.port || 5432}${url.pathname} (${flags})`;
    } catch {
      return 'DATABASE_URL (unparseable)';
    }
  }
  return `${conn.host}:${conn.port}/${conn.database} (${flags})`;
}

/**
 * Setup problems worth flagging at startup. Logged, never thrown, since the
 * setup might still work in a given environment.
 */
export function databaseWarnings(env: Env = process.env): string[] {
  const host = databaseHost(env) || '';
  const warnings: string[] = [];

  if (/^db\.[a-z0-9]+\.supabase\.co$/i.test(host)) {
    warnings.push(
      "Supabase direct host is IPv6-only unless you bought the IPv4 add-on. Hosts without IPv6 (e.g. Render) can't reach it — use the Session pooler connection string instead.",
    );
  }

  if (/\.pooler\.supabase\.com$/i.test(host)) {
    try {
      if (new URL(env.DATABASE_URL || '').port === '6543') {
        warnings.push(
          'Supabase Transaction pooler (port 6543) is meant for serverless functions. For this long-running server use the Session pooler (port 5432).',
        );
      }
    } catch {
      // ignore unparseable URLs
    }
  }

  return warnings;
}

/**
 * Supabase publishes the `public` schema through its REST API with a public
 * key, so tables there must have row level security on. Enabled for Supabase
 * by default; DB_ENABLE_RLS=true/false overrides.
 */
export function shouldEnableRls(env: Env = process.env): boolean {
  if (env.DB_ENABLE_RLS !== undefined && env.DB_ENABLE_RLS !== '') {
    return isTrue(env.DB_ENABLE_RLS);
  }
  return isSupabase(env);
}

/**
 * Whether TypeORM should create/update tables on startup. Always on in
 * development; elsewhere only when DB_SYNCHRONIZE=true (useful for the very
 * first deploy to an empty database).
 */
export function shouldSynchronize(env: Env = process.env): boolean {
  return env.NODE_ENV === 'development' || isTrue(env.DB_SYNCHRONIZE);
}

/**
 * Allowed browser origins. CORS_ORIGINS is a comma-separated list; entries
 * may use a leading wildcard ("https://*.vercel.app") for preview deploys.
 * Unset means any origin (the previous behaviour).
 */
export function corsOrigin(
  env: Env = process.env,
): true | ((origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => void) {
  const entries = (env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);

  if (entries.length === 0 || entries.includes('*')) return true;

  const patterns = entries.map(
    (entry) =>
      new RegExp(
        `^${entry
          .split('*')
          .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
          .join('[^.]+')}$`,
      ),
  );

  return (origin, cb) => {
    // Non-browser requests (curl, health checks) have no Origin header
    if (!origin || patterns.some((p) => p.test(origin))) return cb(null, true);
    cb(null, false);
  };
}
