import express from 'express';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import { healthRouter } from './routes/health.ts';
import { driveRouter } from './routes/drive.ts';
import { getEffectiveCookieSecret, resolveSessionSecret } from './utils/sessionSecret.ts';

dotenv.config();

export const app = express();
const isProduction = process.env.NODE_ENV === 'production';

// Enable trust proxy for reverse proxies (Vercel Edge, Google Cloud Run)
app.set('trust proxy', 1);

app.use(express.json());
app.use(cookieParser(getEffectiveCookieSecret(isProduction)));

// Health route is always accessible and does not require session cookies or Redis
app.use('/api', healthRouter);

// Middleware for storage routes: validates production SESSION_SECRET and Upstash config with controlled HTTP response
app.use('/api/storage', (req, res, next) => {
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

app.use('/api/storage', driveRouter);

export default app;
