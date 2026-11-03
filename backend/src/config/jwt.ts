// src/config/jwt.ts

// Only ever used outside production, so local dev works without setup
const DEV_FALLBACK_SECRET = 'local-dev-only-jwt-secret';

/**
 * The one JWT secret used to both sign and verify tokens. Production refuses
 * to start without JWT_SECRET, since a known default would let anyone forge
 * logins.
 */
export function jwtSecret(env: Record<string, string | undefined> = process.env): string {
  if (env.JWT_SECRET) return env.JWT_SECRET;
  if (env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  }
  return DEV_FALLBACK_SECRET;
}
