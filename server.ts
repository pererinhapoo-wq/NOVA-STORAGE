import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import { healthRouter } from './src/server/routes/health.ts';
import { driveRouter } from './src/server/routes/drive.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import crypto from 'crypto';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const isProduction = process.env.NODE_ENV === 'production';

// Configure trust proxy for Google Cloud Run reverse proxy in production
if (isProduction) {
  app.set('trust proxy', 1);
}

// Session secret validation with strict entropy enforcement
const MIN_SECRET_LENGTH = 32;
const DISALLOWED_DEFAULT_SECRETS = [
  'nova-storage-session-secret-key',
  'your_session_secret_here',
  'a-very-long-and-secure-random-secret-key-32-chars',
  'INFORME_AQUI_UMA_CHAVE_CRIPTOGRAFICA_COM_PELO_MENOS_32_CARACTERES',
  'INFORME_AQUI_UMA_STRING_ALEATORIA_COM_NO_MINIMO_32_CARACTERES'
];

const sessionSecretEnv = process.env.SESSION_SECRET?.trim();
let sessionSecret: string;

if (isProduction) {
  if (!sessionSecretEnv) {
    console.error('[ERRO CRÍTICO DE SEGURANÇA] SESSION_SECRET ausente no ambiente de produção.');
    console.error('Defina a variável SESSION_SECRET com no mínimo 32 caracteres criptograficamente aleatórios.');
    process.exit(1);
  }

  if (sessionSecretEnv.length < MIN_SECRET_LENGTH || DISALLOWED_DEFAULT_SECRETS.includes(sessionSecretEnv)) {
    console.error('[ERRO CRÍTICO DE SEGURANÇA] SESSION_SECRET não atende aos requisitos de entropia em produção.');
    console.error(`O segredo deve possuir pelo menos ${MIN_SECRET_LENGTH} caracteres e não ser um valor padrão.`);
    process.exit(1);
  }

  sessionSecret = sessionSecretEnv;
} else {
  // In development, generate an ephemeral random secret if not defined to avoid static fallbacks
  if (!sessionSecretEnv || sessionSecretEnv.length < MIN_SECRET_LENGTH) {
    sessionSecret = crypto.randomBytes(32).toString('hex');
    console.warn('[NOVA STORAGE] SESSION_SECRET não configurado ou com baixa entropia. Um segredo efêmero aleatório foi gerado para esta sessão de desenvolvimento.');
  } else {
    sessionSecret = sessionSecretEnv;
  }
}

app.use(express.json());
app.use(cookieParser(sessionSecret));

// API Routes
app.use('/api', healthRouter);
app.use('/api/storage', driveRouter);

// Frontend integration: Vite middleware in development, static build in production
if (process.env.NODE_ENV === 'production') {
  const distPath = path.resolve(__dirname, 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.resolve(distPath, 'index.html'));
  });
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({
    server: {
      middlewareMode: true,
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[NOVA STORAGE] Servidor backend ativo na porta ${PORT}`);
  console.log(`[NOVA STORAGE] Rota de integridade disponível em http://localhost:${PORT}/api/health`);
});
