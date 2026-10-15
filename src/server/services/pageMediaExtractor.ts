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

/**
 * Normaliza e resolve URLs relativas de forma segura em relação à URL base
 */
function resolveUrlSafe(src: string, baseUrl: string): string | null {
  try {
    const trimmed = (src || '').trim();
    if (!trimmed || trimmed.startsWith('javascript:') || trimmed.startsWith('data:') || trimmed.startsWith('about:')) {
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
 * Determina o status da inspeção diferenciando claramente os 5 cenários:
 * 1. Nenhuma fonte aberta encontrada
 * 2. Player incorporado (iframe) identificado
 * 3. Possível carregamento dinâmico de mídia
 * 4. Fonte direta encontrada e acessível
 * 5. (Reprodução confirmada ocorre no player no cliente)
 */
export function determineInspectionStatus(params: {
  sourcesCount: number;
  hasAccessibleDirectSource: boolean;
  detectedDrm: boolean;
  detectedProtection: boolean;
  iframesCount: number;
  dynamicIndicatorsCount: number;
  firstIframeDomain?: string;
}): {
  status: InspectionStatus;
  summaryMessage: string;
  diagnosticDetails: string[];
} {
  const details: string[] = [];

  if (params.detectedDrm) {
    return {
      status: 'drm_or_protected',
      summaryMessage: 'Proteção DRM proprietária detectada (ex: Widevine/FairPlay). O conteúdo está protegido contra reprodução direta externa.',
      diagnosticDetails: ['Indícios de APIs de proteção DRM de navegadores (EME / requestMediaKeySystemAccess).']
    };
  }

  if (params.sourcesCount > 0) {
    if (params.hasAccessibleDirectSource) {
      details.push(`${params.sourcesCount} fonte(s) direta(s) encontrada(s) no HTML da página.`);
      details.push('Pelo menos uma fonte direta respondeu com sucesso aos testes de conectividade e alcance.');
      return {
        status: 'direct_source_accessible',
        summaryMessage: `Fonte direta encontrada e acessível (${params.sourcesCount} fonte(s) identificada(s)).`,
        diagnosticDetails: details
      };
    } else {
      details.push(`${params.sourcesCount} fonte(s) direta(s) encontrada(s), porém sem confirmação de leitura pública irrestrita.`);
      return {
        status: 'sources_found',
        summaryMessage: `Fonte direta encontrada (${params.sourcesCount} fonte(s)), mas com restrições de permissão ou CORS no servidor remoto.`,
        diagnosticDetails: details
      };
    }
  }

  if (params.iframesCount > 0) {
    const domainText = params.firstIframeDomain ? ` do domínio "${params.firstIframeDomain}"` : '';
    details.push(`${params.iframesCount} elemento(s) iframe detectado(s) no HTML da página.`);
    details.push('Não é possível afirmar se existe um vídeo ativo apenas pela presença de um iframe.');
    details.push('Por motivos de segurança e política de mesma origem (Same-Origin Policy), o conteúdo interno de iframes de terceiros não é acessado.');
    return {
      status: 'embedded_player_detected',
      summaryMessage: `Player incorporado (iframe) identificado${domainText} (${params.iframesCount} frame(s) detectado(s)).`,
      diagnosticDetails: details
    };
  }

  if (params.dynamicIndicatorsCount > 0) {
    details.push(`${params.dynamicIndicatorsCount} indicador(es) de carregamento dinâmico ou biblioteca de player encontrado(s) no HTML.`);
    details.push('A página não expõe a URL de mídia diretamente no DOM estático; o fluxo de vídeo costuma ser solicitado sob demanda via requisições assíncronas do cliente.');
    return {
      status: 'dynamic_loading_detected',
      summaryMessage: 'Possível carregamento dinâmico de mídia detectado. Bibliotecas de player ou configurações dinâmicas foram encontradas no código da página.',
      diagnosticDetails: details
    };
  }

  return {
    status: 'no_sources',
    summaryMessage: 'Nenhuma fonte aberta encontrada. A página não expõe tags de vídeo abertas, iframes incorporados nem scripts de carregamento de mídia.',
    diagnosticDetails: ['O HTML analisado não contém tags <video>, <source>, metadados de compartilhamento ou referências a players.']
  };
}

/**
 * Analisa o HTML de uma página web e extrai fontes de vídeo abertas,
 * elementos iframe (com domínio de origem) e referências a carregamento dinâmico
 */
export async function extractMediaFromHtml(
  html: string,
  pageUrl: string
): Promise<{
  sources: ExtractedMediaSource[];
  detectedIframes: DetectedIframe[];
  dynamicMediaIndicators: DynamicMediaIndicator[];
  detectedDrm: boolean;
  detectedProtection: boolean;
  pageTitle: string;
}> {
  const sourcesMap = new Map<string, ExtractedMediaSource>();
  const detectedIframesMap = new Map<string, DetectedIframe>();
  const dynamicIndicators: DynamicMediaIndicator[] = [];
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

  // 7. Extração de elementos IFRAME e registro seguro de domínio de origem
  // REQUISITO: Não afirmar que existe um vídeo só porque foi encontrado um iframe.
  // Não buscar automaticamente todos os iframes encontrados (zero requisições ao destino).
  const iframeRegex = /<iframe\b([^>]*)>/gi;
  let iframeTagMatch: RegExpExecArray | null;
  let pageUrlObj: URL | null = null;
  try {
    pageUrlObj = new URL(pageUrl);
  } catch {
    // URL base inválida
  }

  while ((iframeTagMatch = iframeRegex.exec(html)) !== null) {
    const attrs = iframeTagMatch[1] || '';
    // Procura src="..." ou data-src="..."
    const srcMatch = attrs.match(/\bsrc=["']([^"']+)["']/i) || attrs.match(/\bdata-src=["']([^"']+)["']/i);
    const titleMatch = attrs.match(/\btitle=["']([^"']+)["']/i);

    if (srcMatch && srcMatch[1]) {
      const rawSrc = srcMatch[1].trim();
      const resolved = resolveUrlSafe(rawSrc, pageUrl);
      if (resolved && !detectedIframesMap.has(resolved)) {
        try {
          const iframeUrlObj = new URL(resolved);
          const domain = iframeUrlObj.hostname.toLowerCase();
          const origin = iframeUrlObj.origin;
          const isCrossOrigin = pageUrlObj ? iframeUrlObj.origin !== pageUrlObj.origin : true;

          detectedIframesMap.set(resolved, {
            url: resolved,
            domain,
            origin,
            isCrossOrigin,
            title: titleMatch ? titleMatch[1].trim() : undefined
          });
        } catch {
          // Ignora URL malformada de iframe
        }
      }
    }
  }

  // 8. Detecção estática de referências a players e carregamento dinâmico de mídia
  // SEM executar JavaScript arbitrário da página analisada
  const playerLibraries: Array<{ name: string; regex: RegExp; desc: string }> = [
    { name: 'hls.js', regex: /\b(?:hls(?:\.min)?\.js|Hls\.isSupported|new\s+Hls\b)/i, desc: 'Biblioteca Hls.js identificada no código (gerencia streams .m3u8 via JavaScript)' },
    { name: 'video.js', regex: /\b(?:video(?:\.min)?\.js|videojs\s*\()/i, desc: 'Framework Video.js identificado no código' },
    { name: 'jwplayer', regex: /\b(?:jwplayer(?:\.js)?|jwplayer\s*\([^)]*\)\.setup)/i, desc: 'Framework JW Player identificado no código' },
    { name: 'dash.js', regex: /\b(?:dash(?:\.all)?(?:\.min)?\.js|dashjs\b)/i, desc: 'Biblioteca Dash.js identificada no código' },
    { name: 'plyr', regex: /\b(?:plyr(?:\.min)?\.js|new\s+Plyr\b)/i, desc: 'Biblioteca de player Plyr identificada no código' },
    { name: 'clappr', regex: /\b(?:clappr(?:\.min)?\.js|new\s+Clappr\.Player\b)/i, desc: 'Biblioteca de player Clappr identificada no código' },
    { name: 'shaka-player', regex: /\b(?:shaka-player|shaka\.Player\b)/i, desc: 'Shaka Player identificado no código' }
  ];

  for (const lib of playerLibraries) {
    if (lib.regex.test(html)) {
      dynamicIndicators.push({
        type: 'player_library',
        description: lib.desc,
        patternMatched: lib.name
      });
    }
  }

  // Detecta atributos de dados de mídia em elementos HTML (ex: data-video, data-stream, data-file)
  const dataVideoRegex = /\b(?:data-video(?:-url|-src)?|data-stream(?:-url)?|data-hls|data-mp4)=["']([^"']+)["']/gi;
  let dataMatch: RegExpExecArray | null;
  let dataCount = 0;
  while ((dataMatch = dataVideoRegex.exec(html)) !== null && dataCount < 3) {
    const rawVal = dataMatch[1];
    dynamicIndicators.push({
      type: 'data_attribute',
      description: `Atributo de dados de vídeo detectado no elemento (${dataMatch[0].split('=')[0]})`,
      patternMatched: rawVal.length > 60 ? `${rawVal.substring(0, 57)}...` : rawVal
    });
    dataCount++;
  }

  // Detecta chamadas de inicialização dinâmica ou streams embutidos em scripts (sem tag <video> direta)
  if (sourcesMap.size === 0) {
    const inlineScriptStreamRegex = /['"](https?:\\?\/\\?[^'"]+\.(?:m3u8|mp4)(?:\\?[^'"]*)?)['"]/gi;
    let streamMatch: RegExpExecArray | null;
    let inlineCount = 0;
    while ((streamMatch = inlineScriptStreamRegex.exec(html)) !== null && inlineCount < 2) {
      const matchedSnippet = streamMatch[1].replace(/\\\//g, '/');
      dynamicIndicators.push({
        type: 'media_config',
        description: 'Referência a stream (.m3u8/.mp4) encontrada no interior de bloco de script/JSON',
        patternMatched: matchedSnippet.length > 70 ? `${matchedSnippet.substring(0, 67)}...` : matchedSnippet
      });
      inlineCount++;
    }
  }

  return {
    sources: Array.from(sourcesMap.values()),
    detectedIframes: Array.from(detectedIframesMap.values()),
    dynamicMediaIndicators: dynamicIndicators,
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
  supportsRange?: boolean;
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
    // Tenta uma requisição GET com cabeçalho de alcance curto (Range: bytes=0-1024) para testar 206 Partial Content
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
    const acceptRanges = response.headers.get('accept-ranges');
    const contentRange = response.headers.get('content-range');
    const supportsRange = response.status === 206 || acceptRanges === 'bytes' || Boolean(contentRange);

    let notes = '';
    if (response.status === 403) {
      notes = `Acesso negado (HTTP 403 Forbidden). O arquivo é privado ou o servidor recusou a requisição anônima (Content-Type: ${mimeType || 'desconhecido'}).`;
    } else if (response.status === 404) {
      notes = 'Arquivo não encontrado (HTTP 404 Not Found). O link de mídia pode estar expirado ou inativo.';
    } else if (accessible) {
      const rangeText = supportsRange ? 'Suporta Range (206 Partial Content)' : 'Sem Range parcial explícito';
      const corsText = corsSupported ? 'CORS Habilitado' : 'Sem CORS Declarado';
      notes = `HTTP ${response.status} (${mimeType || 'mídia'}) · ${rangeText} · ${corsText}.`;
    } else {
      notes = `Servidor respondeu com código HTTP ${response.status}.`;
    }

    return {
      accessible,
      corsSupported,
      statusCode: response.status,
      contentLengthBytes: contentLength ? parseInt(contentLength, 10) : undefined,
      mimeType,
      supportsRange,
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
