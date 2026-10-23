import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inferMediaFormat,
  extractIntermediateMediaDestination,
  probeMediaAccessibility,
  IntermediateUrlRule,
  registerIntermediateUrlRule
} from '../src/server/services/pageMediaExtractor.ts';
import { validateUrlForSsrf } from '../src/server/utils/ssrfGuard.ts';
import { app } from '../src/server/app.ts';
import http from 'node:http';

test('Reconhecimento Controlado de URLs Intermediárias HLS e Proteções SSRF', async (t) => {
  // -------------------------------------------------------------
  // Teste 1: URL .m3u8 direta que já funciona deve continuar funcionando
  // -------------------------------------------------------------
  await t.test('1. URL .m3u8 direta é identificada como HLS e preserva comportamento existente', () => {
    const directHls = 'https://cdn-sv01.maximaimg.online/stream/g/gintama/01-02.mp4/index.m3u8';
    assert.strictEqual(inferMediaFormat(directHls), 'HLS');

    const intermediateCheck = extractIntermediateMediaDestination(directHls);
    assert.strictEqual(intermediateCheck.isIntermediate, false, 'Link direto não deve ser classificado como intermediário');
  });

  // -------------------------------------------------------------
  // Teste 2: MP4 direto continua funcionando normalmente
  // -------------------------------------------------------------
  await t.test('2. URL .mp4 direta continua sendo identificada como MP4 sem interferência', () => {
    const directMp4 = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
    assert.strictEqual(inferMediaFormat(directMp4), 'MP4');

    const intermediateCheck = extractIntermediateMediaDestination(directMp4);
    assert.strictEqual(intermediateCheck.isIntermediate, false);
  });

  // -------------------------------------------------------------
  // Teste 3: URL intermediária com parâmetro "d" extrai o destino corretamente
  // -------------------------------------------------------------
  await t.test('3. URL intermediária do AniVideo extrai destino .m3u8 mantendo URL completa', () => {
    const intermediateUrl =
      'https://api.anivideo.net/videohls.php?d=https://cdn-sv01.maximaimg.online/stream/g/gintama/01-02.mp4/index.m3u8';

    // O wrapper intermediário não deve ser inferido diretamente como arquivo de mídia
    assert.strictEqual(inferMediaFormat(intermediateUrl), 'UNKNOWN');

    // A extração estruturada deve identificar o destino real
    const extraction = extractIntermediateMediaDestination(intermediateUrl);
    assert.strictEqual(extraction.isIntermediate, true);
    assert.strictEqual(extraction.valid, true);
    if (extraction.valid) {
      assert.strictEqual(
        extraction.targetUrl,
        'https://cdn-sv01.maximaimg.online/stream/g/gintama/01-02.mp4/index.m3u8'
      );
      assert.strictEqual(extraction.targetFormat, 'HLS');
      assert.strictEqual(extraction.rule.id, 'anivideo_videohls');
    }
  });

  // -------------------------------------------------------------
  // Teste 4: Preserva codificação e parâmetros sem decodificação dupla
  // -------------------------------------------------------------
  await t.test('4. Preserva parâmetros e codificação original evitando decodificação dupla', () => {
    // Parâmetro 'd' com URL codificada contendo token e espaço codificado (%20)
    const encodedInnerUrl =
      'https%3A%2F%2Fcdn.example.org%2Fstream%2Fep01.m3u8%3Ftoken%3Dsecret123%26title%3DMeu%2520Video';
    const intermediateUrl = `https://api.anivideo.net/videohls.php?d=${encodedInnerUrl}`;

    const extraction = extractIntermediateMediaDestination(intermediateUrl);
    assert.strictEqual(extraction.isIntermediate, true);
    assert.strictEqual(extraction.valid, true);
    if (extraction.valid) {
      // O %2520 na consulta original não deve ter sofrido decodificação dupla para espaço puro
      assert.strictEqual(
        extraction.targetUrl,
        'https://cdn.example.org/stream/ep01.m3u8?token=secret123&title=Meu%20Video'
      );
      assert.strictEqual(extraction.targetFormat, 'HLS');
    }
  });

  // -------------------------------------------------------------
  // Teste 5: Parâmetro ausente, vazio ou malformado apresenta erro claro
  // -------------------------------------------------------------
  await t.test('5. Parâmetro ausente em endpoint intermediário retorna erro claro', () => {
    const missingParamUrl = 'https://api.anivideo.net/videohls.php';
    const extraction = extractIntermediateMediaDestination(missingParamUrl);
    assert.strictEqual(extraction.isIntermediate, true);
    assert.strictEqual(extraction.valid, false);
    if (!extraction.valid) {
      assert.strictEqual(extraction.code, 'MISSING_INTERMEDIATE_PARAM');
      assert.ok(extraction.error.includes('requer o parâmetro "d"'));
    }
  });

  await t.test('6. Parâmetro vazio em endpoint intermediário retorna erro claro', () => {
    const emptyParamUrl = 'https://api.anivideo.net/videohls.php?d=';
    const extraction = extractIntermediateMediaDestination(emptyParamUrl);
    assert.strictEqual(extraction.isIntermediate, true);
    assert.strictEqual(extraction.valid, false);
    if (!extraction.valid) {
      assert.strictEqual(extraction.code, 'EMPTY_INTERMEDIATE_PARAM');
      assert.ok(extraction.error.includes('está vazio'));
    }
  });

  await t.test('7. Parâmetro contendo URL sintaticamente malformada retorna erro claro', () => {
    const malformedUrl = 'https://api.anivideo.net/videohls.php?d=isto-nao-e-uma-url';
    const extraction = extractIntermediateMediaDestination(malformedUrl);
    assert.strictEqual(extraction.isIntermediate, true);
    assert.strictEqual(extraction.valid, false);
    if (!extraction.valid) {
      assert.strictEqual(extraction.code, 'INVALID_INTERMEDIATE_URL');
      assert.ok(extraction.error.includes('formato sintático inválido'));
    }
  });

  await t.test('8. Protocolos não-HTTP (ex: file://, ftp://, javascript:) são bloqueados', () => {
    const fileTarget = 'https://api.anivideo.net/videohls.php?d=file:///etc/passwd';
    const extraction = extractIntermediateMediaDestination(fileTarget);
    assert.strictEqual(extraction.isIntermediate, true);
    assert.strictEqual(extraction.valid, false);
    if (!extraction.valid) {
      assert.strictEqual(extraction.code, 'INVALID_PROTOCOL');
      assert.ok(extraction.error.includes('não é permitido'));
    }
  });

  // -------------------------------------------------------------
  // Teste 9: Destino proibido pelas regras SSRF é bloqueado
  // -------------------------------------------------------------
  await t.test('9. Destino que aponta para localhost ou IP privado é bloqueado por SSRF', async () => {
    const localTarget = 'https://api.anivideo.net/videohls.php?d=http://localhost:3000/api/health';
    const extraction = extractIntermediateMediaDestination(localTarget);
    assert.strictEqual(extraction.isIntermediate, true);
    assert.strictEqual(extraction.valid, true);

    if (extraction.valid) {
      const ssrfCheck = await validateUrlForSsrf(extraction.targetUrl);
      assert.strictEqual(ssrfCheck.valid, false);
      assert.ok(ssrfCheck.error?.includes('bloqueado pela política de proteção contra SSRF'));
    }

    const metadataTarget = 'https://api.anivideo.net/videohls.php?d=http://169.254.169.254/latest/meta-data';
    const metaExtraction = extractIntermediateMediaDestination(metadataTarget);
    assert.strictEqual(metaExtraction.isIntermediate, true);
    if (metaExtraction.valid) {
      const ssrfCheck = await validateUrlForSsrf(metaExtraction.targetUrl);
      assert.strictEqual(ssrfCheck.valid, false);
      assert.ok(ssrfCheck.error?.includes('faixa privada') || ssrfCheck.error?.includes('bloqueado'));
    }
  });

  // -------------------------------------------------------------
  // Teste 10: Não presume que todo parâmetro "d" é intermediário (regra controlada)
  // -------------------------------------------------------------
  await t.test('10. Parâmetros "d" em domínios não-intermediários não sofrem interceptação indevida', () => {
    const normalSiteUrl = 'https://noticias.exemplo.com/artigo?d=2026-10-22';
    const extraction = extractIntermediateMediaDestination(normalSiteUrl);
    assert.strictEqual(extraction.isIntermediate, false, 'Domínio comum não deve ser classificado como intermediário');
  });

  // -------------------------------------------------------------
  // Teste 11: Endpoints genéricos compatíveis (/videohls.php) funcionam
  // -------------------------------------------------------------
  await t.test('11. Endpoints genéricos com path /videohls.php são reconhecidos', () => {
    const genericIntermediate = 'https://gateway.meuprovedor.online/videohls.php?d=https://cdn.exemplo.com/live/index.m3u8';
    const extraction = extractIntermediateMediaDestination(genericIntermediate);
    assert.strictEqual(extraction.isIntermediate, true);
    assert.strictEqual(extraction.valid, true);
    if (extraction.valid) {
      assert.strictEqual(extraction.targetUrl, 'https://cdn.exemplo.com/live/index.m3u8');
      assert.strictEqual(extraction.targetFormat, 'HLS');
      assert.strictEqual(extraction.rule.id, 'generic_videohls_endpoint');
    }
  });

  // -------------------------------------------------------------
  // Teste 12: Integração com a rota POST /api/storage/inspect-page
  // -------------------------------------------------------------
  await t.test('12. Rota /api/storage/inspect-page processa URL intermediária e bloqueia SSRF no destino', async () => {
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;

    try {
      // 12.1 Bloqueio de destino proibido por SSRF via rota Express
      const ssrfRes = await fetch(`http://127.0.0.1:${port}/api/storage/inspect-page`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageUrl: 'https://api.anivideo.net/videohls.php?d=http://127.0.0.1:3000/api/health'
        })
      });

      const ssrfData = await ssrfRes.json();
      assert.strictEqual(ssrfRes.status, 400);
      assert.strictEqual(ssrfData.success, false);
      assert.strictEqual(ssrfData.code, 'SSRF_BLOCKED');

      // 12.2 Parâmetro ausente na rota Express
      const missingRes = await fetch(`http://127.0.0.1:${port}/api/storage/inspect-page`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageUrl: 'https://api.anivideo.net/videohls.php'
        })
      });

      const missingData = await missingRes.json();
      assert.strictEqual(missingRes.status, 400);
      assert.strictEqual(missingData.success, false);
      assert.strictEqual(missingData.code, 'MISSING_INTERMEDIATE_PARAM');

      // 12.3 URL direta .m3u8 inexistente que retorna 404 real é tratada como falha sem inventar sucesso
      const notFoundRes = await fetch(`http://127.0.0.1:${port}/api/storage/inspect-page`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageUrl: 'https://raw.githubusercontent.com/404-nonexistent-manifest.m3u8'
        })
      });

      const notFoundData = await notFoundRes.json();
      assert.strictEqual(notFoundRes.status, 200);
      assert.strictEqual(notFoundData.success, true);
      assert.strictEqual(notFoundData.result.sourcesFound[0].accessible, false);
      assert.strictEqual(notFoundData.result.sourcesFound[0].statusCode, 404);
      assert.strictEqual(notFoundData.result.diagnostics.status, 'error');

      // 12.4 URL intermediária cujo destino é um link .m3u8 que retorna 404 real
      const intermediate404Res = await fetch(`http://127.0.0.1:${port}/api/storage/inspect-page`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageUrl: 'https://api.anivideo.net/videohls.php?d=https://raw.githubusercontent.com/404-nonexistent-manifest.m3u8'
        })
      });

      const intermediate404Data = await intermediate404Res.json();
      assert.strictEqual(intermediate404Res.status, 200);
      assert.strictEqual(intermediate404Data.success, true);
      // Confirma que a fonte identificada é a URL real de destino e não a intermediária
      assert.strictEqual(
        intermediate404Data.result.sourcesFound[0].url,
        'https://raw.githubusercontent.com/404-nonexistent-manifest.m3u8'
      );
      assert.strictEqual(intermediate404Data.result.sourcesFound[0].accessible, false);
      assert.strictEqual(intermediate404Data.result.sourcesFound[0].statusCode, 404);
      assert.strictEqual(intermediate404Data.result.diagnostics.status, 'error');
      assert.ok(intermediate404Data.result.diagnostics.summaryMessage.includes('HTTP 404 Not Found'));

      // 12.5 Caso de Sucesso Real do Usuário:
      // URL intermediária com link HLS real ativo
      const userCaseRes = await fetch(`http://127.0.0.1:${port}/api/storage/inspect-page`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageUrl:
            'https://api.anivideo.net/videohls.php?d=https://cdn-sv01.maximaimg.online/stream/g/gintama/01-02.mp4/index.m3u8'
        })
      });

      const userCaseData = await userCaseRes.json();
      assert.strictEqual(userCaseRes.status, 200);
      assert.strictEqual(userCaseData.success, true);
      assert.strictEqual(userCaseData.result.sourcesFound.length, 1);
      // Fonte extraída é o link HLS direto
      assert.strictEqual(
        userCaseData.result.sourcesFound[0].url,
        'https://cdn-sv01.maximaimg.online/stream/g/gintama/01-02.mp4/index.m3u8'
      );
      assert.strictEqual(userCaseData.result.sourcesFound[0].format, 'HLS');
      assert.strictEqual(userCaseData.result.sourcesFound[0].accessible, true);
      assert.strictEqual(userCaseData.result.sourcesFound[0].statusCode, 200);
      assert.strictEqual(userCaseData.result.sourcesFound[0].corsSupported, true);
      assert.strictEqual(userCaseData.result.diagnostics.status, 'direct_source_accessible');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
