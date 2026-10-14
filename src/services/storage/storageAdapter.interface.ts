import { ProviderStatus, ProviderType } from '../../types/storage';

export interface RemoteFileMetadata {
  remoteId: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  md5OrSha256Checksum?: string;
  createdTime?: string;
  modifiedTime?: string;
  downloadUrl?: string; // Will only be populated via backend signed URL proxy
}

export interface ProviderConnectionTestResult {
  success: boolean;
  code: 'NOT_CONFIGURED' | 'INVALID_CREDENTIALS' | 'INSUFFICIENT_SCOPES' | 'OK';
  message: string;
  checkedAt: string;
  details?: Record<string, unknown>;
}

/**
 * StorageProviderAdapter Interface
 * 
 * Formal abstraction layer for remote storage backends.
 * In accordance with NOVA STORAGE architecture rules:
 * - No credentials or secret keys are stored in client code.
 * - Real API calls must be proxied through backend routes or client-side OAuth when provisioned.
 * - Initial state reflects "not_configured" truthfully.
 */
export interface StorageProviderAdapter {
  readonly providerType: ProviderType;
  readonly providerName: string;
  
  getStatus(): ProviderStatus;
  
  testConnection(config: Record<string, string>): Promise<ProviderConnectionTestResult>;
  
  listFolderContents(folderRemoteId?: string): Promise<RemoteFileMetadata[]>;
  
  generateSignedStreamToken(fileRemoteId: string): Promise<{
    streamUrl: string | null;
    expiresInSeconds: number;
    notice: string;
  }>;
}
