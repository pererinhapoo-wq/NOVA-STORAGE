import { google } from 'googleapis';
import type { Credentials } from 'google-auth-library';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

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

// Session store directory and file path (ignored in .gitignore)
const DATA_DIR = path.resolve(process.cwd(), '.data');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

// Session TTL: 14 days
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
// CSRF state TTL: 10 minutes
const CSRF_TTL_MS = 10 * 60 * 1000;

export class DriveAuthService {
  // Required scope: Read-only access to files and metadata
  // Explanatory note: 'drive.readonly' is strictly read-only, preventing any accidental write/delete
  // while allowing NOVA STORAGE to index file names, sizes, checksums, and stream video content.
  public static readonly REQUIRED_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

  // In-memory cache of sessions
  private static sessionStore = new Map<string, UserSessionData>();
  private static isInitialized = false;

  /**
   * Initializes session store from disk cache if present
   */
  private static ensureInitialized(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;

    try {
      if (fs.existsSync(SESSIONS_FILE)) {
        const raw = fs.readFileSync(SESSIONS_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const now = Date.now();
          for (const item of parsed) {
            // Only load non-expired sessions
            if (item && item.id && now - (item.lastActivityAt || 0) < SESSION_TTL_MS) {
              this.sessionStore.set(item.id, item);
            }
          }
        }
      }
    } catch (e) {
      console.warn('[NOVA STORAGE] Aviso: Falha ao carregar sessões em disco, iniciando em memória.', e);
    }
  }

  /**
   * Persists active sessions to secure local file using atomic write.
   * If writing or renaming fails, any temporary file is cleaned up,
   * without deleting or corrupting the existing sessions file.
   */
  private static saveSessionsToDisk(): void {
    let tempFile: string | null = null;
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
      }
      const data = Array.from(this.sessionStore.values());
      tempFile = path.join(DATA_DIR, `sessions.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`);
      fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), { mode: 0o600 });
      fs.renameSync(tempFile, SESSIONS_FILE);
      tempFile = null;
    } catch (e: any) {
      if (tempFile) {
        try {
          if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
          }
        } catch {
          // ignore cleanup errors
        }
      }
      console.warn('[NOVA STORAGE] Aviso: Falha ao persistir sessões em disco.', e?.message || 'Erro desconhecido');
    }
  }

  /**
   * Cleans up expired sessions and stale CSRF tokens
   */
  public static pruneExpiredSessions(): void {
    this.ensureInitialized();
    const now = Date.now();
    let changed = false;

    for (const [id, session] of this.sessionStore.entries()) {
      if (now - session.lastActivityAt > SESSION_TTL_MS) {
        this.sessionStore.delete(id);
        changed = true;
      } else if (session.csrfExpiresAt && now > session.csrfExpiresAt) {
        session.csrfState = null;
        session.csrfExpiresAt = null;
        changed = true;
      }
    }

    if (changed) {
      this.saveSessionsToDisk();
    }
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
   * Retrieves an existing valid session, or null if invalid or expired
   */
  public static getValidSession(sessionId: string): UserSessionData | null {
    if (!sessionId || typeof sessionId !== 'string' || sessionId.length < 32) {
      return null;
    }
    this.ensureInitialized();
    this.pruneExpiredSessions();

    const session = this.sessionStore.get(sessionId);
    if (!session) return null;

    if (Date.now() - session.lastActivityAt > SESSION_TTL_MS) {
      this.sessionStore.delete(sessionId);
      this.saveSessionsToDisk();
      return null;
    }

    session.lastActivityAt = Date.now();
    return session;
  }

  /**
   * Creates a new cryptographically random session
   */
  public static createSession(): UserSessionData {
    this.ensureInitialized();
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

    this.sessionStore.set(sessionId, newSession);
    this.saveSessionsToDisk();
    return newSession;
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
   * Updates session tokens ensuring existing fields (scope, token_type, refresh_token, etc.)
   * are preserved when new values are undefined or absent, while supporting legitimate
   * refresh_token rotation from Google.
   */
  public static updateSessionTokens(session: UserSessionData, newTokens: Credentials): void {
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
    this.saveSessionsToDisk();
  }

  /**
   * Creates an authenticated OAuth2 client with token-refresh listener attached.
   * Ensures that any token refresh triggered during API calls (e.g. getStatus, listFiles)
   * preserves the existing refresh_token and commits the update to session storage.
   */
  public static getAuthenticatedClient(session: UserSessionData): any {
    const oauth2Client = this.getOAuth2Client();
    if (!session.tokens) {
      throw new Error('Sessão sem tokens de autenticação.');
    }
    oauth2Client.setCredentials(session.tokens);

    oauth2Client.on('tokens', (newTokens: Credentials) => {
      DriveAuthService.updateSessionTokens(session, newTokens);
    });

    return oauth2Client;
  }

  /**
   * Generates authorization URL with CSRF state protection tied to the session
   */
  public static generateAuthorizationUrl(
    session: UserSessionData,
    targetFolderId?: string
  ): { authUrl: string; state: string } {
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

    this.saveSessionsToDisk();

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
   * Handles the OAuth callback, strictly validates CSRF state, and retrieves tokens
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
      this.saveSessionsToDisk();
      return {
        success: false,
        error: 'Validação CSRF falhou: o parâmetro state recebido é inválido.'
      };
    }

    if (session.csrfExpiresAt && now > session.csrfExpiresAt) {
      session.csrfState = null;
      session.csrfExpiresAt = null;
      this.saveSessionsToDisk();
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

      this.saveSessionsToDisk();

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
   * Verifies connection state by testing real API connectivity if tokens exist
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

      DriveAuthService.saveSessionsToDisk();

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
   * CRITICAL: If not connected or folder does not exist, returns empty list with explicit error
   * Never invents files!
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
   * Disconnect and revoke tokens for a session
   */
  public static async disconnect(session: UserSessionData): Promise<boolean> {
    if (session.tokens?.access_token) {
      try {
        const oauth2Client = this.getOAuth2Client();
        oauth2Client.setCredentials(session.tokens);
        await oauth2Client.revokeCredentials();
      } catch {
        // Ignore revocation errors if already expired
      }
    }

    session.tokens = null;
    session.userEmail = null;
    session.userName = null;
    session.connectedAt = null;
    session.lastVerifiedAt = null;
    session.targetFolderId = null;
    session.lastActivityAt = Date.now();

    this.saveSessionsToDisk();
    return true;
  }
}
