import { EpisodeFile, Folder, NovaStreamExportManifest } from '../../types/storage';

/**
 * NovaStreamIntegrationService
 * 
 * Prepares the architectural bridge for future integration between
 * NOVA STORAGE (the vault & metadata source) and NOVA STREAM (the video playback client).
 * 
 * Rules:
 * - Does not mix codebase with NOVA STREAM or Hikari.
 * - Formats standardized manifest schemas that NOVA STREAM can consume via read-only API.
 * - Explicitly marks that stream endpoints are unavailable until remote storage is provisioned.
 */
export class NovaStreamIntegrationService {
  private static readonly PROTOCOL_VERSION = '1.0.0';

  /**
   * Generates a clean JSON manifest containing all cataloged episodes and technical specs
   * for synchronization with a streaming front-end.
   */
  static generateExportManifest(
    episodes: EpisodeFile[],
    folders: Folder[]
  ): NovaStreamExportManifest {
    const folderMap = new Map(folders.map(f => [f.id, f.name]));

    return {
      manifestVersion: '1.0.0',
      generatedAt: new Date().toISOString(),
      vaultId: 'nova-storage-vault-01',
      vaultName: 'NOVA STORAGE - Catálogo Primário',
      totalItems: episodes.length,
      handshakeProtocol: 'NOVA_STORAGE_BEARER_V1',
      episodes: episodes.map(ep => ({
        id: ep.id,
        series: ep.seriesName || folderMap.get(ep.folderId) || 'Avulso',
        season: ep.seasonNumber,
        episode: ep.episodeNumber,
        title: ep.title,
        fileName: ep.originalFileName,
        sizeBytes: ep.fileSizeBytes,
        duration: ep.durationSeconds,
        resolution: ep.resolution,
        checksum: ep.checksumSha256,
        streamEndpointAvailable: false,
        streamNotice: 'Conexão com armazenamento real ainda não configurada no NOVA STORAGE.'
      }))
    };
  }

  /**
   * Generates sample curl / HTTP request to simulate how NOVA STREAM will query NOVA STORAGE.
   */
  static getApiHandshakeSpecification(): {
    endpoint: string;
    method: 'GET' | 'POST';
    headers: Record<string, string>;
    description: string;
  } {
    return {
      endpoint: '/api/v1/vault/manifest',
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Nova-Storage-Client': 'NOVA-STREAM/2026.1',
        'Authorization': 'Bearer <NOVA_STORAGE_API_SECRET_TOKEN>'
      },
      description: 'Endpoint read-only para sincronização de catálogo de episódios sem expor credenciais do Google Drive/MEGA.'
    };
  }
}
