import express from 'express';
import type { Request, Response } from 'express';
import { PCloudService } from '../services/pcloudService.ts';
import { authenticatePCloudRequest } from '../services/pcloudAuthService.ts';
import { DriveAuthService } from '../services/driveAuthService.ts';

export const pcloudRouter = express.Router();

/**
 * Retorna lista explícita de origens confiáveis para proteção anti-CSRF.
 * Não aceita curingas (*) nem origens arbitrárias enviadas pelo cliente.
 */
export function getTrustedOrigins(): string[] {
  const trusted = new Set<string>();

  // 1. Origem principal do servidor configurada via DriveAuthService / APP_URL
  const appOrigin = DriveAuthService.getTrustedOrigin();
  if (appOrigin) {
    try {
      trusted.add(new URL(appOrigin).origin.toLowerCase());
    } catch {
      // url inválida ignorada
    }
  }

  const appUrl = process.env.APP_URL?.trim();
  if (appUrl) {
    try {
      trusted.add(new URL(appUrl).origin.toLowerCase());
    } catch {
      // url inválida ignorada
    }
  }

  // 2. Lista adicional explícita em TRUSTED_ORIGINS (separada por vírgula)
  const envList = process.env.TRUSTED_ORIGINS?.trim();
  if (envList) {
    for (const item of envList.split(',')) {
      const clean = item.trim();
      if (clean && clean !== '*') {
        try {
          trusted.add(new URL(clean).origin.toLowerCase());
        } catch {
          // url inválida ignorada
        }
      }
    }
  }

  // 3. Em ambientes de desenvolvimento ou teste, aceita origens locais padrão
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) {
    trusted.add('http://localhost:3000');
    trusted.add('http://localhost:5173');
    trusted.add('http://127.0.0.1:3000');
    trusted.add('http://127.0.0.1:5173');
  }

  return Array.from(trusted);
}

/**
 * Valida se uma origem fornecida pertence à lista explícita de origens confiáveis
 */
export function isTrustedOrigin(candidateOrigin?: string): boolean {
  if (!candidateOrigin || typeof candidateOrigin !== 'string') return false;
  try {
    const normalized = new URL(candidateOrigin.trim()).origin.toLowerCase();
    return getTrustedOrigins().includes(normalized);
  } catch {
    return false;
  }
}

/**
 * Valida os requisitos anti-CSRF para requisições autenticadas por cookie de sessão:
 * 1. Exige o cabeçalho personalizado 'X-Nova-Client: storage-v1'.
 * 2. Valida o cabeçalho 'Origin' (ou 'Referer' caso Origin não venha presente)
 *    contra a lista explícita de origens confiáveis configurada no servidor.
 */
export function verifyCsrfForSession(req: Request): { valid: boolean; code?: string; message?: string } {
  // 1. Verificação do cabeçalho personalizado
  const clientHeader = req.headers['x-nova-client'];
  if (clientHeader !== 'storage-v1') {
    return {
      valid: false,
      code: 'CSRF_HEADER_MISSING',
      message: 'Proteção anti-CSRF: cabeçalho obrigatório "X-Nova-Client: storage-v1" ausente ou inválido.'
    };
  }

  // 2. Verificação do cabeçalho Origin ou Referer contra a lista estrita de origens confiáveis
  const originHeader = req.headers.origin as string | undefined;
  let candidateOrigin = originHeader;

  if (!candidateOrigin && req.headers.referer) {
    try {
      candidateOrigin = new URL(req.headers.referer as string).origin;
    } catch {
      candidateOrigin = undefined;
    }
  }

  if (!candidateOrigin || !isTrustedOrigin(candidateOrigin)) {
    return {
      valid: false,
      code: 'CSRF_ORIGIN_UNTRUSTED',
      message: 'Proteção anti-CSRF: origem da requisição ausente ou não autorizada pela lista confiável do servidor.'
    };
  }

  return { valid: true };
}

/**
 * GET /api/storage/pcloud/status
 * Consulta o estado atual da configuração e da conexão com a API oficial do pCloud.
 * 
 * Regras de Autorização:
 * - Exige autenticação (sessão válida ou token administrativo).
 * - Visitantes anônimos são recusados com HTTP 401.
 * - Administradores recebem detalhes operacionais; visualizadores recebem resumo de conectividade.
 */
pcloudRouter.get('/pcloud/status', async (req: Request, res: Response) => {
  const auth = await authenticatePCloudRequest(req);

  if (!auth.authenticated) {
    return res.status(401).json({
      configured: false,
      connected: false,
      status: 'unauthorized',
      code: 'AUTH_REQUIRED',
      message: 'Autenticação obrigatória para consultar o status do armazenamento pCloud.',
      checkedAt: new Date().toISOString()
    });
  }

  try {
    const status = await PCloudService.testConnection(undefined, auth.session);
    const oauthConfig = PCloudService.areOAuthCredentialsConfigured();

    // Se o usuário não for administrador, omite detalhes de conta interna (cota, e-mail)
    if (auth.role !== 'admin') {
      return res.status(200).json({
        configured: status.configured,
        connected: status.connected,
        status: status.status,
        code: status.code,
        message: status.message,
        checkedAt: status.checkedAt
      });
    }

    return res.status(200).json({
      ...status,
      oauth: {
        configured: oauthConfig.configured,
        clientIdConfigured: oauthConfig.clientIdConfigured,
        clientSecretConfigured: oauthConfig.clientSecretConfigured,
        redirectUri: oauthConfig.redirectUri,
        connected: Boolean(auth.session?.pcloudTokens?.accessToken)
      }
    });
  } catch (error: any) {
    return res.status(500).json({
      configured: false,
      connected: false,
      status: 'error',
      code: 'API_ERROR',
      message: error.message || 'Erro interno ao consultar estado da API pCloud.',
      checkedAt: new Date().toISOString()
    });
  }
});

/**
 * GET /api/storage/pcloud/auth-url
 * Gera a URL de autorização OAuth 2.0 oficial do pCloud com proteção anti-CSRF via state
 * 
 * Regras de Autorização:
 * - Exige privilégios de administrador (sessão de admin ou Bearer PCLOUD_ADMIN_TOKEN).
 * - Proteção anti-CSRF para requisições autenticadas por cookie (X-Nova-Client e Origin confiável).
 * - Cria ou recupera a sessão do usuário, vinculando o parâmetro state com validade de 10 minutos.
 */
pcloudRouter.get('/pcloud/auth-url', async (req: Request, res: Response) => {
  const auth = await authenticatePCloudRequest(req);

  if (!auth.authenticated) {
    return res.status(401).json({
      success: false,
      code: 'AUTH_REQUIRED',
      message: 'Autenticação de administrador necessária para iniciar a conexão OAuth do pCloud.'
    });
  }

  if (auth.authMethod === 'session') {
    const csrfCheck = verifyCsrfForSession(req);
    if (!csrfCheck.valid) {
      return res.status(403).json({
        success: false,
        code: csrfCheck.code,
        message: csrfCheck.message
      });
    }
  }

  if (auth.role !== 'admin') {
    return res.status(403).json({
      success: false,
      code: 'FORBIDDEN',
      message: 'Apenas administradores autorizados podem iniciar a autorização OAuth do pCloud.'
    });
  }

  try {
    let session = auth.session;
    if (!session) {
      session = await DriveAuthService.getOrInitSession(req, res);
      session.role = 'admin';
      await DriveAuthService.saveSession(session);
    }

    const { authUrl, state, redirectUri, trustedOrigin } = await PCloudService.generateOAuthUrl(session);

    return res.status(200).json({
      url: authUrl,
      state,
      redirectUri,
      trustedOrigin
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      code: 'CONFIG_ERROR',
      message: error.message || 'Falha ao gerar URL de autorização OAuth do pCloud.'
    });
  }
});

/**
 * GET /api/storage/pcloud/callback
 * Endpoint oficial de redirecionamento OAuth 2.0 do pCloud.
 * 
 * Medidas Estritas de Segurança:
 * - Valida parâmetro state contra o armazenado na sessão do usuário (anti-CSRF).
 * - Executa a troca de authorization code por token EXCLUSIVAMENTE no servidor.
 * - Trata locationid (1 = US, 2 = EU) e valida hostname contra domínio confiável (*.pcloud.com).
 * - NUNCA expõe o access_token, client_secret ou PCLOUD_ADMIN_TOKEN no HTML, URL ou logs.
 * - Emite postMessage restrito à origem confiável do aplicativo e fecha a janela popup.
 */
pcloudRouter.get(['/pcloud/callback', '/pcloud/callback/'], async (req: Request, res: Response) => {
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;
  const oauthError = req.query.error as string | undefined;
  const trustedOrigin = DriveAuthService.getTrustedOrigin();

  // 1. Trata erro de autorização retornado diretamente pelo pCloud (ex: usuário recusou)
  if (oauthError) {
    const sanitizedError = String(oauthError).replace(/[<>&"']/g, '');
    res.status(400).send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <title>NOVA STORAGE - Erro OAuth pCloud</title>
          <style>
            body { background: #090a0d; color: #f87171; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
            .box { padding: 2rem; border: 1px solid #374151; border-radius: 0.75rem; background: #111827; max-width: 400px; }
          </style>
        </head>
        <body>
          <div class="box">
            <h3>Autorização Cancelada ou Recusada</h3>
            <p style="color: #9ca3af; font-size: 0.875rem;">O pCloud retornou: ${sanitizedError}</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'PCLOUD_OAUTH_ERROR', error: ${JSON.stringify(sanitizedError)} }, ${JSON.stringify(trustedOrigin)});
                setTimeout(() => window.close(), 2500);
              }
            </script>
          </div>
        </body>
      </html>
    `);
    return;
  }

  // 2. Validação dos parâmetros obrigatórios
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
          <h3>Parâmetros ausentes no retorno OAuth do pCloud (code ou state ausentes).</h3>
        </body>
      </html>
    `);
    return;
  }

  // 3. Recuperação da sessão associada ao cookie assinado
  const signedSessionId = req.signedCookies?.[DriveAuthService.COOKIE_NAME];
  let session: any = null;
  if (signedSessionId && typeof signedSessionId === 'string') {
    try {
      session = await DriveAuthService.getValidSession(signedSessionId);
    } catch {
      session = null;
    }
  }

  if (!session) {
    res.status(400).send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <title>NOVA STORAGE - Sessão Não Encontrada</title>
          <style>body { background: #090a0d; color: #f87171; font-family: sans-serif; text-align: center; padding-top: 5rem; }</style>
        </head>
        <body>
          <h3>Sessão inválida ou expirada para processar o retorno OAuth do pCloud.</h3>
        </body>
      </html>
    `);
    return;
  }

  // 4. Validação do state e troca do código pelo token no backend
  const result = await PCloudService.handleOAuthCallback(session, code, state);

  if (!result.success) {
    const sanitizedError = String(result.error || 'Erro desconhecido na troca de credenciais.').replace(/[<>&"']/g, '');
    res.status(400).send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <title>NOVA STORAGE - Falha OAuth pCloud</title>
          <style>
            body { background: #090a0d; color: #f87171; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
            .box { padding: 2rem; border: 1px solid #7f1d1d; border-radius: 0.75rem; background: #111827; max-width: 450px; }
          </style>
        </head>
        <body>
          <div class="box">
            <h3>Falha na Conexão OAuth com pCloud</h3>
            <p style="color: #9ca3af; font-size: 0.875rem;">${sanitizedError}</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'PCLOUD_OAUTH_ERROR', error: ${JSON.stringify(sanitizedError)} }, ${JSON.stringify(trustedOrigin)});
              }
            </script>
          </div>
        </body>
      </html>
    `);
    return;
  }

  // 5. Sucesso: Emite postMessage seguro para a janela de origem e fecha o popup
  res.status(200).send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>NOVA STORAGE - pCloud Conectado</title>
        <style>
          body { background: #090a0d; color: #34d399; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
          .box { padding: 2rem; border: 1px solid #065f46; border-radius: 0.75rem; background: #064e3b20; max-width: 400px; }
        </style>
      </head>
      <body>
        <div class="box">
          <h3 style="color: #34d399; margin-top: 0;">pCloud Conectado com Sucesso!</h3>
          <p style="color: #9ca3af; font-size: 0.875rem;">Servidor Regional: <strong>${result.hostname || 'api.pcloud.com'}</strong></p>
          <p style="color: #6ee7b7; font-size: 0.75rem;">Esta janela será fechada automaticamente...</p>
        </div>
        <script>
          try {
            if (window.opener) {
              window.opener.postMessage({ type: 'PCLOUD_OAUTH_COMPLETED' }, ${JSON.stringify(trustedOrigin)});
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
 * POST /api/storage/pcloud/test-connection
 * Executa o teste ativo de conexão contra a API oficial do pCloud
 * 
 * Regras de Autorização:
 * - Exige autenticação de administrador (sessão administrativa ou token de admin).
 * - Usuários sem autenticação: 401 Unauthorized.
 * - Usuários autenticados sem permissão de administrador: 403 Forbidden.
 */
pcloudRouter.post('/pcloud/test-connection', async (req: Request, res: Response) => {
  const auth = await authenticatePCloudRequest(req);

  if (!auth.authenticated) {
    return res.status(401).json({
      success: false,
      code: 'AUTH_REQUIRED',
      message: 'Autenticação obrigatória para realizar teste de conexão com o pCloud.',
      checkedAt: new Date().toISOString()
    });
  }

  // Defesa Anti-CSRF para requisições autenticadas por cookie de sessão
  if (auth.authMethod === 'session') {
    const csrfCheck = verifyCsrfForSession(req);
    if (!csrfCheck.valid) {
      return res.status(403).json({
        success: false,
        code: csrfCheck.code,
        message: csrfCheck.message,
        checkedAt: new Date().toISOString()
      });
    }
  }

  if (auth.role !== 'admin') {
    return res.status(403).json({
      success: false,
      code: 'FORBIDDEN',
      message: 'Permissão insuficiente: apenas administradores autorizados podem realizar testes de conexão.',
      checkedAt: new Date().toISOString()
    });
  }

  try {
    const status = await PCloudService.testConnection(undefined, auth.session);
    return res.status(200).json(status);
  } catch (error: any) {
    return res.status(500).json({
      configured: false,
      connected: false,
      status: 'error',
      code: 'API_ERROR',
      message: error.message || 'Erro ao testar conexão com pCloud.',
      checkedAt: new Date().toISOString()
    });
  }
});

/**
 * POST /api/storage/pcloud/file-link
 * Gera um link de streaming / acesso direto a partir do identificador permanente (fileId) no pCloud
 * 
 * Regras de Segurança e Autorização:
 * 1. Não aceita hosts arbitrários fornecidos pelo cliente (proteção contra SSRF).
 * 2. Exige usuário autenticado (401 se ausente).
 * 3. Valida formato numérico estrito do fileId (400 se inválido).
 * 4. Valida se o arquivo está no catálogo autorizado (403 se não autorizado, impedindo IDOR).
 * 5. Não vaza tokens de acesso ou dados sensíveis em logs ou respostas.
 */
pcloudRouter.post('/pcloud/file-link', async (req: Request, res: Response) => {
  const body = req.body || {};

  // 1. Defesa preventiva contra injeção de hosts ou endpoints SSRF pelo cliente
  if (body.host || body.customHost || body.endpoint || body.apiUrl) {
    return res.status(400).json({
      success: false,
      code: 'UNTRUSTED_HOST_PARAMETER',
      message: 'Definição de hosts ou endpoints arbitrários pelo cliente é estritamente proibida por diretrizes de segurança SSRF.'
    });
  }

  // 2. Verificação de Autenticação
  const auth = await authenticatePCloudRequest(req);
  if (!auth.authenticated) {
    return res.status(401).json({
      success: false,
      code: 'AUTH_REQUIRED',
      message: 'Autenticação obrigatória para solicitar links de arquivos privados.'
    });
  }

  // 2.1. Defesa Anti-CSRF para requisições autenticadas por cookie de sessão
  if (auth.authMethod === 'session') {
    const csrfCheck = verifyCsrfForSession(req);
    if (!csrfCheck.valid) {
      return res.status(403).json({
        success: false,
        code: csrfCheck.code,
        message: csrfCheck.message
      });
    }
  }

  // 3. Validação do parâmetro fileId
  const { fileId, forceDownload, contentType } = body;
  if (fileId === undefined || fileId === null || String(fileId).trim() === '') {
    return res.status(400).json({
      success: false,
      code: 'MISSING_FILE_ID',
      message: 'O identificador permanente do arquivo (fileId) é obrigatório.'
    });
  }

  const cleanFileId = String(fileId).trim();
  if (!/^\d+$/.test(cleanFileId)) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_FILE_ID',
      message: 'O fileId deve ser um identificador numérico válido do pCloud (ex: 12345678).'
    });
  }

  // 4. Verificação de Autorização do Arquivo (Prevenção contra enumeração/IDOR de arquivos privados)
  // O arquivo precisa estar registrado no catálogo autorizado do NOVA STORAGE ou nos IDs autorizados da sessão
  const isAuthorized =
    (await PCloudService.isAuthorizedFile(cleanFileId)) ||
    Boolean(auth.session?.authorizedFileIds?.includes(cleanFileId));

  if (!isAuthorized) {
    return res.status(403).json({
      success: false,
      code: 'FILE_NOT_AUTHORIZED',
      message: 'Acesso negado: o identificador do arquivo não pertence ao catálogo autorizado do NOVA STORAGE.'
    });
  }

  // 5. Chamada segura ao serviço do pCloud com credenciais do servidor ou da sessão ativa
  try {
    const result = await PCloudService.getFileLink(
      cleanFileId,
      {
        forceDownload: Boolean(forceDownload),
        contentType: typeof contentType === 'string' ? contentType : undefined
      },
      auth.session
    );

    if (result.success) {
      return res.status(200).json(result);
    }

    if (result.code === 'NOT_CONFIGURED') {
      return res.status(503).json(result);
    }

    if (result.code === 'AUTH_FAILED') {
      return res.status(401).json(result);
    }

    if (result.code === 'FILE_NOT_FOUND') {
      return res.status(404).json(result);
    }

    if (result.code === 'SSRF_BLOCKED' || result.code === 'UNTRUSTED_HOST') {
      return res.status(403).json(result);
    }

    return res.status(400).json(result);
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: error.message || 'Erro interno ao gerar link de arquivo no pCloud.'
    });
  }
});
