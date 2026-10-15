import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractMediaFromHtml,
  inferMediaFormat
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
});
