import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractMediaFromHtml,
  inferMediaFormat,
  probeMediaAccessibility,
  determineInspectionStatus
} from '../src/server/services/pageMediaExtractor.ts';

test('Extração e Identificação de Mídias em Páginas Web', async (t) => {
  await t.test('1. Infere formatos HLS, MP4 e WebM a partir de URL e MIME type', () => {
    assert.strictEqual(inferMediaFormat('https://cdn.example.com/stream/master.m3u8'), 'HLS');
    assert.strictEqual(inferMediaFormat('https://cdn.example.com/stream', 'application/vnd.apple.mpegurl'), 'HLS');
    assert.strictEqual(inferMediaFormat('https://cdn.example.com/video/ep01.mp4'), 'MP4');
    assert.strictEqual(inferMediaFormat('https://cdn.example.com/video/sample.webm'), 'WEBM');
    assert.strictEqual(inferMediaFormat('https://cdn.example.com/unknown/archive.zip'), 'UNKNOWN');
  });

  await t.test('2. Extrai fontes a partir de tag <video src="..."> com resolução de caminho relativo', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Página com Vídeo Direto</title></head>
        <body>
          <video src="/media/video_720p.mp4" controls></video>
        </body>
      </html>
    `;

    const result = await extractMediaFromHtml(html, 'https://streaming.example.org/watch/ep1');
    assert.strictEqual(result.pageTitle, 'Página com Vídeo Direto');
    assert.strictEqual(result.sources.length, 1);
    assert.strictEqual(result.sources[0].url, 'https://streaming.example.org/media/video_720p.mp4');
    assert.strictEqual(result.sources[0].format, 'MP4');
    assert.strictEqual(result.sources[0].discoveryMethod, 'video_tag');
  });

  await t.test('3. Extrai múltiplas faixas a partir de tags <source src="..." type="...">', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Episódio 01 - Transmissão HLS</title></head>
        <body>
          <video controls>
            <source src="https://cdn.example.org/live/stream.m3u8" type="application/x-mpegURL">
            <source src="https://cdn.example.org/live/stream_fallback.mp4" type="video/mp4">
          </video>
        </body>
      </html>
    `;

    const result = await extractMediaFromHtml(html, 'https://example.org');
    assert.strictEqual(result.sources.length, 2);

    const hlsSource = result.sources.find(s => s.format === 'HLS');
    assert.ok(hlsSource);
    assert.strictEqual(hlsSource.discoveryMethod, 'source_tag');
    assert.strictEqual(hlsSource.url, 'https://cdn.example.org/live/stream.m3u8');

    const mp4Source = result.sources.find(s => s.format === 'MP4');
    assert.ok(mp4Source);
    assert.strictEqual(mp4Source.format, 'MP4');
  });

  await t.test('4. Extrai metadados de compartilhamento OpenGraph (og:video)', async () => {
    const html = `
      <html>
        <head>
          <title>Portal de Animes Aberto</title>
          <meta property="og:video" content="https://cdn.openmedia.org/anime/ep01.mp4" />
        </head>
      </html>
    `;

    const result = await extractMediaFromHtml(html, 'https://openmedia.org/page');
    assert.strictEqual(result.sources.length, 1);
    assert.strictEqual(result.sources[0].discoveryMethod, 'og_video');
    assert.strictEqual(result.sources[0].url, 'https://cdn.openmedia.org/anime/ep01.mp4');
  });

  await t.test('5. Extrai metadados JSON-LD estruturados (VideoObject contentUrl)', async () => {
    const html = `
      <html>
        <head>
          <title>Documentário Educacional</title>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "VideoObject",
              "name": "Aula 01",
              "contentUrl": "https://cdn.edu.org/lessons/aula01.m3u8"
            }
          </script>
        </head>
      </html>
    `;

    const result = await extractMediaFromHtml(html, 'https://edu.org/lesson/1');
    assert.strictEqual(result.sources.length, 1);
    assert.strictEqual(result.sources[0].discoveryMethod, 'json_ld');
    assert.strictEqual(result.sources[0].url, 'https://cdn.edu.org/lessons/aula01.m3u8');
    assert.strictEqual(result.sources[0].format, 'HLS');
  });

  await t.test('6. Identifica e sinaliza proteções DRM sem contorná-las', async () => {
    const html = `
      <html>
        <head><title>Streaming Protegido</title></head>
        <body>
          <script>
            navigator.requestMediaKeySystemAccess('com.widevine.alpha', []);
          </script>
        </body>
      </html>
    `;

    const result = await extractMediaFromHtml(html, 'https://drm.example.com');
    assert.strictEqual(result.detectedDrm, true);
  });

  await t.test('7. Trata páginas limpas sem nenhum vídeo declarado', async () => {
    const html = `
      <html>
        <head><title>Artigo de Notícias</title></head>
        <body><p>Apenas texto informativo sem elementos de vídeo.</p></body>
      </html>
    `;

    const result = await extractMediaFromHtml(html, 'https://news.example.com');
    assert.strictEqual(result.sources.length, 0);
    assert.strictEqual(result.detectedDrm, false);
    assert.strictEqual(result.pageTitle, 'Artigo de Notícias');
  });

  await t.test('8. Diagnóstico de acessibilidade MP4: detecta status 403 Forbidden, negação de permissão e não atribui ao CORS indevidamente', async () => {
    const probe = await probeMediaAccessibility('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4');
    assert.strictEqual(probe.accessible, false, 'Deveria ser marcado como inacessível devido ao código HTTP 403');
    assert.strictEqual(probe.statusCode, 403, 'Código de status HTTP deve ser 403');
    assert.strictEqual(probe.corsSupported, true, 'Bucket GCS envia Access-Control-Allow-Origin: *');
    assert.strictEqual(probe.supportsRange, false, 'Objeto 403 não fornece 206 Partial Content');
    assert.ok(probe.notes?.includes('403') || probe.notes?.includes('negado'), 'Notas devem registrar o código 403 ou acesso negado');
  });

  await t.test('9. Diagnóstico de acessibilidade MP4: detecta suporte a Range 206 Partial Content e CORS ativo em mídia pública', async () => {
    const probe = await probeMediaAccessibility('https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4');
    assert.strictEqual(probe.accessible, true, 'Arquivo público deve ser acessível');
    assert.ok(probe.statusCode === 200 || probe.statusCode === 206, 'Código HTTP deve ser 200 ou 206');
    assert.strictEqual(probe.corsSupported, true, 'MDN disponibiliza CORS aberto');
    assert.strictEqual(probe.supportsRange, true, 'MDN suporta requisições parciais Range (bytes=0-1024)');
  });

  await t.test('10. Detecta elemento iframe, registra domínio de origem e NÃO afirma que existe vídeo direto', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Página com Player Incorporado</title></head>
        <body>
          <div class="player-container">
            <iframe src="https://streamtape.com/e/abc123xyz" width="100%" height="450" title="Player Streamtape"></iframe>
          </div>
        </body>
      </html>
    `;

    const result = await extractMediaFromHtml(html, 'https://animesonline.exemplo.org/episodio-1');
    assert.strictEqual(result.pageTitle, 'Página com Player Incorporado');
    // Requisito 4: Não afirmar que existe um vídeo só porque foi encontrado um iframe
    assert.strictEqual(result.sources.length, 0, 'Não deve adicionar o iframe como fonte de vídeo aberta direta');
    assert.strictEqual(result.detectedIframes.length, 1, 'Deve registrar o iframe detectado');
    assert.strictEqual(result.detectedIframes[0].domain, 'streamtape.com');
    assert.strictEqual(result.detectedIframes[0].origin, 'https://streamtape.com');
    assert.strictEqual(result.detectedIframes[0].isCrossOrigin, true);
    assert.strictEqual(result.detectedIframes[0].title, 'Player Streamtape');

    const diag = determineInspectionStatus({
      sourcesCount: result.sources.length,
      hasAccessibleDirectSource: false,
      detectedDrm: result.detectedDrm,
      detectedProtection: result.detectedProtection,
      iframesCount: result.detectedIframes.length,
      dynamicIndicatorsCount: result.dynamicMediaIndicators.length,
      firstIframeDomain: result.detectedIframes[0].domain
    });

    assert.strictEqual(diag.status, 'embedded_player_detected');
    assert.ok(diag.summaryMessage.includes('streamtape.com'));
    assert.ok(diag.diagnosticDetails.some(d => d.includes('Não é possível afirmar se existe um vídeo')));
  });

  await t.test('11. Detecta iframe com URL relativa e resolve corretamente a partir da URL base da página', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Portal Interno</title></head>
        <body>
          <iframe src="/embed/player?v=987" title="Embed Interno"></iframe>
        </body>
      </html>
    `;

    const result = await extractMediaFromHtml(html, 'https://sub.empresa.com/assistir');
    assert.strictEqual(result.sources.length, 0);
    assert.strictEqual(result.detectedIframes.length, 1);
    assert.strictEqual(result.detectedIframes[0].url, 'https://sub.empresa.com/embed/player?v=987');
    assert.strictEqual(result.detectedIframes[0].domain, 'sub.empresa.com');
    assert.strictEqual(result.detectedIframes[0].isCrossOrigin, false, 'Iframe no mesmo subdomínio é Same-Origin');
  });

  await t.test('12. Detecta possíveis carregamentos dinâmicos de mídia via bibliotecas de player e atributos data-*', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Player Dinâmico SPA</title>
          <script src="https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.4.0/hls.min.js"></script>
        </head>
        <body>
          <div id="video-wrapper" data-video-url="https://secure-cdn.tv/api/tokenized_stream"></div>
          <script>
            if (Hls.isSupported()) {
              var hls = new Hls();
            }
          </script>
        </body>
      </html>
    `;

    const result = await extractMediaFromHtml(html, 'https://dynamic-stream.example.org/watch');
    assert.strictEqual(result.sources.length, 0, 'Sem tag <video> estática aberta');
    assert.strictEqual(result.detectedIframes.length, 0, 'Sem iframes');
    assert.ok(result.dynamicMediaIndicators.length >= 2, 'Deve identificar a biblioteca Hls.js e o atributo data-video-url');

    const hasHlsLib = result.dynamicMediaIndicators.some(i => i.patternMatched === 'hls.js');
    assert.ok(hasHlsLib, 'Deve registrar indicador da biblioteca hls.js');

    const diag = determineInspectionStatus({
      sourcesCount: result.sources.length,
      hasAccessibleDirectSource: false,
      detectedDrm: false,
      detectedProtection: false,
      iframesCount: 0,
      dynamicIndicatorsCount: result.dynamicMediaIndicators.length
    });

    assert.strictEqual(diag.status, 'dynamic_loading_detected');
    assert.ok(diag.summaryMessage.includes('dinâmico'));
  });

  await t.test('13. Trata páginas sem iframe, sem vídeo e sem scripts de mídia, classificando como "no_sources"', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Blog de Tecnologia</title></head>
        <body>
          <main>
            <h1>Artigo sobre Arquitetura Desacoplada</h1>
            <p>Texto explicativo puro, sem elementos de áudio ou vídeo incorporados.</p>
          </main>
        </body>
      </html>
    `;

    const result = await extractMediaFromHtml(html, 'https://blog.tech.org/artigo-1');
    assert.strictEqual(result.sources.length, 0);
    assert.strictEqual(result.detectedIframes.length, 0);
    assert.strictEqual(result.dynamicMediaIndicators.length, 0);

    const diag = determineInspectionStatus({
      sourcesCount: 0,
      hasAccessibleDirectSource: false,
      detectedDrm: false,
      detectedProtection: false,
      iframesCount: 0,
      dynamicIndicatorsCount: 0
    });

    assert.strictEqual(diag.status, 'no_sources');
    assert.ok(diag.summaryMessage.includes('Nenhuma fonte aberta encontrada'));
  });

  await t.test('14. Diferenciação inequívoca dos estados de diagnóstico', () => {
    // Estado 1: Nenhuma fonte aberta encontrada
    const state1 = determineInspectionStatus({
      sourcesCount: 0,
      hasAccessibleDirectSource: false,
      detectedDrm: false,
      detectedProtection: false,
      iframesCount: 0,
      dynamicIndicatorsCount: 0
    });
    assert.strictEqual(state1.status, 'no_sources');

    // Estado 2: Player incorporado (iframe) identificado
    const state2 = determineInspectionStatus({
      sourcesCount: 0,
      hasAccessibleDirectSource: false,
      detectedDrm: false,
      detectedProtection: false,
      iframesCount: 1,
      dynamicIndicatorsCount: 0,
      firstIframeDomain: 'player.vimeo.com'
    });
    assert.strictEqual(state2.status, 'embedded_player_detected');
    assert.ok(state2.summaryMessage.includes('player.vimeo.com'));

    // Estado 3: Possível carregamento dinâmico de mídia
    const state3 = determineInspectionStatus({
      sourcesCount: 0,
      hasAccessibleDirectSource: false,
      detectedDrm: false,
      detectedProtection: false,
      iframesCount: 0,
      dynamicIndicatorsCount: 2
    });
    assert.strictEqual(state3.status, 'dynamic_loading_detected');

    // Estado 4: Fonte direta encontrada e acessível
    const state4 = determineInspectionStatus({
      sourcesCount: 1,
      hasAccessibleDirectSource: true,
      detectedDrm: false,
      detectedProtection: false,
      iframesCount: 0,
      dynamicIndicatorsCount: 0
    });
    assert.strictEqual(state4.status, 'direct_source_accessible');

    // Estado DRM / Protegido
    const stateDrm = determineInspectionStatus({
      sourcesCount: 0,
      hasAccessibleDirectSource: false,
      detectedDrm: true,
      detectedProtection: false,
      iframesCount: 0,
      dynamicIndicatorsCount: 0
    });
    assert.strictEqual(stateDrm.status, 'drm_or_protected');
  });
});
