/**
 * Serviço de Validação e Segurança de URLs do Bunny (Bunny Stream / Bunny CDN)
 *
 * Restrições e Garantias de Segurança:
 * 1. Exige estritamente protocolo HTTPS.
 * 2. Restringe iframes e embeds exclusivamente a domínios oficiais do Bunny (iframe.mediadelivery.net, *.mediadelivery.net).
 * 3. Restringe reprodução direta de vídeos MP4/WebM a CDNs autorizados do Bunny (*.b-cdn.net, *.bunnycdn.com).
 * 4. Bloqueia URLs arbitrárias para evitar riscos de segurança (clickjacking, phishing, ataques de incorporação).
 * 5. Preserva integralmente parâmetros de autenticação temporários (token, expires, sign, etc.) sem removê-los ou alterá-los.
 * 6. Não armazena nem solicita senhas ou chaves de API secretas.
 */

export type BunnyLinkType = 'bunny_embed' | 'direct_video' | 'unsupported';

export interface BunnyValidationResult {
  isValid: boolean;
  type: BunnyLinkType;
  normalizedUrl: string;
  originalUrl: string;
  domain: string;
  hasAuthToken: boolean;
  detectedFormat?: 'EMBED' | 'MP4' | 'WEBM' | string;
  detectedResolution?: string;
  error?: string;
  details?: {
    libraryId?: string;
    videoId?: string;
    tokenParamName?: string;
    expiresTimestamp?: string;
    expiresFormatted?: string;
  };
}

/**
 * Domínios oficiais Bunny autorizados para Incorporação (Embed / iframe)
 */
const ALLOWED_EMBED_DOMAINS = [
  'iframe.mediadelivery.net',
  'video.mediadelivery.net',
  'mediadelivery.net'
];

/**
 * Domínios oficiais Bunny autorizados para CDN / Entrega Direta de Mídia
 */
const ALLOWED_CDN_SUFFIXES = [
  '.b-cdn.net',
  '.bunnycdn.com',
  '.mediadelivery.net',
  '.bunny.net'
];

const ALLOWED_CDN_EXACT = [
  'b-cdn.net',
  'bunnycdn.com',
  'bunny.net'
];

/**
 * Verifica se um hostname pertence oficialmente à infraestrutura do Bunny
 */
export function isBunnyDomain(hostname: string): boolean {
  if (!hostname) return false;
  const h = hostname.toLowerCase().trim();

  // 1. Domínios exatos autorizados
  if (ALLOWED_EMBED_DOMAINS.includes(h) || ALLOWED_CDN_EXACT.includes(h)) {
    return true;
  }

  // 2. Subdomínios autorizados (*.b-cdn.net, *.bunnycdn.com, etc.)
  return ALLOWED_CDN_SUFFIXES.some(suffix => h.endsWith(suffix));
}

/**
 * Verifica se o hostname é o domínio oficial do player iframe do Bunny Stream
 */
export function isBunnyEmbedDomain(hostname: string): boolean {
  if (!hostname) return false;
  const h = hostname.toLowerCase().trim();
  return h === 'iframe.mediadelivery.net' || h === 'video.mediadelivery.net' || h.endsWith('.mediadelivery.net');
}

/**
 * Extrai resolução inferida a partir do nome do arquivo ou da URL
 */
function inferResolutionFromUrl(pathname: string): string | undefined {
  const lower = pathname.toLowerCase();
  if (lower.includes('2160p') || lower.includes('4k')) return '4K UHD';
  if (lower.includes('1440p') || lower.includes('2k')) return '1440p';
  if (lower.includes('1080p') || lower.includes('fullhd') || lower.includes('fhd')) return '1080p';
  if (lower.includes('720p') || lower.includes('hd')) return '720p';
  if (lower.includes('480p')) return '480p';
  if (lower.includes('360p')) return '360p';
  return undefined;
}

/**
 * Valida e analisa uma URL fornecida para reprodução no Testador de Links Bunny.
 */
export function validateBunnyUrl(rawUrl: string): BunnyValidationResult {
  const trimmed = (rawUrl || '').trim();

  if (!trimmed) {
    return {
      isValid: false,
      type: 'unsupported',
      normalizedUrl: '',
      originalUrl: '',
      domain: '',
      hasAuthToken: false,
      error: 'Por favor, informe uma URL para testar.'
    };
  }

  // 1. Tentativa de parsing como URL
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      isValid: false,
      type: 'unsupported',
      normalizedUrl: trimmed,
      originalUrl: trimmed,
      domain: '',
      hasAuthToken: false,
      error: 'Formato de URL inválido. Certifique-se de digitar o endereço completo incluindo o protocolo https://.'
    };
  }

  // 2. Verificação estrita de HTTPS
  if (parsed.protocol !== 'https:') {
    return {
      isValid: false,
      type: 'unsupported',
      normalizedUrl: trimmed,
      originalUrl: trimmed,
      domain: parsed.hostname || '',
      hasAuthToken: false,
      error: 'Protocolo não seguro. Apenas URLs seguras com HTTPS (https://) são aceitas para incorporação e reprodução.'
    };
  }

  const hostname = parsed.hostname.toLowerCase();

  // 3. Verificação de Domínio Confiável (Anti-Arbitrary URL / Anti-Clickjacking)
  if (!isBunnyDomain(hostname)) {
    return {
      isValid: false,
      type: 'unsupported',
      normalizedUrl: trimmed,
      originalUrl: trimmed,
      domain: hostname,
      hasAuthToken: false,
      error: `Domínio "${hostname}" não autorizado. Por motivos de segurança, são aceitos apenas endereços oficiais do ecossistema Bunny (iframe.mediadelivery.net, *.b-cdn.net, *.bunnycdn.com).`
    };
  }

  // 4. Detecção e preservação de tokens de segurança temporários
  const searchParams = parsed.searchParams;
  const tokenKeys = ['token', 'token_path', 'expires', 'b-cdn-token', 'auth', 'sign', 'signature', 'access_token'];
  const detectedTokenKey = tokenKeys.find(key => searchParams.has(key));
  const hasAuthToken = Boolean(detectedTokenKey);

  let expiresTimestamp: string | undefined;
  let expiresFormatted: string | undefined;

  const rawExpires = searchParams.get('expires');
  if (rawExpires && /^\d+$/.test(rawExpires)) {
    expiresTimestamp = rawExpires;
    const expNum = parseInt(rawExpires, 10);
    // Verificar se timestamp está em segundos (Unix standard) ou milissegundos
    const date = expNum < 1e11 ? new Date(expNum * 1000) : new Date(expNum);
    if (!isNaN(date.getTime())) {
      expiresFormatted = date.toLocaleString('pt-BR');
    }
  }

  const details: BunnyValidationResult['details'] = {
    tokenParamName: detectedTokenKey,
    expiresTimestamp,
    expiresFormatted
  };

  const pathname = parsed.pathname;

  // 5. Caso A: Bunny Stream Embed Player
  if (isBunnyEmbedDomain(hostname)) {
    // Formatos típicos do Bunny Stream:
    // /embed/{libraryId}/{videoId}
    // /play/{libraryId}/{videoId}
    // /{libraryId}/{videoId}
    const cleanPath = pathname.replace(/^\/+/, '').split('/');
    let libraryId: string | undefined;
    let videoId: string | undefined;

    if (cleanPath.length >= 3 && (cleanPath[0] === 'embed' || cleanPath[0] === 'play')) {
      libraryId = cleanPath[1];
      videoId = cleanPath[2];
    } else if (cleanPath.length >= 2 && /^\d+$/.test(cleanPath[0])) {
      libraryId = cleanPath[0];
      videoId = cleanPath[1];
    }

    if (libraryId && videoId) {
      details.libraryId = libraryId;
      details.videoId = videoId;

      // Normaliza para o endpoint padrão do iframe do Bunny mantendo TODOS os query params intactos
      // Ex: https://iframe.mediadelivery.net/embed/{libraryId}/{videoId}?token=...&expires=...
      const normalized = `https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}${parsed.search}`;

      return {
        isValid: true,
        type: 'bunny_embed',
        normalizedUrl: normalized,
        originalUrl: trimmed,
        domain: hostname,
        hasAuthToken,
        detectedFormat: 'EMBED',
        details
      };
    }

    // Se o domínio for mediadelivery.net mas o caminho não tiver os IDs de biblioteca e vídeo esperados
    return {
      isValid: false,
      type: 'unsupported',
      normalizedUrl: trimmed,
      originalUrl: trimmed,
      domain: hostname,
      hasAuthToken,
      error: 'URL do Bunny Stream incompleta. O endereço deve conter o ID da biblioteca e do vídeo (ex: https://iframe.mediadelivery.net/embed/{libraryId}/{videoId}).'
    };
  }

  // 6. Caso B: Arquivo Direto MP4 / WebM em CDN Bunny (*.b-cdn.net / *.bunnycdn.com)
  const isMp4 = pathname.toLowerCase().endsWith('.mp4');
  const isWebm = pathname.toLowerCase().endsWith('.webm');

  if (isMp4 || isWebm) {
    const format = isMp4 ? 'MP4' : 'WEBM';
    const resolution = inferResolutionFromUrl(pathname);

    // A URL original com todos os tokens e query strings é preservada rigorosamente
    return {
      isValid: true,
      type: 'direct_video',
      normalizedUrl: trimmed,
      originalUrl: trimmed,
      domain: hostname,
      hasAuthToken,
      detectedFormat: format,
      detectedResolution: resolution,
      details
    };
  }

  // 7. Diagnósticos para formatos não suportados nativamente pelo navegador
  const isHls = pathname.toLowerCase().endsWith('.m3u8');
  if (isHls) {
    return {
      isValid: false,
      type: 'unsupported',
      normalizedUrl: trimmed,
      originalUrl: trimmed,
      domain: hostname,
      hasAuthToken,
      error: 'Arquivos HLS (.m3u8) requerem reprodutor adaptativo. Para reproduzir este vídeo via Bunny, copie a URL de Incorporação (iframe.mediadelivery.net/embed/...) gerada no painel do Bunny Stream.'
    };
  }

  const isDASH = pathname.toLowerCase().endsWith('.mpd');
  if (isDASH) {
    return {
      isValid: false,
      type: 'unsupported',
      normalizedUrl: trimmed,
      originalUrl: trimmed,
      domain: hostname,
      hasAuthToken,
      error: 'Arquivos DASH (.mpd) requerem streaming adaptativo. Utilize o player Embed oficial do Bunny Stream ou um arquivo MP4/WebM direto.'
    };
  }

  const isMkv = pathname.toLowerCase().endsWith('.mkv');
  const isAvi = pathname.toLowerCase().endsWith('.avi');
  if (isMkv || isAvi) {
    const ext = isMkv ? 'MKV' : 'AVI';
    return {
      isValid: false,
      type: 'unsupported',
      normalizedUrl: trimmed,
      originalUrl: trimmed,
      domain: hostname,
      hasAuthToken,
      error: `O formato ${ext} não é suportado pelo elemento HTML5 video dos navegadores modernos. Utilize arquivos MP4 ou WebM, ou incorpore via Bunny Stream Embed.`
    };
  }

  return {
    isValid: false,
    type: 'unsupported',
    normalizedUrl: trimmed,
    originalUrl: trimmed,
    domain: hostname,
    hasAuthToken,
    error: 'Formato não suportado para reprodução direta. Informe uma URL de incorporação do Bunny Stream (iframe.mediadelivery.net/embed/...) ou um link direto para arquivo .mp4 ou .webm em CDN Bunny.'
  };
}
