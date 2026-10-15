export type MediaFormat = 'HLS' | 'MP4' | 'WEBM' | 'IFRAME_EMBED' | 'UNKNOWN';

export interface ExtractedMediaSource {
  url: string;
  format: MediaFormat;
  mimeType?: string;
  discoveryMethod:
    | 'direct_stream'
    | 'video_tag'
    | 'source_tag'
    | 'og_video'
    | 'twitter_stream'
    | 'json_ld'
    | 'iframe_embed';
  corsSupported: boolean | null;
  accessible: boolean | null;
  contentLengthBytes?: number;
  statusCode?: number;
  supportsRange?: boolean;
  notes?: string;
}

export interface DetectedIframe {
  url: string;
  domain: string;
  origin: string;
  isCrossOrigin: boolean;
  title?: string;
}

export interface DynamicMediaIndicator {
  type: 'player_library' | 'player_initialization' | 'media_config' | 'data_attribute';
  description: string;
  patternMatched: string;
}

export type InspectionStatus =
  | 'direct_source_accessible'
  | 'embedded_player_detected'
  | 'dynamic_loading_detected'
  | 'no_sources'
  | 'drm_or_protected'
  | 'sources_found'
  | 'error';

export interface PageInspectionResult {
  pageUrl: string;
  pageTitle: string;
  sourcesFound: ExtractedMediaSource[];
  detectedIframes: DetectedIframe[];
  dynamicMediaIndicators: DynamicMediaIndicator[];
  diagnostics: {
    fetchTimeMs: number;
    responseSizeBytes: number;
    redirectCount: number;
    detectedDrm: boolean;
    detectedProtectionOrCaptcha: boolean;
    detectedIframesCount: number;
    detectedDynamicLoading: boolean;
    status: InspectionStatus;
    summaryMessage: string;
    diagnosticDetails?: string[];
  };
}

export interface InspectApiResponse {
  success: boolean;
  result?: PageInspectionResult;
  error?: string;
  code?: string;
}

export class ExternalMediaService {
  /**
   * Envia uma URL de página web ou fluxo de vídeo para inspeção segura no backend
   */
  static async inspectPage(pageUrl: string): Promise<InspectApiResponse> {
    const trimmed = (pageUrl || '').trim();
    if (!trimmed) {
      return {
        success: false,
        error: 'Informe a URL da página web para análise.',
        code: 'MISSING_URL'
      };
    }

    try {
      const res = await fetch('/api/storage/inspect-page', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ pageUrl: trimmed })
      });

      const data = await res.json();
      return data;
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Falha de comunicação com o servidor durante a análise.',
        code: 'NETWORK_ERROR'
      };
    }
  }
}
