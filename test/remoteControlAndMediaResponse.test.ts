import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import express from 'express';
import { mediaInspectRouter } from '../src/server/routes/mediaInspect.ts';
import {
  inferMediaFormat,
  probeMediaAccessibility,
  extractMediaFromHtml
} from '../src/server/services/pageMediaExtractor.ts';
import { safeFetchPageWithLimits, validateUrlForSsrf } from '../src/server/utils/ssrfGuard.ts';

test('Testes de Regressão: Suporte a Parâmetros de Mídia, Content-Type e Proteções do Inspetor', async (t) => {
  const REMOTE_CONTROL_URL =
    'https://a62.filevideo1.com/remote_control.php?time=1792866495&cv=8536fc84991bf62c1608e73746a435cc&lr=0&cv2=95b8bb0fd9dc50148d9fd30f649d31da&file=%2Fvideos%2F1070000%2F1070866%2F1070866.mp4&cv3=ad534ff66f76af9cf1982e97924d890e&cv4=cfebaef6f307fb4ae0a857865359cb4f';

  // -------------------------------------------------------------------------
  // Cenário 1: Link "remote_control.php" reconhecido como MP4 e inspecionado sem baixar arquivo inteiro
  // -------------------------------------------------------------------------
  await t.test('1. Link remote_control.php com parâmetro file=...mp4 é reconhecido como MP4 e inspecionado via Range', async () => {
    // 1.1 inferMediaFormat identifica o formato pelo parâmetro 'file' mesmo com pathname .php
    const format = inferMediaFormat(REMOTE_CONTROL_URL);
    assert.strictEqual(format, 'MP4', 'Deve inferir MP4 a partir do parâmetro file');

    // 1.2 probeMediaAccessibility realiza sondagem curta por Range (bytes=0-1024)
    const probe = await probeMediaAccessibility(REMOTE_CONTROL_URL);
    assert.strictEqual(probe.accessible, true, 'O vídeo deve ser acessível remotamente');
    assert.strictEqual(probe.statusCode, 206, 'Deve responder com HTTP 206 Partial Content');
    assert.strictEqual(probe.mimeType, 'video/mp4', 'MIME type deve ser video/mp4');
    assert.strictEqual(probe.supportsRange, true, 'Deve suportar Range por bytes');
    assert.strictEqual(probe.isHtml, false, 'Não deve ser classificado como HTML');
    // Confirma que não baixou os 351 MB do arquivo inteiro (leu apenas o bloco curto de 1025 bytes)
    assert.ok(
      typeof probe.contentLengthBytes === 'number' && probe.contentLengthBytes <= 2048,
      `Leu apenas ${probe.contentLengthBytes} bytes, sem baixar o vídeo de 351 MB`
    );

    // 1.3 Rota Express responde com sucesso sem erro RESPONSE_TOO_LARGE
    const app = express();
    app.use(express.json());
    app.use('/api/storage', mediaInspectRouter);

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as any).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/storage/inspect-page`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageUrl: REMOTE_CONTROL_URL })
      });

      const data = await res.json();
      assert.strictEqual(res.status, 200, 'A rota deve responder com HTTP 200');
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.result.sourcesFound.length, 1);
      assert.strictEqual(data.result.sourcesFound[0].format, 'MP4');
      assert.strictEqual(data.result.sourcesFound[0].accessible, true);
      assert.strictEqual(data.result.sourcesFound[0].statusCode, 206);
      assert.strictEqual(data.result.diagnostics.status, 'direct_source_accessible');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  // -------------------------------------------------------------------------
  // Cenário 2: Link MP4 direto
  // -------------------------------------------------------------------------
  await t.test('2. Link MP4 direto é inferido e inspecionado corretamente', async () => {
    const directMp4 = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';
    assert.strictEqual(inferMediaFormat(directMp4), 'MP4');

    const probe = await probeMediaAccessibility(directMp4);
    assert.strictEqual(probe.accessible, true);
    assert.strictEqual(probe.statusCode, 206);
    assert.strictEqual(probe.supportsRange, true);
    assert.strictEqual(probe.mimeType, 'video/mp4');
    assert.strictEqual(probe.corsSupported, true);
  });

  // -------------------------------------------------------------------------
  // Cenário 3: Fonte HLS ".m3u8"
  // -------------------------------------------------------------------------
  await t.test('3. Link HLS .m3u8 é inferido e inspecionado corretamente', async () => {
    const hlsUrl = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
    assert.strictEqual(inferMediaFormat(hlsUrl), 'HLS');

    const probe = await probeMediaAccessibility(hlsUrl);
    assert.strictEqual(probe.accessible, true);
    assert.ok(probe.statusCode === 200 || probe.statusCode === 206);
    assert.strictEqual(probe.corsSupported, true);
  });

  // -------------------------------------------------------------------------
  // Cenário 4: Página HTML comum contendo links de vídeo
  // -------------------------------------------------------------------------
  await t.test('4. Página HTML comum contendo tags de vídeo é analisada normalmente', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Página de Demonstração com Vídeo</title></head>
        <body>
          <h1>Vídeo Exemplo</h1>
          <video src="https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4" controls></video>
        </body>
      </html>
    `;

    const extraction = await extractMediaFromHtml(html, 'https://example.org/watch');
    assert.strictEqual(extraction.pageTitle, 'Página de Demonstração com Vídeo');
    assert.strictEqual(extraction.sources.length, 1);
    assert.strictEqual(extraction.sources[0].url, 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4');
    assert.strictEqual(extraction.sources[0].format, 'MP4');
  });

  // -------------------------------------------------------------------------
  // Cenário 5: URL de mídia inválida ou inacessível (ex: 404)
  // -------------------------------------------------------------------------
  await t.test('5. URL de mídia inacessível (HTTP 404) é diagnosticada como falha sem inventar sucesso', async () => {
    const deadMediaUrl = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/arquivo-inexistente-12345.mp4';
    const probe = await probeMediaAccessibility(deadMediaUrl);

    assert.strictEqual(probe.accessible, false, 'Deve relatar accessible: false');
    assert.strictEqual(probe.statusCode, 404, 'Deve registrar statusCode 404');
    assert.ok(probe.notes && probe.notes.includes('404'), 'Deve incluir menção ao código 404 nas notas');
  });

  // -------------------------------------------------------------------------
  // Cenário 6: Bloqueios SSRF e validação de redirecionamentos
  // -------------------------------------------------------------------------
  await t.test('6. Bloqueios SSRF e proteção em redirecionamentos', async () => {
    // 6.1 Loopback
    const loopback = await validateUrlForSsrf('http://127.0.0.1:8080/test');
    assert.strictEqual(loopback.valid, false);

    // 6.2 Metadados de nuvem
    const metadata = await validateUrlForSsrf('http://169.254.169.254/latest/meta-data/');
    assert.strictEqual(metadata.valid, false);

    // 6.3 Rede privada RFC 1918
    const rfc1918 = await validateUrlForSsrf('http://192.168.1.1/stream');
    assert.strictEqual(rfc1918.valid, false);

    // 6.4 Protocolos não suportados
    const fileProto = await validateUrlForSsrf('file:///etc/passwd');
    assert.strictEqual(fileProto.valid, false);

    // 6.5 Redirecionamento malicioso para IP privado é bloqueado por safeFetchPageWithLimits
    const origFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (input: any) => {
        const urlStr = String(input);
        if (urlStr.includes('/step1')) {
          return new Response(null, {
            status: 302,
            headers: { Location: 'http://127.0.0.1:9999/malicious' }
          });
        }
        return origFetch(input);
      };

      await assert.rejects(
        async () => {
          await safeFetchPageWithLimits('https://example.com/step1', {
            timeoutMs: 3000,
            maxRedirects: 2
          });
        },
        /SSRF_BLOCKED/
      );
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  // -------------------------------------------------------------------------
  // Cenário 7: Limite de 512 KB para páginas HTML e cancelamento preventivo para streams
  // -------------------------------------------------------------------------
  await t.test('7. Limite de 512 KB é rigorosamente preservado para páginas HTML e streams cancelam leitura preventiva', async () => {
    const origFetch = globalThis.fetch;
    try {
      // 7.1 Página HTML de 600 KB deve exceder limite e lançar RESPONSE_TOO_LARGE
      globalThis.fetch = async (input: any) => {
        const urlStr = String(input);
        if (urlStr.includes('/large-html')) {
          const stream = new ReadableStream({
            start(controller) {
              const chunk = new Uint8Array(1024);
              chunk.fill(65);
              for (let i = 0; i < 600; i++) {
                controller.enqueue(chunk);
              }
              controller.close();
            }
          });
          return new Response(stream, {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          });
        }

        if (urlStr.includes('/media-stream')) {
          // Stream de vídeo que não deve ser lido como HTML
          const stream = new ReadableStream({
            start(controller) {
              const chunk = new Uint8Array(1024);
              controller.enqueue(chunk);
            }
          });
          return new Response(stream, {
            status: 200,
            headers: {
              'Content-Type': 'video/mp4',
              'Content-Length': '350000000'
            }
          });
        }

        return origFetch(input);
      };

      // 7.1 Teste do limite de 512 KB em HTML
      await assert.rejects(
        async () => {
          await safeFetchPageWithLimits('https://example.com/large-html', {
            timeoutMs: 3000,
            maxSizeBytes: 512 * 1024
          });
        },
        /RESPONSE_TOO_LARGE: A página excedeu o limite máximo de 512 KB/
      );

      // 7.2 Teste da guarda de Content-Type: fluxo de vídeo é cancelado sem tentar ler os 512 KB
      const mediaResult = await safeFetchPageWithLimits('https://example.com/media-stream', {
        timeoutMs: 3000,
        maxSizeBytes: 512 * 1024
      });
      assert.strictEqual(mediaResult.isMediaStream, true);
      assert.strictEqual(mediaResult.contentType, 'video/mp4');
      assert.strictEqual(mediaResult.responseSizeBytes, 0, 'Não deve acumular bytes de fluxo binário no corpo');
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
