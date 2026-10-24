export type VideoResolution = '720p' | '1080p' | '1440p' | '4K UHD' | 'SD';

export type VideoContainer = 'MKV' | 'MP4' | 'WEBM' | 'AVI' | 'TS';

export type VideoCodec = 'HEVC / H.265' | 'AVC / H.264' | 'AV1' | 'VP9';

export type ProviderType = 'google_drive' | 'mega' | 'pcloud' | 's3_compatible' | 'local_fs';

export type ProviderStatus = 'not_configured' | 'pending_credentials' | 'testing' | 'connected' | 'error';

export interface AudioStream {
  id: string;
  language: string;
  codec: string;
  channels: string;
  isDefault?: boolean;
}

export interface SubtitleStream {
  id: string;
  language: string;
  format: 'ASS' | 'SRT' | 'VTT' | 'PGS';
  isDefault?: boolean;
  isForced?: boolean;
}

export interface EpisodeFile {
  id: string;
  folderId: string;
  title: string;
  originalFileName: string;
  seriesName: string;
  seasonNumber: number;
  episodeNumber: number;
  fileSizeBytes: number;
  durationSeconds: number;
  resolution: VideoResolution;
  dimensions: {
    width: number;
    height: number;
  };
  frameRate: number;
  videoCodec: VideoCodec;
  bitrateKbps: number;
  audioStreams: AudioStream[];
  subtitleStreams: SubtitleStream[];
  containerFormat: VideoContainer;
  checksumSha256: string;
  storageProviderStatus: 'local_catalog_only' | 'pending_remote_sync' | 'synced';
  remoteFileId: string | null;
  remoteProvider: ProviderType | null;
  catalogedAt: string; // ISO 8601
  lastVerifiedAt: string;
  streamUrl?: string;
  originUrl?: string;
  originTitle?: string;
  capturedAt?: string;
  streamUrlExpiresAt?: string | null;
  sourceType?: 'direct_url' | 'google_drive' | 'local_file';
  notes?: string;
}

export interface Folder {
  id: string;
  name: string;
  slug: string;
  path: string;
  description?: string;
  parentFolderId: string | null;
  category: 'anime' | 'series' | 'movies' | 'specials' | 'uncategorized';
  colorTag?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StorageProviderConfig {
  id: ProviderType;
  name: string;
  status: ProviderStatus;
  statusMessage: string;
  authMethod: 'oauth2' | 'service_account' | 'api_key_session' | 'access_keys';
  endpointDoc: string;
  settings: {
    clientId?: string;
    targetFolderId?: string;
    serviceAccountEmail?: string;
    megaEmail?: string;
    bucketName?: string;
    customEndpoint?: string;
  };
  lastCheckTimestamp: string | null;
}

export interface StorageCatalogStats {
  totalFiles: number;
  totalFolders: number;
  totalSizeFormatted: string;
  totalSizeBytes: number;
  formatCounts: Record<VideoContainer, number>;
  resolutionCounts: Record<VideoResolution, number>;
  providerConnectionStatus: 'unconfigured' | 'ready' | 'partial';
  lastCatalogUpdate: string;
}

export interface FilterState {
  searchQuery: string;
  folderId: string | 'all';
  resolution: VideoResolution | 'all';
  container: VideoContainer | 'all';
  codec: VideoCodec | 'all';
  sortBy: 'date_desc' | 'date_asc' | 'size_desc' | 'size_asc' | 'episode_asc' | 'title_asc';
}

export interface NovaStreamExportManifest {
  manifestVersion: '1.0.0';
  generatedAt: string;
  vaultId: string;
  vaultName: string;
  totalItems: number;
  handshakeProtocol: 'NOVA_STORAGE_BEARER_V1';
  episodes: Array<{
    id: string;
    series: string;
    season: number;
    episode: number;
    title: string;
    fileName: string;
    sizeBytes: number;
    duration: number;
    resolution: string;
    checksum: string;
    streamEndpointAvailable: boolean;
    streamNotice: string;
  }>;
}
