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
  // In development/test, generate an ephemeral random secret if not defined to avoid static fallbacks
  if (!sessionSecretEnv || sessionSecretEnv.length < MIN_SECRET_LENGTH) {
    sessionSecret = crypto.randomBytes(32).toString('hex');
  } else {
    sessionSecret = sessionSecretEnv;
  }
}

app.use(express.json());
app.use(cookieParser(sessionSecret));

// Mount API routes
app.use('/api', healthRouter);
app.use('/api/storage', driveRouter);

export default app;
