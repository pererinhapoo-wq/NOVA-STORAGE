import test from 'node:test';
import assert from 'node:assert/strict';
import {
  StreamResolverService,
  StreamResolutionResult
} from '../src/services/storage/streamResolverService.ts';
import { LocalCatalogService } from '../src/services/storage/localCatalogService.ts';
import { InspectApiResponse } from '../src/services/storage/externalMediaService.ts';
import { EpisodeFile } from '../src/types/storage.ts';

test('Etapa 3: Interface e Fluxo Seguro de Resolução e Renovação de Links', async (t) => {
  // Configuração de mock do localStorage em memória
  const storageMap = new Map<string, string>();
  const mockLocalStorage = {
    getItem: (key: string) => storageMap.get(key) || null,
    setItem: (key: string, val: string) => { storageMap.set(key, String(val)); },
    removeItem: (key: string) => { storageMap.delete(key); },
    clear: () => { storageMap.clear(); }
  };

  const originalLocalStorage = globalThis.localStorage;
  (globalThis as unknown as { localStorage: typeof mockLocalStorage }).localStorage = mockLocalStorage;

  t.after(() => {
    (globalThis as unknown as { localStorage: typeof originalLocalStorage }).localStorage = originalLocalStorage;
  });

  // -------------------------------------------------------------------------
  // 1. Sucesso na Renovação (Auto-renewable com fonte acessível validada)
  // -------------------------------------------------------------------------
  await t.test('1. Sucesso na renovação: identifica candidata acessível e aplica mantendo metadados', async () => {
    storageMap.clear();

    // Cria episódio com link temporário expirado e página de origem cadastrada
    const ep = LocalCatalogService.addEpisode({
      folderId: 'fld-test',
      title: 'Episódio Expirado para Renovação',
      originalFileName: 'anime_s01e01.mkv',
      seriesName: 'Série Exemplo',
      seasonNumber: 1,
      episodeNumber: 1,
      fileSizeBytes: 1250000000,
      durationSeconds: 1440,
      resolution: '1080p',
      dimensions: { width: 1920, height: 1080 },
      frameRate: 23.976,
      videoCodec: 'HEVC / H.265',
      bitrateKbps: 7000,
      audioStreams: [{ id: 'a1', language: 'Japonês', codec: 'FLAC', channels: '2.0', isDefault: true }],
      subtitleStreams: [{ id: 's1', language: 'Português (BR)', format: 'ASS', isDefault: true }],
      containerFormat: 'MKV',
      checksumSha256: '9f83c18b2a59a7f369d7a2f0bc3e5d814c19280d87a6b41c098e983f4219a12b',
      streamUrl: 'https://cdn.exemplo.com/ep01.m3u8?expires=1500000000', // Expirado (2017)
      originUrl: 'https://site-origem.com/animes/ep-01',
      originTitle: 'Episódio 01 Online'
    });

    const originalId = ep.id;
    const originalChecksum = ep.checksumSha256;
    const originalSize = ep.fileSizeBytes;

    // Mock do inspetor de página simulando fonte acessível no servidor
    const mockInspector = async (_url: string): Promise<InspectApiResponse> => {
      return {
        success: true,
        result: {
          pageUrl: 'https://site-origem.com/animes/ep-01',
          pageTitle: 'Episódio 01 Online HD',
          sourcesFound: [
            {
              url: 'https://cdn.exemplo.com/hls/novo_master.m3u8?expires=2050000000&token=valid_token',
              format: 'HLS',
              discoveryMethod: 'video_tag',
              corsSupported: true,
              accessible: true,
              statusCode: 200,
              supportsRange: true
            }
          ],
          detectedIframes: [],
          dynamicMediaIndicators: [],
          diagnostics: {
            fetchTimeMs: 120,
            responseSizeBytes: 45000,
            redirectCount: 0,
            detectedDrm: false,
            detectedProtectionOrCaptcha: false,
            detectedIframesCount: 0,
            detectedDynamicLoading: false,
            status: 'direct_source_accessible',
            summaryMessage: 'Fonte de mídia direta acessível'
          }
        }
      };
    };

    // Executa resolução
    const resolution = await StreamResolverService.resolveEpisode(ep, {
      pageInspector: mockInspector
    });

    assert.strictEqual(resolution.strategy, 'auto_renewable');
    assert.strictEqual(resolution.canAutoRenew, true);
    assert.strictEqual(resolution.requiresSniffer, false);
    assert.strictEqual(
      resolution.candidateStreamUrl,
      'https://cdn.exemplo.com/hls/novo_master.m3u8?expires=2050000000&token=valid_token'
    );

    // O episódio no catálogo AINDA deve possuir a URL antiga antes do usuário aplicar
    const currentInCatalog = LocalCatalogService.getEpisodes().find(e => e.id === originalId);
    assert.strictEqual(currentInCatalog?.streamUrl, 'https://cdn.exemplo.com/ep01.m3u8?expires=1500000000');

    // Usuário confirma e aplica a candidata
    const updated = LocalCatalogService.updateEpisode(originalId, {
      streamUrl: resolution.candidateStreamUrl,
      streamUrlExpiresAt: resolution.formattedExpirationDate,
      capturedAt: new Date().toISOString()
    });

    assert.ok(updated);
    assert.strictEqual(updated.id, originalId, 'ID original deve ser rigorosamente mantido');
    assert.strictEqual(updated.checksumSha256, originalChecksum, 'Checksum deve permanecer inalterado');
    assert.strictEqual(updated.fileSizeBytes, originalSize, 'Tamanho do arquivo deve ser preservado');
    assert.strictEqual(updated.streamUrl, resolution.candidateStreamUrl);
    assert.ok(updated.streamUrlExpiresAt);
  });

  // -------------------------------------------------------------------------
  // 2. Detecção de Expiração e Link Inválido
  // -------------------------------------------------------------------------
  await t.test('2. Expiração de link: detecta link vencido com assinatura e orienta corretamente', async () => {
    storageMap.clear();

    // Link temporário expirado com timestamp passado
    const expiredUrl = 'https://cdn.origem.com/video.mp4?exp=1400000000';
    const sig = StreamResolverService.evaluateSignature(expiredUrl);

    assert.strictEqual(sig.isPotentiallyTemporary, true);
    assert.strictEqual(sig.isProbablyExpired, true);

    // Sem origem cadastrada, o resultado orienta uso do Sniffer
    const resWithoutOrigin = await StreamResolverService.resolveStream({
      streamUrl: expiredUrl
    });

    assert.strictEqual(resWithoutOrigin.strategy, 'inconclusive');
    assert.strictEqual(resWithoutOrigin.isExpired, true);
    assert.strictEqual(resWithoutOrigin.requiresSniffer, true);
    assert.strictEqual(resWithoutOrigin.canAutoRenew, false);
    assert.ok(resWithoutOrigin.summaryMessage.includes('expirada'));
  });

  // -------------------------------------------------------------------------
  // 3. Falha de Renovação (Origem Indisponível, SSRF, Timeout, DRM)
  // -------------------------------------------------------------------------
  await t.test('3. Falha de renovação: mantém URL atual intacta quando a origem falha ou é bloqueada', async () => {
    storageMap.clear();

    const currentUrl = 'https://cdn.exemplo.com/stream_antigo.m3u8';
    const ep = LocalCatalogService.addEpisode({
      folderId: 'fld-test',
      title: 'Episódio com Falha de Renovação',
      originalFileName: 'video.mp4',
      seriesName: 'Série Exemplo',
      seasonNumber: 1,
      episodeNumber: 1,
      fileSizeBytes: 500000000,
      durationSeconds: 1200,
      resolution: '720p',
      dimensions: { width: 1280, height: 720 },
      frameRate: 23.976,
      videoCodec: 'AVC / H.264',
      bitrateKbps: 3000,
      audioStreams: [],
      subtitleStreams: [],
      containerFormat: 'MP4',
      checksumSha256: 'hash123',
      streamUrl: currentUrl,
      originUrl: 'http://127.0.0.1:8080/admin/video' // Tentativa de SSRF
    });

    const originalId = ep.id;

    // Cenário 3.1: Bloqueio SSRF
    const ssrfInspector = async (_url: string): Promise<InspectApiResponse> => {
      return {
        success: false,
        code: 'SSRF_BLOCKED',
        error: 'Endereço restrito'
      };
    };

    const resSsrf = await StreamResolverService.resolveEpisode(ep, {
      forceOriginInspection: true,
      pageInspector: ssrfInspector
    });

    assert.strictEqual(resSsrf.strategy, 'origin_unavailable');
    assert.strictEqual(resSsrf.canAutoRenew, false);
    assert.strictEqual(resSsrf.candidateStreamUrl, undefined);

    // Verifica que a URL no catálogo continua inalterada
    const afterSsrf = LocalCatalogService.getEpisodes().find(e => e.id === originalId);
    assert.strictEqual(afterSsrf?.streamUrl, currentUrl, 'streamUrl atual não pode ser apagada por falha');

    // Cenário 3.2: Timeout na origem
    const timeoutInspector = async (_url: string): Promise<InspectApiResponse> => {
      return {
        success: false,
        code: 'TIMEOUT',
        error: 'Conexão expirou após 5000ms'
      };
    };

    const resTimeout = await StreamResolverService.resolveEpisode(ep, {
      forceOriginInspection: true,
      pageInspector: timeoutInspector
    });

    assert.strictEqual(resTimeout.strategy, 'inconclusive');
    assert.strictEqual(resTimeout.canAutoRenew, false);

    const afterTimeout = LocalCatalogService.getEpisodes().find(e => e.id === originalId);
    assert.strictEqual(afterTimeout?.streamUrl, currentUrl);

    // Cenário 3.3: Página de origem com proteção DRM
    const drmInspector = async (_url: string): Promise<InspectApiResponse> => {
      return {
        success: true,
        result: {
          pageUrl: 'https://site-drm.com/watch',
          pageTitle: 'Página DRM',
          sourcesFound: [],
          detectedIframes: [],
          dynamicMediaIndicators: [],
          diagnostics: {
            fetchTimeMs: 150,
            responseSizeBytes: 20000,
            redirectCount: 0,
            detectedDrm: true,
            detectedProtectionOrCaptcha: false,
            detectedIframesCount: 0,
            detectedDynamicLoading: false,
            status: 'drm_or_protected',
            summaryMessage: 'Conteúdo protegido por DRM'
          }
        }
      };
    };

    const resDrm = await StreamResolverService.resolveEpisode(ep, {
      forceOriginInspection: true,
      pageInspector: drmInspector
    });

    assert.strictEqual(resDrm.strategy, 'origin_unavailable');
    assert.strictEqual(resDrm.canAutoRenew, false);
  });

  // -------------------------------------------------------------------------
  // 4. Ausência de Origem e Retrocompatibilidade
  // -------------------------------------------------------------------------
  await t.test('4. Ausência de origem: episódios legados funcionam e permitem vincular origem sem perdas', () => {
    storageMap.clear();

    // 4.1 Episódio legado sem originUrl
    const legacyEp = LocalCatalogService.addEpisode({
      folderId: 'fld-legacy',
      title: 'Episódio Legado',
      originalFileName: 'legacy.mkv',
      seriesName: 'Série Antiga',
      seasonNumber: 1,
      episodeNumber: 1,
      fileSizeBytes: 800000000,
      durationSeconds: 1400,
      resolution: '1080p',
      dimensions: { width: 1920, height: 1080 },
      frameRate: 23.976,
      videoCodec: 'HEVC / H.265',
      bitrateKbps: 5000,
      audioStreams: [],
      subtitleStreams: [],
      containerFormat: 'MKV',
      checksumSha256: 'sha256legacy',
      streamUrl: 'https://archive.org/download/sample.mp4' // Link estável
    });

    assert.strictEqual(legacyEp.originUrl, undefined);

    // 4.2 Permite vincular originUrl posteriormente
    const updated = LocalCatalogService.updateEpisodeStreamOrigin(legacyEp.id, {
      originUrl: 'https://site-origem.com/legacy/ep01',
      originTitle: 'Episódio Legado - Página Web Oficial'
    });

    assert.ok(updated);
    assert.strictEqual(updated.id, legacyEp.id);
    assert.strictEqual(updated.originUrl, 'https://site-origem.com/legacy/ep01');
    assert.strictEqual(updated.originTitle, 'Episódio Legado - Página Web Oficial');
    assert.strictEqual(updated.streamUrl, 'https://archive.org/download/sample.mp4', 'Preserva streamUrl existente');
    assert.strictEqual(updated.checksumSha256, 'sha256legacy', 'Preserva checksum');
  });

  // -------------------------------------------------------------------------
  // 5. Renovação Assistida Obrigatória (Anti-bot, Iframe, Dinâmico, Não Confirmado)
  // -------------------------------------------------------------------------
  await t.test('5. Renovação assistida: desafios, iframes e fontes não confirmadas exigem NOVA Sniffer', async () => {
    storageMap.clear();

    const ep = LocalCatalogService.addEpisode({
      folderId: 'fld-test',
      title: 'Episódio Protegido',
      originalFileName: 'video.mkv',
      seriesName: 'Série Teste',
      seasonNumber: 1,
      episodeNumber: 1,
      fileSizeBytes: 700000000,
      durationSeconds: 1300,
      resolution: '1080p',
      dimensions: { width: 1920, height: 1080 },
      frameRate: 23.976,
      videoCodec: 'AVC / H.264',
      bitrateKbps: 4500,
      audioStreams: [],
      subtitleStreams: [],
      containerFormat: 'MKV',
      checksumSha256: 'hash_prot',
      streamUrl: 'https://cdn.exemplo.com/stream.m3u8?expires=1500000000',
      originUrl: 'https://site-origem.com/animes/ep-01'
    });

    // 5.1 Desafio Anti-bot (Cloudflare / CAPTCHA)
    const challengeInspector = async (_url: string): Promise<InspectApiResponse> => {
      return {
        success: true,
        result: {
          pageUrl: 'https://site-origem.com/animes/ep-01',
          pageTitle: 'Just a moment...',
          sourcesFound: [],
          detectedIframes: [],
          dynamicMediaIndicators: [],
          interstitialChallenge: {
            detected: true,
            provider: 'Cloudflare',
            pageTitle: 'Just a moment...',
            evidence: ['cf-browser-verification']
          },
          diagnostics: {
            fetchTimeMs: 80,
            responseSizeBytes: 4000,
            redirectCount: 0,
            detectedDrm: false,
            detectedProtectionOrCaptcha: true,
            detectedIframesCount: 0,
            detectedDynamicLoading: false,
            status: 'challenge_or_interstitial_detected',
            summaryMessage: 'Desafio anti-bot detectado'
          }
        }
      };
    };

    const resChallenge = await StreamResolverService.resolveEpisode(ep, {
      pageInspector: challengeInspector
    });

    assert.strictEqual(resChallenge.strategy, 'assisted_renewal_required');
    assert.strictEqual(resChallenge.requiresSniffer, true);
    assert.strictEqual(resChallenge.canAutoRenew, false);
    assert.ok(resChallenge.summaryMessage.includes('Cloudflare') || resChallenge.summaryMessage.includes('NOVA Sniffer'));

    // 5.2 Player embutido em Iframe
    const iframeInspector = async (_url: string): Promise<InspectApiResponse> => {
      return {
        success: true,
        result: {
          pageUrl: 'https://site-origem.com/animes/ep-01',
          pageTitle: 'Página com Player Iframe',
          sourcesFound: [],
          detectedIframes: [
            {
              url: 'https://embed.player.com/v/12345',
              domain: 'embed.player.com',
              origin: 'https://embed.player.com',
              isCrossOrigin: true,
              classification: 'probable_player'
            }
          ],
          dynamicMediaIndicators: [],
          diagnostics: {
            fetchTimeMs: 90,
            responseSizeBytes: 12000,
            redirectCount: 0,
            detectedDrm: false,
            detectedProtectionOrCaptcha: false,
            detectedIframesCount: 1,
            detectedDynamicLoading: false,
            status: 'embedded_player_detected',
            summaryMessage: 'Player incorporado detectado'
          }
        }
      };
    };

    const resIframe = await StreamResolverService.resolveEpisode(ep, {
      pageInspector: iframeInspector
    });

    assert.strictEqual(resIframe.strategy, 'assisted_renewal_required');
    assert.strictEqual(resIframe.requiresSniffer, true);
    assert.strictEqual(resIframe.canAutoRenew, false);

    // 5.3 Fonte encontrada no HTML porém com acessibilidade NÃO confirmada (probe HTTP 403 / sessão)
    // Princípio inegociável: Não assumir que uma fonte funciona apenas por estar no HTML
    const unverifiedInspector = async (_url: string): Promise<InspectApiResponse> => {
      return {
        success: true,
        result: {
          pageUrl: 'https://site-origem.com/animes/ep-01',
          pageTitle: 'Página com Fonte Restrita',
          sourcesFound: [
            {
              url: 'https://cdn.exemplo.com/hls/restricted_master.m3u8',
              format: 'HLS',
              discoveryMethod: 'video_tag',
              corsSupported: false,
              accessible: false, // Probe recusado (ex: HTTP 403)
              statusCode: 403,
              notes: 'Recusado com HTTP 403 Forbidden'
            }
          ],
          detectedIframes: [],
          dynamicMediaIndicators: [],
          diagnostics: {
            fetchTimeMs: 110,
            responseSizeBytes: 25000,
            redirectCount: 0,
            detectedDrm: false,
            detectedProtectionOrCaptcha: false,
            detectedIframesCount: 0,
            detectedDynamicLoading: false,
            status: 'sources_found',
            summaryMessage: 'Fontes encontradas'
          }
        }
      };
    };

    const resUnverified = await StreamResolverService.resolveEpisode(ep, {
      pageInspector: unverifiedInspector
    });

    assert.strictEqual(resUnverified.strategy, 'assisted_renewal_required');
    assert.strictEqual(resUnverified.canAutoRenew, false);
    assert.strictEqual(resUnverified.requiresSniffer, true);
    assert.ok(resUnverified.summaryMessage.includes('não foi confirmada') || resUnverified.summaryMessage.includes('acessibilidade'));

    // 5.4 Aplicação assistida após captura com NOVA Sniffer
    const snifferCaptured = 'https://cdn.exemplo.com/hls/fresh_master.m3u8?token=sniffer_fresh_token&exp=2050000000';
    const snifferSig = StreamResolverService.evaluateSignature(snifferCaptured);
    const snifferExpiration = StreamResolverService.formatExpirationDate(snifferSig.expirationTimestamp);

    const savedFromSniffer = LocalCatalogService.updateEpisode(ep.id, {
      streamUrl: snifferCaptured,
      streamUrlExpiresAt: snifferExpiration,
      capturedAt: new Date().toISOString()
    });

    assert.ok(savedFromSniffer);
    assert.strictEqual(savedFromSniffer.streamUrl, snifferCaptured);
    assert.strictEqual(savedFromSniffer.id, ep.id, 'ID deve ser preservado');
    assert.strictEqual(savedFromSniffer.title, ep.title, 'Título preservado');
    assert.strictEqual(savedFromSniffer.checksumSha256, ep.checksumSha256, 'Integridade preservada');
  });

  // -------------------------------------------------------------------------
  // 6. Proibição de afirmar funcionamento apenas por HTTP 200/206 da página web
  // -------------------------------------------------------------------------
  await t.test('6. Não confunde HTTP 200 na página web com garantia de funcionamento do fluxo de mídia', async () => {
    // Uma página web que responde HTTP 200 mas cujo player é dinâmico e sem stream direto
    const webPage200Inspector = async (_url: string): Promise<InspectApiResponse> => {
      return {
        success: true,
        result: {
          pageUrl: 'https://site-origem.com/player',
          pageTitle: 'Player Interativo',
          sourcesFound: [], // Nenhuma fonte direta de vídeo estático
          detectedIframes: [],
          dynamicMediaIndicators: [
            {
              type: 'player_library',
              description: 'Player JWPlayer carregado via script',
              patternMatched: 'jwplayer.js'
            }
          ],
          diagnostics: {
            fetchTimeMs: 140,
            responseSizeBytes: 60000,
            redirectCount: 0,
            detectedDrm: false,
            detectedProtectionOrCaptcha: false,
            detectedIframesCount: 0,
            detectedDynamicLoading: true,
            httpStatusCode: 200, // Página retornou HTTP 200
            contentType: 'text/html; charset=utf-8',
            status: 'dynamic_loading_detected',
            summaryMessage: 'Mídia carregada dinamicamente'
          }
        }
      };
    };

    const res = await StreamResolverService.resolveStream({
      streamUrl: 'https://cdn.exemplo.com/stream.m3u8?expires=1500000000',
      originUrl: 'https://site-origem.com/player',
      pageInspector: webPage200Inspector
    });

    // Embora a página tenha respondido 200, a estratégia NÃO PODE ser auto_renewable nem direct_usable
    assert.notStrictEqual(res.strategy, 'auto_renewable');
    assert.notStrictEqual(res.strategy, 'direct_usable');
    assert.strictEqual(res.strategy, 'assisted_renewal_required');
    assert.strictEqual(res.canDirectPlay, false);
    assert.strictEqual(res.canAutoRenew, false);
    assert.strictEqual(res.requiresSniffer, true);
  });

  // -------------------------------------------------------------------------
  // 7. Validade Desconhecida: Sondagem HTTP 200/206 não infere link permanente
  // -------------------------------------------------------------------------
  await t.test('7. Validade desconhecida com HTTP 200: confirma acessibilidade atual sem inferir perenidade', async () => {
    const rawR2Url = 'https://pub-r2.exemplo.com/hls/master.m3u8'; // Sem parâmetros de expiração
    const mockProbe200 = async (url: string): Promise<InspectApiResponse> => {
      return {
        success: true,
        result: {
          pageUrl: url,
          pageTitle: 'Fluxo Direto',
          sourcesFound: [
            {
              url,
              format: 'HLS',
              discoveryMethod: 'direct_stream',
              corsSupported: true,
              accessible: true,
              statusCode: 200,
              supportsRange: true
            }
          ],
          detectedIframes: [],
          dynamicMediaIndicators: [],
          diagnostics: {
            fetchTimeMs: 40,
            responseSizeBytes: 1024,
            redirectCount: 0,
            detectedDrm: false,
            detectedProtectionOrCaptcha: false,
            detectedIframesCount: 0,
            detectedDynamicLoading: false,
            status: 'direct_source_accessible',
            summaryMessage: 'Fonte acessível'
          }
        }
      };
    };

    const res = await StreamResolverService.resolveStream({
      streamUrl: rawR2Url,
      probeCurrentStream: true,
      streamProbe: mockProbe200
    });

    assert.strictEqual(res.strategy, 'direct_usable');
    assert.strictEqual(res.status, 'usable');
    assert.strictEqual(res.canDirectPlay, true);
    assert.strictEqual(res.isTemporary, false);
    assert.strictEqual(res.isExpired, false);
    assert.ok(!res.summaryMessage.includes('perene'), 'Não pode conter a palavra perene');
    assert.ok(res.summaryMessage.includes('desconhecida') || res.summaryMessage.includes('não declara'));
  });

  // -------------------------------------------------------------------------
  // 8. Validade Desconhecida: Sondagem HTTP 403 sem origem -> assistida sem expiração definitiva
  // -------------------------------------------------------------------------
  await t.test('8. Validade desconhecida com HTTP 403 sem origem: relata inacessível ou possivelmente expirado', async () => {
    const expiredR2Url = 'https://pub-r2.exemplo.com/hls/video_1h_later.m3u8';
    const mockProbe403 = async (url: string): Promise<InspectApiResponse> => {
      return {
        success: true,
        result: {
          pageUrl: url,
          pageTitle: 'Acesso Recusado',
          sourcesFound: [
            {
              url,
              format: 'HLS',
              discoveryMethod: 'direct_stream',
              corsSupported: false,
              accessible: false,
              statusCode: 403,
              notes: 'Recusado com HTTP 403 Forbidden'
            }
          ],
          detectedIframes: [],
          dynamicMediaIndicators: [],
          diagnostics: {
            fetchTimeMs: 45,
            responseSizeBytes: 500,
            redirectCount: 0,
            detectedDrm: false,
            detectedProtectionOrCaptcha: false,
            detectedIframesCount: 0,
            detectedDynamicLoading: false,
            httpStatusCode: 403,
            status: 'error',
            summaryMessage: 'Recusado'
          }
        }
      };
    };

    const res = await StreamResolverService.resolveStream({
      streamUrl: expiredR2Url,
      probeCurrentStream: true,
      streamProbe: mockProbe403
    });

    assert.strictEqual(res.strategy, 'assisted_renewal_required');
    assert.strictEqual(res.status, 'assisted');
    assert.strictEqual(res.canDirectPlay, false);
    assert.strictEqual(res.canAutoRenew, false);
    assert.strictEqual(res.requiresSniffer, true);
    // Não afirma expiração definitiva isoladamente pelo status
    assert.ok(res.summaryMessage.includes('inacessível ou possivelmente expirado'));
  });

  // -------------------------------------------------------------------------
  // 9. Validade Desconhecida: Sondagem HTTP 403 COM origem -> renova pela origem e preserva link atual
  // -------------------------------------------------------------------------
  await t.test('9. Validade desconhecida com HTTP 403 com origem: busca origem e obtém nova fonte mantendo URL atual', async () => {
    storageMap.clear();

    const originalUrl = 'https://cdn.r2.com/video_expirado.m3u8';
    const newCandidate = 'https://cdn.r2.com/video_renovado.m3u8';

    const ep = LocalCatalogService.addEpisode({
      folderId: 'fld-test',
      title: 'Episódio R2 Expirado',
      originalFileName: 'r2_ep01.mp4',
      seriesName: 'Série R2',
      seasonNumber: 1,
      episodeNumber: 1,
      fileSizeBytes: 800000000,
      durationSeconds: 1500,
      resolution: '1080p',
      dimensions: { width: 1920, height: 1080 },
      frameRate: 23.976,
      videoCodec: 'AVC / H.264',
      bitrateKbps: 4500,
      audioStreams: [],
      subtitleStreams: [],
      containerFormat: 'MP4',
      checksumSha256: 'sha_r2_test',
      streamUrl: originalUrl,
      originUrl: 'https://site-origem.com/animes/ep-01'
    });

    const mockProbe403 = async (url: string): Promise<InspectApiResponse> => {
      return {
        success: true,
        result: {
          pageUrl: url,
          pageTitle: 'Forbidden',
          sourcesFound: [
            {
              url,
              format: 'MP4',
              discoveryMethod: 'direct_stream',
              corsSupported: false,
              accessible: false,
              statusCode: 403
            }
          ],
          detectedIframes: [],
          dynamicMediaIndicators: [],
          diagnostics: {
            fetchTimeMs: 40,
            responseSizeBytes: 100,
            redirectCount: 0,
            detectedDrm: false,
            detectedProtectionOrCaptcha: false,
            detectedIframesCount: 0,
            detectedDynamicLoading: false,
            httpStatusCode: 403,
            status: 'error',
            summaryMessage: 'HTTP 403'
          }
        }
      };
    };

    const mockOriginInspector = async (url: string): Promise<InspectApiResponse> => {
      return {
        success: true,
        result: {
          pageUrl: url,
          pageTitle: 'Episódio 01 Original',
          sourcesFound: [
            {
              url: newCandidate,
              format: 'HLS',
              discoveryMethod: 'video_tag',
              corsSupported: true,
              accessible: true,
              statusCode: 200,
              supportsRange: true
            }
          ],
          detectedIframes: [],
          dynamicMediaIndicators: [],
          diagnostics: {
            fetchTimeMs: 100,
            responseSizeBytes: 20000,
            redirectCount: 0,
            detectedDrm: false,
            detectedProtectionOrCaptcha: false,
            detectedIframesCount: 0,
            detectedDynamicLoading: false,
            status: 'direct_source_accessible',
            summaryMessage: 'Fonte encontrada'
          }
        }
      };
    };

    const res = await StreamResolverService.resolveEpisode(ep, {
      probeCurrentStream: true,
      streamProbe: mockProbe403,
      pageInspector: mockOriginInspector
    });

    assert.strictEqual(res.strategy, 'auto_renewable');
    assert.strictEqual(res.status, 'renewable');
    assert.strictEqual(res.canAutoRenew, true);
    assert.strictEqual(res.candidateStreamUrl, newCandidate);
    assert.strictEqual(res.currentStreamUrl, originalUrl, 'Preserva a URL original no resultado');

    // Verifica que o catálogo ainda mantém a URL original intacta
    const inCatalog = LocalCatalogService.getEpisodes().find(e => e.id === ep.id);
    assert.strictEqual(inCatalog?.streamUrl, originalUrl, 'URL original do catálogo não pode ser substituída automaticamente');
  });

  // -------------------------------------------------------------------------
  // 10. Sondagem com Timeout: Resultado Inconclusivo sem declarar expiração
  // -------------------------------------------------------------------------
  await t.test('10. Sondagem com Timeout: resulta em inconclusive sem declarar expiração indevida', async () => {
    const mockTimeout = async (_url: string): Promise<InspectApiResponse> => {
      return {
        success: false,
        code: 'TIMEOUT',
        error: 'Conexão excedeu o tempo limite de 4000ms'
      };
    };

    const res = await StreamResolverService.resolveStream({
      streamUrl: 'https://cdn.lento.com/video.mp4',
      originUrl: 'https://site-origem.com/ep-01',
      probeCurrentStream: true,
      streamProbe: mockTimeout
    });

    assert.strictEqual(res.strategy, 'inconclusive');
    assert.strictEqual(res.status, 'inconclusive');
    assert.strictEqual(res.canDirectPlay, false);
    assert.ok(res.summaryMessage.includes('tempo limite') || res.summaryMessage.includes('Falha de comunicação'));
    assert.strictEqual(res.currentStreamUrl, 'https://cdn.lento.com/video.mp4');
  });
});
