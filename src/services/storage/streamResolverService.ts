import {
  detectTemporaryUrlSignature,
  ExternalMediaService,
  InspectApiResponse,
  PageInspectionResult,
  TemporaryUrlSignatureInfo
} from './externalMediaService.ts';
import { EpisodeFile } from '../../types/storage.ts';

/**
 * Estratégia de resolução para o link do episódio:
 * - direct_usable: Link direto ainda utilizável com evidência suficiente (não expirado ou estável).
 * - auto_renewable: Renovação automática possível por uma fonte autorizada/pública acessível.
 * - assisted_renewal_required: Renovação assistida necessária (iframe, carregamento dinâmico, anti-bot, sem garantia de reprodução direta).
 * - origin_unavailable: Origem indisponível, bloqueada por SSRF, protegida por DRM ou inacessível.
 * - inconclusive: Falha de validação, erro de rede, timeout ou ausência de dados para tomada de decisão.
 */
export type ResolutionStrategy =
  | 'direct_usable'
  | 'auto_renewable'
  | 'assisted_renewal_required'
  | 'origin_unavailable'
  | 'inconclusive';

export type StreamResolutionStatus =
  | 'usable'
  | 'renewable'
  | 'assisted'
  | 'unavailable'
  | 'inconclusive';

export interface ResolveStreamInput {
  streamUrl?: string;
  originUrl?: string;
  originTitle?: string;
  capturedAt?: string;
  streamUrlExpiresAt?: string | null;
  /**
   * Forçar inspeção na página de origem mesmo que o link atual aparente validade
   */
  forceOriginInspection?: boolean;
  /**
   * Injetor opcional de inspetor de página para testes unitários ou requisições customizadas
   */
  pageInspector?: (url: string) => Promise<InspectApiResponse>;
}

export interface StreamResolutionResult {
  strategy: ResolutionStrategy;
  status: StreamResolutionStatus;
  canDirectPlay: boolean;
  canAutoRenew: boolean;
  requiresSniffer: boolean;
  summaryMessage: string;
  details: string[];

  // Links atual e candidato
  currentStreamUrl?: string;
  candidateStreamUrl?: string;

  // Informações de validade temporal
  isTemporary: boolean;
  isExpired?: boolean;
  expirationTimestamp?: number;
  formattedExpirationDate?: string | null;

  // Metadados de origem
  originUrl?: string;
  originTitle?: string;
  capturedAt?: string;
  streamUrlExpiresAt?: string | null;

  // Assinatura detectada no link atual
  signatureInfo?: TemporaryUrlSignatureInfo;

  // Detalhes diagnósticos da inspeção de origem (se executada)
  inspectionDetails?: {
    pageTitle?: string;
    sourcesCount: number;
    hasAccessibleSource: boolean;
    interstitialChallenge?: boolean;
    embeddedIframesCount: number;
    dynamicLoadingDetected: boolean;
    errorCode?: string;
    inspectionStatus?: string;
  };
}

export class StreamResolverService {
  /**
   * Avalia a assinatura temporal de uma URL de mídia
   */
  static evaluateSignature(streamUrl?: string): TemporaryUrlSignatureInfo {
    if (!streamUrl) {
      return { isPotentiallyTemporary: false, detectedParameters: [] };
    }
    return detectTemporaryUrlSignature(streamUrl);
  }

  /**
   * Formata timestamp numérico de expiração para exibição legível
   */
  static formatExpirationDate(expirationTimestamp?: number): string | null {
    if (!expirationTimestamp || isNaN(expirationTimestamp) || expirationTimestamp <= 0) {
      return null;
    }
    try {
      const ms = expirationTimestamp > 1_000_000_000 && expirationTimestamp < 4_000_000_000
        ? expirationTimestamp * 1000
        : expirationTimestamp;
      const d = new Date(ms);
      if (isNaN(d.getTime())) return null;
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return null;
    }
  }

  /**
   * Resolve a situação de um episódio completo do catálogo de forma segura e não-destrutiva.
   * Não altera o registro original nem substitui automaticamente streamUrl.
   */
  static async resolveEpisode(
    episode: Partial<EpisodeFile>,
    options?: {
      forceOriginInspection?: boolean;
      pageInspector?: (url: string) => Promise<InspectApiResponse>;
    }
  ): Promise<StreamResolutionResult> {
    return this.resolveStream({
      streamUrl: episode.streamUrl,
      originUrl: episode.originUrl,
      originTitle: episode.originTitle,
      capturedAt: episode.capturedAt,
      streamUrlExpiresAt: episode.streamUrlExpiresAt,
      forceOriginInspection: options?.forceOriginInspection,
      pageInspector: options?.pageInspector
    });
  }

  /**
   * Determina de maneira legítima se um link de vídeo pode ser utilizado diretamente,
   * se pode ser renovado automaticamente a partir da página de origem, ou se requer ação assistida.
   */
  static async resolveStream(input: ResolveStreamInput): Promise<StreamResolutionResult> {
    const streamUrl = typeof input.streamUrl === 'string' ? input.streamUrl.trim() : '';
    const originUrl = typeof input.originUrl === 'string' ? input.originUrl.trim() : '';
    const details: string[] = [];

    // 1. Caso base: Nem link direto nem origem foram fornecidos
    if (!streamUrl && !originUrl) {
      return {
        strategy: 'inconclusive',
        status: 'inconclusive',
        canDirectPlay: false,
        canAutoRenew: false,
        requiresSniffer: false,
        summaryMessage: 'Nenhuma URL de stream ou página de origem foi informada para resolução.',
        details: ['Forneça ao menos um link de stream ou uma página web de origem.'],
        isTemporary: false
      };
    }

    // 2. Análise da assinatura e parâmetros temporais do link atual (se presente)
    const sigInfo = streamUrl ? this.evaluateSignature(streamUrl) : undefined;
    const isTemporary = Boolean(sigInfo?.isPotentiallyTemporary);
    const isExpired = sigInfo?.isProbablyExpired;
    const expirationTimestamp = sigInfo?.expirationTimestamp;
    const formattedExpiration = this.formatExpirationDate(expirationTimestamp);

    if (streamUrl && sigInfo) {
      if (sigInfo.isPotentiallyTemporary) {
        details.push(`Parâmetros de assinatura detectados: ${sigInfo.detectedParameters.join(', ')}.`);
        if (expirationTimestamp) {
          details.push(`Carimbo de expiração: ${formattedExpiration || expirationTimestamp}.`);
        }
      } else {
        details.push('Nenhum parâmetro de assinatura temporária conhecido foi detectado na URL direta.');
      }
    }

    // 3. Caso em que o link direto existe e NÃO há página de origem
    if (streamUrl && !originUrl) {
      if (isExpired === true) {
        return {
          strategy: 'inconclusive',
          status: 'inconclusive',
          canDirectPlay: false,
          canAutoRenew: false,
          requiresSniffer: true,
          summaryMessage: 'O link atual possui assinatura temporária expirada e não há página de origem cadastrada para renovação.',
          details: [
            ...details,
            'Sem a página de origem, a renovação automatizada não é possível.',
            'Utilize o NOVA Sniffer no navegador para capturar uma nova URL e cadastrar a página de origem.'
          ],
          currentStreamUrl: streamUrl,
          isTemporary: true,
          isExpired: true,
          expirationTimestamp,
          formattedExpirationDate: formattedExpiration,
          signatureInfo: sigInfo
        };
      }

      // Link direto não expirado ou perene
      const msg = isTemporary
        ? 'Link direto com assinatura temporária aparentemente válida, porém sem página de origem cadastrada para renovação futura.'
        : 'Link direto aparentemente perene, sem parâmetros temporários detectados.';

      return {
        strategy: 'direct_usable',
        status: 'usable',
        canDirectPlay: true,
        canAutoRenew: false,
        requiresSniffer: false,
        summaryMessage: msg,
        details,
        currentStreamUrl: streamUrl,
        isTemporary,
        isExpired: false,
        expirationTimestamp,
        formattedExpirationDate: formattedExpiration,
        signatureInfo: sigInfo
      };
    }

    // 4. Se o link direto existe, não está expirado e NÃO foi forçada a inspeção de origem:
    // O link atual ainda pode ser reproduzido com segurança.
    const isDirectUsable = streamUrl && isExpired !== true;
    if (isDirectUsable && !input.forceOriginInspection) {
      const msg = isTemporary
        ? `Link direto ativo com assinatura temporária válida até ${formattedExpiration || 'o término do prazo'}. Página de origem registrada para renovação futura.`
        : 'Link direto utilizável e página de origem preservada.';

      return {
        strategy: 'direct_usable',
        status: 'usable',
        canDirectPlay: true,
        canAutoRenew: Boolean(originUrl),
        requiresSniffer: false,
        summaryMessage: msg,
        details: [
          ...details,
          `Página de origem disponível: ${originUrl}`,
          'Renovação sob demanda disponível caso o link expire.'
        ],
        currentStreamUrl: streamUrl,
        isTemporary,
        isExpired: false,
        expirationTimestamp,
        formattedExpirationDate: formattedExpiration,
        originUrl,
        originTitle: input.originTitle,
        capturedAt: input.capturedAt,
        streamUrlExpiresAt: input.streamUrlExpiresAt,
        signatureInfo: sigInfo
      };
    }

    // 5. Necessidade de inspeção da página de origem (link expirado, inexistente ou inspeção forçada)
    details.push(`Iniciando análise na página de origem: ${originUrl}`);

    // Validação estrita de protocolo da URL de origem
    try {
      const parsedOrigin = new URL(originUrl);
      if (parsedOrigin.protocol !== 'http:' && parsedOrigin.protocol !== 'https:') {
        return {
          strategy: 'origin_unavailable',
          status: 'unavailable',
          canDirectPlay: false,
          canAutoRenew: false,
          requiresSniffer: false,
          summaryMessage: `Protocolo "${parsedOrigin.protocol}" não suportado para página de origem. Apenas HTTP e HTTPS são aceitos.`,
          details: [...details, 'Protocolo não seguro ou incompatível com inspeção web.'],
          currentStreamUrl: streamUrl,
          originUrl,
          isTemporary,
          isExpired,
          expirationTimestamp,
          formattedExpirationDate: formattedExpiration,
          signatureInfo: sigInfo
        };
      }
    } catch {
      return {
        strategy: 'origin_unavailable',
        status: 'unavailable',
        canDirectPlay: false,
        canAutoRenew: false,
        requiresSniffer: false,
        summaryMessage: 'A URL da página de origem informada é inválida ou malformada.',
        details: [...details, 'Erro de sintaxe na URL da página de origem.'],
        currentStreamUrl: streamUrl,
        originUrl,
        isTemporary,
        isExpired,
        expirationTimestamp,
        formattedExpirationDate: formattedExpiration,
        signatureInfo: sigInfo
      };
    }

    // 6. Consulta através da infraestrutura de inspeção segura
    const inspector = input.pageInspector || ExternalMediaService.inspectPage;
    let inspectionResponse: InspectApiResponse;

    try {
      inspectionResponse = await inspector(originUrl);
    } catch (err: any) {
      return {
        strategy: 'inconclusive',
        status: 'inconclusive',
        canDirectPlay: false,
        canAutoRenew: false,
        requiresSniffer: false,
        summaryMessage: 'Falha de comunicação ou erro de rede ao tentar consultar a página de origem.',
        details: [...details, `Erro de rede: ${err?.message || 'Falha desconhecida'}`],
        currentStreamUrl: streamUrl,
        originUrl,
        originTitle: input.originTitle,
        capturedAt: input.capturedAt,
        isTemporary,
        isExpired,
        expirationTimestamp,
        formattedExpirationDate: formattedExpiration,
        signatureInfo: sigInfo
      };
    }

    // 7. Tratamento de erros reportados pelo serviço de inspeção
    if (!inspectionResponse.success || !inspectionResponse.result) {
      const errCode = inspectionResponse.code || 'UNKNOWN_ERROR';
      const errMsg = inspectionResponse.error || 'Erro na inspeção da página remota.';

      if (errCode === 'SSRF_BLOCKED') {
        return {
          strategy: 'origin_unavailable',
          status: 'unavailable',
          canDirectPlay: false,
          canAutoRenew: false,
          requiresSniffer: false,
          summaryMessage: 'Acesso à página de origem recusado pelas diretrizes de segurança contra SSRF (endereço local ou restrito).',
          details: [...details, `Bloqueio de segurança: ${errMsg}`],
          currentStreamUrl: streamUrl,
          originUrl,
          isTemporary,
          isExpired,
          expirationTimestamp,
          formattedExpirationDate: formattedExpiration,
          signatureInfo: sigInfo,
          inspectionDetails: {
            sourcesCount: 0,
            hasAccessibleSource: false,
            embeddedIframesCount: 0,
            dynamicLoadingDetected: false,
            errorCode: errCode
          }
        };
      }

      if (errCode === 'RATE_LIMIT_EXCEEDED') {
        return {
          strategy: 'inconclusive',
          status: 'inconclusive',
          canDirectPlay: false,
          canAutoRenew: false,
          requiresSniffer: false,
          summaryMessage: 'Limite de requisições excedido. Aguarde alguns instantes antes de renovar novamente.',
          details: [...details, `Rate limit atingido: ${errMsg}`],
          currentStreamUrl: streamUrl,
          originUrl,
          isTemporary,
          isExpired,
          expirationTimestamp,
          formattedExpirationDate: formattedExpiration,
          signatureInfo: sigInfo,
          inspectionDetails: {
            sourcesCount: 0,
            hasAccessibleSource: false,
            embeddedIframesCount: 0,
            dynamicLoadingDetected: false,
            errorCode: errCode
          }
        };
      }

      // Outros erros (Timeout, resposta não-HTML, erro 404/500)
      return {
        strategy: errCode === 'TIMEOUT' ? 'inconclusive' : 'origin_unavailable',
        status: errCode === 'TIMEOUT' ? 'inconclusive' : 'unavailable',
        canDirectPlay: false,
        canAutoRenew: false,
        requiresSniffer: false,
        summaryMessage: `A página de origem não pôde ser consultada: ${errMsg}`,
        details: [...details, `Falha no serviço de inspeção (${errCode}): ${errMsg}`],
        currentStreamUrl: streamUrl,
        originUrl,
        isTemporary,
        isExpired,
        expirationTimestamp,
        formattedExpirationDate: formattedExpiration,
        signatureInfo: sigInfo,
        inspectionDetails: {
          sourcesCount: 0,
          hasAccessibleSource: false,
          embeddedIframesCount: 0,
          dynamicLoadingDetected: false,
          errorCode: errCode
        }
      };
    }

    // 8. Análise detalhada do resultado retornado pela página de origem
    const res: PageInspectionResult = inspectionResponse.result;
    const diag = res.diagnostics;
    const sources = res.sourcesFound || [];
    const iframes = res.detectedIframes || [];
    const dynamicIndicators = res.dynamicMediaIndicators || [];
    const challenge = res.interstitialChallenge;

    const baseInspectionDetails = {
      pageTitle: res.pageTitle,
      sourcesCount: sources.length,
      hasAccessibleSource: sources.some(s => s.accessible === true),
      interstitialChallenge: challenge?.detected || diag.detectedProtectionOrCaptcha,
      embeddedIframesCount: iframes.length,
      dynamicLoadingDetected: dynamicIndicators.length > 0 || diag.detectedDynamicLoading,
      inspectionStatus: diag.status
    };

    // 8.1 Detecção de Desafio Intermediário, Anti-bot ou CAPTCHA (Cloudflare, reCAPTCHA, etc.)
    if (challenge?.detected || diag.detectedProtectionOrCaptcha) {
      const provider = challenge?.provider || 'Proteção Anti-bot';
      return {
        strategy: 'assisted_renewal_required',
        status: 'assisted',
        canDirectPlay: false,
        canAutoRenew: false,
        requiresSniffer: true,
        summaryMessage: `A página de origem requer verificação interativa no navegador (${provider}). A renovação deve ser feita pelo NOVA Sniffer no navegador.`,
        details: [
          ...details,
          `Desafio detectado: ${provider}.`,
          'Serviços automatizados não podem nem devem contornar desafios anti-bot.',
          'Abra a página do episódio no seu navegador móvel, aguarde a liberação e capture a nova URL pelo NOVA Sniffer.'
        ],
        currentStreamUrl: streamUrl,
        originUrl,
        originTitle: res.pageTitle || input.originTitle,
        capturedAt: input.capturedAt,
        isTemporary,
        isExpired,
        expirationTimestamp,
        formattedExpirationDate: formattedExpiration,
        signatureInfo: sigInfo,
        inspectionDetails: baseInspectionDetails
      };
    }

    // 8.2 Proteção por DRM detectada na página de origem
    if (diag.detectedDrm) {
      return {
        strategy: 'origin_unavailable',
        status: 'unavailable',
        canDirectPlay: false,
        canAutoRenew: false,
        requiresSniffer: false,
        summaryMessage: 'A página de origem utiliza proteção de direitos digitais (DRM). Fluxos criptografados não são compatíveis.',
        details: [
          ...details,
          'Identificada proteção DRM no conteúdo da página.',
          'O NOVA STORAGE não suporta nem contorna sistemas de DRM.'
        ],
        currentStreamUrl: streamUrl,
        originUrl,
        originTitle: res.pageTitle || input.originTitle,
        capturedAt: input.capturedAt,
        isTemporary,
        isExpired,
        expirationTimestamp,
        formattedExpirationDate: formattedExpiration,
        signatureInfo: sigInfo,
        inspectionDetails: baseInspectionDetails
      };
    }

    // 8.3 Mídia encapsulada em Player Incorporado (iframe)
    if (diag.status === 'embedded_player_detected' || (iframes.length > 0 && sources.length === 0)) {
      const firstIframe = iframes[0];
      const iframeInfo = firstIframe ? ` (${firstIframe.domain})` : '';
      return {
        strategy: 'assisted_renewal_required',
        status: 'assisted',
        canDirectPlay: false,
        canAutoRenew: false,
        requiresSniffer: true,
        summaryMessage: `O vídeo é exibido através de player incorporado${iframeInfo}. A renovação exige a execução do NOVA Sniffer na página pelo usuário.`,
        details: [
          ...details,
          `Foram detectados ${iframes.length} iframe(s) na página.`,
          'Fontes embutidas em iframes de outros domínios não expõem URLs estáticas diretas no HTML principal.',
          'Inicie o vídeo no navegador e acione o NOVA Sniffer para capturar a nova requisição.'
        ],
        currentStreamUrl: streamUrl,
        originUrl,
        originTitle: res.pageTitle || input.originTitle,
        capturedAt: input.capturedAt,
        isTemporary,
        isExpired,
        expirationTimestamp,
        formattedExpirationDate: formattedExpiration,
        signatureInfo: sigInfo,
        inspectionDetails: baseInspectionDetails
      };
    }

    // 8.4 Carregamento Dinâmico de Mídia via Javascript
    if (diag.status === 'dynamic_loading_detected' || (dynamicIndicators.length > 0 && sources.length === 0)) {
      return {
        strategy: 'assisted_renewal_required',
        status: 'assisted',
        canDirectPlay: false,
        canAutoRenew: false,
        requiresSniffer: true,
        summaryMessage: 'A mídia é carregada dinamicamente via scripts de player. A renovação deve ser feita com o monitoramento do NOVA Sniffer.',
        details: [
          ...details,
          'A página utiliza bibliotecas de reprodução dinâmicas que constroem a URL em tempo de execução.',
          'Ative o modo de monitoramento no NOVA Sniffer, dê Play no vídeo e copie a URL atualizada.'
        ],
        currentStreamUrl: streamUrl,
        originUrl,
        originTitle: res.pageTitle || input.originTitle,
        capturedAt: input.capturedAt,
        isTemporary,
        isExpired,
        expirationTimestamp,
        formattedExpirationDate: formattedExpiration,
        signatureInfo: sigInfo,
        inspectionDetails: baseInspectionDetails
      };
    }

    // 8.5 Nenhuma fonte encontrada
    if (sources.length === 0) {
      return {
        strategy: 'assisted_renewal_required',
        status: 'assisted',
        canDirectPlay: false,
        canAutoRenew: false,
        requiresSniffer: true,
        summaryMessage: 'Nenhuma fonte de mídia pública direta foi identificada no HTML da página de origem.',
        details: [
          ...details,
          'A página não expõe elementos <video> estáticos ou metadados de compartilhamento de vídeo no HTML inicial.',
          'Utilize o NOVA Sniffer para capturar as requisições ativas geradas pelo player do navegador.'
        ],
        currentStreamUrl: streamUrl,
        originUrl,
        originTitle: res.pageTitle || input.originTitle,
        capturedAt: input.capturedAt,
        isTemporary,
        isExpired,
        expirationTimestamp,
        formattedExpirationDate: formattedExpiration,
        signatureInfo: sigInfo,
        inspectionDetails: baseInspectionDetails
      };
    }

    // 8.6 Avaliação das fontes encontradas
    const validCandidates = sources.filter(
      s => s.format !== 'UNKNOWN' && s.format !== 'IFRAME_EMBED' && s.url
    );

    if (validCandidates.length === 0) {
      return {
        strategy: 'assisted_renewal_required',
        status: 'assisted',
        canDirectPlay: false,
        canAutoRenew: false,
        requiresSniffer: true,
        summaryMessage: 'As fontes encontradas na página não possuem formato de mídia compatível para reprodução direta.',
        details: [...details, 'Nenhum formato HLS, MP4 ou WebM utilizável foi identificado.'],
        currentStreamUrl: streamUrl,
        originUrl,
        originTitle: res.pageTitle || input.originTitle,
        capturedAt: input.capturedAt,
        isTemporary,
        isExpired,
        expirationTimestamp,
        formattedExpirationDate: formattedExpiration,
        signatureInfo: sigInfo,
        inspectionDetails: baseInspectionDetails
      };
    }

    // Procura por fonte que tenha sido confirmada como acessível pelo probe de rede
    const accessibleSource = validCandidates.find(s => s.accessible === true);

    if (accessibleSource) {
      const candSig = this.evaluateSignature(accessibleSource.url);
      const candExpiration = candSig.expirationTimestamp;
      const candFormatted = this.formatExpirationDate(candExpiration);

      return {
        strategy: 'auto_renewable',
        status: 'renewable',
        canDirectPlay: false, // O novo link é candidato, cabe ao usuário ou camada superior adotá-lo
        canAutoRenew: true,
        requiresSniffer: false,
        summaryMessage: `Renovação automática viável: nova URL de mídia (${accessibleSource.format}) identificada e confirmada como acessível na página de origem.`,
        details: [
          ...details,
          `Fonte validada via probe: HTTP ${accessibleSource.statusCode || 200}${accessibleSource.supportsRange ? ' (Suporte a Range 206 ativo)' : ''}.`,
          accessibleSource.corsSupported ? 'CORS habilitado no servidor de origem.' : 'Sem cabeçalho CORS explícito.',
          candSig.isPotentiallyTemporary
            ? `A nova URL também possui assinatura temporária${candFormatted ? ` com validade estimada até ${candFormatted}` : ''}.`
            : 'A nova URL não apresenta assinatura temporária aparente.'
        ],
        currentStreamUrl: streamUrl,
        candidateStreamUrl: accessibleSource.url,
        isTemporary: candSig.isPotentiallyTemporary,
        isExpired: false,
        expirationTimestamp: candExpiration,
        formattedExpirationDate: candFormatted,
        originUrl,
        originTitle: res.pageTitle || input.originTitle,
        capturedAt: input.capturedAt,
        streamUrlExpiresAt: candFormatted,
        signatureInfo: candSig,
        inspectionDetails: {
          ...baseInspectionDetails,
          hasAccessibleSource: true
        }
      };
    }

    // Se encontramos fontes no HTML, mas NENHUMA foi confirmada acessível (ex: probe 403, sem probe, ou erro)
    // Conforme o princípio: não tratar simples inspeção HTML como garantia de que o vídeo funcionará.
    const unverifiedCandidate = validCandidates[0];
    return {
      strategy: 'assisted_renewal_required',
      status: 'assisted',
      canDirectPlay: false,
      canAutoRenew: false,
      requiresSniffer: true,
      summaryMessage: 'Fonte de mídia identificada no HTML da página de origem, porém sua acessibilidade direta não foi confirmada pelo servidor.',
      details: [
        ...details,
        `Candidata não confirmada: ${unverifiedCandidate.url}`,
        unverifiedCandidate.notes ? `Nota da sondagem: ${unverifiedCandidate.notes}` : 'O servidor remoto pode exigir sessão ativa, cookies de navegador ou cabeçalhos de origem.',
        'Recomenda-se verificação assistida utilizando o NOVA Sniffer no navegador para capturar a sessão real.'
      ],
      currentStreamUrl: streamUrl,
      candidateStreamUrl: unverifiedCandidate.url,
      isTemporary,
      isExpired,
      expirationTimestamp,
      formattedExpirationDate: formattedExpiration,
      originUrl,
      originTitle: res.pageTitle || input.originTitle,
      capturedAt: input.capturedAt,
      signatureInfo: sigInfo,
      inspectionDetails: {
        ...baseInspectionDetails,
        hasAccessibleSource: false
      }
    };
  }
}
