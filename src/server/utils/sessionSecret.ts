import crypto from 'crypto';

export const MIN_SECRET_LENGTH = 16;
export const RECOMMENDED_SECRET_LENGTH = 32;

export const DISALLOWED_DEFAULT_SECRETS = [
  'nova-storage-session-secret-key',
  'your_session_secret_here',
  'a-very-long-and-secure-random-secret-key-32-chars',
  'INFORME_AQUI_UMA_CHAVE_CRIPTOGRAFICA_COM_PELO_MENOS_32_CARACTERES',
  'INFORME_AQUI_UMA_STRING_ALEATORIA_COM_NO_MINIMO_32_CARACTERES'
];

export interface SessionSecretStatus {
  configured: boolean;
  present: boolean;
  length: number;
  meetsMinimumLength: boolean;
  secret: string | null;
}

let ephemeralDevSecret: string | null = null;

/**
 * Resolves SESSION_SECRET with tolerance for:
 * - Exact key (process.env.SESSION_SECRET)
 * - Trailing/leading whitespace in variable names or values (common in cloud UIs)
 * - Surrounding quotes ("secret" or 'secret')
 * - Common aliases (APP_SESSION_SECRET, AUTH_SECRET)
 * - Minimum entropy check (at least 16 chars, 32 recommended)
 * Never exposes the secret value in logs or status responses.
 */
export function resolveSessionSecret(): SessionSecretStatus {
  // 1. Direct environment variable lookup
  let raw: string | undefined = process.env.SESSION_SECRET;

  // 2. Common cloud/framework aliases
  if (!raw) {
    raw = process.env.APP_SESSION_SECRET || process.env.AUTH_SECRET;
  }

  // 3. Case-insensitive and whitespace-tolerant key search in process.env
  if (!raw) {
    for (const [key, value] of Object.entries(process.env)) {
      const normalizedKey = key.trim().toUpperCase();
      if (normalizedKey === 'SESSION_SECRET' || normalizedKey === 'AUTH_SECRET') {
        raw = value;
        break;
      }
    }
  }

  if (!raw || typeof raw !== 'string') {
    return {
      configured: false,
      present: false,
      length: 0,
      meetsMinimumLength: false,
      secret: null
    };
  }

  let cleaned = raw.trim();

  // Strip surrounding quotes if wrapped in "..." or '...'
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  const length = cleaned.length;
  const isDisallowed = DISALLOWED_DEFAULT_SECRETS.includes(cleaned);
  const meetsMinimumLength = length >= MIN_SECRET_LENGTH && !isDisallowed;

  return {
    configured: meetsMinimumLength,
    present: true,
    length,
    meetsMinimumLength,
    secret: meetsMinimumLength ? cleaned : null
  };
}

/**
 * Returns a valid secret string for cookie-parser initialization.
 * In development/test, generates a cryptographically random secret if none is set.
 * In production, returns the verified secret or a placeholder for parser setup
 * (requests are protected by route-level validation).
 */
export function getEffectiveCookieSecret(isProduction: boolean): string {
  const status = resolveSessionSecret();
  if (status.configured && status.secret) {
    return status.secret;
  }

  if (!isProduction) {
    if (!ephemeralDevSecret) {
      ephemeralDevSecret = crypto.randomBytes(32).toString('hex');
    }
    return ephemeralDevSecret;
  }

  return 'unconfigured-production-secret-placeholder-minimum-32-chars';
}
