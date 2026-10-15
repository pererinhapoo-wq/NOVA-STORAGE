import { StorageProviderAdapter, ProviderConnectionTestResult, RemoteFileMetadata } from '../storageAdapter.interface';
import { ProviderStatus, ProviderType } from '../../../types/storage';

export interface DriveVideoItem {
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
  webViewLink: string;
  previewUrl: string;
}

export interface DriveFileListResponse {
  files: DriveVideoItem[];
  total: number;
  nextPageToken?: string | null;
  status: 'connected' | 'not_configured' | 'error';
  error?: string;
  timestamp?: string;
}

/**
 * GoogleDriveStorageAdapter
 * 
 * Connector for Google Drive API v3 via backend proxy routes.
 * Follows NOVA STORAGE strict architecture:
 * - Zero token or credential exposure on client.
 * - Real API queries routed through server session.
 * - Does not download large video streams through Vercel serverless functions.
 * - Directly leverages Google Drive preview & view links.
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
        credentials: 'include',
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
    } catch {
      return {
        success: false,
        code: 'NOT_CONFIGURED',
        message: 'Não foi possível contatar o servidor backend para validação. Verifique se o servidor Express está ativo.',
        checkedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Lists video files available in the authenticated Google Drive account.
   * Respects optional folderId: empty string/undefined lists all accessible files,
   * while a folder ID filters strictly within that directory.
   */
  async listVideos(options?: {
    folderId?: string;
    pageSize?: number;
    pageToken?: string;
  }): Promise<DriveFileListResponse> {
    const targetFolder = options?.folderId !== undefined 
      ? options.folderId.trim() 
      : (this.configuredFolderId?.trim() || '');

    const params = new URLSearchParams();
    if (targetFolder) {
      params.set('folderId', targetFolder);
    }
    if (options?.pageSize) {
      params.set('pageSize', String(options.pageSize));
    }
    if (options?.pageToken) {
      params.set('pageToken', options.pageToken);
    }

    const queryStr = params.toString() ? `?${params.toString()}` : '';

    try {
      const response = await fetch(`/api/storage/drive/files${queryStr}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        },
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          files: [],
          total: 0,
          status: 'error',
          error: errorData.error || errorData.message || `Erro HTTP ${response.status} ao consultar arquivos.`,
          timestamp: new Date().toISOString()
        };
      }

      const data = await response.json();
      const rawFiles: any[] = Array.isArray(data.files) ? data.files : [];

      const mappedFiles: DriveVideoItem[] = rawFiles.map((f) => ({
        id: String(f.id || ''),
        name: String(f.name || 'Arquivo sem nome'),
        mimeType: String(f.mimeType || 'video/mp4'),
        sizeBytes: Number(f.sizeBytes || 0),
        md5Checksum: f.md5Checksum ? String(f.md5Checksum) : undefined,
        createdTime: f.createdTime ? String(f.createdTime) : undefined,
        modifiedTime: f.modifiedTime ? String(f.modifiedTime) : undefined,
        videoDetails: f.videoDetails
          ? {
              width: f.videoDetails.width ? Number(f.videoDetails.width) : undefined,
              height: f.videoDetails.height ? Number(f.videoDetails.height) : undefined,
              durationMillis: f.videoDetails.durationMillis ? Number(f.videoDetails.durationMillis) : undefined
            }
          : undefined,
        webViewLink: `https://drive.google.com/file/d/${f.id}/view`,
        previewUrl: `https://drive.google.com/file/d/${f.id}/preview`
      }));

      return {
        files: mappedFiles,
        total: data.total ?? mappedFiles.length,
        nextPageToken: data.nextPageToken || null,
        status: data.status || 'connected',
        error: data.error,
        timestamp: data.timestamp || new Date().toISOString()
      };
    } catch (err: any) {
      return {
        files: [],
        total: 0,
        status: 'error',
        error: err?.message || 'Falha de conexão com o servidor ao consultar arquivos do Google Drive.',
        timestamp: new Date().toISOString()
      };
    }
  }

  async listFolderContents(folderRemoteId?: string): Promise<RemoteFileMetadata[]> {
    const res = await this.listVideos({ folderId: folderRemoteId });
    return res.files.map((file) => ({
      remoteId: file.id,
      name: file.name,
      sizeBytes: file.sizeBytes,
      mimeType: file.mimeType,
      md5OrSha256Checksum: file.md5Checksum,
      createdTime: file.createdTime,
      modifiedTime: file.modifiedTime,
      downloadUrl: file.webViewLink
    }));
  }

  async getAuthUrl(folderId?: string): Promise<{ url?: string; state?: string; error?: string }> {
    try {
      const url = folderId
        ? `/api/storage/drive/auth-url?folderId=${encodeURIComponent(folderId)}`
        : '/api/storage/drive/auth-url';
      const response = await fetch(url, { credentials: 'include' });
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
      const res = await fetch('/api/storage/drive/disconnect', { 
        method: 'POST',
        credentials: 'include'
      });
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
      const res = await fetch('/api/storage/drive/status', { credentials: 'include' });
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
      notice: 'Armazenamento remoto do Google Drive utiliza visualização direta segura.'
    };
  }

  /**
   * Helper: Formats raw byte counts into human-readable strings (KB, MB, GB).
   */
  public static formatBytes(bytes: number): string {
    if (!bytes || isNaN(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const val = bytes / Math.pow(1024, i);
    return `${val.toFixed(i > 1 ? 2 : 0)} ${units[i]}`;
  }

  /**
   * Helper: Formats ISO dates to localized date-time strings.
   */
  public static formatDate(isoString?: string): string {
    if (!isoString) return 'Data não informada';
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  }

  /**
   * Known video file extensions
   */
  public static readonly VIDEO_EXTENSIONS = [
    '.mp4', '.mkv', '.webm', '.avi', '.mov', '.m4v', '.flv', '.ts', '.wmv', '.3gp', '.ogv', '.mpg', '.mpeg'
  ];

  /**
   * Known non-video extensions explicitly excluded (PDF, ISO, archives, documents, images, audio)
   */
  public static readonly NON_VIDEO_EXTENSIONS = [
    '.pdf', '.iso', '.img', '.bin', '.zip', '.rar', '.7z', '.tar', '.gz', '.txt',
    '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.exe', '.apk', '.dmg',
    '.srt', '.vtt', '.ass', '.sub', '.nfo', '.mp3', '.flac', '.wav', '.aac', '.m4a', '.ogg'
  ];

  /**
   * Determines if a file is a valid, recognized video file based on extension and MIME type.
   * Explicitly excludes PDFs, ISOs, documents, and archives even if categorized loosely.
   */
  public static isVideoFile(name: string, mimeType?: string): boolean {
    const nameLower = (name || '').toLowerCase().trim();
    const mimeLower = (mimeType || '').toLowerCase().trim();

    // 1. Explicit exclusion of known non-video extensions (e.g. .pdf, .iso, .zip, etc.)
    for (const ext of GoogleDriveStorageAdapter.NON_VIDEO_EXTENSIONS) {
      if (nameLower.endsWith(ext)) {
        return false;
      }
    }

    // 2. Explicit exclusion of non-video MIME types
    if (
      mimeLower.includes('pdf') ||
      mimeLower.includes('iso') ||
      mimeLower.startsWith('image/') ||
      mimeLower.startsWith('audio/') ||
      mimeLower.startsWith('text/') ||
      mimeLower.includes('application/zip') ||
      mimeLower.includes('application/x-zip') ||
      mimeLower.includes('application/x-rar') ||
      mimeLower.includes('application/x-7z') ||
      mimeLower.includes('application/x-iso9660-image') ||
      mimeLower.includes('application/x-raw-disk-image')
    ) {
      return false;
    }

    // 3. Explicit inclusion of video extensions
    for (const ext of GoogleDriveStorageAdapter.VIDEO_EXTENSIONS) {
      if (nameLower.endsWith(ext)) {
        return true;
      }
    }

    // 4. Video MIME types
    if (mimeLower.startsWith('video/')) {
      return true;
    }

    return false;
  }

  /**
   * Helper: Infers format extension / codec container from name or MIME type.
   */
  public static inferFormat(name: string, mimeType?: string): string {
    const nameLower = (name || '').toLowerCase();
    const mimeLower = (mimeType || '').toLowerCase();

    // Video formats
    if (nameLower.endsWith('.mkv') || mimeLower.includes('matroska')) return 'MKV';
    if (nameLower.endsWith('.mp4') || mimeLower === 'video/mp4') return 'MP4';
    if (nameLower.endsWith('.webm') || mimeLower === 'video/webm') return 'WEBM';
    if (nameLower.endsWith('.avi') || mimeLower.includes('x-msvideo') || mimeLower.includes('avi')) return 'AVI';
    if (nameLower.endsWith('.mov') || mimeLower.includes('quicktime')) return 'MOV';
    if (nameLower.endsWith('.m4v')) return 'M4V';
    if (nameLower.endsWith('.ts') || mimeLower.includes('mp2t')) return 'MPEG-TS';
    if (nameLower.endsWith('.flv') || mimeLower.includes('x-flv')) return 'FLV';
    if (nameLower.endsWith('.wmv') || mimeLower.includes('ms-wmv')) return 'WMV';

    // Non-video formats explicitly identified
    if (nameLower.endsWith('.pdf') || mimeLower.includes('pdf')) return 'PDF';
    if (nameLower.endsWith('.iso') || mimeLower.includes('iso')) return 'ISO';
    if (nameLower.endsWith('.zip') || nameLower.endsWith('.rar') || nameLower.endsWith('.7z')) return 'ARQUIVO';

    if (mimeLower.startsWith('video/')) {
      return 'VÍDEO';
    }

    return 'OUTRO';
  }

  /**
   * Helper: Checks if format has native browser HTML5 playback support
   */
  public static isNativePlayable(format: string): boolean {
    return format === 'MP4' || format === 'WEBM';
  }

  /**
   * Generates direct Google Drive file viewer URL
   */
  public static getDriveViewUrl(fileId: string): string {
    return `https://drive.google.com/file/d/${fileId}/view`;
  }

  /**
   * Generates embedded preview URL for Google Drive files
   */
  public static getPreviewUrl(fileId: string): string {
    return `https://drive.google.com/file/d/${fileId}/preview`;
  }
}
