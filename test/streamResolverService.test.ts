import test from 'node:test';
import assert from 'node:assert/strict';
import {
  StreamResolverService,
  ResolutionStrategy,
  StreamResolutionResult
} from '../src/services/storage/streamResolverService.ts';
import { InspectApiResponse, PageInspectionResult } from '../src/services/storage/externalMediaService.ts';
import { EpisodeFile } from '../src/types/storage.ts';

test('Serviço de Resolução e Renovação Legítima de Links (StreamResolverService)', async (t) => {
  // -------------------------------------------------------------
  // Bloco 1: Links Sem Origem
  // -------------------------------------------------------------
  await t.test('1.1. Link perene sem origem é classificado como utilizável diretamente', async () => {
    const res = await StreamResolverService.resolveStream({
      streamUrl: 'https://archive.org/download/video/sample_1080p.mp4'
    });

    assert.strictEqual(res.strategy, 'direct_usable');
    assert.strictEqual(res.status, 'usable');
    assert.strictEqual(res.canDirectPlay, true);
    assert.strictEqual(res.canAutoRenew, false);
    assert.strictEqual(res.isTemporary, false);
    assert.strictEqual(res.isExpired, false);
  });

  await t.test('1.2. Link temporário expirado sem origem resulta em inconclusivo / sniffer necessário', async () => {
    // Timestamp 1500000000 (ano 2017 - definitivamente no passado)
    const expiredStreamUrl = 'https://cdn.exemplo.com/hls/master.m3u8?token=xyz123&expires=1500000000';
    const res = await StreamResolverService.resolveStream({
      streamUrl: expiredStreamUrl
    });

    assert.strictEqual(res.strategy, 'inconclusive');
    assert.strictEqual(res.status, 'inconclusive');
    assert.strictEqual(res.canDirectPlay, false);
    assert.strictEqual(res.canAutoRenew, false);
    assert.strictEqual(res.requiresSniffer, true);
    assert.strictEqual(res.isExpired, true);
    assert.ok(res.summaryMessage.includes('expirada'));
  });

  await t.test('1.3. Link temporário dentro do prazo sem origem permanece utilizável diretamente', async () => {
    // Timestamp no futuro (ano ~2035)
    const futureTimestamp = 2050000000;
    const activeStreamUrl = `https://cdn.exemplo.com/video.mp4?sig=abc&expires=${futureTimestamp}`;
    const res = await StreamResolverService.resolveStream({
      streamUrl: activeStreamUrl
    });

    assert.strictEqual(res.strategy, 'direct_usable');
    assert.strictEqual(res.status, 'usable');
    assert.strictEqual(res.canDirectPlay, true);
    assert.strictEqual(res.canAutoRenew, false);
    assert.strictEqual(res.isExpired, false);
    assert.strictEqual(res.expirationTimestamp, futureTimestamp);
  });

  await t.test('1.4. Link com token genérico sem timestamp numérico não é considerado expirado indevidamente', async () => {
    const streamWithOpaqueToken = 'https://cdn.exemplo.com/video.mp4?auth_token=super_secret_opaque_token';
    const res = await StreamResolverService.resolveStream({
      streamUrl: streamWithOpaqueToken
    });

    // Não deve inventar validade de 1 hora nem assumir expirado
    assert.strictEqual(res.strategy, 'direct_usable');
    assert.strictEqual(res.canDirectPlay, true);
    assert.strictEqual(res.isExpired, false);
    assert.strictEqual(res.expirationTimestamp, undefined);
  });

  // -------------------------------------------------------------
  // Bloco 2: Links Temporários e Detecção de Assinaturas
  // -------------------------------------------------------------
  await t.test('2.1. Avalia assinatura com parâmetros de expiração (exp, expires, wstime)', () => {
    const sig = StreamResolverService.evaluateSignature('https://stream.net/ep01.m3u8?exp=1800000000&token=abc');
    assert.strictEqual(sig.isPotentiallyTemporary, true);
    assert.ok(sig.detectedParameters.includes('exp'));
    assert.ok(sig.detectedParameters.includes('token'));
    assert.strictEqual(sig.expirationTimestamp, 1800000000);
  });

  await t.test('2.2. Formata data legível a partir de timestamp em segundos e milissegundos', () => {
    const formattedSec = StreamResolverService.formatExpirationDate(1893456000); // 2030-01-01
    assert.ok(formattedSec && formattedSec.includes('2030'));

    const formattedMs = StreamResolverService.formatExpirationDate(1893456000000);
    assert.ok(formattedMs && formattedMs.includes('2030'));

    assert.strictEqual(StreamResolverService.formatExpirationDate(undefined), null);
    assert.strictEqual(StreamResolverService.formatExpirationDate(-10), null);
  });

  await t.test('2.3. Link com assinatura válida e origem preserva origem sem disparar inspeção desnecessária', async () => {
    let inspectorCalled = false;
    const futureTimestamp = 2050000000;
    const res = await StreamResolverService.resolveStream({
      streamUrl: `https://cdn.origem.com/video.mp4?expires=${futureTimestamp}`,
      originUrl: 'https://site-origem.com/animes/ep-01',
      pageInspector: async () => {
        inspectorCalled = true;
        return { success: true };
      }
    });

    assert.strictEqual(inspectorCalled, false, 'Não deve chamar inspeção de rede se o link direto atual está válido');
    assert.strictEqual(res.strategy, 'direct_usable');
    assert.strictEqual(res.canDirectPlay, true);
    assert.strictEqual(res.canAutoRenew, true);
    assert.strictEqual(res.originUrl, 'https://site-origem.com/animes/ep-01');
  });

  await t.test('2.4. Opção forceOriginInspection força consulta mesmo com link direto aparentemente válido', async () => {
    let inspectorCalled = false;
    const futureTimestamp = 2050000000;
    await StreamResolverService.resolveStream({
      streamUrl: `https://cdn.origem.com/video.mp4?expires=${futureTimestamp}`,
      originUrl: 'https://site-origem.com/animes/ep-01',
      forceOriginInspection: true,
      pageInspector: async () => {
        inspectorCalled = true;
        return {
          success: true,
          result: {
            pageUrl: 'https://site-origem.com/animes/ep-01',
            pageTitle: 'Episódio 01',
            sourcesFound: [
              {
                url: 'https://cdn.origem.com/novo-video.mp4?expires=2060000000',
                format: 'MP4',
                corsSupported: true,
                accessible: true,
                statusCode: 200,
                discoveryMethod: 'video_tag'
              }
            ],
            detectedIframes: [],
            dynamicMediaIndicators: [],
            diagnostics: {
              fetchTimeMs: 120,
              responseSizeBytes: 4096,
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
      }
    });

    assert.strictEqual(inspectorCalled, true);
  });

  // -------------------------------------------------------------
  // Bloco 3: Origem Pública Acessível (Renovação Automática Legítima)
  // -------------------------------------------------------------
  await t.test('3.1. Quando o link está expirado e a página de origem fornece nova fonte confirmada como acessível', async () => {
    const expiredUrl = 'https://cdn.exemplo.com/ep01.m3u8?expires=1500000000';
    const newCandidateUrl = 'https://cdn.exemplo.com/ep01.m3u8?expires=2050000000';

    const mockResult: PageInspectionResult = {
      pageUrl: 'https://site-anime.com/frieren/ep-01',
      pageTitle: 'Frieren - Episódio 01 Online',
      sourcesFound: [
        {
          url: newCandidateUrl,
          format: 'HLS',
          mimeType: 'application/x-mpegURL',
          corsSupported: true,
          accessible: true,
          statusCode: 200,
          discoveryMethod: 'video_tag',
          notes: 'Fonte de vídeo acessível com cabeçalhos CORS.'
        }
      ],
      detectedIframes: [],
      dynamicMediaIndicators: [],
      diagnostics: {
        fetchTimeMs: 150,
        responseSizeBytes: 10240,
        redirectCount: 0,
        detectedDrm: false,
        detectedProtectionOrCaptcha: false,
        detectedIframesCount: 0,
        detectedDynamicLoading: false,
        status: 'direct_source_accessible',
        summaryMessage: 'Fonte identificada e acessível'
      }
    };

    const res = await StreamResolverService.resolveStream({
      streamUrl: expiredUrl,
      originUrl: 'https://site-anime.com/frieren/ep-01',
      pageInspector: async () => ({
        success: true,
        result: mockResult
      })
    });

    assert.strictEqual(res.strategy, 'auto_renewable');
    assert.strictEqual(res.status, 'renewable');
    assert.strictEqual(res.canAutoRenew, true);
    assert.strictEqual(res.requiresSniffer, false);
    assert.strictEqual(res.candidateStreamUrl, newCandidateUrl);
    assert.strictEqual(res.currentStreamUrl, expiredUrl);
    assert.strictEqual(res.originTitle, 'Frieren - Episódio 01 Online');
    assert.strictEqual(res.isTemporary, true);
    assert.strictEqual(res.expirationTimestamp, 2050000000);
  });

  // -------------------------------------------------------------
  // Bloco 4: Origem Bloqueada ou Incompatível
  // -------------------------------------------------------------
  await t.test('4.1. Bloqueio por SSRF na página de origem é classificado como origin_unavailable', async () => {
    const res = await StreamResolverService.resolveStream({
      streamUrl: 'https://cdn.exemplo.com/video.mp4?exp=1500000000',
      originUrl: 'http://169.254.169.254/latest/meta-data',
      pageInspector: async () => ({
        success: false,
        error: 'Endereço IP pertence ao serviço de metadados de nuvem restrito.',
        code: 'SSRF_BLOCKED'
      })
    });

    assert.strictEqual(res.strategy, 'origin_unavailable');
    assert.strictEqual(res.status, 'unavailable');
    assert.strictEqual(res.canAutoRenew, false);
    assert.strictEqual(res.canDirectPlay, false);
    assert.ok(res.summaryMessage.includes('SSRF'));
  });

  await t.test('4.2. Protocolo inválido (ex: file://, ftp://) é bloqueado antes da rede', async () => {
    let networkAttempted = false;
    const res = await StreamResolverService.resolveStream({
      streamUrl: 'https://cdn.exemplo.com/video.mp4?exp=1500000000',
      originUrl: 'ftp://servidor-privado.local/pasta',
      pageInspector: async () => {
        networkAttempted = true;
        return { success: true };
      }
    });

    assert.strictEqual(networkAttempted, false);
    assert.strictEqual(res.strategy, 'origin_unavailable');
    assert.ok(res.summaryMessage.includes('Protocolo'));
  });

  await t.test('4.3. Presença de DRM na página de origem classifica como origin_unavailable', async () => {
    const res = await StreamResolverService.resolveStream({
      streamUrl: 'https://cdn.exemplo.com/video.mp4?exp=1500000000',
      originUrl: 'https://servico-drm.com/player',
      pageInspector: async () => ({
        success: true,
        result: {
          pageUrl: 'https://servico-drm.com/player',
          pageTitle: 'Player Protegido',
          sourcesFound: [],
          detectedIframes: [],
          dynamicMediaIndicators: [],
          diagnostics: {
            fetchTimeMs: 100,
            responseSizeBytes: 2000,
            redirectCount: 0,
            detectedDrm: true,
            detectedProtectionOrCaptcha: false,
            detectedIframesCount: 0,
            detectedDynamicLoading: false,
            status: 'drm_or_protected',
            summaryMessage: 'DRM detectado'
          }
        }
      })
    });

    assert.strictEqual(res.strategy, 'origin_unavailable');
    assert.strictEqual(res.status, 'unavailable');
    assert.ok(res.summaryMessage.includes('DRM'));
  });

  // -------------------------------------------------------------
  // Bloco 5: Resposta Sem Mídia Renovada / Renovação Assistida Necessária
  // -------------------------------------------------------------
  await t.test('5.1. Desafio anti-bot / Cloudflare resulta em assisted_renewal_required com sniffer', async () => {
    const res = await StreamResolverService.resolveStream({
      streamUrl: 'https://cdn.exemplo.com/video.mp4?exp=1500000000',
      originUrl: 'https://site-com-cloudflare.com/ep-01',
      pageInspector: async () => ({
        success: true,
        result: {
          pageUrl: 'https://site-com-cloudflare.com/ep-01',
          pageTitle: 'Just a moment...',
          sourcesFound: [],
          detectedIframes: [],
          dynamicMediaIndicators: [],
          interstitialChallenge: {
            detected: true,
            provider: 'Cloudflare',
            pageTitle: 'Just a moment...',
            evidence: ['Página com desafio Turnstile Cloudflare']
          },
          diagnostics: {
            fetchTimeMs: 250,
            responseSizeBytes: 1500,
            redirectCount: 0,
            detectedDrm: false,
            detectedProtectionOrCaptcha: true,
            detectedIframesCount: 0,
            detectedDynamicLoading: false,
            status: 'challenge_or_interstitial_detected',
            summaryMessage: 'Desafio intermediário Cloudflare detectado'
          }
        }
      })
    });

    assert.strictEqual(res.strategy, 'assisted_renewal_required');
    assert.strictEqual(res.status, 'assisted');
    assert.strictEqual(res.requiresSniffer, true);
    assert.strictEqual(res.canAutoRenew, false);
    assert.ok(res.summaryMessage.includes('Cloudflare'));
  });

  await t.test('5.2. Mídia embutida em iframe requer renovação assistida com NOVA Sniffer', async () => {
    const res = await StreamResolverService.resolveStream({
      streamUrl: 'https://cdn.exemplo.com/video.mp4?exp=1500000000',
      originUrl: 'https://portal.com/anime/ep-02',
      pageInspector: async () => ({
        success: true,
        result: {
          pageUrl: 'https://portal.com/anime/ep-02',
          pageTitle: 'Portal Anime Ep 2',
          sourcesFound: [],
          detectedIframes: [
            {
              url: 'https://embed.playerhub.to/v/12345',
              domain: 'embed.playerhub.to',
              origin: 'https://embed.playerhub.to',
              isCrossOrigin: true,
              classification: 'probable_player'
            }
          ],
          dynamicMediaIndicators: [],
          diagnostics: {
            fetchTimeMs: 140,
            responseSizeBytes: 3000,
            redirectCount: 0,
            detectedDrm: false,
            detectedProtectionOrCaptcha: false,
            detectedIframesCount: 1,
            detectedDynamicLoading: false,
            status: 'embedded_player_detected',
            summaryMessage: 'Player incorporado detectado'
          }
        }
      })
    });

    assert.strictEqual(res.strategy, 'assisted_renewal_required');
    assert.strictEqual(res.requiresSniffer, true);
    assert.ok(res.summaryMessage.includes('player incorporado'));
  });

  await t.test('5.3. Carregamento dinâmico via JS requer monitoramento ativo do Sniffer', async () => {
    const res = await StreamResolverService.resolveStream({
      streamUrl: 'https://cdn.exemplo.com/video.mp4?exp=1500000000',
      originUrl: 'https://portal.com/anime/ep-03',
      pageInspector: async () => ({
        success: true,
        result: {
          pageUrl: 'https://portal.com/anime/ep-03',
          pageTitle: 'Portal Anime Ep 3',
          sourcesFound: [],
          detectedIframes: [],
          dynamicMediaIndicators: [
            {
              type: 'player_library',
              description: 'Biblioteca jwplayer detectada',
              patternMatched: 'jwplayer.js'
            }
          ],
          diagnostics: {
            fetchTimeMs: 180,
            responseSizeBytes: 4200,
            redirectCount: 0,
            detectedDrm: false,
            detectedProtectionOrCaptcha: false,
            detectedIframesCount: 0,
            detectedDynamicLoading: true,
            status: 'dynamic_loading_detected',
            summaryMessage: 'Carregamento dinâmico'
          }
        }
      })
    });

    assert.strictEqual(res.strategy, 'assisted_renewal_required');
    assert.strictEqual(res.requiresSniffer, true);
    assert.ok(res.summaryMessage.includes('dinamicamente'));
  });

  await t.test('5.4. Fonte presente no HTML porém inacessível no probe (HTTP 403 / sessão) NÃO garante reprodução e exige renovação assistida', async () => {
    const res = await StreamResolverService.resolveStream({
      streamUrl: 'https://cdn.exemplo.com/video.mp4?exp=1500000000',
      originUrl: 'https://portal.com/anime/ep-04',
      pageInspector: async () => ({
        success: true,
        result: {
          pageUrl: 'https://portal.com/anime/ep-04',
          pageTitle: 'Portal Anime Ep 4',
          sourcesFound: [
            {
              url: 'https://stream.host.com/video.mp4',
              format: 'MP4',
              corsSupported: false,
              accessible: false,
              statusCode: 403,
              discoveryMethod: 'video_tag',
              notes: 'Servidor recusou com HTTP 403 Forbidden.'
            }
          ],
          detectedIframes: [],
          dynamicMediaIndicators: [],
          diagnostics: {
            fetchTimeMs: 190,
            responseSizeBytes: 3500,
            redirectCount: 0,
            detectedDrm: false,
            detectedProtectionOrCaptcha: false,
            detectedIframesCount: 0,
            detectedDynamicLoading: false,
            status: 'sources_found',
            summaryMessage: 'Fontes encontradas'
          }
        }
      })
    });

    // Princípio do prompt: Não tratar simples inspeção HTML como garantia de que o vídeo funcionará
    assert.strictEqual(res.strategy, 'assisted_renewal_required');
    assert.strictEqual(res.requiresSniffer, true);
    assert.strictEqual(res.candidateStreamUrl, 'https://stream.host.com/video.mp4');
    assert.ok(res.summaryMessage.includes('não foi confirmada'));
  });

  // -------------------------------------------------------------
  // Bloco 6: Erros de Rede e Comunicação
  // -------------------------------------------------------------
  await t.test('6.1. Exceção de rede no inspetor resulta em strategy: inconclusive', async () => {
    const res = await StreamResolverService.resolveStream({
      streamUrl: 'https://cdn.exemplo.com/video.mp4?exp=1500000000',
      originUrl: 'https://site-fora-do-ar.com/ep-01',
      pageInspector: async () => {
        throw new Error('Falha de conexão: ECONNREFUSED');
      }
    });

    assert.strictEqual(res.strategy, 'inconclusive');
    assert.strictEqual(res.status, 'inconclusive');
    assert.ok(res.summaryMessage.includes('rede'));
    assert.ok(res.details.some(d => d.includes('ECONNREFUSED')));
  });

  await t.test('6.2. Erro de timeout do backend resulta em strategy: inconclusive', async () => {
    const res = await StreamResolverService.resolveStream({
      streamUrl: 'https://cdn.exemplo.com/video.mp4?exp=1500000000',
      originUrl: 'https://site-lento.com/ep-01',
      pageInspector: async () => ({
        success: false,
        error: 'Tempo limite esgotado após 5000ms',
        code: 'TIMEOUT'
      })
    });

    assert.strictEqual(res.strategy, 'inconclusive');
    assert.strictEqual(res.status, 'inconclusive');
    assert.ok(res.summaryMessage.includes('Tempo limite'));
  });

  await t.test('6.3. Erro de rate limit excedido resulta em strategy: inconclusive', async () => {
    const res = await StreamResolverService.resolveStream({
      streamUrl: 'https://cdn.exemplo.com/video.mp4?exp=1500000000',
      originUrl: 'https://site.com/ep-01',
      pageInspector: async () => ({
        success: false,
        error: 'Limite de requisições excedido.',
        code: 'RATE_LIMIT_EXCEEDED'
      })
    });

    assert.strictEqual(res.strategy, 'inconclusive');
    assert.strictEqual(res.status, 'inconclusive');
    assert.ok(res.summaryMessage.includes('Limite de requisições'));
  });

  // -------------------------------------------------------------
  // Bloco 7: Resultados Inconclusivos e Entradas Inválidas
  // -------------------------------------------------------------
  await t.test('7.1. Ausência de streamUrl e originUrl resulta em inconclusive imediato', async () => {
    const res = await StreamResolverService.resolveStream({});
    assert.strictEqual(res.strategy, 'inconclusive');
    assert.strictEqual(res.status, 'inconclusive');
    assert.strictEqual(res.canDirectPlay, false);
    assert.strictEqual(res.canAutoRenew, false);
  });

  await t.test('7.2. Strings em branco retornam resultado inconclusive', async () => {
    const res = await StreamResolverService.resolveStream({
      streamUrl: '   ',
      originUrl: '   '
    });
    assert.strictEqual(res.strategy, 'inconclusive');
  });

  // -------------------------------------------------------------
  // Bloco 8: Integração Não-Destrutiva com Objeto EpisodeFile
  // -------------------------------------------------------------
  await t.test('8.1. resolveEpisode preserva o objeto original intacto sem mutações', async () => {
    const originalEpisode: Partial<EpisodeFile> = {
      id: 'ep-test-01',
      title: 'Episódio Teste',
      fileSizeBytes: 1234567,
      streamUrl: 'https://cdn.exemplo.com/ep01.mp4?expires=2050000000',
      originUrl: 'https://site.com/ep-01',
      originTitle: 'Página Teste',
      capturedAt: '2026-10-22T20:00:00Z'
    };

    const snapshot = JSON.stringify(originalEpisode);
    const res = await StreamResolverService.resolveEpisode(originalEpisode);

    assert.strictEqual(JSON.stringify(originalEpisode), snapshot, 'O episódio original não deve sofrer mutação');
    assert.strictEqual(res.strategy, 'direct_usable');
    assert.strictEqual(res.canDirectPlay, true);
    assert.strictEqual(res.canAutoRenew, true);
  });
});
