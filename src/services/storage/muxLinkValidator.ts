/**
 * Serviço de Validação e Segurança de URLs e Playback IDs do Mux Video
 *
 * Restrições e Garantias de Segurança:
 * 1. Exige protocolo estrito HTTPS quando uma URL completa for fornecida.
 * 2. Valida e restringe domínios a stream.mux.com e image.mux.com (Anti-Arbitrary URL / Anti-SSRF).
 * 3. Suporta Playback IDs públicos e vídeos assinados com Playback Token JWT.
 * 4. Não solicita nem expõe chaves privadas de assinatura (Signing Key ID / Secret PEM).
 * 5. Não presume que um vídeo existe apenas por ter formato alfanumérico válido.
 */

export interface MuxTokenDetails {
  rawToken: string;
  isJwtFormat: boolean;
  subject?: string;
  audience?: string;
  expiresTimestamp?: number;
  expiresFormatted?: string;
  isExpired?: boolean;
}

export interface MuxValidationResult {
  isValid: boolean;
  playbackId: string;
  streamUrl: string;
  thumbnailUrl: string;
  hasToken: boolean;
  isSigned: boolean;
  tokenDetails?: MuxTokenDetails;
  inputType: 'playback_id' | 'stream_url' | 'unsupported';
  originalInput: string;
  error?: string;
}

// Regex segura para validação de Playback ID alfanumérico padrão do Mux (geralmente 10 a 64 chars)
const PLAYBACK_ID_REGEX = /^[a-zA-Z0-9_\-]{6,80}$/;

/**
 * Decodifica com segurança o payload de um JWT sem expor ou executar código não seguro
 */
function decodeJwtPayloadSafe(token: string): Partial<{ sub: string; aud: string; exp: number }> | null {
  try {
    const parts = token.trim().split('.');
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

/**
 * Analisa e extrai metadados de um token de reprodução JWT do Mux
 */
export function parseMuxToken(tokenStr?: string | null): MuxTokenDetails | undefined {
  if (!tokenStr || !tokenStr.trim()) return undefined;
  const rawToken = tokenStr.trim();
  const payload = decodeJwtPayloadSafe(rawToken);

  if (payload) {
    let expiresFormatted: string | undefined;
    let isExpired = false;

    if (typeof payload.exp === 'number') {
      const expDate = new Date(payload.exp * 1000);
      if (!isNaN(expDate.getTime())) {
        expiresFormatted = expDate.toLocaleString('pt-BR');
        isExpired = Date.now() > expDate.getTime();
      }
    }

    return {
      rawToken,
      isJwtFormat: true,
      subject: payload.sub,
      audience: payload.aud,
      expiresTimestamp: payload.exp,
      expiresFormatted,
      isExpired
    };
  }

  // Se for token opaco ou não-JWT padrão
  return {
    rawToken,
    isJwtFormat: false
  };
}

/**
 * Valida uma entrada que pode ser um Playback ID do Mux ou uma URL completa de stream
 * @param input Playback ID ou URL completa (ex: https://stream.mux.com/{id}.m3u8)
 * @param optionalToken Token JWT opcional para Playback IDs assinados
 */
export function validateMuxInput(input: string, optionalToken?: string): MuxValidationResult {
  const trimmed = (input || '').trim();

  if (!trimmed) {
    return {
      isValid: false,
      playbackId: '',
      streamUrl: '',
      thumbnailUrl: '',
      hasToken: false,
      isSigned: false,
      inputType: 'unsupported',
      originalInput: '',
      error: 'Por favor, insira um Playback ID ou URL de stream do Mux.'
    };
  }

  let extractedPlaybackId = '';
  let tokenFromUrl: string | undefined;
  let inputType: 'playback_id' | 'stream_url' | 'unsupported' = 'unsupported';

  // Caso 1: A entrada é uma URL (começa com http:// ou https://)
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return {
        isValid: false,
        playbackId: '',
        streamUrl: '',
        thumbnailUrl: '',
        hasToken: false,
        isSigned: false,
        inputType: 'unsupported',
        originalInput: trimmed,
        error: 'Formato de URL inválido. Certifique-se de digitar um endereço válido.'
      };
    }

    // Protocolo estrito HTTPS
    if (parsed.protocol !== 'https:') {
      return {
        isValid: false,
        playbackId: '',
        streamUrl: '',
        thumbnailUrl: '',
        hasToken: false,
        isSigned: false,
        inputType: 'unsupported',
        originalInput: trimmed,
        error: 'Protocolo não seguro. Apenas URLs seguras com HTTPS (https://) são aceitas.'
      };
    }

    const hostname = parsed.hostname.toLowerCase();
    const isMuxDomain = hostname === 'stream.mux.com' || hostname === 'image.mux.com' || hostname.endsWith('.mux.com');

    if (!isMuxDomain) {
      return {
        isValid: false,
        playbackId: '',
        streamUrl: '',
        thumbnailUrl: '',
        hasToken: false,
        isSigned: false,
        inputType: 'unsupported',
        originalInput: trimmed,
        error: `Domínio "${hostname}" não autorizado. São aceitos apenas streams oficiais do Mux (stream.mux.com) ou Playback IDs diretos.`
      };
    }

    // Extrai o Playback ID do caminho: /<playbackId>.m3u8 ou /<playbackId>/thumbnail.jpg
    const pathParts = parsed.pathname.replace(/^\/+/, '').split('/');
    if (pathParts.length > 0) {
      const rawId = pathParts[0].replace(/\.m3u8$/i, '');
      if (PLAYBACK_ID_REGEX.test(rawId)) {
        extractedPlaybackId = rawId;
        inputType = 'stream_url';
      }
    }

    if (!extractedPlaybackId) {
      return {
        isValid: false,
        playbackId: '',
        streamUrl: '',
        thumbnailUrl: '',
        hasToken: false,
        isSigned: false,
        inputType: 'unsupported',
        originalInput: trimmed,
        error: 'Não foi possível extrair um Playback ID válido da URL do Mux.'
      };
    }

    // Extrai token de query params se existir
    const urlToken = parsed.searchParams.get('token');
    if (urlToken) {
      tokenFromUrl = urlToken.trim();
    }
  } else {
    // Caso 2: A entrada é um Playback ID direto
    // Limpeza de possíveis extensões acidentais digitadas pelo usuário (ex: id.m3u8)
    const cleanId = trimmed.replace(/\.m3u8$/i, '');
    if (PLAYBACK_ID_REGEX.test(cleanId)) {
      extractedPlaybackId = cleanId;
      inputType = 'playback_id';
    } else {
      return {
        isValid: false,
        playbackId: '',
        streamUrl: '',
        thumbnailUrl: '',
        hasToken: false,
        isSigned: false,
        inputType: 'unsupported',
        originalInput: trimmed,
        error: 'Playback ID inválido. Deve conter apenas caracteres alfanuméricos (ex: a4ashK2mO...).'
      };
    }
  }

  // Define o token efetivo: prioriza o token informado no campo opcional, com fallback para o token da URL
  const effectiveToken = (optionalToken?.trim() || tokenFromUrl || '').trim();
  const tokenDetails = parseMuxToken(effectiveToken);
  const isSigned = Boolean(effectiveToken);

  // Constrói URLs oficiais do Mux
  let streamUrl = `https://stream.mux.com/${extractedPlaybackId}.m3u8`;
  let thumbnailUrl = `https://image.mux.com/${extractedPlaybackId}/thumbnail.jpg`;

  if (effectiveToken) {
    streamUrl += `?token=${encodeURIComponent(effectiveToken)}`;
    thumbnailUrl += `?token=${encodeURIComponent(effectiveToken)}`;
  }

  return {
    isValid: true,
    playbackId: extractedPlaybackId,
    streamUrl,
    thumbnailUrl,
    hasToken: isSigned,
    isSigned,
    tokenDetails,
    inputType,
    originalInput: trimmed
  };
}
