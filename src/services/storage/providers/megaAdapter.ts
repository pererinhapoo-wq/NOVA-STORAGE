import { StorageProviderAdapter, ProviderConnectionTestResult, RemoteFileMetadata } from '../storageAdapter.interface';
import { ProviderStatus, ProviderType } from '../../../types/storage';

/**
 * MegaStorageAdapter
 * 
 * Future connector for MEGA Cloud Storage via mega-cmd daemon or web API.
 * Rules:
 * - Does NOT mock real files or simulate uploads.
 * - In this initial phase, reports truthfully that credentials are not configured.
 */
export class MegaStorageAdapter implements StorageProviderAdapter {
  readonly providerType: ProviderType = 'mega';
  readonly providerName: string = 'MEGA Cloud';

  private email: string | null = null;
  private folderHandle: string | null = null;

  constructor(email?: string, folderHandle?: string) {
    this.email = email || null;
    this.folderHandle = folderHandle || null;
  }

  getStatus(): ProviderStatus {
    if (!this.email || !this.folderHandle) {
      return 'not_configured';
    }
    return 'pending_credentials';
  }

  async testConnection(config: Record<string, string>): Promise<ProviderConnectionTestResult> {
    const email = config.megaEmail?.trim();
    const folderHandle = config.targetFolderId?.trim();

    if (!email || !folderHandle) {
      return {
        success: false,
        code: 'NOT_CONFIGURED',
        message: 'Credenciais ausentes. Forneça o identificador de pasta ou conta MEGA para preparar a conexão.',
        checkedAt: new Date().toISOString()
      };
    }

    return {
      success: false,
      code: 'NOT_CONFIGURED',
      message: 'Conexão com MEGA API ainda não configurada no nó de sincronização.',
      checkedAt: new Date().toISOString(),
      details: {
        targetAccount: email,
        folderNode: folderHandle
      }
    };
  }

  async listFolderContents(_folderRemoteId?: string): Promise<RemoteFileMetadata[]> {
    return [];
  }

  async generateSignedStreamToken(_fileRemoteId: string): Promise<{
    streamUrl: string | null;
    expiresInSeconds: number;
    notice: string;
  }> {
    return {
      streamUrl: null,
      expiresInSeconds: 0,
      notice: 'Armazenamento remoto MEGA ainda não ativado nesta versão inicial.'
    };
  }
}
