import { validateUrlForSsrf } from '../utils/ssrfGuard.ts';

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
  notes?: string;
}

export interface PageInspectionResult {
  pageUrl: string;
  pageTitle: string;
  sourcesFound: ExtractedMediaSource[];
  diagnostics: {
    fetchTimeMs: number;
    responseSizeBytes: number;
    redirectCount: number;
    detectedDrm: boolean;
    detectedProtectionOrCaptcha: boolean;
    status: 'sources_found' | 'no_sources' | 'drm_or_protected' | 'error';
    summaryMessage: string;
  };
}

/**
 * Normaliza e resolve URLs relativas de forma segura em relação à URL base
 */
function resolveUrlSafe(src: string, baseUrl: string): string | null {
  try {
    const trimmed = (src || '').trim();
    if (!trimmed || trimmed.startsWith('javascript:') || trimmed.startsWith('data:')) {
      return null;
    }
    const resolved = new URL(trimmed, baseUrl);
    if (resolved.protocol !== 'https:' && resolved.protocol !== 'http:') {
      return null;
    }
    return resolved.toString();
  } catch {
    return null;
  }
}

/**
 * Infere o formato da mídia a partir da extensão da URL ou MIME type
 */
export function inferMediaFormat(url: string, mimeType?: string): MediaFormat {
  const lowerUrl = url.toLowerCase();
  const lowerMime = (mimeType || '').toLowerCase();

  if (
    lowerUrl.includes('.m3u8') ||
    lowerMime.includes('application/x-mpegurl') ||
    lowerMime.includes('vnd.apple.mpegurl')
  ) {
    return 'HLS';
  }

  if (lowerUrl.includes('.mp4') || lowerMime.includes('video/mp4')) {
    return 'MP4';
  }

  if (lowerUrl.includes('.webm') || lowerMime.includes('video/webm')) {
    return 'WEBM';
  }

  return 'UNKNOWN';
}

/**
 * Extrai o título da página a partir da tag <title>
 */
function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (match && match[1]) {
    return match[1].replace(/\s+/g, ' ').trim();
  }
  return 'Sem título identificado';
}

/**
 * Analisa o HTML de uma página web e extrai fontes de vídeo abertas e autorizadas
 */
export async function extractMediaFromHtml(
  html: string,
  pageUrl: string
): Promise<{ sources: ExtractedMediaSource[]; detectedDrm: boolean; detectedProtection: boolean; pageTitle: string }> {
  const sourcesMap = new Map<string, ExtractedMediaSource>();
  const pageTitle = extractTitle(html);

  // 1. Detecção de proteções ativas (DRM / EME / Cloudflare / CAPTCHA)
  const hasDrmKeywords =
    html.includes('requestMediaKeySystemAccess') ||
    html.includes('com.widevine.alpha') ||
    html.includes('com.apple.fps') ||
    html.includes('playready') ||
    html.includes('drmSecurity');

  const hasProtectionOrCaptcha =
    html.includes('cf-challenge-running') ||
    html.includes('turnstile') ||
    html.includes('g-recaptcha') ||
    html.includes('hcaptcha');

  // 2. Extração de tags <video src="...">
  const videoSrcRegex = /<video[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = videoSrcRegex.exec(html)) !== null) {
    const rawSrc = match[1];
    const resolved = resolveUrlSafe(rawSrc, pageUrl);
    if (resolved && !sourcesMap.has(resolved)) {
      sourcesMap.set(resolved, {
        url: resolved,
        format: inferMediaFormat(resolved),
        discoveryMethod: 'video_tag',
        corsSupported: null,
        accessible: null,
        notes: 'Tag <video src> encontrada diretamente no DOM da página.'
      });
    }
  }

  // 3. Extração de tags <source src="..." type="...">
  const sourceTagRegex = /<source[^>]+src=["']([^"']+)["'](?:[^>]+type=["']([^"']+)["'])?[^>]*>/gi;
  while ((match = sourceTagRegex.exec(html)) !== null) {
    const rawSrc = match[1];
    const rawType = match[2];
    const resolved = resolveUrlSafe(rawSrc, pageUrl);
    if (resolved && !sourcesMap.has(resolved)) {
      sourcesMap.set(resolved, {
        url: resolved,
        format: inferMediaFormat(resolved, rawType),
        mimeType: rawType,
        discoveryMethod: 'source_tag',
        corsSupported: null,
        accessible: null,
        notes: rawType ? `Tag <source> com tipo MIME declarado: ${rawType}` : 'Tag <source> sem tipo explícito.'
      });
    }
  }

  // 4. Extração de OpenGraph Video (og:video, og:video:url, og:video:secure_url)
  const ogVideoRegex = /<meta[^>]+property=["']og:video(?::secure_url|:url)?["'][^>]+content=["']([^"']+)["'][^>]*>/gi;
  while ((match = ogVideoRegex.exec(html)) !== null) {
    const rawSrc = match[1];
    const resolved = resolveUrlSafe(rawSrc, pageUrl);
    if (resolved && !sourcesMap.has(resolved)) {
      sourcesMap.set(resolved, {
        url: resolved,
        format: inferMediaFormat(resolved),
        discoveryMethod: 'og_video',
        corsSupported: null,
        accessible: null,
        notes: 'Metadados de distribuição pública OpenGraph (og:video).'
      });
    }
  }

  // 5. Extração de Twitter Player Stream
  const twitterStreamRegex = /<meta[^>]+name=["']twitter:player:stream["'][^>]+content=["']([^"']+)["'][^>]*>/gi;
  while ((match = twitterStreamRegex.exec(html)) !== null) {
    const rawSrc = match[1];
    const resolved = resolveUrlSafe(rawSrc, pageUrl);
    if (resolved && !sourcesMap.has(resolved)) {
      sourcesMap.set(resolved, {
        url: resolved,
        format: inferMediaFormat(resolved),
        discoveryMethod: 'twitter_stream',
        corsSupported: null,
        accessible: null,
        notes: 'Metadados Twitter Card (twitter:player:stream).'
      });
    }
  }

  // 6. Extração de JSON-LD VideoObject (contentUrl)
  const jsonLdRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const objects = Array.isArray(data) ? data : [data];
      for (const obj of objects) {
        if (obj && (obj['@type'] === 'VideoObject' || obj.contentUrl)) {
          const contentUrl = obj.contentUrl || obj.embedUrl;
          if (contentUrl && typeof contentUrl === 'string') {
            const resolved = resolveUrlSafe(contentUrl, pageUrl);
            if (resolved && !sourcesMap.has(resolved)) {
              sourcesMap.set(resolved, {
                url: resolved,
                format: inferMediaFormat(resolved),
                discoveryMethod: 'json_ld',
                corsSupported: null,
                accessible: null,
                notes: 'Esquema semântico estruturado JSON-LD (VideoObject).'
              });
            }
          }
        }
      }
    } catch {
      // Ignora JSON malformado na página
    }
  }

  return {
    sources: Array.from(sourcesMap.values()),
    detectedDrm: hasDrmKeywords,
    detectedProtection: hasProtectionOrCaptcha,
    pageTitle
  };
}

/**
 * Testa de forma segura e não intrusiva a acessibilidade e cabeçalhos CORS de uma URL de mídia
 */
export async function probeMediaAccessibility(mediaUrl: string): Promise<{
  accessible: boolean;
  corsSupported: boolean;
  statusCode?: number;
  contentLengthBytes?: number;
  mimeType?: string;
  notes?: string;
}> {
  // 1. Validação SSRF rigorosa do endpoint de mídia antes de conectar
  const ssrfCheck = await validateUrlForSsrf(mediaUrl);
  if (!ssrfCheck.valid) {
    return {
      accessible: false,
      corsSupported: false,
      notes: `Acesso à mídia bloqueado por política de segurança SSRF: ${ssrfCheck.error}`
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s timeout

  try {
    // Tenta uma requisição HEAD ou GET com cabeçalho de alcance curto (Range: bytes=0-1)
    const response = await fetch(mediaUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 NOVA-STORAGE-Inspector/1.0',
        'Range': 'bytes=0-1024',
        'Origin': 'https://ais-dev-4wcm7llj3mzvxq3xdjjq3o-46161797005.us-east1.run.app'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const corsHeader = response.headers.get('access-control-allow-origin');
    const corsSupported = typeof corsHeader === 'string' && corsHeader.length > 0;
    const accessible = response.status >= 200 && response.status < 400;
    const contentLength = response.headers.get('content-length');
    const mimeType = response.headers.get('content-type') || undefined;

    let notes = '';
    if (accessible && corsSupported) {
      notes = 'Fonte acessível publicamente com cabeçalhos CORS autorizados.';
    } else if (accessible && !corsSupported) {
      notes =
        'A mídia respondeu com sucesso ao servidor, mas não declara cabeçalho Access-Control-Allow-Origin (*). Pode ser bloqueada pelo navegador ao tentar carregar diretamente no player.';
    } else if (response.status === 403) {
      notes = 'Acesso proibido (HTTP 403). A fonte pode exigir assinatura, autenticação ou bloqueio por Referer.';
    } else if (response.status === 404) {
      notes = 'Arquivo não encontrado (HTTP 404). O link de mídia pode estar expirado ou inativo.';
    } else {
      notes = `Servidor respondeu com código HTTP ${response.status}.`;
    }

    return {
      accessible,
      corsSupported,
      statusCode: response.status,
      contentLengthBytes: contentLength ? parseInt(contentLength, 10) : undefined,
      mimeType,
      notes
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    return {
      accessible: false,
      corsSupported: false,
      notes: `Não foi possível conectar à fonte de mídia: ${err?.message || 'Erro de rede'}`
    };
  }
}
