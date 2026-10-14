import { google } from 'googleapis';
import type { Credentials } from 'google-auth-library';
import crypto from 'crypto';
import { Redis } from '@upstash/redis';

export interface UserSessionData {
  id: string;
  csrfState: string | null;
  csrfExpiresAt: number | null;
  targetFolderId: string | null;
  tokens: Credentials | null;
  userEmail: string | null;
  userName: string | null;
  connectedAt: string | null;
  lastVerifiedAt: string | null;
  lastActivityAt: number;
  createdAt: number;
}

export interface IRedisClient {
  get<T = any>(key: string): Promise<T | null>;
  set(key: string, value: any, opts?: { ex?: number }): Promise<any>;
  del(key: string): Promise<any>;
}

// Session TTL: 14 days (in seconds and milliseconds)
const SESSION_TTL_SECONDS = 14 * 24 * 60 * 60; // 1,209,600s
const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;

// CSRF state TTL: 10 minutes
const CSRF_TTL_MS = 10 * 60 * 1000;

// Redis key prefix for isolated namespacing
const REDIS_KEY_PREFIX = 'nova:session:';

export class DriveAuthService {
  // Required scope: Read-only access to files and metadata
  // Explanatory note: 'drive.readonly' is strictly read-only, preventing any accidental write/delete
  // while allowing NOVA STORAGE to index file names, sizes, checksums, and stream video content.
  public static readonly REQUIRED_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

  // Configurable / mockable Redis client for tests and dependency injection
  private static customRedisClient: IRedisClient | null = null;

  // In-memory isolated store strictly for non-production environments (development / test without Upstash)
  private static inMemoryDevStore: Map<string, { data: string; expiresAt: number }> | null = null;
  private static warnedDevFallback = false;

  /**
   * Allows injecting a custom or mock Redis client (e.g. in automated unit tests)
   */
  public static setRedisClient(client: IRedisClient | null): void {
    this.customRedisClient = client;
  }

  /**
   * Resets the non-production in-memory store (useful between test cases)
   */
  public static resetInMemoryDevStore(): void {
    if (this.inMemoryDevStore) {
      this.inMemoryDevStore.clear();
    }
    this.warnedDevFallback = false;
  }

  /**
   * Resolves the active Redis client with strict enforcement:
   * - In production: KV_REST_API_URL and KV_REST_API_TOKEN are mandatory. Missing variables throw a controlled error.
   * - In development/test: If env vars are absent and no custom client was set, uses an isolated in-memory store.
   */
  public static getRedisClient(): IRedisClient {
    if (this.customRedisClient) {
      return this.customRedisClient;
    }

    const isProduction = process.env.NODE_ENV === 'production';
    const url = process.env.KV_REST_API_URL?.trim();
    const token = process.env.KV_REST_API_TOKEN?.trim();

    if (url && token) {
      return new Redis({ url, token });
    }

    if (isProduction) {
      throw new Error(
        'Configuração obrigatória ausente em produção: KV_REST_API_URL e KV_REST_API_TOKEN devem estar configurados para conexão com o Upstash Redis.'
      );
    }

    // Isolated fallback ONLY for development and test environments
    if (!this.inMemoryDevStore) {
      this.inMemoryDevStore = new Map();
    }

    if (!this.warnedDevFallback) {
      console.warn(
        '[NOVA STORAGE DEV/TEST] Variáveis KV_REST_API_URL e KV_REST_API_TOKEN não encontradas. Utilizando armazenamento temporário isolado em memória (bloqueado em produção).'
      );
      this.warnedDevFallback = true;
    }

    const store = this.inMemoryDevStore;

    return {
      get: async <T>(key: string): Promise<T | null> => {
        const entry = store.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
          store.delete(key);
          return null;
        }
        return JSON.parse(entry.data) as T;
      },
      set: async (key: string, value: any, opts?: { ex?: number }): Promise<'OK'> => {
        const ttlMs = (opts?.ex || SESSION_TTL_SECONDS) * 1000;
        store.set(key, {
          data: JSON.stringify(value),
          expiresAt: Date.now() + ttlMs
        });
        return 'OK';
      },
      del: async (key: string): Promise<number> => {
        const existed = store.delete(key);
        return existed ? 1 : 0;
      }
    };
  }

  /**
   * Formats the Redis key with the standard prefix
   */
  private static getSessionKey(sessionId: string): string {
    return `${REDIS_KEY_PREFIX}${sessionId}`;
  }

  /**
   * Resolves the explicitly configured, trusted application origin.
   * Does NOT rely on unverified Host headers.
   */
  public static getTrustedOrigin(): string {
    if (process.env.APP_URL?.trim()) {
      return process.env.APP_URL.trim().replace(/\/$/, '');
    }
    return 'http://localhost:3000';
  }

  /**
   * Resolves the OAuth redirect URI based on APP_URL or GOOGLE_REDIRECT_URI
   */
  public static getRedirectUri(): string {
    if (process.env.GOOGLE_REDIRECT_URI?.trim()) {
      return process.env.GOOGLE_REDIRECT_URI.trim();
    }
    const origin = this.getTrustedOrigin();
    return `${origin}/api/storage/drive/callback`;
  }

  /**
   * Retrieves an existing valid session from Upstash Redis, or null if invalid or expired.
   * Renews TTL on active access.
   */
  public static async getValidSession(sessionId: string): Promise<UserSessionData | null> {
    if (!sessionId || typeof sessionId !== 'string' || sessionId.length < 32) {
      return null;
    }

    const key = this.getSessionKey(sessionId);
    const redis = this.getRedisClient();

    let session: UserSessionData | null = null;
    try {
      session = await redis.get<UserSessionData>(key);
    } catch (err: any) {
      console.error('[NOVA STORAGE] Falha ao recuperar sessão do Redis:', err?.message || 'Erro desconhecido');
      throw new Error('Falha na comunicação com o serviço de sessões (Redis indisponível).');
    }

    if (!session) {
      return null;
    }

    const now = Date.now();
    // Validate session lifespan against lastActivityAt
    if (now - (session.lastActivityAt || 0) > SESSION_TTL_MS) {
      try {
        await redis.del(key);
      } catch {
        // Ignora erro de exclusão em sessão já expirada
      }
      return null;
    }

    // Clean up expired CSRF state if past CSRF timeout
    if (session.csrfExpiresAt && now > session.csrfExpiresAt) {
      session.csrfState = null;
      session.csrfExpiresAt = null;
    }

    // Update activity timestamp and refresh Redis TTL
    session.lastActivityAt = now;
    try {
      await redis.set(key, session, { ex: SESSION_TTL_SECONDS });
    } catch (err: any) {
      console.error('[NOVA STORAGE] Falha ao renovar TTL da sessão no Redis:', err?.message || 'Erro desconhecido');
      throw new Error('Falha na persistência da sessão no Redis.');
    }

    return session;
  }

  /**
   * Creates a new cryptographically random session and stores it in Upstash Redis
   */
  public static async createSession(): Promise<UserSessionData> {
    const sessionId = crypto.randomBytes(32).toString('hex');
    const now = Date.now();

    const newSession: UserSessionData = {
      id: sessionId,
      csrfState: null,
      csrfExpiresAt: null,
      targetFolderId: null,
      tokens: null,
      userEmail: null,
      userName: null,
      connectedAt: null,
      lastVerifiedAt: null,
      lastActivityAt: now,
      createdAt: now
    };

    await this.saveSession(newSession);
    return newSession;
  }

  /**
   * Persists the session state directly to Upstash Redis with 14 days TTL.
   * Throws a controlled error if Redis is unreachable.
   */
  public static async saveSession(session: UserSessionData): Promise<void> {
    if (!session || !session.id) {
      throw new Error('Sessão inválida para gravação.');
    }

    const key = this.getSessionKey(session.id);
    const redis = this.getRedisClient();

    try {
      await redis.set(key, session, { ex: SESSION_TTL_SECONDS });
    } catch (err: any) {
      console.error('[NOVA STORAGE] Falha ao persistir sessão no Redis:', err?.message || 'Erro desconhecido');
      throw new Error('Falha na comunicação com o serviço de sessões (Upstash Redis indisponível).');
    }
  }

  /**
   * Updates session tokens ensuring existing fields (scope, token_type, refresh_token, etc.)
   * are preserved when new values are undefined or absent, while supporting legitimate
   * refresh_token rotation from Google. Never exposes tokens in logs or responses.
   */
  public static async updateSessionTokens(session: UserSessionData, newTokens: Credentials): Promise<void> {
    const existingTokens = session.tokens || {};

    // Do not let undefined values in newTokens overwrite existing defined fields
    const validNewTokens: Partial<Credentials> = {};
    for (const [key, value] of Object.entries(newTokens)) {
      if (value !== undefined) {
        (validNewTokens as any)[key] = value;
      }
    }

    const mergedTokens: Credentials = {
      ...existingTokens,
      ...validNewTokens
    };

    // Explicitly guarantee refresh_token preservation unless Google provided a new valid refresh_token
    const newRefreshToken = typeof newTokens.refresh_token === 'string' && newTokens.refresh_token.trim().length > 0
      ? newTokens.refresh_token.trim()
      : undefined;

    if (newRefreshToken) {
      mergedTokens.refresh_token = newRefreshToken;
    } else if (existingTokens.refresh_token) {
      mergedTokens.refresh_token = existingTokens.refresh_token;
    } else {
      delete mergedTokens.refresh_token;
    }

    session.tokens = mergedTokens;
    session.lastActivityAt = Date.now();

    await this.saveSession(session);
  }

  /**
   * Check if Google OAuth credentials are present in server environment
   */
  public static areCredentialsConfigured(): {
    configured: boolean;
    clientIdConfigured: boolean;
    clientSecretConfigured: boolean;
    redirectUri: string;
    trustedOrigin: string;
  } {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
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
   * Creates an instance of Google OAuth2 client with current credentials
   */
  public static getOAuth2Client(): any {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    const redirectUri = this.getRedirectUri();

    if (!clientId || !clientSecret) {
      throw new Error('GOOGLE_CLIENT_ID ou GOOGLE_CLIENT_SECRET não configurados no servidor.');
    }

    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  }

  /**
   * Creates an authenticated OAuth2 client with token-refresh listener attached.
   * Ensures that any token refresh triggered during API calls (e.g. getStatus, listFiles)
   * preserves the existing refresh_token and commits the update to Upstash Redis.
   */
  public static getAuthenticatedClient(session: UserSessionData): any {
    const oauth2Client = this.getOAuth2Client();
    if (!session.tokens) {
      throw new Error('Sessão sem tokens de autenticação.');
    }
    oauth2Client.setCredentials(session.tokens);

    oauth2Client.on('tokens', (newTokens: Credentials) => {
      DriveAuthService.updateSessionTokens(session, newTokens).catch((err: any) => {
        console.error('[NOVA STORAGE] Falha ao persistir tokens atualizados no Redis:', err?.message || 'Erro desconhecido');
      });
    });

    return oauth2Client;
  }

  /**
   * Generates authorization URL with CSRF state protection tied to the session and saved in Redis
   */
  public static async generateAuthorizationUrl(
    session: UserSessionData,
    targetFolderId?: string
  ): Promise<{ authUrl: string; state: string }> {
    const { configured } = this.areCredentialsConfigured();
    if (!configured) {
      throw new Error(
        'Credenciais do Google Cloud OAuth (GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET) não estão definidas no arquivo de ambiente (.env).'
      );
    }

    const csrfState = crypto.randomBytes(32).toString('hex');
    session.csrfState = csrfState;
    session.csrfExpiresAt = Date.now() + CSRF_TTL_MS;
    session.lastActivityAt = Date.now();

    if (targetFolderId) {
      session.targetFolderId = targetFolderId.trim();
    }

    await this.saveSession(session);

    const oauth2Client = this.getOAuth2Client();

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline', // Requests refresh_token for persistent connection
      scope: [this.REQUIRED_SCOPE],
      state: csrfState,
      prompt: 'consent', // Forces refresh token issuance on first connection
      include_granted_scopes: true
    });

    return { authUrl, state: csrfState };
  }

  /**
   * Handles the OAuth callback, strictly validates CSRF state, and retrieves tokens.
   * State and tokens are persisted to Upstash Redis.
   */
  public static async handleCallback(
    session: UserSessionData,
    code: string,
    state: string
  ): Promise<{ success: boolean; userEmail?: string; error?: string }> {
    const now = Date.now();

    // CSRF Protection validation
    if (!session.csrfState || session.csrfState !== state) {
      session.csrfState = null;
      session.csrfExpiresAt = null;
      await this.saveSession(session).catch(() => {});
      return {
        success: false,
        error: 'Validação CSRF falhou: o parâmetro state recebido é inválido.'
      };
    }

    if (session.csrfExpiresAt && now > session.csrfExpiresAt) {
      session.csrfState = null;
      session.csrfExpiresAt = null;
      await this.saveSession(session).catch(() => {});
      return {
        success: false,
        error: 'Validação CSRF falhou: a solicitação de autorização expirou (tempo limite de 10 minutos).'
      };
    }

    // Invalidate state immediately after consumption
    session.csrfState = null;
    session.csrfExpiresAt = null;

    try {
      const oauth2Client = this.getOAuth2Client();
      const { tokens } = await oauth2Client.getToken(code);

      if (!tokens || !tokens.access_token) {
        return {
          success: false,
          error: 'Falha ao trocar código de autorização por tokens de acesso.'
        };
      }

      oauth2Client.setCredentials(tokens);

      // Validate connection with a real API call before declaring active state
      const drive = google.drive({ version: 'v3', auth: oauth2Client });
      const about = await drive.about.get({
        fields: 'user(displayName,emailAddress,photoLink)'
      });

      const user = about.data.user;

      session.tokens = tokens;
      session.userEmail = user?.emailAddress || 'Conta Google Autorizada';
      session.userName = user?.displayName || 'Usuário';
      session.connectedAt = new Date().toISOString();
      session.lastVerifiedAt = new Date().toISOString();
      session.lastActivityAt = Date.now();

      await this.saveSession(session);

      return {
        success: true,
        userEmail: session.userEmail
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Erro inesperado durante a troca de tokens OAuth com a API do Google.'
      };
    }
  }

  /**
   * Verifies connection state by testing real API connectivity if tokens exist.
   * Updates lastVerifiedAt in Upstash Redis.
   */
  public static async getStatus(session: UserSessionData): Promise<{
    configured: boolean;
    connected: boolean;
    status: 'not_configured' | 'pending_auth' | 'connected' | 'error';
    userEmail?: string | null;
    userName?: string | null;
    targetFolderId?: string | null;
    message: string;
    redirectUri: string;
    trustedOrigin: string;
    checkedAt: string;
  }> {
    const { configured, redirectUri, trustedOrigin } = this.areCredentialsConfigured();

    if (!configured) {
      return {
        configured: false,
        connected: false,
        status: 'not_configured',
        message: 'Variáveis GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET não configuradas no servidor.',
        redirectUri,
        trustedOrigin,
        checkedAt: new Date().toISOString()
      };
    }

    if (!session.tokens || !session.tokens.access_token) {
      return {
        configured: true,
        connected: false,
        status: 'pending_auth',
        targetFolderId: session.targetFolderId,
        message: 'Credenciais presentes no servidor. Autorização do usuário via popup OAuth necessária.',
        redirectUri,
        trustedOrigin,
        checkedAt: new Date().toISOString()
      };
    }

    // Tokens exist: Perform health check with Drive API
    try {
      const oauth2Client = this.getAuthenticatedClient(session);

      const drive = google.drive({ version: 'v3', auth: oauth2Client });
      const about = await drive.about.get({
        fields: 'user(displayName,emailAddress),storageQuota'
      });

      session.lastVerifiedAt = new Date().toISOString();
      session.lastActivityAt = Date.now();
      const user = about.data.user;

      await this.saveSession(session);

      return {
        configured: true,
        connected: true,
        status: 'connected',
        userEmail: user?.emailAddress || session.userEmail,
        userName: user?.displayName || session.userName,
        targetFolderId: session.targetFolderId,
        message: `Conectado com sucesso à conta ${user?.emailAddress || session.userEmail}.`,
        redirectUri,
        trustedOrigin,
        checkedAt: new Date().toISOString()
      };
    } catch (err: any) {
      return {
        configured: true,
        connected: false,
        status: 'error',
        userEmail: session.userEmail,
        targetFolderId: session.targetFolderId,
        message: `Falha na validação do token: ${err.message || 'Token expirado ou revogado'}.`,
        redirectUri,
        trustedOrigin,
        checkedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Lists real video files from Google Drive
   * CRITICAL: If not connected or folder does not exist, returns empty list with explicit error.
   * Never invents files or leaks tokens!
   */
  public static async listFiles(
    session: UserSessionData,
    options: {
      folderId?: string;
      pageSize?: number;
      pageToken?: string;
      videosOnly?: boolean;
    }
  ): Promise<{
    files: Array<{
      id: string;
      name: string;
      mimeType: string;
      sizeBytes: number;
      md5Checksum?: string;
      createdTime?: string;
      modifiedTime?: string;
      videoDetails?: {
        width?: number;
        height?: number;
        durationMillis?: number;
      };
    }>;
    nextPageToken?: string | null;
    total: number;
    status: 'connected' | 'not_configured' | 'error';
    error?: string;
  }> {
    if (!session.tokens || !session.tokens.access_token) {
      return {
        files: [],
        total: 0,
        status: 'not_configured',
        error: 'Google Drive não configurado ou sessão OAuth não autorizada no servidor.'
      };
    }

    try {
      const oauth2Client = this.getAuthenticatedClient(session);

      const drive = google.drive({ version: 'v3', auth: oauth2Client });
      const targetFolder = options.folderId?.trim() || session.targetFolderId?.trim();

      // Build query
      const queryParts: string[] = ['trashed = false'];

      if (targetFolder) {
        queryParts.push(`'${targetFolder.replace(/'/g, "\\'")}' in parents`);
      }

      // Exclude folders
      queryParts.push("mimeType != 'application/vnd.google-apps.folder'");

      // Filter video files if requested
      if (options.videosOnly !== false) {
        queryParts.push(
          "(mimeType contains 'video/' or name contains '.mkv' or name contains '.mp4' or name contains '.webm' or name contains '.avi')"
        );
      }

      const q = queryParts.join(' and ');
      const pageSize = Math.min(Math.max(options.pageSize || 50, 1), 100);

      const response = await drive.files.list({
        q,
        pageSize,
        pageToken: options.pageToken,
        fields: 'nextPageToken, files(id, name, mimeType, size, md5Checksum, createdTime, modifiedTime, videoMediaMetadata)',
        orderBy: 'modifiedTime desc'
      });

      const driveFiles = response.data.files || [];

      const mappedFiles = driveFiles.map((file) => ({
        id: file.id || '',
        name: file.name || 'Sem nome',
        mimeType: file.mimeType || 'application/octet-stream',
        sizeBytes: parseInt(file.size || '0', 10),
        md5Checksum: file.md5Checksum || undefined,
        createdTime: file.createdTime || undefined,
        modifiedTime: file.modifiedTime || undefined,
        videoDetails: file.videoMediaMetadata
          ? {
              width: file.videoMediaMetadata.width || undefined,
              height: file.videoMediaMetadata.height || undefined,
              durationMillis: file.videoMediaMetadata.durationMillis
                ? parseInt(file.videoMediaMetadata.durationMillis, 10)
                : undefined
            }
          : undefined
      }));

      session.lastActivityAt = Date.now();
      await this.saveSession(session).catch(() => {});

      return {
        files: mappedFiles,
        nextPageToken: response.data.nextPageToken || null,
        total: mappedFiles.length,
        status: 'connected'
      };
    } catch (err: any) {
      return {
        files: [],
        total: 0,
        status: 'error',
        error: `Erro da API do Google Drive: ${err.message || 'Falha ao consultar arquivos'}`
      };
    }
  }

  /**
   * Disconnect and revoke tokens for a session, updating Upstash Redis
   */
  public static async disconnect(session: UserSessionData): Promise<boolean> {
    if (session.tokens?.access_token) {
      try {
        const oauth2Client = this.getOAuth2Client();
        oauth2Client.setCredentials(session.tokens);
        await oauth2Client.revokeCredentials();
      } catch {
        // Ignore revocation errors if already expired or revoked remotely
      }
    }

    session.tokens = null;
    session.userEmail = null;
    session.userName = null;
    session.connectedAt = null;
    session.lastVerifiedAt = null;
    session.targetFolderId = null;
    session.lastActivityAt = Date.now();

    await this.saveSession(session);
    return true;
  }
}
