import express from 'express';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import { healthRouter } from './routes/health.ts';
import { driveRouter } from './routes/drive.ts';
import { mediaInspectRouter } from './routes/mediaInspect.ts';
import { pcloudRouter } from './routes/pcloud.ts';
import { getEffectiveCookieSecret, resolveSessionSecret } from './utils/sessionSecret.ts';

dotenv.config();

export const app = express();
const isProduction = process.env.NODE_ENV === 'production';

// Enable trust proxy for reverse proxies (Vercel Edge, Google Cloud Run)
app.set('trust proxy', 1);

app.use(express.json());

// In serverless runtimes (such as Vercel), req.cookies is pre-populated without signing secrets.
// Reset req.cookies if req.secret is absent so cookie-parser executes full cryptographic signature verification.
app.use((req, _res, next) => {
  if (req.cookies && !(req as any).secret) {
    delete (req as any).cookies;
  }
  next();
});

app.use(cookieParser(getEffectiveCookieSecret(isProduction)));

// Guarantee that req.secret and req.signedCookies are always defined on every request
app.use((req, _res, next) => {
  if (!(req as any).secret) {
    (req as any).secret = getEffectiveCookieSecret(isProduction);
  }
  if (!req.signedCookies) {
    req.signedCookies = Object.create(null);
  }
  if ((req as any)._initialSignedCookies) {
    Object.assign(req.signedCookies, (req as any)._initialSignedCookies);
  }
  next();
});

// Normalização de rota para ambientes serverless (ex: Vercel)
app.use((req, _res, next) => {
  if (req.url && !req.url.startsWith('/api')) {
    if (req.url.startsWith('/storage') || req.url.startsWith('/health')) {
      req.url = `/api${req.url}`;
    }
  }
  next();
});

// Health route is always accessible and does not require session cookies or Redis
app.use(['/api', '/health'], healthRouter);

// Media inspection route with SSRF protection (does not require Drive OAuth credentials)
app.use(['/api/storage', '/storage'], mediaInspectRouter);

// pCloud storage route (uses server-side PCLOUD_ACCESS_TOKEN, decoupled from Drive OAuth and Redis)
app.use(['/api/storage', '/storage'], pcloudRouter);

// Middleware for storage routes: validates production SESSION_SECRET and Upstash config with controlled HTTP response
app.use(['/api/storage', '/storage'], (req, res, next) => {
  if (isProduction) {
    const secretStatus = resolveSessionSecret();
    if (!secretStatus.configured) {
      console.error('[NOVA STORAGE] SESSION_SECRET ausente ou com entropia insuficiente na Vercel.');
      return res.status(500).json({
        configured: false,
        status: 'error',
        code: 'CONFIG_ERROR',
        message: secretStatus.present
          ? `A variável SESSION_SECRET possui apenas ${secretStatus.length} caracteres (mínimo de 16 caracteres, recomendado 32).`
          : 'A variável de ambiente SESSION_SECRET não foi detectada no runtime da Vercel. Certifique-se de que ela está associada ao ambiente de Production e realize um novo Redeploy.',
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

app.use(['/api/storage', '/storage'], driveRouter);

export default app;
