import crypto from 'crypto';
import { validateUrlForSsrf } from '../utils/ssrfGuard.ts';
import { DriveAuthService } from './driveAuthService.ts';
import type { UserSessionData } from './driveAuthService.ts';

/**
 * pCloud Storage Service
 * 
 * Conector backend seguro para a API Oficial do pCloud (https://docs.pcloud.com/).
 * 
 * Princípios de Segurança e Arquitetura:
 * - Credenciais exclusivamente em variáveis de ambiente no servidor Vercel (PCLOUD_ACCESS_TOKEN) ou em sessão segura após OAuth.
 * - Nenhum token, chave secreta ou parâmetro sensível é exposto ao frontend ou em logs.
 * - Suporta as regiões Global (api.pcloud.com) e Europa (eapi.pcloud.com).
 * - Distingue estritamente: não configurado, credenciais inválidas e conectado com sucesso.
 * - Utiliza o endpoint oficial 'getfilelink' para streaming direto a partir de fileId permanente.
 * - Proteção contra SSRF e validação de domínio oficial (.pcloud.com) nos hosts de mídia.
 * - Catálogo de autorização de arquivos permanente:
 *     1. Upstash Redis ('nova:pcloud:authorized_files') para persistência distribuída em serverless.
 *     2. Variável de ambiente 'PCLOUD_AUTHORIZED_FILE_IDS' para persistência declarativa na Vercel.
 *     3. Cache em memória da instância para alta performance nas consultas.
 */

export interface PCloudConnectionStatus {
  configured: boolean;
  connected: boolean;
  status: 'not_configured' | 'invalid_credentials' | 'connected' | 'error';
  code: 'NOT_CONFIGURED' | 'AUTH_FAILED' | 'OK' | 'NETWORK_ERROR' | 'API_ERROR';
  message: string;
  checkedAt: string;
  details?: {
    userId?: number;
    email?: string;
    quotaBytes?: number;
    usedQuotaBytes?: number;
    quotaFormatted?: string;
    usedQuotaFormatted?: string;
    premium?: boolean;
    apiHost?: string;
  };
}

export interface PCloudFileLinkResult {
  success: boolean;
  fileId?: string;
  streamUrl?: string;
  expiresAt?: string;
  expiresTimestamp?: number | null;
  sizeBytes?: number;
  hosts?: string[];
  code?: string;
  message?: string;
}

export class PCloudService {
  private static readonly DEFAULT_API_HOST = 'api.pcloud.com';
  private static readonly EU_API_HOST = 'eapi.pcloud.com';
  private static readonly DEFAULT_OAUTH_AUTH_HOST = 'my.pcloud.com';
  private static readonly EU_OAUTH_AUTH_HOST = 'eapi.pcloud.com';
  private static readonly REQUEST_TIMEOUT_MS = 8000;
  private static readonly REDIS_AUTHORIZED_FILES_KEY = 'nova:pcloud:authorized_files';

  // Cache em memória local por instância serverless
  private static readonly authorizedFiles = new Set<string>();

  /**
   * Inicializa ou autoriza um arquivo por seu fileId no catálogo do NOVA STORAGE
   * Grava no cache de memória e sincroniza no Upstash Redis se disponível.
   */
  public static async authorizeFile(fileId: string | number): Promise<void> {
    const cleanId = String(fileId).trim();
    if (!cleanId || !/^\d+$/.test(cleanId)) return;

    this.authorizedFiles.add(cleanId);

    try {
      const redis = DriveAuthService.getRedisClient();
      const existing = (await redis.get<string[]>(this.REDIS_AUTHORIZED_FILES_KEY)) || [];
      if (!existing.includes(cleanId)) {
        existing.push(cleanId);
        await redis.set(this.REDIS_AUTHORIZED_FILES_KEY, existing);
      }
    } catch {
      // Sem Redis ou ambiente dev sem Upstash
    }
  }

  /**
   * Autoriza múltiplos arquivos no catálogo
   */
  public static async authorizeFiles(fileIds: Array<string | number>): Promise<void> {
    for (const id of fileIds) {
      await this.authorizeFile(id);
    }
  }

  /**
   * Revoga a autorização de um arquivo
   */
  public static async revokeAuthorizedFile(fileId: string | number): Promise<void> {
    const cleanId = String(fileId).trim();
    this.authorizedFiles.delete(cleanId);

    try {
      const redis = DriveAuthService.getRedisClient();
      const existing = (await redis.get<string[]>(this.REDIS_AUTHORIZED_FILES_KEY)) || [];
      const filtered = existing.filter(id => id !== cleanId);
      await redis.set(this.REDIS_AUTHORIZED_FILES_KEY, filtered);
    } catch {
      // Ignora erro de exclusão em Redis ausente
    }
  }

  /**
   * Verifica se um arquivo está explicitamente autorizado no catálogo
   * Considera:
   * 1. Cache em memória da instância ativa
   * 2. Variável de ambiente PCLOUD_AUTHORIZED_FILE_IDS (lista separada por vírgula na Vercel)
   * 3. Chave persistida no Upstash Redis ('nova:pcloud:authorized_files')
   */
  public static async isAuthorizedFile(fileId: string | number): Promise<boolean> {
    const cleanId = String(fileId).trim();
    if (!cleanId || !/^\d+$/.test(cleanId)) return false;

    // 1. Verificação rápida em cache de memória
    if (this.authorizedFiles.has(cleanId)) {
      return true;
    }

    // 2. Verificação em variável de ambiente (persistência declarativa serverless)
    const envAuthorized = process.env.PCLOUD_AUTHORIZED_FILE_IDS?.trim();
    if (envAuthorized) {
      const allowedList = envAuthorized.split(',').map(s => s.trim());
      if (allowedList.includes(cleanId)) {
        this.authorizedFiles.add(cleanId);
        return true;
      }
    }

    // 3. Verificação em persistência Upstash Redis
    try {
      const redis = DriveAuthService.getRedisClient();
      const redisList = await redis.get<string[]>(this.REDIS_AUTHORIZED_FILES_KEY);
      if (Array.isArray(redisList) && redisList.includes(cleanId)) {
        this.authorizedFiles.add(cleanId);
        return true;
      }
    } catch {
      // Fallback seguro caso Redis esteja indisponível
    }

    return false;
  }

  /**
   * Retorna lista de IDs de arquivos atualmente autorizados
   */
  public static async getAuthorizedFiles(): Promise<string[]> {
    const envAuthorized = process.env.PCLOUD_AUTHORIZED_FILE_IDS?.trim();
    const envIds = envAuthorized ? envAuthorized.split(',').map(s => s.trim()).filter(Boolean) : [];

    let redisIds: string[] = [];
    try {
      const redis = DriveAuthService.getRedisClient();
      const list = await redis.get<string[]>(this.REDIS_AUTHORIZED_FILES_KEY);
      if (Array.isArray(list)) {
        redisIds = list;
      }
    } catch {
      // Fallback
    }

    return Array.from(new Set([...this.authorizedFiles, ...envIds, ...redisIds]));
  }

  /**
   * Limpa arquivos autorizados em memória e no repositório de teste
   */
  public static async resetAuthorizedFiles(): Promise<void> {
    this.authorizedFiles.clear();
    try {
      const redis = DriveAuthService.getRedisClient();
      await redis.del(this.REDIS_AUTHORIZED_FILES_KEY);
    } catch {
      // Ignore
    }
  }

  /**
   * Obtém o token de acesso exclusivo do ambiente seguro do servidor ou da sessão ativa
   */
  public static getAccessToken(session?: UserSessionData): string | null {
    if (session?.pcloudTokens?.accessToken) {
      const sessToken = session.pcloudTokens.accessToken.trim();
      if (sessToken.length > 0) return sessToken;
    }

    const token = process.env.PCLOUD_ACCESS_TOKEN || process.env.PCLOUD_OAUTH_TOKEN || null;
    if (token && typeof token === 'string' && token.trim().length > 0) {
      return token.trim();
    }
    return null;
  }

  /**
   * Verifica se o token de acesso do pCloud está configurado no servidor ou na sessão
   */
  public static isConfigured(session?: UserSessionData): boolean {
    return this.getAccessToken(session) !== null;
  }

  /**
   * Valida se um nome de host fornecido pertence estritamente ao domínio oficial *.pcloud.com.
   * Impede ataques de SSRF, injeção de parâmetros, IP loopback ou hosts maliciosos.
   */
  public static isValidPCloudHost(hostname?: string): boolean {
    if (!hostname || typeof hostname !== 'string') return false;
    const clean = hostname.trim().toLowerCase();
    const withoutProtocol = clean.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
    return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*\.pcloud\.com$/.test(withoutProtocol);
  }

  /**
   * Resolve o host da API baseado em locationid (1 = US/Global, 2 = Europa) e hostname validado.
   */
  public static resolveApiHost(locationId?: number, hostname?: string): string {
    if (hostname && this.isValidPCloudHost(hostname)) {
      return hostname.trim().toLowerCase().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
    }
    if (locationId === 2) {
      return this.EU_API_HOST;
    }
    return this.DEFAULT_API_HOST;
  }

  /**
   * Determina o host base da API oficial do pCloud (Global ou Europa)
   */
  public static getApiHost(session?: UserSessionData): string {
    if (session?.pcloudTokens?.hostname && this.isValidPCloudHost(session.pcloudTokens.hostname)) {
      return session.pcloudTokens.hostname.trim();
    }
    if (session?.pcloudTokens?.locationId === 2) {
      return this.EU_API_HOST;
    }

    const customHost = process.env.PCLOUD_API_HOST?.trim();
    if (customHost && this.isValidPCloudHost(customHost)) {
      return customHost.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
    }

    const region = process.env.PCLOUD_REGION?.trim().toLowerCase();
    if (region === 'eu' || region === 'europe') {
      return this.EU_API_HOST;
    }

    return this.DEFAULT_API_HOST;
  }

  /**
   * Retorna a URL base completa para chamadas à API oficial
   */
  public static getBaseUrl(session?: UserSessionData): string {
    return `https://${this.getApiHost(session)}`;
  }

  /**
   * Resolve a origem confiável do aplicativo para pCloud.
   * Suporta APP_URL, PCLOUD_REDIRECT_URI e variáveis de runtime da Vercel.
   */
  public static getTrustedOrigin(): string {
    const appUrl = process.env.APP_URL?.trim();
    if (appUrl) {
      try {
        return new URL(appUrl).origin;
      } catch {
        // ignore
      }
    }

    const redirectUri = process.env.PCLOUD_REDIRECT_URI?.trim();
    if (redirectUri) {
      try {
        return new URL(redirectUri).origin;
      } catch {
        // ignore
      }
    }

    const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
    if (vercelUrl?.trim()) {
      try {
        const fullUrl = vercelUrl.trim().startsWith('http') ? vercelUrl.trim() : `https://${vercelUrl.trim()}`;
        return new URL(fullUrl).origin;
      } catch {
        // ignore
      }
    }

    return DriveAuthService.getTrustedOrigin();
  }

  /**
   * Verifica se as credenciais OAuth do pCloud estão configuradas no servidor
   */
  public static areOAuthCredentialsConfigured(): {
    configured: boolean;
    clientIdConfigured: boolean;
    clientSecretConfigured: boolean;
    redirectUri: string;
    trustedOrigin: string;
  } {
    const clientId = process.env.PCLOUD_CLIENT_ID?.trim();
    const clientSecret = process.env.PCLOUD_CLIENT_SECRET?.trim();
    const redirectUri = this.getRedirectUri();
    const trustedOrigin = this.getTrustedOrigin();

    return {
      configured: Boolean(clientId && clientSecret),
      clientIdConfigured: Boolean(clientId),
      clientSecretConfigured: Boolean(clientSecret),
      redirectUri,
      trustedOrigin
    };
  }

  /**
   * Retorna a URI exata de redirecionamento OAuth cadastrada no console do pCloud
   */
  public static getRedirectUri(): string {
    if (process.env.PCLOUD_REDIRECT_URI?.trim()) {
      return process.env.PCLOUD_REDIRECT_URI.trim();
    }
    const origin = this.getTrustedOrigin();
    return `${origin}/api/storage/pcloud/callback`;
  }

  /**
   * Gera a URL de autorização OAuth 2.0 do pCloud com state protegido contra CSRF.
   * O fluxo interativo de login e consentimento da pCloud ocorre sempre em https://my.pcloud.com/oauth2/authorize
   * tanto para contas nos EUA quanto na Europa.
   */
  public static async generateOAuthUrl(
    session: UserSessionData
  ): Promise<{ authUrl: string; state: string; redirectUri: string; trustedOrigin: string }> {
    const { configured } = this.areOAuthCredentialsConfigured();
    if (!configured) {
      throw new Error(
        'Credenciais do pCloud OAuth (PCLOUD_CLIENT_ID e PCLOUD_CLIENT_SECRET) não estão definidas no arquivo de ambiente (.env).'
      );
    }

    const clientId = process.env.PCLOUD_CLIENT_ID!.trim();
    const redirectUri = this.getRedirectUri();

    // Gera parâmetro state criptograficamente seguro vinculado à sessão com expiração de 10 minutos
    const csrfState = crypto.randomBytes(32).toString('hex');
    session.pcloudCsrfState = csrfState;
    session.pcloudCsrfExpiresAt = Date.now() + 10 * 60 * 1000;
    session.lastActivityAt = Date.now();

    await DriveAuthService.saveSession(session);

    // Endpoint oficial web de autorização: my.pcloud.com
    const customAuthHost = process.env.PCLOUD_OAUTH_AUTH_HOST?.trim();
    const authHost = customAuthHost && this.isValidPCloudHost(customAuthHost)
      ? customAuthHost
      : this.DEFAULT_OAUTH_AUTH_HOST;

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      state: csrfState
    });

    const authUrl = `https://${authHost}/oauth2/authorize?${params.toString()}`;

    return {
      authUrl,
      state: csrfState,
      redirectUri,
      trustedOrigin: this.getTrustedOrigin()
    };
  }

  /**
   * Executa a troca do código de autorização pelo token exclusivamente no backend
   */
  public static async exchangeCodeForToken(
    code: string,
    session?: UserSessionData,
    hints?: {
      locationId?: number;
      hostname?: string;
    }
  ): Promise<{
    success: boolean;
    accessToken?: string;
    tokenType?: string;
    userId?: number;
    locationId?: number;
    hostname?: string;
    error?: string;
  }> {
    const clientId = process.env.PCLOUD_CLIENT_ID?.trim();
    const clientSecret = process.env.PCLOUD_CLIENT_SECRET?.trim();

    if (!clientId || !clientSecret) {
      return {
        success: false,
        error: 'PCLOUD_CLIENT_ID ou PCLOUD_CLIENT_SECRET não configurados no servidor.'
      };
    }

    if (!code || typeof code !== 'string' || code.trim().length === 0) {
      return {
        success: false,
        error: 'Código de autorização inválido ou ausente.'
      };
    }

    let tokenHost = this.DEFAULT_API_HOST;
    if (hints?.hostname && this.isValidPCloudHost(hints.hostname)) {
      tokenHost = hints.hostname;
    } else if (hints?.locationId === 2) {
      tokenHost = this.EU_API_HOST;
    } else if (session?.pcloudTokens?.hostname && this.isValidPCloudHost(session.pcloudTokens.hostname)) {
      tokenHost = session.pcloudTokens.hostname;
    } else {
      const region = process.env.PCLOUD_REGION?.trim().toLowerCase();
      if (region === 'eu' || region === 'europe') {
        tokenHost = this.EU_API_HOST;
      }
    }

    const endpoint = `https://${tokenHost}/oauth2_token`;
    const bodyParams = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: code.trim()
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: bodyParams.toString(),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          success: false,
          error: `O servidor OAuth do pCloud retornou status HTTP ${response.status}.`
        };
      }

      const data = await response.json();

      if (data.result === 0 && data.access_token) {
        const locationId = typeof data.locationid === 'number' ? data.locationid : undefined;
        const rawHostname = typeof data.hostname === 'string' ? data.hostname.trim() : undefined;
        const validatedHost = this.resolveApiHost(locationId, rawHostname);

        return {
          success: true,
          accessToken: String(data.access_token).trim(),
          tokenType: typeof data.token_type === 'string' ? data.token_type : 'bearer',
          userId: typeof data.userid === 'number' ? data.userid : undefined,
          locationId,
          hostname: validatedHost
        };
      }

      return {
        success: false,
        error: data.error || `Falha na autorização pCloud (código ${data.result}).`
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      const isTimeout = err?.name === 'AbortError' || String(err?.message).toLowerCase().includes('timeout');
      return {
        success: false,
        error: isTimeout
          ? 'Tempo limite excedido ao comunicar com o servidor OAuth do pCloud (timeout 8s).'
          : 'Erro de conexão de rede durante a troca do código de autorização.'
      };
    }
  }

  /**
   * Processa o callback OAuth, valida CSRF (state), troca tokens e persiste na sessão
   */
  public static async handleOAuthCallback(
    session: UserSessionData,
    code: string,
    state: string,
    hints?: {
      locationId?: number;
      hostname?: string;
    }
  ): Promise<{
    success: boolean;
    userId?: number;
    locationId?: number;
    hostname?: string;
    error?: string;
  }> {
    const now = Date.now();

    // 1. Validação do state anti-CSRF
    if (!session.pcloudCsrfState || session.pcloudCsrfState !== state) {
      session.pcloudCsrfState = null;
      session.pcloudCsrfExpiresAt = null;
      await DriveAuthService.saveSession(session).catch(() => {});
      return {
        success: false,
        error: 'Validação CSRF falhou: o parâmetro state recebido é inválido ou expirou.'
      };
    }

    if (session.pcloudCsrfExpiresAt && now > session.pcloudCsrfExpiresAt) {
      session.pcloudCsrfState = null;
      session.pcloudCsrfExpiresAt = null;
      await DriveAuthService.saveSession(session).catch(() => {});
      return {
        success: false,
        error: 'Validação CSRF falhou: a solicitação de autorização expirou (tempo limite de 10 minutos).'
      };
    }

    // 2. Invalidação imediata do state para impedir ataques de repetição (Replay Attacks)
    session.pcloudCsrfState = null;
    session.pcloudCsrfExpiresAt = null;

    // 3. Troca do código de autorização pelo token de acesso
    const exchangeResult = await this.exchangeCodeForToken(code, session, hints);
    if (!exchangeResult.success || !exchangeResult.accessToken) {
      await DriveAuthService.saveSession(session).catch(() => {});
      return {
        success: false,
        error: exchangeResult.error || 'Falha na troca do código de autorização por tokens de acesso.'
      };
    }

    // 4. Grava os tokens na sessão segura do servidor
    session.pcloudTokens = {
      accessToken: exchangeResult.accessToken,
      tokenType: exchangeResult.tokenType,
      userId: exchangeResult.userId,
      locationId: exchangeResult.locationId,
      hostname: exchangeResult.hostname,
      connectedAt: new Date().toISOString()
    };
    session.lastActivityAt = Date.now();

    await DriveAuthService.saveSession(session);

    return {
      success: true,
      userId: exchangeResult.userId,
      locationId: exchangeResult.locationId,
      hostname: exchangeResult.hostname
    };
  }

  /**
   * Desconecta o pCloud da sessão atual, revogando o token armazenado
   */
  public static async disconnectOAuth(session: UserSessionData): Promise<boolean> {
    session.pcloudTokens = null;
    session.pcloudCsrfState = null;
    session.pcloudCsrfExpiresAt = null;
    session.lastActivityAt = Date.now();
    await DriveAuthService.saveSession(session);
    return true;
  }

  /**
   * Mascara endereço de e-mail para exibição segura sem expor dados pessoais completos
   */
  public static maskEmail(email: string): string {
    if (!email || typeof email !== 'string') return '';
    const parts = email.split('@');
    if (parts.length !== 2) return '***';
    const name = parts[0];
    const domain = parts[1];
    if (name.length <= 2) {
      return `${name[0] || '*'}***@${domain}`;
    }
    return `${name[0]}***${name[name.length - 1]}@${domain}`;
  }

  /**
   * Formata contagem de bytes em formato legível (KB, MB, GB, TB)
   */
  public static formatBytes(bytes: number): string {
    if (!bytes || isNaN(bytes) || bytes <= 0) return '0.00 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const val = bytes / Math.pow(1024, i);
    return `${val.toFixed(2)} ${units[i]}`;
  }

  /**
   * Converte a data de expiração RFC 2822 retornada pelo pCloud para timestamp em segundos
   * Exemplo retornado pelo pCloud: "Sat, 24 Oct 2026 14:00:00 +0000"
   */
  public static parseExpirationTimestamp(expiresStr?: string): number | null {
    if (!expiresStr || typeof expiresStr !== 'string') return null;
    try {
      const parsed = Date.parse(expiresStr);
      if (isNaN(parsed)) return null;
      return Math.floor(parsed / 1000);
    } catch {
      return null;
    }
  }

  /**
   * Testa a configuração e a conexão com a API oficial do pCloud via método 'userinfo'
   * Documentação oficial: https://docs.pcloud.com/methods/general/userinfo.html
   * 
   * Não expõe tokens em respostas, logs ou exceções.
   */
  public static async testConnection(tokenOverride?: string, session?: UserSessionData): Promise<PCloudConnectionStatus> {
    const token = tokenOverride?.trim() || this.getAccessToken(session);
    const checkedAt = new Date().toISOString();

    // 1. Verificação de configuração ausente
    if (!token) {
      return {
        configured: false,
        connected: false,
        status: 'not_configured',
        code: 'NOT_CONFIGURED',
        message: 'Variável de ambiente PCLOUD_ACCESS_TOKEN não configurada no servidor Vercel.',
        checkedAt
      };
    }

    const host = this.getApiHost(session);
    const endpoint = `https://${host}/userinfo`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          configured: true,
          connected: false,
          status: 'error',
          code: 'API_ERROR',
          message: `Servidor da API pCloud retornou status HTTP ${response.status}.`,
          checkedAt
        };
      }

      const data = await response.json();

      // Códigos de resultado oficiais do pCloud:
      // result === 0 -> Sucesso
      // result === 1000 ou 2000 -> Log in required / Falha de autenticação
      if (data.result === 0) {
        const quotaBytes = typeof data.quota === 'number' ? data.quota : 0;
        const usedQuotaBytes = typeof data.usedquota === 'number' ? data.usedquota : 0;

        return {
          configured: true,
          connected: true,
          status: 'connected',
          code: 'OK',
          message: 'Conexão com a API oficial do pCloud verificada com sucesso.',
          checkedAt,
          details: {
            userId: typeof data.userid === 'number' ? data.userid : undefined,
            email: typeof data.email === 'string' ? this.maskEmail(data.email) : undefined,
            quotaBytes,
            usedQuotaBytes,
            quotaFormatted: this.formatBytes(quotaBytes),
            usedQuotaFormatted: this.formatBytes(usedQuotaBytes),
            premium: Boolean(data.premium),
            apiHost: host
          }
        };
      }

      // Falha de autenticação (token inválido, revogado ou expirado)
      if (data.result === 1000 || data.result === 2000) {
        return {
          configured: true,
          connected: false,
          status: 'invalid_credentials',
          code: 'AUTH_FAILED',
          message: 'Falha de autenticação com o pCloud: o token configurado é inválido, foi revogado ou expirou.',
          checkedAt
        };
      }

      // Outro código de erro do pCloud
      return {
        configured: true,
        connected: false,
        status: 'error',
        code: 'API_ERROR',
        message: data.error || `A API do pCloud retornou o código de erro ${data.result}.`,
        checkedAt
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      const isTimeout = err?.name === 'AbortError' || String(err?.message).toLowerCase().includes('timeout');

      return {
        configured: true,
        connected: false,
        status: 'error',
        code: 'NETWORK_ERROR',
        message: isTimeout
          ? 'Tempo limite de resposta excedido ao conectar com a API do pCloud (timeout de 8s).'
          : 'Não foi possível estabelecer conexão de rede com a API oficial do pCloud.',
        checkedAt
      };
    }
  }

  /**
   * Gera link direto de acesso/streaming a partir do identificador permanente (fileId) no pCloud
   * Documentação oficial: https://docs.pcloud.com/methods/streaming/getfilelink.html
   * 
   * Medidas de Proteção:
   * - Suporta requisições HTTP Range (206 Partial Content), permitindo scrubbing e streaming fluido em players.
   * - Possui prazo de expiração retornado oficialmente pelo pCloud.
   * - Não expõe o token de autenticação na URL (gerada via autorização server-to-server).
   * - Valida o host retornado contra domínio oficial (.pcloud.com) e contra SSRF antes da liberação.
   */
  public static async getFileLink(
    fileId: string | number,
    options?: {
      forceDownload?: boolean;
      contentType?: string;
    },
    session?: UserSessionData
  ): Promise<PCloudFileLinkResult> {
    const token = this.getAccessToken(session);

    if (!token) {
      return {
        success: false,
        code: 'NOT_CONFIGURED',
        message: 'Variável de ambiente PCLOUD_ACCESS_TOKEN não configurada no servidor Vercel.'
      };
    }

    const cleanFileId = String(fileId).trim();
    if (!cleanFileId || !/^\d+$/.test(cleanFileId)) {
      return {
        success: false,
        code: 'INVALID_FILE_ID',
        message: 'O identificador do arquivo no pCloud (fileId) deve ser um número inteiro positivo válido.'
      };
    }

    const host = this.getApiHost(session);
    const params = new URLSearchParams();
    params.set('fileid', cleanFileId);
    if (options?.forceDownload) {
      params.set('forcedownload', '1');
    }
    if (options?.contentType) {
      params.set('contenttype', options.contentType.trim());
    }

    const endpoint = `https://${host}/getfilelink?${params.toString()}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          success: false,
          code: 'API_ERROR',
          message: `Servidor da API pCloud retornou status HTTP ${response.status}.`
        };
      }

      const data = await response.json();

      if (data.result === 0 && Array.isArray(data.hosts) && data.hosts.length > 0 && data.path) {
        const downloadHost = String(data.hosts[0]).trim();

        // 1. Validação de segurança de domínio oficial pCloud (impede DNS hijacking ou hosts maliciosos)
        if (!/^[a-zA-Z0-9.-]+\.pcloud\.com$/i.test(downloadHost)) {
          return {
            success: false,
            code: 'UNTRUSTED_HOST',
            message: 'O servidor retornado pelo pCloud não pertence a um domínio oficial confiável (*.pcloud.com).'
          };
        }

        const streamUrl = `https://${downloadHost}${data.path}`;

        // 2. Validação estrita de proteção contra SSRF (bloqueia IPs de loopback, RFC 1918 ou metadados de nuvem)
        const ssrfCheck = await validateUrlForSsrf(streamUrl);
        if (!ssrfCheck.valid) {
          return {
            success: false,
            code: 'SSRF_BLOCKED',
            message: ssrfCheck.error || 'A URL de stream foi bloqueada pela política de segurança SSRF.'
          };
        }

        const expiresAt = typeof data.expires === 'string' ? data.expires : undefined;
        const expiresTimestamp = this.parseExpirationTimestamp(expiresAt);

        return {
          success: true,
          fileId: cleanFileId,
          streamUrl,
          expiresAt,
          expiresTimestamp,
          sizeBytes: typeof data.size === 'number' ? data.size : undefined,
          hosts: data.hosts
        };
      }

      if (data.result === 1000 || data.result === 2000) {
        return {
          success: false,
          code: 'AUTH_FAILED',
          message: 'Falha de autenticação no pCloud ao gerar link de acesso.'
        };
      }

      if (data.result === 2009) {
        return {
          success: false,
          code: 'FILE_NOT_FOUND',
          message: `O arquivo com o ID ${cleanFileId} não foi encontrado na conta pCloud.`
        };
      }

      return {
        success: false,
        code: 'API_ERROR',
        message: data.error || `Erro retornado pelo pCloud (código ${data.result}).`
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      const isTimeout = err?.name === 'AbortError' || String(err?.message).toLowerCase().includes('timeout');

      return {
        success: false,
        code: 'NETWORK_ERROR',
        message: isTimeout
          ? 'Tempo limite de resposta excedido ao solicitar link ao pCloud.'
          : 'Falha de rede ao contatar a API oficial do pCloud.'
      };
    }
  }
}
