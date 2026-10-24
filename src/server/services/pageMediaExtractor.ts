import { validateUrlForSsrf } from '../utils/ssrfGuard.ts';

export type MediaFormat = 'HLS' | 'MP4' | 'WEBM' | 'IFRAME_EMBED' | 'UNKNOWN';

export type IframeClassification = 'probable_player' | 'utility_or_service' | 'unknown_purpose';

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
  classification: IframeClassification;
  classificationReason: string;
}

export interface DynamicMediaIndicator {
  type: 'player_library' | 'player_initialization' | 'media_config' | 'data_attribute';
  description: string;
  patternMatched: string;
}

export interface InterstitialChallengeInfo {
  detected: boolean;
  provider: 'Cloudflare' | 'Google reCAPTCHA' | 'hCaptcha' | 'Proteção Intermediária' | 'Nenhum';
  pageTitle: string;
  httpStatusCode?: number;
  contentType?: string;
  evidence: string[];
}

export type InspectionStatus =
  | 'direct_source_accessible'
  | 'embedded_player_detected'
  | 'dynamic_loading_detected'
  | 'challenge_or_interstitial_detected'
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
  interstitialChallenge?: InterstitialChallengeInfo;
  diagnostics: {
    fetchTimeMs: number;
    responseSizeBytes: number;
    redirectCount: number;
    detectedDrm: boolean;
    detectedProtectionOrCaptcha: boolean;
    detectedIframesCount: number;
    detectedDynamicLoading: boolean;
    httpStatusCode?: number;
    contentType?: string;
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
 * Decodifica de forma segura valores de parâmetros URL, tolerando codificações simples ou duplas
 */
function safeDecodeParam(val: string): string {
  try {
    const once = decodeURIComponent(val);
    try {
      return decodeURIComponent(once);
    } catch {
      return once;
    }
  } catch {
    return val;
  }
}

/**
 * Infere o formato da mídia a partir da extensão da URL ou MIME type
 */
export function inferMediaFormat(url: string, mimeType?: string): MediaFormat {
  const lowerMime = (mimeType || '').toLowerCase();

  if (
    lowerMime.includes('application/x-mpegurl') ||
    lowerMime.includes('vnd.apple.mpegurl')
  ) {
    return 'HLS';
  }

  if (lowerMime.includes('video/mp4')) {
    return 'MP4';
  }

  if (lowerMime.includes('video/webm')) {
    return 'WEBM';
  }

  let parsed: URL | null = null;
  let pathToCheck = (url || '').toLowerCase();
  try {
    parsed = new URL(url);
    pathToCheck = parsed.pathname.toLowerCase();
  } catch {
    // Para URLs relativas ou caminhos locais sem protocolo/base
  }

  // 1. Checagem direta pelo caminho principal da URL
  if (pathToCheck.includes('.m3u8')) {
    return 'HLS';
  }

  if (pathToCheck.includes('.mp4')) {
    return 'MP4';
  }

  if (pathToCheck.includes('.webm')) {
    return 'WEBM';
  }

  // 2. Se corresponder a uma regra cadastrada de URL intermediária (ex.: api.anivideo.net/videohls.php),
  // o wrapper intermediário não deve ser inferido diretamente como arquivo de mídia na URL;
  // ele deve ser tratado estruturadamente por extractIntermediateMediaDestination.
  if (parsed && typeof findMatchingIntermediateRule === 'function' && findMatchingIntermediateRule(parsed)) {
    return 'UNKNOWN';
  }

  // 3. Checagem em parâmetros de consulta (ex.: file, video, url, src, path, media, stream)
  // ou na query string decodificada (URLs intermediárias, gateways PHP e CDNs assinadas)
  if (parsed && parsed.search) {
    // 3.1 Prioriza parâmetros comuns de mídia
    const commonMediaParams = ['file', 'video', 'url', 'src', 'path', 'media', 'stream', 'uri', 'target'];
    for (const param of commonMediaParams) {
      const rawVal = parsed.searchParams.get(param);
      if (rawVal) {
        const decoded = safeDecodeParam(rawVal).toLowerCase();
        if (/\.m3u8(?:$|[?#&])/i.test(decoded)) return 'HLS';
        if (/\.mp4(?:$|[?#&])/i.test(decoded)) return 'MP4';
        if (/\.webm(?:$|[?#&])/i.test(decoded)) return 'WEBM';
      }
    }

    // 2.2 Varredura genérica em todos os parâmetros da query string
    for (const [, rawVal] of parsed.searchParams.entries()) {
      if (rawVal) {
        const decoded = safeDecodeParam(rawVal).toLowerCase();
        if (/\.m3u8(?:$|[?#&])/i.test(decoded)) return 'HLS';
        if (/\.mp4(?:$|[?#&])/i.test(decoded)) return 'MP4';
        if (/\.webm(?:$|[?#&])/i.test(decoded)) return 'WEBM';
      }
    }

    // 2.3 Varredura na query string completa decodificada (caso haja parâmetros codificados aninhados)
    const fullDecodedSearch = safeDecodeParam(parsed.search).toLowerCase();
    if (/\.m3u8(?:$|[?#&])/i.test(fullDecodedSearch)) return 'HLS';
    if (/\.mp4(?:$|[?#&])/i.test(fullDecodedSearch)) return 'MP4';
    if (/\.webm(?:$|[?#&])/i.test(fullDecodedSearch)) return 'WEBM';
  }

  return 'UNKNOWN';
}

/**
 * Regra controlada para identificação de provedores e rotas intermediárias de fluxo
 */
export interface IntermediateUrlRule {
  id: string;
  name: string;
  matches: (url: URL) => boolean;
  targetParam: string;
}

export const INTERMEDIATE_URL_RULES: IntermediateUrlRule[] = [
  {
    id: 'anivideo_videohls',
    name: 'AniVideo Gateway',
    matches: (url: URL) => {
      const host = url.hostname.toLowerCase();
      return host === 'api.anivideo.net' || host === 'anivideo.net' || host.endsWith('.anivideo.net');
    },
    targetParam: 'd'
  },
  {
    id: 'generic_videohls_endpoint',
    name: 'Endpoint Intermediário de Vídeo HLS',
    matches: (url: URL) => {
      const path = url.pathname.toLowerCase();
      return (
        path.endsWith('/videohls.php') ||
        path.endsWith('/videohls') ||
        path.endsWith('/video_hls.php') ||
        path.endsWith('/playerhls.php') ||
        path.endsWith('/hlsplayer.php')
      );
    },
    targetParam: 'd'
  }
];

export function registerIntermediateUrlRule(rule: IntermediateUrlRule): void {
  const existingIdx = INTERMEDIATE_URL_RULES.findIndex(r => r.id === rule.id);
  if (existingIdx >= 0) {
    INTERMEDIATE_URL_RULES[existingIdx] = rule;
  } else {
    INTERMEDIATE_URL_RULES.push(rule);
  }
}

export function findMatchingIntermediateRule(
  url: URL,
  customRules?: IntermediateUrlRule[]
): IntermediateUrlRule | undefined {
  const rules = customRules || INTERMEDIATE_URL_RULES;
  return rules.find(r => r.matches(url));
}

export type IntermediateExtractionResult =
  | {
      isIntermediate: true;
      valid: true;
      targetUrl: string;
      targetFormat: MediaFormat;
      rule: IntermediateUrlRule;
    }
  | {
      isIntermediate: true;
      valid: false;
      error: string;
      code:
        | 'MISSING_INTERMEDIATE_PARAM'
        | 'EMPTY_INTERMEDIATE_PARAM'
        | 'INVALID_INTERMEDIATE_URL'
        | 'INVALID_PROTOCOL'
        | 'UNSUPPORTED_MEDIA_FORMAT';
      rule: IntermediateUrlRule;
    }
  | {
      isIntermediate: false;
    };

/**
 * Identifica URLs intermediárias por meio de parsing estruturado da URL,
 * decodifica parâmetros configurados como "d", valida se contém URL HTTP/HTTPS válida
 * e preserva parâmetros e codificação original sem decodificação dupla.
 */
export function extractIntermediateMediaDestination(
  rawUrl: string,
  customRules?: IntermediateUrlRule[]
): IntermediateExtractionResult {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) {
    return { isIntermediate: false };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    return { isIntermediate: false };
  }

  const rule = findMatchingIntermediateRule(parsedUrl, customRules);
  if (!rule) {
    return { isIntermediate: false };
  }

  const paramName = rule.targetParam;
  if (!parsedUrl.searchParams.has(paramName)) {
    return {
      isIntermediate: true,
      valid: false,
      error: `A URL intermediária (${rule.name}) requer o parâmetro "${paramName}" com a URL de destino.`,
      code: 'MISSING_INTERMEDIATE_PARAM',
      rule
    };
  }

  const rawTarget = parsedUrl.searchParams.get(paramName);
  if (!rawTarget || !rawTarget.trim()) {
    return {
      isIntermediate: true,
      valid: false,
      error: `O parâmetro "${paramName}" da URL intermediária está vazio.`,
      code: 'EMPTY_INTERMEDIATE_PARAM',
      rule
    };
  }

  const trimmedTarget = rawTarget.trim();

  let targetObj: URL;
  try {
    targetObj = new URL(trimmedTarget);
  } catch {
    return {
      isIntermediate: true,
      valid: false,
      error: `O parâmetro "${paramName}" contém uma URL de destino com formato sintático inválido.`,
      code: 'INVALID_INTERMEDIATE_URL',
      rule
    };
  }

  if (targetObj.protocol !== 'http:' && targetObj.protocol !== 'https:') {
    return {
      isIntermediate: true,
      valid: false,
      error: `Protocolo "${targetObj.protocol}" no parâmetro "${paramName}" não é permitido. Apenas HTTP e HTTPS são aceitos.`,
      code: 'INVALID_PROTOCOL',
      rule
    };
  }

  const targetFormat = inferMediaFormat(trimmedTarget);

  return {
    isIntermediate: true,
    valid: true,
    targetUrl: trimmedTarget,
    targetFormat,
    rule
  };
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
 * Classifica iframes por indícios semânticos em:
 * - 'utility_or_service': autenticação, login, chat de suporte, formulários, captcha, anúncios
 * - 'probable_player': provedores conhecidos de vídeo, padrões de path (/embed/, /player/, /e/), parâmetros de vídeo
 * - 'unknown_purpose': sem indícios claros de player nem de serviço utilitário
 */
export function classifyIframe(
  url: string,
  title?: string
): { classification: IframeClassification; reason: string } {
  let urlObj: URL | null = null;
  try {
    urlObj = new URL(url);
  } catch {
    // URL relativa ou formato inválido
  }

  const pathAndQuery = urlObj ? `${urlObj.pathname}${urlObj.search}`.toLowerCase() : url.toLowerCase();
  const hostname = urlObj ? urlObj.hostname.toLowerCase() : '';
  const titleLower = (title || '').toLowerCase();

  // 1. Indícios Semânticos de Iframe Utilitário ou Serviço (chat, login, auth, anúncio, captcha)
  const isChat =
    pathAndQuery.includes('/chat') ||
    pathAndQuery.includes('chat2') ||
    pathAndQuery.includes('livechat') ||
    hostname.includes('tawk.to') ||
    hostname.includes('crisp.chat') ||
    hostname.includes('zendesk') ||
    hostname.includes('intercom') ||
    hostname.includes('disqus') ||
    titleLower.includes('chat') ||
    titleLower.includes('atendimento') ||
    titleLower.includes('suporte');

  const isAuthOrLogin =
    pathAndQuery.includes('login') ||
    pathAndQuery.includes('signin') ||
    pathAndQuery.includes('sign-in') ||
    pathAndQuery.includes('auth') ||
    pathAndQuery.includes('oauth') ||
    pathAndQuery.includes('entrar') ||
    pathAndQuery.includes('register') ||
    pathAndQuery.includes('signup') ||
    hostname.startsWith('auth.') ||
    hostname.startsWith('login.') ||
    titleLower.includes('login') ||
    titleLower.includes('autentic') ||
    titleLower.includes('acesso à conta') ||
    titleLower.includes('entrar');

  const isCaptchaOrSecurity =
    hostname.includes('recaptcha') ||
    hostname.includes('hcaptcha') ||
    pathAndQuery.includes('recaptcha') ||
    pathAndQuery.includes('hcaptcha') ||
    pathAndQuery.includes('turnstile') ||
    titleLower.includes('captcha') ||
    titleLower.includes('verificação');

  const isAdOrTracker =
    hostname.includes('doubleclick') ||
    hostname.includes('googlesyndication') ||
    hostname.includes('adnxs') ||
    hostname.includes('adserver') ||
    pathAndQuery.includes('/ads/') ||
    pathAndQuery.includes('/adserver') ||
    titleLower.includes('anúncio') ||
    titleLower.includes('publicidade');

  if (isChat || isAuthOrLogin || isCaptchaOrSecurity || isAdOrTracker) {
    let reason = 'Iframe utilitário de serviço identificado';
    if (isChat && isAuthOrLogin) {
      reason = 'Iframe utilitário de chat e autenticação (ex: /chat2/login.php)';
    } else if (isChat) {
      reason = 'Iframe utilitário de chat de atendimento ou suporte';
    } else if (isAuthOrLogin) {
      reason = 'Iframe utilitário de autenticação ou login de usuário';
    } else if (isCaptchaOrSecurity) {
      reason = 'Iframe de serviço de segurança / verificação anti-bot';
    } else if (isAdOrTracker) {
      reason = 'Iframe de publicidade ou medição de tráfego';
    }
    return {
      classification: 'utility_or_service',
      reason
    };
  }

  // 2. Indícios Semânticos de Provável Player de Vídeo
  const knownVideoDomains = [
    'youtube.com',
    'youtube-nocookie.com',
    'youtu.be',
    'vimeo.com',
    'dailymotion.com',
    'twitch.tv',
    'streamtape.com',
    'streamtape.net',
    'mp4upload.com',
    'doodstream.com',
    'dood.to',
    'dood.so',
    'dood.cx',
    'dood.la',
    'dood.ws',
    'dood.sh',
    'voe.sx',
    'mixdrop.co',
    'mixdrop.to',
    'mixdrop.ch',
    'mixdrop.bz',
    'filemoon.sx',
    'filemoon.to',
    'filemoon.in',
    'streamwish.to',
    'streamwish.com',
    'vidmoly.me',
    'vidmoly.net',
    'streamlare.com',
    'upstream.to',
    'uqload.com',
    'uqload.to',
    'embedrise.com',
    'supervideo.tv',
    'waaw.to',
    'netu.tv',
    'vidlox.me',
    'vidsrc.me',
    'vidsrc.to',
    'vidsrc.net',
    'vidsrc.in',
    'vidsrc.pm',
    'vidplay.site',
    'vidplay.online',
    'megacloud.tv',
    'rabbitstream.net',
    'dokicloud.one'
  ];

  const matchesKnownVideoDomain = knownVideoDomains.some(
    d => hostname === d || hostname.endsWith(`.${d}`)
  );

  const hasPlayerSubdomain = hostname.startsWith('player.') || hostname.startsWith('embed.') || hostname.startsWith('video.');

  const hasPlayerPath =
    pathAndQuery.startsWith('/embed/') ||
    pathAndQuery.includes('/embed/') ||
    pathAndQuery.startsWith('/player/') ||
    pathAndQuery.includes('/player/') ||
    pathAndQuery.includes('/player.php') ||
    pathAndQuery.startsWith('/e/') ||
    pathAndQuery.includes('/e/') ||
    pathAndQuery.includes('/video/') ||
    pathAndQuery.includes('/stream/') ||
    pathAndQuery.includes('player=') ||
    pathAndQuery.includes('video_id=') ||
    pathAndQuery.includes('.m3u8') ||
    pathAndQuery.includes('.mp4');

  const hasPlayerTitle =
    titleLower.includes('player') ||
    titleLower.includes('reprodutor') ||
    titleLower.includes('vídeo') ||
    titleLower.includes('video') ||
    titleLower.includes('stream') ||
    titleLower.includes('assistir');

  if (matchesKnownVideoDomain || hasPlayerSubdomain || hasPlayerPath || hasPlayerTitle) {
    let reason = 'Indícios semânticos de player de vídeo';
    if (matchesKnownVideoDomain) {
      reason = `Provedor de hospedagem de vídeo reconhecido (${hostname})`;
    } else if (hasPlayerPath) {
      reason = 'Estrutura de URL compatível com player/incorporação (/embed/, /player/, /e/)';
    } else if (hasPlayerSubdomain) {
      reason = `Subdomínio dedicado a streaming/player (${hostname})`;
    } else if (hasPlayerTitle) {
      reason = `Título do elemento declara reprodução de mídia ("${title}")`;
    }
    return {
      classification: 'probable_player',
      reason
    };
  }

  // 3. Finalidade Desconhecida / Sem Evidências de Vídeo
  return {
    classification: 'unknown_purpose',
    reason: 'Iframe sem evidências objetivas de reprodução de vídeo ou serviços conhecidos'
  };
}

/**
 * Determina o status da inspeção diferenciando claramente os cenários:
 * 1. Nenhuma fonte aberta encontrada
 * 2. Player incorporado (iframe) identificado
 * 3. Possível carregamento dinâmico de mídia
 * 4. Fonte direta encontrada e acessível
 * 5. Página intermediária ou desafio de proteção (Cloudflare/Anti-Bot/Turnstile)
 * 6. (Reprodução confirmada ocorre no player no cliente)
 */
export function determineInspectionStatus(params: {
  sourcesCount: number;
  hasAccessibleDirectSource: boolean;
  detectedDrm: boolean;
  detectedProtection: boolean;
  detectedChallenge?: boolean;
  challengeInfo?: InterstitialChallengeInfo;
  iframesCount: number;
  detectedIframes?: DetectedIframe[];
  dynamicIndicatorsCount: number;
  firstIframeDomain?: string;
  httpStatusCode?: number;
  contentType?: string;
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

  // Detecção explícita de página intermediária ou desafio de acesso (ex: Cloudflare "Just a moment...")
  // REQUISITO: Não afirmar que o episódio não possui vídeo; apresentar como limitação de acesso.
  if ((params.detectedChallenge || params.detectedProtection) && params.sourcesCount === 0) {
    const provider = params.challengeInfo?.provider || 'Proteção Intermediária';
    const title = params.challengeInfo?.pageTitle || 'Just a moment...';
    const statusText = params.httpStatusCode ? `HTTP ${params.httpStatusCode}` : 'Resposta do Servidor';

    details.push(`Resposta interceptada por desafio de proteção (${provider}) · ${statusText}.`);
    details.push(`Título da resposta recebida pelo servidor: "${title}".`);
    if (params.contentType) {
      details.push(`Tipo de conteúdo retornado: ${params.contentType}.`);
    }
    if (params.challengeInfo?.evidence && params.challengeInfo.evidence.length > 0) {
      details.push(`Indício(s) detectado(s): ${params.challengeInfo.evidence.join('; ')}.`);
    }
    details.push('Limitação de Acesso Automatizado: O episódio pode conter vídeo e reproduzir normalmente no seu navegador, mas a requisição do analisador recebeu uma página intermediária de proteção.');
    details.push('Por motivos de conformidade e segurança, o NOVA STORAGE não tenta resolver CAPTCHAs, contornar firewalls anti-bot nem executar scripts do intermediário.');

    return {
      status: 'challenge_or_interstitial_detected',
      summaryMessage: `Página intermediária ou desafio de acesso detectado (${provider}). O servidor retornou uma tela de verificação temporária em vez do conteúdo do episódio. Isso representa uma limitação de acesso do analisador, não a ausência de vídeo.`,
      diagnosticDetails: details
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

  // Análise semântica dos iframes detectados
  const iframes = params.detectedIframes || [];
  const probablePlayers = iframes.filter(i => i.classification === 'probable_player');
  const utilityIframes = iframes.filter(i => i.classification === 'utility_or_service');
  const unknownIframes = iframes.filter(i => i.classification === 'unknown_purpose');

  // Retrocompatibilidade quando detectedIframes não é passado explicitamente
  const hasProbablePlayerFallback = iframes.length === 0 && params.iframesCount > 0 && Boolean(
    params.firstIframeDomain &&
    (params.firstIframeDomain.includes('streamtape') ||
     params.firstIframeDomain.includes('vimeo') ||
     params.firstIframeDomain.includes('youtube') ||
     params.firstIframeDomain.includes('player') ||
     params.firstIframeDomain.includes('embed') ||
     params.firstIframeDomain.includes('video'))
  );

  const hasProbablePlayer = probablePlayers.length > 0 || hasProbablePlayerFallback;

  // 1. Se houver provável player de vídeo
  if (hasProbablePlayer) {
    const domain = probablePlayers[0]?.domain || params.firstIframeDomain;
    const domainText = domain ? ` do domínio "${domain}"` : '';
    const count = probablePlayers.length || params.iframesCount;
    details.push(`${count} elemento(s) iframe com características de player/embed detectado(s)${domainText}.`);
    details.push('Não é possível afirmar se existe um vídeo ativo apenas pela presença de um iframe.');
    details.push('Por motivos de segurança e política de mesma origem (Same-Origin Policy), o conteúdo interno de iframes de terceiros não é acessado.');
    if (utilityIframes.length > 0) {
      details.push(`${utilityIframes.length} outro(s) iframe(s) utilitário(s) identificado(s) na página (chat/login/serviço).`);
    }
    return {
      status: 'embedded_player_detected',
      summaryMessage: `Player incorporado (iframe) identificado${domainText} (${count} frame(s) detectado(s)).`,
      diagnosticDetails: details
    };
  }

  // 2. Se houver indícios de carregamento dinâmico (scripts de player / data-* attributes)
  if (params.dynamicIndicatorsCount > 0) {
    details.push(`${params.dynamicIndicatorsCount} indicador(es) de carregamento dinâmico ou biblioteca de player encontrado(s) no HTML.`);
    details.push('A página não expõe a URL de mídia diretamente no DOM estático; o fluxo de vídeo costuma ser solicitado sob demanda via requisições assíncronas do cliente.');
    if (utilityIframes.length > 0) {
      details.push(`${utilityIframes.length} iframe(s) utilitário(s) identificado(s) (${utilityIframes.map(i => i.domain).join(', ')}), sem evidência de reprodução de vídeo.`);
    }
    if (unknownIframes.length > 0) {
      details.push(`${unknownIframes.length} iframe(s) de finalidade não confirmada detectado(s), sem indícios de reprodução.`);
    }
    return {
      status: 'dynamic_loading_detected',
      summaryMessage: 'Possível carregamento dinâmico de mídia detectado. Bibliotecas de player ou configurações dinâmicas foram encontradas no código da página.',
      diagnosticDetails: details
    };
  }

  // 3. Se houver apenas iframes utilitários (ex: /chat2/login.php)
  if (utilityIframes.length > 0 && unknownIframes.length === 0) {
    const utilityCount = utilityIframes.length;
    details.push(`${utilityCount} elemento(s) iframe utilitário(s) identificado(s) no HTML (chat/login/serviço).`);
    details.push('Nenhum elemento de vídeo, tag <video>, tag <source> ou metadados de compartilhamento foram encontrados.');
    details.push('O NOVA STORAGE não afirma que existe vídeo em iframes utilitários sem evidências objetivas.');
    return {
      status: 'no_sources',
      summaryMessage: `Nenhuma fonte aberta de vídeo encontrada. O(s) ${utilityCount} iframe(s) detectado(s) são utilitários (chat/login/serviço) e não correspondem a players de vídeo.`,
      diagnosticDetails: details
    };
  }

  // 4. Se houver iframes com finalidade desconhecida sem evidências de player
  if (unknownIframes.length > 0 || (iframes.length === 0 && params.iframesCount > 0)) {
    const unkCount = unknownIframes.length || params.iframesCount;
    details.push(`${unkCount} elemento(s) iframe com finalidade não confirmada identificado(s) no HTML.`);
    details.push('Não foram identificadas tags de vídeo, metadados nem padrões semânticos de players conhecidos.');
    details.push('O NOVA STORAGE não assume a presença de vídeo em iframes sem evidências claras.');
    return {
      status: 'no_sources',
      summaryMessage: `Nenhuma fonte aberta de vídeo encontrada. O(s) iframe(s) detectado(s) possuem finalidade desconhecida, sem indícios semânticos de player.`,
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
 * elementos iframe (com domínio de origem), referências a carregamento dinâmico
 * e páginas intermediárias de proteção (Cloudflare/Anti-Bot)
 */
export async function extractMediaFromHtml(
  html: string,
  pageUrl: string,
  options?: { httpStatus?: number; contentType?: string }
): Promise<{
  sources: ExtractedMediaSource[];
  detectedIframes: DetectedIframe[];
  dynamicMediaIndicators: DynamicMediaIndicator[];
  interstitialChallenge: InterstitialChallengeInfo;
  detectedDrm: boolean;
  detectedProtection: boolean;
  pageTitle: string;
}> {
  const sourcesMap = new Map<string, ExtractedMediaSource>();
  const detectedIframesMap = new Map<string, DetectedIframe>();
  const dynamicIndicators: DynamicMediaIndicator[] = [];
  const pageTitle = extractTitle(html);
  const challengeEvidence: string[] = [];

  // 1. Detecção de proteções ativas (DRM / EME)
  const hasDrmKeywords =
    html.includes('requestMediaKeySystemAccess') ||
    html.includes('com.widevine.alpha') ||
    html.includes('com.apple.fps') ||
    html.includes('playready') ||
    html.includes('drmSecurity');

  // 1.1 Detecção de Desafios Intermediários e Telas Anti-Bot (Cloudflare / Turnstile / CAPTCHA)
  const titleLower = pageTitle.toLowerCase();
  const isCloudflareTitle =
    titleLower.includes('just a moment') ||
    titleLower.includes('attention required') ||
    titleLower.includes('checking your browser') ||
    titleLower.includes('cloudflare');

  if (isCloudflareTitle) {
    challengeEvidence.push(`Título de verificação intermediária: "${pageTitle}"`);
  }

  const hasCloudflarePlatform =
    html.includes('challenges.cloudflare.com') ||
    html.includes('cf-mitigated') ||
    html.includes('cf-chl-') ||
    html.includes('challenge-platform') ||
    html.includes('cf-challenge-running') ||
    html.includes('cf-browser-verification') ||
    html.includes('cf_chl_prog') ||
    html.includes('turnstile');

  if (hasCloudflarePlatform) {
    challengeEvidence.push('Plataforma de Desafios/Turnstile da Cloudflare no corpo HTML');
  }

  if (html.includes('DDoS protection by Cloudflare')) {
    challengeEvidence.push('Mensagem de proteção anti-DDoS por Cloudflare');
  }

  if (html.includes('Ray ID:') || html.includes('ray-id')) {
    challengeEvidence.push('Identificador de requisição Cloudflare (Ray ID)');
  }

  if (html.includes('enable JavaScript and cookies to continue') || html.includes('Enable JavaScript and cookies')) {
    challengeEvidence.push('Exigência de execução de JavaScript e cookies do navegador');
  }

  const isRecaptcha = html.includes('g-recaptcha') || html.includes('google.com/recaptcha');
  if (isRecaptcha) {
    challengeEvidence.push('Widget de verificação Google reCAPTCHA');
  }

  const isHcaptcha = html.includes('hcaptcha');
  if (isHcaptcha) {
    challengeEvidence.push('Widget de verificação hCaptcha');
  }

  const isCloudflare = isCloudflareTitle || hasCloudflarePlatform || html.includes('DDoS protection by Cloudflare');
  const detectedChallenge = isCloudflare || isRecaptcha || isHcaptcha || isCloudflareTitle;
  const hasProtectionOrCaptcha = detectedChallenge || hasDrmKeywords;

  let challengeProvider: InterstitialChallengeInfo['provider'] = 'Nenhum';
  if (isCloudflare) challengeProvider = 'Cloudflare';
  else if (isRecaptcha) challengeProvider = 'Google reCAPTCHA';
  else if (isHcaptcha) challengeProvider = 'hCaptcha';
  else if (detectedChallenge) challengeProvider = 'Proteção Intermediária';

  const interstitialChallenge: InterstitialChallengeInfo = {
    detected: detectedChallenge,
    provider: challengeProvider,
    pageTitle,
    httpStatusCode: options?.httpStatus,
    contentType: options?.contentType,
    evidence: challengeEvidence
  };

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
          const title = titleMatch ? titleMatch[1].trim() : undefined;
          const classificationResult = classifyIframe(resolved, title);

          detectedIframesMap.set(resolved, {
            url: resolved,
            domain,
            origin,
            isCrossOrigin,
            title,
            classification: classificationResult.classification,
            classificationReason: classificationResult.reason
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
    interstitialChallenge,
    detectedDrm: hasDrmKeywords,
    detectedProtection: hasProtectionOrCaptcha,
    pageTitle
  };
}

/**
 * Testa de forma segura e não intrusiva a acessibilidade e cabeçalhos CORS de uma URL de mídia,
 * com validação SSRF estrita na URL inicial e em cada salto de redirecionamento.
 */
export async function probeMediaAccessibility(
  mediaUrl: string,
  options?: { maxRedirects?: number; timeoutMs?: number }
): Promise<{
  accessible: boolean;
  corsSupported: boolean;
  statusCode?: number;
  contentLengthBytes?: number;
  mimeType?: string;
  supportsRange?: boolean;
  notes?: string;
  finalUrl?: string;
  isHtml?: boolean;
}> {
  const maxRedirects = options?.maxRedirects ?? 3;
  const timeoutMs = options?.timeoutMs ?? 4000;

  let currentUrl = mediaUrl;
  let redirectCount = 0;

  while (redirectCount <= maxRedirects) {
    // 1. Validação SSRF rigorosa do endpoint de mídia antes de conectar em cada salto
    const ssrfCheck = await validateUrlForSsrf(currentUrl);
    if (!ssrfCheck.valid) {
      return {
        accessible: false,
        corsSupported: false,
        notes: `Acesso à mídia bloqueado por política de segurança SSRF: ${ssrfCheck.error}`
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // Tenta uma requisição GET com cabeçalho de alcance curto (Range: bytes=0-1024) para testar 206 Partial Content
      // Usamos redirect: 'manual' para impedir desvios de SSRF via redirecionamentos para IPs privados ou metadados
      const response = await fetch(currentUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 NOVA-STORAGE-Inspector/1.0',
          'Range': 'bytes=0-1024',
          'Origin': 'https://ais-dev-4wcm7llj3mzvxq3xdjjq3o-46161797005.us-east1.run.app'
        },
        redirect: 'manual',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Trata redirecionamentos manuais com validação SSRF no próximo salto
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) {
          return {
            accessible: false,
            corsSupported: false,
            statusCode: response.status,
            notes: 'Redirecionamento recebido sem cabeçalho Location.'
          };
        }

        currentUrl = new URL(location, currentUrl).toString();
        redirectCount++;
        continue;
      }

      const corsHeader = response.headers.get('access-control-allow-origin');
      const corsSupported = typeof corsHeader === 'string' && corsHeader.length > 0;
      const contentLength = response.headers.get('content-length');
      const mimeType = response.headers.get('content-type') || undefined;
      const lowerMime = (mimeType || '').toLowerCase();
      const isHtml = Boolean(
        lowerMime.includes('text/html') ||
        lowerMime.includes('application/xhtml+xml')
      );
      const accessible = (response.status >= 200 && response.status < 400) && !isHtml;
      const acceptRanges = response.headers.get('accept-ranges');
      const contentRange = response.headers.get('content-range');
      const supportsRange = response.status === 206 || acceptRanges === 'bytes' || Boolean(contentRange);

      let notes = '';
      if (isHtml) {
        notes = `O servidor respondeu com uma página HTML (Content-Type: ${mimeType || 'text/html'}) e não com um fluxo de mídia direto.`;
      } else if (response.status === 403) {
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
        notes,
        finalUrl: currentUrl,
        isHtml
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

  return {
    accessible: false,
    corsSupported: false,
    notes: `Limite máximo de ${maxRedirects} redirecionamentos excedido.`
  };
}
