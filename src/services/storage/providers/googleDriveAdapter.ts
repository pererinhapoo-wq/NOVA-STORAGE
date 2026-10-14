import { StorageProviderAdapter, ProviderConnectionTestResult, RemoteFileMetadata } from '../storageAdapter.interface';
import { ProviderStatus, ProviderType } from '../../../types/storage';

/**
 * GoogleDriveStorageAdapter
 * 
 * Future connector for Google Drive API v3.
 * Scopes required:
 * - https://www.googleapis.com/auth/drive.readonly (or drive.file for isolated app folder)
 * 
 * Rules:
 * - Does NOT mock real files or simulate uploads.
 * - In this initial phase, reports truthfully that credentials are not configured.
 */
export class GoogleDriveStorageAdapter implements StorageProviderAdapter {
  readonly providerType: ProviderType = 'google_drive';
  readonly providerName: string = 'Google Drive';

  private configuredClientId: string | null = null;
  private configuredFolderId: string | null = null;

  constructor(initialClientId?: string, initialFolderId?: string) {
    this.configuredClientId = initialClientId || null;
    this.configuredFolderId = initialFolderId || null;
  }

  getStatus(): ProviderStatus {
    if (!this.configuredClientId || !this.configuredFolderId) {
      return 'not_configured';
    }
    return 'pending_credentials';
  }

  async testConnection(config?: Record<string, string>): Promise<ProviderConnectionTestResult> {
    const clientId = config?.clientId?.trim() || this.configuredClientId || undefined;
    const folderId = config?.targetFolderId?.trim() || this.configuredFolderId || undefined;

    try {
      const response = await fetch('/api/storage/drive/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          clientId,
          targetFolderId: folderId
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          code: 'NOT_CONFIGURED',
          message: errorData.message || `Erro no servidor backend (HTTP ${response.status}).`,
          checkedAt: new Date().toISOString()
        };
      }

      const data = await response.json();
      return {
        success: Boolean(data.success),
        code: data.code || 'NOT_CONFIGURED',
        message: data.message || 'Resposta recebida do backend.',
        checkedAt: data.checkedAt || new Date().toISOString(),
        details: data.details
      };
    } catch (networkError) {
      return {
        success: false,
        code: 'NOT_CONFIGURED',
        message: 'Não foi possível contatar o servidor backend para validação. Verifique se o servidor Express está ativo.',
        checkedAt: new Date().toISOString()
      };
    }
  }

  async listFolderContents(_folderRemoteId?: string): Promise<RemoteFileMetadata[]> {
    try {
      const response = await fetch('/api/storage/drive/files');
      if (!response.ok) {
        return [];
      }
      const data = await response.json();
      return Array.isArray(data.files) ? data.files : [];
    } catch {
      return [];
    }
  }

  async getAuthUrl(folderId?: string): Promise<{ url?: string; state?: string; error?: string }> {
    try {
      const url = folderId
        ? `/api/storage/drive/auth-url?folderId=${encodeURIComponent(folderId)}`
        : '/api/storage/drive/auth-url';
      const response = await fetch(url);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          error: errorData.message || `Erro no servidor backend (HTTP ${response.status}).`
        };
      }
      return await response.json();
    } catch (err: any) {
      return {
        error: err?.message || 'Falha de rede ao contatar o servidor backend.'
      };
    }
  }

  async disconnect(): Promise<boolean> {
    try {
      const res = await fetch('/api/storage/drive/disconnect', { method: 'POST' });
      return res.ok;
    } catch {
      return false;
    }
  }

  async getBackendStatus(): Promise<{
    configured: boolean;
    connected: boolean;
    status: ProviderStatus;
    userEmail?: string | null;
    userName?: string | null;
    targetFolderId?: string | null;
    message: string;
    redirectUri: string;
  }> {
    try {
      const res = await fetch('/api/storage/drive/status');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err: any) {
      return {
        configured: false,
        connected: false,
        status: 'not_configured',
        message: err.message || 'Backend offline',
        redirectUri: ''
      };
    }
  }

  async generateSignedStreamToken(_fileRemoteId: string): Promise<{
    streamUrl: string | null;
    expiresInSeconds: number;
    notice: string;
  }> {
    return {
      streamUrl: null,
      expiresInSeconds: 0,
      notice: 'Armazenamento remoto do Google Drive ainda não ativado nesta versão inicial.'
    };
  }
}
