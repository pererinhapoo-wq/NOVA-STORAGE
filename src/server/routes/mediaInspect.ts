import { Router } from 'express';
import {
  safeFetchPageWithLimits,
  validateUrlForSsrf,
  inspectRateLimiter
} from '../utils/ssrfGuard.ts';
import {
  extractMediaFromHtml,
  probeMediaAccessibility,
  inferMediaFormat,
  determineInspectionStatus,
  PageInspectionResult,
  ExtractedMediaSource
} from '../services/pageMediaExtractor.ts';

export const mediaInspectRouter = Router();

mediaInspectRouter.post('/inspect-page', async (req, res) => {
  const startTime = Date.now();
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '127.0.0.1';

  // 1. Rate Limiting por IP para evitar abuso do backend como proxy
  if (inspectRateLimiter.isRateLimited(clientIp)) {
    return res.status(429).json({
      success: false,
      error: 'Limite de requisições excedido. Por favor, aguarde alguns instantes antes de inspecionar outra página.',
      code: 'RATE_LIMIT_EXCEEDED'
    });
  }

  const { pageUrl } = req.body || {};
  const trimmedUrl = typeof pageUrl === 'string' ? pageUrl.trim() : '';

  if (!trimmedUrl) {
    return res.status(400).json({
      success: false,
      error: 'Por favor, informe a URL da página web para análise.',
      code: 'MISSING_URL'
    });
  }

  // 2. Validação SSRF preliminar do endereço fornecido
  const ssrfCheck = await validateUrlForSsrf(trimmedUrl);
  if (!ssrfCheck.valid) {
    return res.status(400).json({
      success: false,
      error: ssrfCheck.error || 'A URL informada não foi permitida pela política de segurança SSRF.',
      code: 'SSRF_BLOCKED'
    });
  }

  try {
    // 3. Caso especial: O usuário forneceu diretamente um link de stream (.m3u8 ou .mp4)
    const directFormat = inferMediaFormat(trimmedUrl);
    if (directFormat !== 'UNKNOWN') {
      const probe = await probeMediaAccessibility(trimmedUrl);
      const directSource: ExtractedMediaSource = {
        url: trimmedUrl,
        format: directFormat,
        mimeType: probe.mimeType,
        discoveryMethod: 'direct_stream',
        corsSupported: probe.corsSupported,
        accessible: probe.accessible,
        contentLengthBytes: probe.contentLengthBytes,
        statusCode: probe.statusCode,
        supportsRange: probe.supportsRange,
        notes: probe.notes || 'Link direto de stream fornecido pelo usuário.'
      };

      const result: PageInspectionResult = {
        pageUrl: trimmedUrl,
        pageTitle: `Fluxo Direto de Mídia (${directFormat})`,
        sourcesFound: [directSource],
        detectedIframes: [],
        dynamicMediaIndicators: [],
        diagnostics: {
          fetchTimeMs: Date.now() - startTime,
          responseSizeBytes: 0,
          redirectCount: 0,
          detectedDrm: false,
          detectedProtectionOrCaptcha: false,
          detectedIframesCount: 0,
          detectedDynamicLoading: false,
          status: probe.accessible ? 'direct_source_accessible' : 'error',
          summaryMessage: probe.accessible
            ? probe.corsSupported
              ? `Fonte direta de stream identificada e acessível (HTTP ${probe.statusCode || 200}${probe.supportsRange ? ' · Range 206 Ativo' : ''} · CORS Ativo).`
              : `Fonte direta de stream identificada (HTTP ${probe.statusCode || 200}), mas sem cabeçalhos CORS declarados.`
            : `O servidor remoto recusou o acesso direto (HTTP ${probe.statusCode || 'Inacessível'}). ${probe.notes || ''}`
        }
      };

      return res.json({ success: true, result });
    }

    // 4. Busca segura da página HTML com limites de timeout (5s), tamanho (512 KB) e redirecionamentos (3)
    const pageResponse = await safeFetchPageWithLimits(trimmedUrl, {
      timeoutMs: 5000,
      maxSizeBytes: 512 * 1024,
      maxRedirects: 3
    });

    const isHtml =
      pageResponse.contentType.includes('text/html') ||
      pageResponse.contentType.includes('application/xhtml+xml') ||
      pageResponse.body.includes('<html') ||
      pageResponse.body.includes('<!doctype html');

    if (!isHtml) {
      // Se não for HTML nem stream direto reconhecido
      return res.status(400).json({
        success: false,
        error: `O endereço informado retornou um tipo de conteúdo não-HTML (${pageResponse.contentType}). É esperada uma página web ou arquivo de mídia direto.`,
        code: 'NOT_HTML_CONTENT'
      });
    }

    // 5. Extração de metadados de vídeo, iframes com domínio de origem e detecção de desafios anti-bot
    const extraction = await extractMediaFromHtml(pageResponse.body, pageResponse.finalUrl, {
      httpStatus: pageResponse.status,
      contentType: pageResponse.contentType
    });

    // 6. Teste de acessibilidade e CORS para as primeiras fontes encontradas (máx 3 para performance)
    const testedSources: ExtractedMediaSource[] = [];
    for (const src of extraction.sources.slice(0, 3)) {
      const probe = await probeMediaAccessibility(src.url);
      testedSources.push({
        ...src,
        corsSupported: probe.corsSupported,
        accessible: probe.accessible,
        statusCode: probe.statusCode,
        contentLengthBytes: probe.contentLengthBytes,
        supportsRange: probe.supportsRange,
        notes: probe.notes || src.notes
      });
    }

    // Se houver mais fontes além das 3 primeiras, anexa sem probe de rede imediato
    if (extraction.sources.length > 3) {
      for (const remaining of extraction.sources.slice(3)) {
        testedSources.push(remaining);
      }
    }

    // 7. Avaliação diagnóstica com diferenciação precisa de estados (incluindo desafios intermediários)
    const hasAccessibleDirectSource = testedSources.some(s => s.accessible === true);
    const firstIframeDomain = extraction.detectedIframes[0]?.domain;
    const statusEvaluation = determineInspectionStatus({
      sourcesCount: testedSources.length,
      hasAccessibleDirectSource,
      detectedDrm: extraction.detectedDrm,
      detectedProtection: extraction.detectedProtection,
      detectedChallenge: extraction.interstitialChallenge?.detected,
      challengeInfo: extraction.interstitialChallenge,
      iframesCount: extraction.detectedIframes.length,
      detectedIframes: extraction.detectedIframes,
      dynamicIndicatorsCount: extraction.dynamicMediaIndicators.length,
      firstIframeDomain,
      httpStatusCode: pageResponse.status,
      contentType: pageResponse.contentType
    });

    const inspectionResult: PageInspectionResult = {
      pageUrl: pageResponse.finalUrl,
      pageTitle: extraction.pageTitle,
      sourcesFound: testedSources,
      detectedIframes: extraction.detectedIframes,
      dynamicMediaIndicators: extraction.dynamicMediaIndicators,
      interstitialChallenge: extraction.interstitialChallenge,
      diagnostics: {
        fetchTimeMs: Date.now() - startTime,
        responseSizeBytes: pageResponse.responseSizeBytes,
        redirectCount: pageResponse.redirectCount,
        detectedDrm: extraction.detectedDrm,
        detectedProtectionOrCaptcha: extraction.detectedProtection || (extraction.interstitialChallenge?.detected ?? false),
        detectedIframesCount: extraction.detectedIframes.length,
        detectedDynamicLoading: extraction.dynamicMediaIndicators.length > 0,
        httpStatusCode: pageResponse.status,
        contentType: pageResponse.contentType,
        status: statusEvaluation.status,
        summaryMessage: statusEvaluation.summaryMessage,
        diagnosticDetails: statusEvaluation.diagnosticDetails
      }
    };

    return res.json({ success: true, result: inspectionResult });
  } catch (err: any) {
    const errorMsg = err?.message || 'Falha ao inspecionar a página remota.';
    let code = 'INSPECTION_FAILED';

    if (errorMsg.includes('SSRF_BLOCKED')) code = 'SSRF_BLOCKED';
    else if (errorMsg.includes('TIMEOUT')) code = 'TIMEOUT';
    else if (errorMsg.includes('RESPONSE_TOO_LARGE')) code = 'RESPONSE_TOO_LARGE';
    else if (errorMsg.includes('MAX_REDIRECTS_EXCEEDED')) code = 'MAX_REDIRECTS';

    return res.status(400).json({
      success: false,
      error: errorMsg,
      code
    });
  }
});
