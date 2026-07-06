/**
 * Fails fast at boot with a clear message instead of crashing later with a
 * cryptic connection error. Wired into ConfigModule.forRoot({ validate }).
 */
const REQUIRED = ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET'] as const;

// known placeholder values that must never reach production
const PLACEHOLDER_SECRETS = new Set([
  'change-me-in-production',
  'dev-only-secret-change-me',
]);

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const missing = REQUIRED.filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if (process.env.NODE_ENV === 'production') {
    const secret = String(config.JWT_SECRET);
    if (PLACEHOLDER_SECRETS.has(secret) || secret.length < 16) {
      throw new Error(
        'JWT_SECRET is a placeholder or too short (<16 chars) — set a strong secret before running in production',
      );
    }
  }

  return config;
}
