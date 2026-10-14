import express from 'express';
import type { Request, Response } from 'express';
import { DriveAuthService } from '../services/driveAuthService.ts';
import type { UserSessionData } from '../services/driveAuthService.ts';

export const driveRouter = express.Router();

const COOKIE_NAME = 'nova_session_id';

/**
 * Retrieves the validated session from Upstash Redis or initializes a new secure signed session
 */
async function getOrInitSession(req: Request, res: Response): Promise<UserSessionData> {
  // Read ONLY from cryptographically signed cookie, ignoring unverified client headers
  const signedSessionId = req.signedCookies?.[COOKIE_NAME];

  if (signedSessionId && typeof signedSessionId === 'string') {
    const existingSession = await DriveAuthService.getValidSession(signedSessionId);
    if (existingSession) {
      return existingSession;
    }
  }

  // Create new session in Upstash Redis and issue signed httpOnly cookie
  const newSession = await DriveAuthService.createSession();
  res.cookie(COOKIE_NAME, newSession.id, {
    signed: true,
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
    maxAge: 14 * 24 * 60 * 60 * 1000 // 14 days
  });

  return newSession;
}

/**
 * GET /api/storage/drive/status
 * Returns real state of Google Drive connection and OAuth configuration
 */
driveRouter.get('/drive/status', async (req: Request, res: Response) => {
  try {
    const session = await getOrInitSession(req, res);
    const status = await DriveAuthService.getStatus(session);
    res.status(200).json(status);
  } catch (error: any) {
    res.status(500).json({
      configured: false,
      connected: false,
      status: 'error',
      message: error.message || 'Erro interno ao consultar estado do Google Drive.',
      checkedAt: new Date().toISOString()
    });
  }
});

/**
 * GET /api/storage/drive/auth-url
 * Generates Google OAuth 2.0 authorization URL with CSRF protection for popup
 */
driveRouter.get('/drive/auth-url', async (req: Request, res: Response) => {
  try {
    const session = await getOrInitSession(req, res);
    const targetFolderId = req.query.folderId as string | undefined;

    const { authUrl, state } = await DriveAuthService.generateAuthorizationUrl(
      session,
      targetFolderId
    );
    res.status(200).json({
      url: authUrl,
      state,
      scope: DriveAuthService.REQUIRED_SCOPE,
      redirectUri: DriveAuthService.getRedirectUri(),
      trustedOrigin: DriveAuthService.getTrustedOrigin()
    });
  } catch (error: any) {
    res.status(400).json({
      error: 'CONFIG_ERROR',
      message: error.message || 'Falha ao gerar URL de autorização OAuth.'
    });
  }
});

/**
 * GET /api/storage/drive/callback
 * OAuth 2.0 callback endpoint redirected from Google Consent Screen.
 * Uses postMessage targeted to explicit trusted origin and closes popup cleanly.
 */
driveRouter.get('/drive/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;
  const oauthError = req.query.error as string | undefined;
  const trustedOrigin = DriveAuthService.getTrustedOrigin();

  if (oauthError) {
    res.status(400).send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <title>NOVA STORAGE - Erro OAuth</title>
          <style>
            body { background: #090a0d; color: #f87171; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
            .box { padding: 2rem; border: 1px solid #374151; border-radius: 0.75rem; background: #111827; max-width: 400px; }
          </style>
        </head>
        <body>
          <div class="box">
            <h3>Autorização Cancelada ou Recusada</h3>
            <p style="color: #9ca3af; font-size: 0.875rem;">O Google retornou: ${oauthError}</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'GOOGLE_OAUTH_ERROR', error: '${oauthError}' }, ${JSON.stringify(trustedOrigin)});
                setTimeout(() => window.close(), 2500);
              }
            </script>
          </div>
        </body>
      </html>
    `);
    return;
  }

  if (!code || !state) {
    res.status(400).send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <title>NOVA STORAGE - Parâmetros Inválidos</title>
          <style>body { background: #090a0d; color: #f87171; font-family: sans-serif; text-align: center; padding-top: 5rem; }</style>
        </head>
        <body>
          <h3>Parâmetros ausentes no retorno OAuth (code ou state ausentes).</h3>
        </body>
      </html>
    `);
    return;
  }

  let session: UserSessionData;
  try {
    session = await getOrInitSession(req, res);
  } catch (err: any) {
    res.status(500).send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <title>NOVA STORAGE - Erro de Sessão</title>
          <style>body { background: #090a0d; color: #f87171; font-family: sans-serif; text-align: center; padding-top: 5rem; }</style>
        </head>
        <body>
          <h3>Falha ao carregar sessão para autenticação OAuth.</h3>
        </body>
      </html>
    `);
    return;
  }

  const result = await DriveAuthService.handleCallback(session, code, state);

  if (!result.success) {
    res.status(400).send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <title>NOVA STORAGE - Falha na Troca de Tokens</title>
          <style>
            body { background: #090a0d; color: #f87171; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
            .box { padding: 2rem; border: 1px solid #7f1d1d; border-radius: 0.75rem; background: #111827; max-width: 450px; }
          </style>
        </head>
        <body>
          <div class="box">
            <h3>Falha na Conexão OAuth</h3>
            <p style="color: #9ca3af; font-size: 0.875rem;">${result.error || 'Erro desconhecido.'}</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'GOOGLE_OAUTH_ERROR', error: '${result.error}' }, ${JSON.stringify(trustedOrigin)});
              }
            </script>
          </div>
        </body>
      </html>
    `);
    return;
  }

  // Success: Return HTML snippet sending postMessage targeted strictly to the trusted origin
  res.status(200).send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>NOVA STORAGE - Conectado com Sucesso</title>
        <style>
          body { background: #090a0d; color: #34d399; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
          .box { padding: 2rem; border: 1px solid #065f46; border-radius: 0.75rem; background: #064e3b20; max-width: 400px; }
        </style>
      </head>
      <body>
        <div class="box">
          <h3 style="color: #34d399; margin-top: 0;">Google Drive Conectado!</h3>
          <p style="color: #9ca3af; font-size: 0.875rem;">Conta: <strong>${result.userEmail || ''}</strong></p>
          <p style="color: #6ee7b7; font-size: 0.75rem;">Esta janela será fechada automaticamente...</p>
        </div>
        <script>
          try {
            if (window.opener) {
              window.opener.postMessage({ type: 'GOOGLE_OAUTH_COMPLETED' }, ${JSON.stringify(trustedOrigin)});
              window.close();
            } else {
              window.location.href = '/';
            }
          } catch (e) {
            window.close();
          }
        </script>
      </body>
    </html>
  `);
});

/**
 * GET /api/storage/drive/files
 * Lists real video files from Google Drive with folder filter and pagination
 * If not connected, returns empty list with explicit status: "not_configured"
 */
driveRouter.get('/drive/files', async (req: Request, res: Response) => {
  const folderId = req.query.folderId as string | undefined;
  const pageToken = req.query.pageToken as string | undefined;
  const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 50;

  try {
    const session = await getOrInitSession(req, res);
    const result = await DriveAuthService.listFiles(session, {
      folderId,
      pageSize,
      pageToken,
      videosOnly: true
    });

    res.status(200).json({
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({
      files: [],
      total: 0,
      status: 'error',
      error: error.message || 'Erro interno ao consultar arquivos do Google Drive.',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/storage/drive/test-connection
 * Tests connection readiness on the backend against real Drive API if tokens exist
 */
driveRouter.post('/drive/test-connection', async (req: Request, res: Response) => {
  const { clientId, targetFolderId } = req.body || {};

  try {
    const session = await getOrInitSession(req, res);

    // If client provided a folderId, update it in session
    if (targetFolderId) {
      session.targetFolderId = targetFolderId.trim();
      await DriveAuthService.saveSession(session);
    }

    const status = await DriveAuthService.getStatus(session);

    if (status.status === 'connected') {
      res.status(200).json({
        success: true,
        code: 'OK',
        message: status.message,
        details: {
          userEmail: status.userEmail,
          userName: status.userName,
          targetFolderId: status.targetFolderId,
          scope: DriveAuthService.REQUIRED_SCOPE
        },
        checkedAt: new Date().toISOString()
      });
      return;
    }

    if (status.status === 'pending_auth') {
      res.status(200).json({
        success: false,
        code: 'PENDING_AUTH',
        message: 'Credenciais presentes no servidor. Clique em "Autorizar Google Drive" para abrir a janela de consentimento OAuth.',
        details: {
          redirectUri: status.redirectUri,
          scope: DriveAuthService.REQUIRED_SCOPE
        },
        checkedAt: new Date().toISOString()
      });
      return;
    }

    res.status(200).json({
      success: false,
      code: 'NOT_CONFIGURED',
      message: status.message || 'Google Drive API v3 não configurada no servidor backend (.env ausente).',
      details: {
        providedClientId: clientId ? `${String(clientId).substring(0, 10)}...` : undefined,
        redirectUri: status.redirectUri,
        scope: DriveAuthService.REQUIRED_SCOPE
      },
      checkedAt: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      code: 'ERROR',
      message: error.message || 'Erro ao validar conexão com Google Drive.',
      checkedAt: new Date().toISOString()
    });
  }
});

/**
 * POST /api/storage/drive/disconnect
 * Disconnects Google Drive, revokes tokens and resets session
 */
driveRouter.post('/drive/disconnect', async (req: Request, res: Response) => {
  try {
    const session = await getOrInitSession(req, res);
    await DriveAuthService.disconnect(session);

    res.status(200).json({
      success: true,
      message: 'Google Drive desconectado da sessão com sucesso.'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Erro ao desconectar Google Drive.'
    });
  }
});
