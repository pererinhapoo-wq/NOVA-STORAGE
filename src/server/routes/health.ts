import express from 'express';
import type { Request, Response } from 'express';

export const healthRouter = express.Router();

const startTime = Date.now();

healthRouter.get('/health', (_req: Request, res: Response) => {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  const hasOAuthConfig = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

  res.status(200).json({
    status: 'ok',
    service: 'NOVA STORAGE Backend',
    version: '1.0.0',
    uptimeSeconds,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    serverPort: process.env.PORT || '3000',
    storage: {
      localCatalog: 'active',
      googleDrive: {
        status: hasOAuthConfig ? 'credentials_detected' : 'not_configured',
        oauthConfigured: hasOAuthConfig,
        scopes: ['https://www.googleapis.com/auth/drive.readonly'],
        message: hasOAuthConfig
          ? 'Credenciais OAuth 2.0 detectadas no servidor (.env configurado).'
          : 'Conexão com Google Drive API ainda não configurada no servidor (.env pendente).'
      }
    }
  });
});
