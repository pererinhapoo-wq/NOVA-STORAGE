import {
  EpisodeFile,
  Folder,
  StorageCatalogStats,
  StorageProviderConfig,
  VideoContainer,
  VideoResolution
} from '../../types/storage';

const STORAGE_KEYS = {
  FOLDERS: 'nova_storage_folders_v1',
  EPISODES: 'nova_storage_episodes_v1',
  PROVIDERS: 'nova_storage_providers_v1',
  LAST_SEEDED: 'nova_storage_seeded_flag_v1'
};

const INITIAL_FOLDERS: Folder[] = [
  {
    id: 'fld-frieren',
    name: 'Frieren: E a Jornada para o Além',
    slug: 'frieren-beyond-journeys-end',
    path: '/animes/frieren-temporada-1',
    description: 'Temporada 1 completa · Áudio dual e legendas estilizadas ASS',
    parentFolderId: null,
    category: 'anime',
    colorTag: 'cyan',
    createdAt: '2026-09-10T14:20:00Z',
    updatedAt: '2026-10-12T09:15:00Z'
  },
  {
    id: 'fld-dungeon-meshi',
    name: 'Dungeon Meshi',
    slug: 'delicious-in-dungeon',
    path: '/animes/dungeon-meshi-t1',
    description: 'Temporada 1 · Encode HEVC 10-bit',
    parentFolderId: null,
    category: 'anime',
    colorTag: 'amber',
    createdAt: '2026-09-18T18:00:00Z',
    updatedAt: '2026-10-05T11:40:00Z'
  },
  {
    id: 'fld-vinland',
    name: 'Vinland Saga',
    slug: 'vinland-saga',
    path: '/animes/vinland-saga-t2',
    description: 'Temporada 2 (Arco do Escravo) · Master 1080p',
    parentFolderId: null,
    category: 'anime',
    colorTag: 'emerald',
    createdAt: '2026-09-22T20:10:00Z',
    updatedAt: '2026-10-01T16:00:00Z'
  },
  {
    id: 'fld-filmes-specials',
    name: 'Longas e Especiais',
    slug: 'filmes-e-especiais',
    path: '/filmes',
    description: 'Filmes de animação e lançamentos em 4K UHD',
    parentFolderId: null,
    category: 'movies',
    colorTag: 'purple',
    createdAt: '2026-09-28T12:00:00Z',
    updatedAt: '2026-10-11T17:30:00Z'
  }
];

const INITIAL_EPISODES: EpisodeFile[] = [
  {
    id: 'ep-fr-01',
    folderId: 'fld-frieren',
    title: 'O Fim da Jornada',
    originalFileName: '[NovaStore] Frieren - S01E01 - The Journey\'s End [1080p HEVC Dual-Audio].mkv',
    seriesName: 'Frieren: E a Jornada para o Além',
    seasonNumber: 1,
    episodeNumber: 1,
    fileSizeBytes: 1447034880, // ~1.35 GB
    durationSeconds: 1460, // 24m 20s
    resolution: '1080p',
    dimensions: { width: 1920, height: 1080 },
    frameRate: 23.976,
    videoCodec: 'HEVC / H.265',
    bitrateKbps: 7900,
    audioStreams: [
      { id: 'a1', language: 'Japonês', codec: 'FLAC 2.0', channels: '2.0', isDefault: true },
      { id: 'a2', language: 'Português (BR)', codec: 'E-AC-3 5.1', channels: '5.1' }
    ],
    subtitleStreams: [
      { id: 's1', language: 'Português (Brasil)', format: 'ASS', isDefault: true },
      { id: 's2', language: 'Inglês', format: 'SRT' }
    ],
    containerFormat: 'MKV',
    checksumSha256: '9f83c18b2a59a7f369d7a2f0bc3e5d814c19280d87a6b41c098e983f4219a12b',
    storageProviderStatus: 'local_catalog_only',
    remoteFileId: null,
    remoteProvider: null,
    catalogedAt: '2026-09-10T14:25:00Z',
    lastVerifiedAt: '2026-10-13T10:00:00Z',
    notes: 'Encode verificado. Compatível com reprodução direta (Direct Stream).'
  },
  {
    id: 'ep-fr-02',
    folderId: 'fld-frieren',
    title: 'Não Precisa Ser por Mágica',
    originalFileName: '[NovaStore] Frieren - S01E02 - It Didn\'t Have to Be Magic [1080p HEVC Dual-Audio].mkv',
    seriesName: 'Frieren: E a Jornada para o Além',
    seasonNumber: 1,
    episodeNumber: 2,
    fileSizeBytes: 1384120320, // ~1.29 GB
    durationSeconds: 1445,
    resolution: '1080p',
    dimensions: { width: 1920, height: 1080 },
    frameRate: 23.976,
    videoCodec: 'HEVC / H.265',
    bitrateKbps: 7650,
    audioStreams: [
      { id: 'a1', language: 'Japonês', codec: 'FLAC 2.0', channels: '2.0', isDefault: true },
      { id: 'a2', language: 'Português (BR)', codec: 'E-AC-3 5.1', channels: '5.1' }
    ],
    subtitleStreams: [
      { id: 's1', language: 'Português (Brasil)', format: 'ASS', isDefault: true },
      { id: 's2', language: 'Inglês', format: 'SRT' }
    ],
    containerFormat: 'MKV',
    checksumSha256: 'a28bc471d09e3a7589d81fc59b431e288d0119a0e67cf174109ba249f0183cd5',
    storageProviderStatus: 'local_catalog_only',
    remoteFileId: null,
    remoteProvider: null,
    catalogedAt: '2026-09-10T15:10:00Z',
    lastVerifiedAt: '2026-10-13T10:00:00Z'
  },
  {
    id: 'ep-fr-03',
    folderId: 'fld-frieren',
    title: 'Magia Assassina',
    originalFileName: '[NovaStore] Frieren - S01E03 - Killing Magic [1080p HEVC Dual-Audio].mkv',
    seriesName: 'Frieren: E a Jornada para o Além',
    seasonNumber: 1,
    episodeNumber: 3,
    fileSizeBytes: 1512340000,
    durationSeconds: 1450,
    resolution: '1080p',
    dimensions: { width: 1920, height: 1080 },
    frameRate: 23.976,
    videoCodec: 'HEVC / H.265',
    bitrateKbps: 8300,
    audioStreams: [
      { id: 'a1', language: 'Japonês', codec: 'FLAC 2.0', channels: '2.0', isDefault: true },
      { id: 'a2', language: 'Português (BR)', codec: 'E-AC-3 5.1', channels: '5.1' }
    ],
    subtitleStreams: [
      { id: 's1', language: 'Português (Brasil)', format: 'ASS', isDefault: true }
    ],
    containerFormat: 'MKV',
    checksumSha256: 'bc945037d9fa82645eb4884967399db67e651d2834b92c46fca0fba5067ce218',
    storageProviderStatus: 'local_catalog_only',
    remoteFileId: null,
    remoteProvider: null,
    catalogedAt: '2026-09-10T16:00:00Z',
    lastVerifiedAt: '2026-10-13T10:00:00Z'
  },
  {
    id: 'ep-dm-01',
    folderId: 'fld-dungeon-meshi',
    title: 'Hot Pot / Torta de Escorpião',
    originalFileName: '[NovaStore] Dungeon Meshi - S01E01 - Hot Pot and Tart [1080p AVC].mp4',
    seriesName: 'Dungeon Meshi',
    seasonNumber: 1,
    episodeNumber: 1,
    fileSizeBytes: 985661440, // ~940 MB
    durationSeconds: 1485,
    resolution: '1080p',
    dimensions: { width: 1920, height: 1080 },
    frameRate: 23.976,
    videoCodec: 'AVC / H.264',
    bitrateKbps: 5300,
    audioStreams: [
      { id: 'a1', language: 'Japonês', codec: 'AAC-LC', channels: '2.0', isDefault: true },
      { id: 'a2', language: 'Português', codec: 'AAC-LC', channels: '2.0' }
    ],
    subtitleStreams: [
      { id: 's1', language: 'Português', format: 'SRT', isDefault: true }
    ],
    containerFormat: 'MP4',
    checksumSha256: '44d567fe99cba4140026e792c31c77f0a1c1d84b2326ef26e5da7808620bb025',
    storageProviderStatus: 'local_catalog_only',
    remoteFileId: null,
    remoteProvider: null,
    catalogedAt: '2026-09-18T18:15:00Z',
    lastVerifiedAt: '2026-10-12T14:00:00Z'
  },
  {
    id: 'ep-dm-02',
    folderId: 'fld-dungeon-meshi',
    title: 'Assado de Basilisco / Omelete',
    originalFileName: '[NovaStore] Dungeon Meshi - S01E02 - Roast Basilisk [1080p AVC].mp4',
    seriesName: 'Dungeon Meshi',
    seasonNumber: 1,
    episodeNumber: 2,
    fileSizeBytes: 943718400, // ~900 MB
    durationSeconds: 1470,
    resolution: '1080p',
    dimensions: { width: 1920, height: 1080 },
    frameRate: 23.976,
    videoCodec: 'AVC / H.264',
    bitrateKbps: 5120,
    audioStreams: [
      { id: 'a1', language: 'Japonês', codec: 'AAC-LC', channels: '2.0', isDefault: true }
    ],
    subtitleStreams: [
      { id: 's1', language: 'Português', format: 'SRT', isDefault: true }
    ],
    containerFormat: 'MP4',
    checksumSha256: '7b801a6b0c279e83344b1d61556b6b797f1f008f1b6ee24385a498b3353dfbe4',
    storageProviderStatus: 'local_catalog_only',
    remoteFileId: null,
    remoteProvider: null,
    catalogedAt: '2026-09-18T19:00:00Z',
    lastVerifiedAt: '2026-10-12T14:00:00Z'
  },
  {
    id: 'ep-vs-01',
    folderId: 'fld-vinland',
    title: 'Escravo',
    originalFileName: '[NovaStore] Vinland Saga - S02E01 - Slave [1080p AV1].webm',
    seriesName: 'Vinland Saga',
    seasonNumber: 2,
    episodeNumber: 1,
    fileSizeBytes: 817889280, // ~780 MB
    durationSeconds: 1530,
    resolution: '1080p',
    dimensions: { width: 1920, height: 1080 },
    frameRate: 23.976,
    videoCodec: 'AV1',
    bitrateKbps: 4280,
    audioStreams: [
      { id: 'a1', language: 'Japonês', codec: 'Opus 2.0', channels: '2.0', isDefault: true }
    ],
    subtitleStreams: [
      { id: 's1', language: 'Português', format: 'VTT', isDefault: true }
    ],
    containerFormat: 'WEBM',
    checksumSha256: '3f044bb78c66e2c39d8919cf6214ecad96a84090c29a888801d003f9050d2bb2',
    storageProviderStatus: 'local_catalog_only',
    remoteFileId: null,
    remoteProvider: null,
    catalogedAt: '2026-09-22T20:25:00Z',
    lastVerifiedAt: '2026-10-11T08:30:00Z'
  },
  {
    id: 'ep-movie-01',
    folderId: 'fld-filmes-specials',
    title: 'O Menino e a Garça (The Boy and the Heron)',
    originalFileName: 'The.Boy.and.the.Heron.2023.2160p.UHD.HDR.HEVC.Atmos.mkv',
    seriesName: 'Filmes Studio Ghibli',
    seasonNumber: 1,
    episodeNumber: 1,
    fileSizeBytes: 14817633280, // ~13.8 GB
    durationSeconds: 7440, // 2h 04m
    resolution: '4K UHD',
    dimensions: { width: 3840, height: 2160 },
    frameRate: 24.0,
    videoCodec: 'HEVC / H.265',
    bitrateKbps: 16500,
    audioStreams: [
      { id: 'a1', language: 'Japonês', codec: 'Dolby TrueHD Atmos 7.1', channels: '7.1', isDefault: true },
      { id: 'a2', language: 'Português (BR)', codec: 'E-AC-3 5.1', channels: '5.1' }
    ],
    subtitleStreams: [
      { id: 's1', language: 'Português (Brasil)', format: 'ASS', isDefault: true },
      { id: 's2', language: 'Inglês', format: 'PGS' }
    ],
    containerFormat: 'MKV',
    checksumSha256: 'e86b4028d7b324cebcfcfc8021b16eef8392ba30c5e75da7e6ff82cfbf575fa6',
    storageProviderStatus: 'local_catalog_only',
    remoteFileId: null,
    remoteProvider: null,
    catalogedAt: '2026-09-28T12:30:00Z',
    lastVerifiedAt: '2026-10-14T07:10:00Z',
    notes: 'Master 4K HDR10. Pronto para streaming local de altíssima fidelidade.'
  }
];

const INITIAL_PROVIDERS: StorageProviderConfig[] = [
  {
    id: 'google_drive',
    name: 'Google Drive API (v3)',
    status: 'not_configured',
    statusMessage: 'Conexão com armazenamento real ainda não configurada.',
    authMethod: 'oauth2',
    endpointDoc: 'https://developers.google.com/drive/api/v3/reference',
    settings: {
      clientId: '',
      targetFolderId: ''
    },
    lastCheckTimestamp: null
  },
  {
    id: 'pcloud',
    name: 'pCloud Storage API',
    status: 'not_configured',
    statusMessage: 'Conexão com armazenamento real pCloud ainda não configurada.',
    authMethod: 'oauth2',
    endpointDoc: 'https://docs.pcloud.com/',
    settings: {
      targetFolderId: ''
    },
    lastCheckTimestamp: null
  },
  {
    id: 'mega',
    name: 'MEGA Cloud Storage',
    status: 'not_configured',
    statusMessage: 'Conexão com armazenamento real ainda não configurada.',
    authMethod: 'api_key_session',
    endpointDoc: 'https://mega.io/developers',
    settings: {
      megaEmail: '',
      targetFolderId: ''
    },
    lastCheckTimestamp: null
  },
  {
    id: 's3_compatible',
    name: 'Armazenamento S3 / MinIO / Local NAS',
    status: 'not_configured',
    statusMessage: 'Aguardando parâmetros de endpoint S3 ou storage local.',
    authMethod: 'access_keys',
    endpointDoc: 'https://aws.amazon.com/s3/',
    settings: {
      bucketName: '',
      customEndpoint: ''
    },
    lastCheckTimestamp: null
  }
];

export class LocalCatalogService {
  /**
   * Initialize or retrieve folders
   */
  static getFolders(): Folder[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.FOLDERS);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // Fallback
    }
    this.saveFolders(INITIAL_FOLDERS);
    return INITIAL_FOLDERS;
  }

  static saveFolders(folders: Folder[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.FOLDERS, JSON.stringify(folders));
    } catch (e) {
      console.warn('Erro ao salvar pastas no localStorage', e);
    }
  }

  /**
   * Initialize or retrieve episodes
   */
  static getEpisodes(): EpisodeFile[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.EPISODES);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // Fallback
    }
    this.saveEpisodes(INITIAL_EPISODES);
    return INITIAL_EPISODES;
  }

  static saveEpisodes(episodes: EpisodeFile[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.EPISODES, JSON.stringify(episodes));
    } catch (e) {
      console.warn('Erro ao salvar episódios no localStorage', e);
    }
  }

  /**
   * Storage provider configurations
   */
  static getProviders(): StorageProviderConfig[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.PROVIDERS);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          for (const initial of INITIAL_PROVIDERS) {
            if (!parsed.some(p => p.id === initial.id)) {
              parsed.push(initial);
            }
          }
          return parsed;
        }
      }
    } catch {
      // Fallback
    }
    this.saveProviders(INITIAL_PROVIDERS);
    return INITIAL_PROVIDERS;
  }

  static saveProviders(providers: StorageProviderConfig[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.PROVIDERS, JSON.stringify(providers));
    } catch (e) {
      console.warn('Erro ao salvar providers', e);
    }
  }

  static updateProviderConfig(
    providerId: string,
    updates: Partial<StorageProviderConfig>
  ): StorageProviderConfig[] {
    const list = this.getProviders();
    const index = list.findIndex(p => p.id === providerId);
    if (index >= 0) {
      list[index] = { ...list[index], ...updates };
      this.saveProviders(list);
    }
    return list;
  }

  /**
   * Get calculated statistics
   */
  static getStats(): StorageCatalogStats {
    const episodes = this.getEpisodes();
    const folders = this.getFolders();

    let totalBytes = 0;
    const formatCounts: Record<VideoContainer, number> = {
      MKV: 0,
      MP4: 0,
      WEBM: 0,
      AVI: 0,
      TS: 0
    };

    const resolutionCounts: Record<VideoResolution, number> = {
      '4K UHD': 0,
      '1440p': 0,
      '1080p': 0,
      '720p': 0,
      'SD': 0
    };

    for (const ep of episodes) {
      totalBytes += ep.fileSizeBytes;
      if (ep.containerFormat in formatCounts) {
        formatCounts[ep.containerFormat]++;
      }
      if (ep.resolution in resolutionCounts) {
        resolutionCounts[ep.resolution]++;
      }
    }

    return {
      totalFiles: episodes.length,
      totalFolders: folders.length,
      totalSizeBytes: totalBytes,
      totalSizeFormatted: this.formatBytes(totalBytes),
      formatCounts,
      resolutionCounts,
      providerConnectionStatus: 'unconfigured',
      lastCatalogUpdate: new Date().toISOString()
    };
  }

  /**
   * Add a new episode
   */
  static addEpisode(newEp: Omit<EpisodeFile, 'id' | 'catalogedAt' | 'lastVerifiedAt' | 'storageProviderStatus' | 'remoteFileId' | 'remoteProvider'>): EpisodeFile {
    const episodes = this.getEpisodes();
    const id = `ep-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const fullEpisode: EpisodeFile = {
      ...newEp,
      id,
      storageProviderStatus: 'local_catalog_only',
      remoteFileId: null,
      remoteProvider: null,
      catalogedAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString()
    };

    const updated = [fullEpisode, ...episodes];
    this.saveEpisodes(updated);
    return fullEpisode;
  }

  /**
   * Update an existing episode
   */
  static updateEpisode(id: string, updates: Partial<EpisodeFile>): EpisodeFile | null {
    const episodes = this.getEpisodes();
    const index = episodes.findIndex(e => e.id === id);
    if (index === -1) return null;

    episodes[index] = {
      ...episodes[index],
      ...updates,
      lastVerifiedAt: new Date().toISOString()
    };
    this.saveEpisodes(episodes);
    return episodes[index];
  }

  /**
   * Atualiza com segurança a URL do fluxo e os metadados de origem de um episódio
   * Preserva todos os demais dados intactos e sem migrações destrutivas.
   */
  static updateEpisodeStreamOrigin(
    id: string,
    streamData: {
      streamUrl?: string;
      originUrl?: string;
      originTitle?: string;
      capturedAt?: string;
      streamUrlExpiresAt?: string | null;
    }
  ): EpisodeFile | null {
    return this.updateEpisode(id, streamData);
  }

  /**
   * Delete an episode
   */
  static deleteEpisode(id: string): boolean {
    const episodes = this.getEpisodes();
    const filtered = episodes.filter(e => e.id !== id);
    if (filtered.length !== episodes.length) {
      this.saveEpisodes(filtered);
      return true;
    }
    return false;
  }

  /**
   * Add a new folder
   */
  static addFolder(name: string, description?: string, category: Folder['category'] = 'anime'): Folder {
    const folders = this.getFolders();
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const id = `fld-${Date.now().toString(36)}`;
    const newFolder: Folder = {
      id,
      name,
      slug,
      path: `/${category}/${slug}`,
      description: description || 'Pasta do catálogo',
      parentFolderId: null,
      category,
      colorTag: 'cyan',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const updated = [...folders, newFolder];
    this.saveFolders(updated);
    return newFolder;
  }

  /**
   * Delete a folder and handle its episodes
   */
  static deleteFolder(folderId: string): void {
    const folders = this.getFolders().filter(f => f.id !== folderId);
    this.saveFolders(folders);

    // Unassign episodes from this folder
    const episodes = this.getEpisodes().map(ep => {
      if (ep.folderId === folderId) {
        return { ...ep, folderId: '' };
      }
      return ep;
    });
    this.saveEpisodes(episodes);
  }

  /**
   * Reset catalog to initial pristine demo state
   */
  static resetToDefaultCatalog(): void {
    this.saveFolders(INITIAL_FOLDERS);
    this.saveEpisodes(INITIAL_EPISODES);
    this.saveProviders(INITIAL_PROVIDERS);
  }

  /**
   * Human-readable byte formatting with tabular stability
   */
  static formatBytes(bytes: number, decimals: number = 2): string {
    if (bytes === 0) return '0.00 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  /**
   * Human-readable time duration formatting (HH:MM:SS or MM:SS)
   */
  static formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    const mDisplay = m < 10 ? `0${m}` : `${m}`;
    const sDisplay = s < 10 ? `0${s}` : `${s}`;

    if (h > 0) {
      return `${h}:${mDisplay}:${sDisplay}`;
    }
    return `${mDisplay}:${sDisplay}`;
  }

  /**
   * Format ISO date string to localized date
   */
  static formatDate(isoString: string): string {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return isoString;
    }
  }
}
