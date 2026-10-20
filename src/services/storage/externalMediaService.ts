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

export type IframeClassification = 'probable_player' | 'utility_or_service' | 'unknown_purpose';

export interface DetectedIframe {
  url: string;
  domain: string;
  origin: string;
  isCrossOrigin: boolean;
  title?: string;
  classification?: IframeClassification;
  classificationReason?: string;
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

export type MediaSourceValidationState =
  | 'detected_untested'
  | 'server_accessible'
  | 'playback_confirmed'
  | 'temporary_or_expired'
  | 'access_denied'
  | 'playback_failed'
  | 'inconclusive'
  | 'html_response';

export interface TemporaryUrlSignatureInfo {
  isPotentiallyTemporary: boolean;
  detectedParameters: string[];
  expirationTimestamp?: number;
  isProbablyExpired?: boolean;
  reason?: string;
}

export interface MediaSourceValidationEvaluation {
  state: MediaSourceValidationState;
  stateLabel: string;
  badgeClass: string;
  summaryMessage: string;
  evidence: string[];
  isTemporary: boolean;
  sanitizedUrl: string;
}

/**
 * Detecta se uma URL de mídia possui características de assinatura ou link temporário
 * com base em parâmetros comuns de expiração e autenticação por CDN
 */
export function detectTemporaryUrlSignature(url: string): TemporaryUrlSignatureInfo {
  if (!url || typeof url !== 'string') {
    return { isPotentiallyTemporary: false, detectedParameters: [] };
  }

  try {
    const parsed = new URL(url);
    const params = parsed.searchParams;
    const detected: string[] = [];
    let expirationTimestamp: number | undefined;
    let isProbablyExpired: boolean | undefined;

    // Chaves comuns de expiração
    const expKeys = ['expires', 'expire', 'exp', 'e', 'wstime', 'validto', 'validity', 'deadline'];
    // Chaves comuns de assinatura e token de CDN
    const tokenKeys = [
      'token',
      'auth_token',
      'access_token',
      'security_token',
      'st',
      'sig',
      'signature',
      'sign',
      'h',
      'hash',
      'md5',
      'key-pair-id',
      'policy',
      'hmac',
      'wssecret'
    ];

    for (const [key, value] of params.entries()) {
      const lowerKey = key.toLowerCase();
      if (expKeys.includes(lowerKey)) {
        detected.push(key);
        const numericVal = parseInt(value, 10);
        if (!isNaN(numericVal) && numericVal > 0) {
          expirationTimestamp = numericVal;
          // Se for timestamp em segundos (ex: 1729000000)
          if (numericVal > 1_000_000_000 && numericVal < 4_000_000_000) {
            isProbablyExpired = numericVal < Math.floor(Date.now() / 1000);
          } else if (numericVal >= 1_000_000_000_000) {
            // Se for timestamp em milissegundos
            isProbablyExpired = numericVal < Date.now();
          }
        }
      } else if (tokenKeys.includes(lowerKey)) {
        detected.push(key);
      }
    }

    const isPotentiallyTemporary = detected.length > 0;
    let reason: string | undefined;

    if (isPotentiallyTemporary) {
      if (isProbablyExpired) {
        reason = `O parâmetro de validade (${detected.join(', ')}) indica carimbo de data/hora no passado. O link pode ter expirado.`;
      } else if (expirationTimestamp) {
        reason = `Identificado parâmetro de expiração programada (${detected.join(', ')}).`;
      } else {
        reason = `Identificado(s) parâmetro(s) de assinatura de CDN (${detected.join(', ')}).`;
      }
    }

    return {
      isPotentiallyTemporary,
      detectedParameters: detected,
      expirationTimestamp,
      isProbablyExpired,
      reason
    };
  } catch {
    return { isPotentiallyTemporary: false, detectedParameters: [] };
  }
}

/**
 * Mascara tokens, assinaturas e credenciais sensíveis na URL exclusivamente para exibição e logs,
 * preservando a URL original intacta para reprodução pelo player.
 */
export function sanitizeMediaUrlForDisplay(url: string): string {
  if (!url || typeof url !== 'string') return '';

  try {
    const parsed = new URL(url);
    const sensitiveKeys = [
      'token',
      'auth',
      'auth_token',
      'access_token',
      'security_token',
      'signature',
      'sig',
      'sign',
      'key',
      'secret',
      'hash',
      'password',
      'pass',
      'session',
      'jwt',
      'credential',
      'mac',
      'hmac',
      'wssecret',
      'policy'
    ];

    const newParams = new URLSearchParams();
    for (const [key, value] of parsed.searchParams.entries()) {
      const lowerKey = key.toLowerCase();
      const isSensitive = sensitiveKeys.some(k => lowerKey === k || lowerKey.includes(k));
      if (isSensitive && value && value.length > 4) {
        newParams.set(key, '[token_protegido]');
      } else {
        newParams.set(key, value);
      }
    }

    parsed.search = newParams.toString();
    return parsed.toString().replace(/%5B/g, '[').replace(/%5D/g, ']');
  } catch {
    // Se falhar no parse, oculta query string por segurança
    const qIndex = url.indexOf('?');
    if (qIndex !== -1) {
      return url.slice(0, qIndex) + '?[parametros_protegidos]';
    }
    return url;
  }
}

/**
 * Avalia de forma unificada o estado da fonte de vídeo diferenciando com precisão os 7 cenários:
 * 1. URL detectada, mas ainda não testada
 * 2. Servidor acessível
 * 3. Reprodução realmente confirmada (evento playing do navegador)
 * 4. Link temporário ou potencialmente expirado
 * 5. Acesso negado pelo servidor (HTTP 403/401)
 * 6. Falha por CORS, formato ou outro motivo com evidências
 * 7. Resultado inconclusivo
 */
export function evaluateMediaSourceValidation(params: {
  source?: ExtractedMediaSource;
  playbackState: 'idle' | 'connecting' | 'canplay' | 'playing' | 'error';
  playbackErrorDetail?: string | null;
  browserErrorCode?: number | null;
}): MediaSourceValidationEvaluation {
  const { source, playbackState, playbackErrorDetail, browserErrorCode } = params;
  const rawUrl = source?.url || '';
  const sanitizedUrl = sanitizeMediaUrlForDisplay(rawUrl);
  const sigInfo = detectTemporaryUrlSignature(rawUrl);

  const evidence: string[] = [];

  // 3. Reprodução Realmente Confirmada (evento 'playing' disparado no elemento HTML5)
  // Regra obrigatória: HTTP 200/206 isoladamente NUNCA equivale a reprodução confirmada.
  if (playbackState === 'playing') {
    evidence.push('Evento de reprodução ativo no navegador (video.playing).');
    evidence.push('Frames de vídeo decodificados e fluxo contínuo estabelecido.');
    return {
      state: 'playback_confirmed',
      stateLabel: '3. Reprodução Confirmada',
      badgeClass: 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300',
      summaryMessage: 'Reprodução em andamento confirmada pelo navegador. O fluxo de vídeo está decodificando frames normalmente.',
      evidence,
      isTemporary: sigInfo.isPotentiallyTemporary,
      sanitizedUrl
    };
  }

  // 4. Link Temporário ou Potencialmente Expirado
  // Se a URL possui indícios de assinatura/token E retornou HTTP 403/410, ou timestamp expirado, ou erro com 403
  const isHttpForbiddenOrExpired = source?.statusCode === 403 || source?.statusCode === 410;
  const hasErrorForbidden = playbackErrorDetail && (playbackErrorDetail.includes('403') || playbackErrorDetail.includes('Forbidden'));

  if (sigInfo.isPotentiallyTemporary && (isHttpForbiddenOrExpired || sigInfo.isProbablyExpired || (playbackState === 'error' && hasErrorForbidden))) {
    evidence.push(`Parâmetros de assinatura temporária detectados: ${sigInfo.detectedParameters.join(', ')}.`);
    if (sigInfo.isProbablyExpired) {
      evidence.push('O carimbo de data/hora (timestamp) na URL indica validade no passado.');
    }
    if (isHttpForbiddenOrExpired) {
      evidence.push(`O servidor remoto recusou o acesso (HTTP ${source?.statusCode || 403}).`);
    }
    evidence.push('Links assinados possuem validade curta e costumam expirar após alguns minutos ou estar restritos ao IP/sessão original.');
    return {
      state: 'temporary_or_expired',
      stateLabel: '4. Link Temporário / Potencialmente Expirado',
      badgeClass: 'bg-amber-950/40 border-amber-500/60 text-amber-200',
      summaryMessage: 'Link com assinatura temporária que pode ter expirado ou estar restrito à sessão de origem. O servidor recusou o acesso com código de proteção.',
      evidence,
      isTemporary: true,
      sanitizedUrl
    };
  }

  // Diagnóstico específico: Resposta HTML na sondagem do backend (baseada estritamente no Content-Type)
  const lowerMime = (source?.mimeType || '').toLowerCase();
  const isHtmlProbe = Boolean(
    lowerMime &&
      (lowerMime.includes('text/html') || lowerMime.includes('application/xhtml+xml'))
  );

  // Classifica como 'html_response' exclusivamente se o Content-Type da sondagem indicar HTML,
  // sem utilizar o erro do player do navegador como gatilho dessa classificação
  if (isHtmlProbe) {
    if (source?.statusCode) {
      evidence.push(`Sondagem do backend: o servidor respondeu com código HTTP ${source.statusCode}.`);
    }
    if (source?.mimeType) {
      evidence.push(`Sondagem do backend: Content-Type retornado foi "${source.mimeType}".`);
    }
    evidence.push('O servidor remoto retornou um documento HTML na requisição da sondagem, em vez de dados binários de vídeo.');

    // Evidência do elemento de vídeo no navegador mantida estritamente separada
    if (playbackState === 'error') {
      evidence.push(
        `Elemento de vídeo no navegador: erro registrado na reprodução${
          playbackErrorDetail ? ` (${playbackErrorDetail})` : ''
        }.`
      );
    } else if (playbackState === 'connecting') {
      evidence.push('Elemento de vídeo no navegador: conectando ao fluxo...');
    } else {
      evidence.push('Elemento de vídeo no navegador: reprodução ainda não confirmada.');
    }

    const is403 = source?.statusCode === 403;
    const summaryMessage = is403
      ? 'A sondagem HTTP feita pelo backend foi recusada com HTTP 403 e retornou uma página HTML (possíveis causas incluem restrição de acesso, sessão, token ou bloqueio a requisições de servidor). A reprodução no navegador ainda não foi confirmada.'
      : 'O endereço testado retornou uma página web (HTML) na sondagem em vez de um arquivo de vídeo acessível. A URL capturada pode não ser o endereço direto da mídia.';

    return {
      state: 'html_response',
      stateLabel: 'URL intermediária ou resposta HTML',
      badgeClass: 'bg-amber-950/40 border-amber-500/60 text-amber-200',
      summaryMessage,
      evidence,
      isTemporary: sigInfo.isPotentiallyTemporary,
      sanitizedUrl
    };
  }

  // 5. Acesso Negado pelo Servidor (HTTP 403/401 sem indícios de assinatura temporária e com mídia ou MIME não-HTML)
  if (source?.statusCode === 403 || source?.statusCode === 401) {
    evidence.push(`Sondagem do backend: resposta HTTP ${source.statusCode}.`);
    if (source?.mimeType) {
      evidence.push(`Sondagem do backend: Content-Type declarado: "${source.mimeType}".`);
    }
    evidence.push('A requisição direta da sondagem foi recusada pelo servidor de origem.');

    if (playbackState === 'error') {
      evidence.push(
        `Elemento de vídeo no navegador: erro registrado na reprodução${
          playbackErrorDetail ? ` (${playbackErrorDetail})` : ''
        }.`
      );
    } else if (playbackState === 'connecting') {
      evidence.push('Elemento de vídeo no navegador: conectando ao fluxo...');
    } else {
      evidence.push('Elemento de vídeo no navegador: reprodução ainda não confirmada.');
    }

    return {
      state: 'access_denied',
      stateLabel: '5. Acesso Negado pelo Servidor',
      badgeClass: 'bg-rose-950/40 border-rose-500/60 text-rose-300',
      summaryMessage: `Acesso negado pelo servidor remoto (HTTP ${source.statusCode}) na sondagem. A requisição foi recusada pelo servidor de origem e a reprodução no navegador ainda não foi confirmada.`,
      evidence,
      isTemporary: sigInfo.isPotentiallyTemporary,
      sanitizedUrl
    };
  }

  // Se houver falha de reprodução no navegador ('error'):
  if (playbackState === 'error') {
    // 6. Falha por CORS, formato ou outro motivo com evidências suficientes
    const hasCorsEvidence = source?.corsSupported === false;
    const hasNotFoundEvidence = source?.statusCode === 404;
    const hasInvalidMimeEvidence = source?.mimeType && !source.mimeType.toLowerCase().includes('video');
    const hasDecodeErrorEvidence = browserErrorCode === 3; // MEDIA_ERR_DECODE

    if (hasCorsEvidence || hasNotFoundEvidence || hasInvalidMimeEvidence || hasDecodeErrorEvidence) {
      if (hasCorsEvidence) {
        evidence.push('O servidor remoto não declarou o cabeçalho Access-Control-Allow-Origin.');
      }
      if (hasNotFoundEvidence) {
        evidence.push('O servidor remoto retornou HTTP 404 Not Found (arquivo inexistente ou removido).');
      }
      if (hasInvalidMimeEvidence) {
        evidence.push(`O servidor retornou tipo MIME não-vídeo: "${source?.mimeType}".`);
      }
      if (hasDecodeErrorEvidence) {
        evidence.push('Falha na decodificação de codecs pelo navegador (MEDIA_ERR_DECODE - Código 3).');
      }

      return {
        state: 'playback_failed',
        stateLabel: '6. Falha de Reprodução com Causa Evidente',
        badgeClass: 'bg-rose-950/40 border-rose-800/60 text-rose-300',
        summaryMessage: 'Falha comprovada por restrição de rede, ausência de CORS ou formato de mídia incompatível com o navegador.',
        evidence,
        isTemporary: sigInfo.isPotentiallyTemporary,
        sanitizedUrl
      };
    }

    // 7. Resultado Inconclusivo (quando não há evidência suficiente para cravar a causa)
    evidence.push('O navegador emitiu erro no elemento de vídeo (MEDIA_ERR_SRC_NOT_SUPPORTED ou falha de rede sem resposta do servidor).');
    evidence.push('Não há cabeçalhos de recusa suficientes ou confirmação técnica para apontar CORS, codec ou bloqueio com certeza.');
    evidence.push('O fluxo pode depender de contexto de aba, cookies de sessão de terceiros ou parâmetros de Referer não replicáveis.');

    return {
      state: 'inconclusive',
      stateLabel: '7. Resultado Inconclusivo',
      badgeClass: 'bg-neutral-900 border-neutral-700 text-neutral-300',
      summaryMessage: 'Resultado inconclusivo. O navegador não conseguiu carregar o vídeo, mas não existem evidências suficientes para determinar se a causa foi bloqueio de cabeçalho, restrição de sessão ou codec incompatível.',
      evidence,
      isTemporary: sigInfo.isPotentiallyTemporary,
      sanitizedUrl
    };
  }

  // 2. Servidor Acessível (HTTP 200/206 confirmado pelo probe do backend)
  if (source?.accessible === true) {
    evidence.push(`Servidor remoto respondeu com sucesso: HTTP ${source.statusCode || 200}.`);
    if (source.supportsRange) {
      evidence.push('Suporte a requisições parciais por bytes confirmado (HTTP 206 Partial Content).');
    }
    if (source.corsSupported) {
      evidence.push('Cabeçalho Access-Control-Allow-Origin presente.');
    }
    if (sigInfo.isPotentiallyTemporary) {
      evidence.push(`Aviso: Link com parâmetros de assinatura (${sigInfo.detectedParameters.join(', ')}). Pode expirar com o tempo.`);
    }

    return {
      state: 'server_accessible',
      stateLabel: '2. Servidor Acessível',
      badgeClass: 'bg-cyan-950/40 border-cyan-500/50 text-cyan-300',
      summaryMessage: `Servidor de mídia acessível (HTTP ${source.statusCode || 200}${source.supportsRange ? ' · Range 206 Ativo' : ''}). Aguardando início do player no navegador.`,
      evidence,
      isTemporary: sigInfo.isPotentiallyTemporary,
      sanitizedUrl
    };
  }

  // 1. URL detectada, mas ainda não testada
  evidence.push('URL de mídia identificada no HTML ou inserida pelo usuário.');
  evidence.push('Aguardando verificação de rede pelo analisador ou inicialização do player.');
  if (sigInfo.isPotentiallyTemporary) {
    evidence.push(`Aviso: A URL aparenta conter parâmetros de assinatura (${sigInfo.detectedParameters.join(', ')}).`);
  }

  return {
    state: 'detected_untested',
    stateLabel: '1. URL Detectada (Não Testada)',
    badgeClass: 'bg-neutral-900 border-neutral-800 text-neutral-400',
    summaryMessage: 'URL de mídia identificada. Aguardando teste de conectividade ou comando de reprodução.',
    evidence,
    isTemporary: sigInfo.isPotentiallyTemporary,
    sanitizedUrl
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

