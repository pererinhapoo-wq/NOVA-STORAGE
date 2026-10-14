import express from 'express';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import { healthRouter } from './routes/health.ts';
import { driveRouter } from './routes/drive.ts';

dotenv.config();

export const app = express();
const isProduction = process.env.NODE_ENV === 'production';

// Enable trust proxy for reverse proxies (Vercel Edge, Google Cloud Run)
app.set('trust proxy', 1);

// Session secret validation with strict entropy enforcement
const MIN_SECRET_LENGTH = 32;
const DISALLOWED_DEFAULT_SECRETS = [
  'nova-storage-session-secret-key',
  'your_session_secret_here',
  'a-very-long-and-secure-random-secret-key-32-chars',
  'INFORME_AQUI_UMA_CHAVE_CRIPTOGRAFICA_COM_PELO_MENOS_32_CARACTERES',
  'INFORME_AQUI_UMA_STRING_ALEATORIA_COM_NO_MINIMO_32_CARACTERES'
];

let ephemeralDevSecret: string | null = null;

function getCookieSecret(): string {
  const secretEnv = process.env.SESSION_SECRET?.trim();
  if (secretEnv && secretEnv.length >= MIN_SECRET_LENGTH && !DISALLOWED_DEFAULT_SECRETS.includes(secretEnv)) {
    return secretEnv;
  }
  if (!isProduction) {
    if (!ephemeralDevSecret) {
      ephemeralDevSecret = crypto.randomBytes(32).toString('hex');
    }
    return ephemeralDevSecret;
  }
  // In production, fallback string for cookieParser initialization so module loading does not crash.
  // Storage routes are protected by the middleware below with a clear HTTP 500 error instead of killing the process.
  return 'unconfigured-production-secret-placeholder-minimum-32-chars';
}

app.use(express.json());
app.use(cookieParser(getCookieSecret()));

// Health route is always accessible and does not require session cookies or Redis
app.use('/api', healthRouter);

// Middleware for storage routes: validates production SESSION_SECRET and Upstash config with controlled HTTP response
app.use('/api/storage', (req, res, next) => {
  if (isProduction) {
    const secretEnv = process.env.SESSION_SECRET?.trim();
    if (!secretEnv || secretEnv.length < MIN_SECRET_LENGTH || DISALLOWED_DEFAULT_SECRETS.includes(secretEnv)) {
      console.error('[NOVA STORAGE] SESSION_SECRET ausente ou com entropia insuficiente na Vercel (mínimo 32 caracteres).');
      return res.status(500).json({
        configured: false,
        status: 'error',
        code: 'CONFIG_ERROR',
        message: 'A variável de ambiente SESSION_SECRET não está configurada ou possui menos de 32 caracteres na Vercel.',
        checkedAt: new Date().toISOString()
      });
    }

    const kvUrl = process.env.KV_REST_API_URL?.trim();
    const kvToken = process.env.KV_REST_API_TOKEN?.trim();
    if (!kvUrl || !kvToken) {
      console.error('[NOVA STORAGE] Variáveis Upstash Redis (KV_REST_API_URL / KV_REST_API_TOKEN) ausentes em produção.');
      return res.status(500).json({
        configured: false,
        status: 'error',
        code: 'REDIS_CONFIG_ERROR',
        message: 'Variáveis de ambiente KV_REST_API_URL e KV_REST_API_TOKEN são obrigatórias na Vercel para persistência no Upstash Redis.',
        checkedAt: new Date().toISOString()
      });
    }
  }
  next();
});

app.use('/api/storage', driveRouter);

export default app;
