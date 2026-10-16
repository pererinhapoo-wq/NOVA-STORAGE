import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectTemporaryUrlSignature,
  sanitizeMediaUrlForDisplay,
  evaluateMediaSourceValidation,
  ExtractedMediaSource
} from '../src/services/storage/externalMediaService.ts';

test('Validação Robusta de Fontes de Vídeo, Links Temporários e Sanitização Segura', async (t) => {
  // -------------------------------------------------------------
  // Bloco 1: Detecção de URLs Potencialmente Temporárias e Assinadas
  // -------------------------------------------------------------
  await t.test('1. Identifica parâmetros de assinatura de CDN e expiração temporal', () => {
    const signedUrl = 'https://cdn.exemplo.com/hls/ep01.m3u8?token=abcdef123456&expires=1893456000';
    const sig = detectTemporaryUrlSignature(signedUrl);

    assert.strictEqual(sig.isPotentiallyTemporary, true);
    assert.ok(sig.detectedParameters.includes('token'));
    assert.ok(sig.detectedParameters.includes('expires'));
    assert.strictEqual(sig.expirationTimestamp, 1893456000);
    assert.strictEqual(sig.isProbablyExpired, false, 'Data no futuro não deve ser classificada como expirada');
  });

  await t.test('2. Sinaliza timestamp de expiração que já se encontra no passado', () => {
    // Timestamp 1600000000 (ano 2020)
    const expiredUrl = 'https://stream.storage.net/video.mp4?exp=1600000000&sig=9876543210';
    const sig = detectTemporaryUrlSignature(expiredUrl);

    assert.strictEqual(sig.isPotentiallyTemporary, true);
    assert.ok(sig.detectedParameters.includes('exp'));
    assert.ok(sig.detectedParameters.includes('sig'));
    assert.strictEqual(sig.isProbablyExpired, true, 'Timestamp no passado deve ser identificado como provavelmente expirado');
    assert.ok(sig.reason?.includes('expirado'));
  });

  await t.test('3. Não acusa falsos positivos em URLs estáticas ou públicas sem tokens', () => {
    const cleanUrl = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
    const sig = detectTemporaryUrlSignature(cleanUrl);

    assert.strictEqual(sig.isPotentiallyTemporary, false);
    assert.strictEqual(sig.detectedParameters.length, 0);
  });

  // -------------------------------------------------------------
  // Bloco 2: Mascaramento Seguro de Parâmetros Sensíveis
  // -------------------------------------------------------------
  await t.test('4. Mascara tokens, assinaturas e chaves sensíveis na URL de exibição', () => {
    const rawUrl = 'https://cdn.privada.org/video.mp4?token=super_secret_token_xyz999&signature=sha256_sig_abc123&v=1&resolution=1080p';
    const sanitized = sanitizeMediaUrlForDisplay(rawUrl);

    assert.ok(!sanitized.includes('super_secret_token_xyz999'), 'Token secreto não deve estar visível');
    assert.ok(!sanitized.includes('sha256_sig_abc123'), 'Assinatura secreta não deve estar visível');
    assert.ok(sanitized.includes('[token_protegido]'), 'Deve substituir o valor por marcador seguro');
    assert.ok(sanitized.includes('resolution=1080p'), 'Parâmetros públicos inofensivos devem ser preservados');
  });

  await t.test('5. Garante que a sanitização NÃO altera o objeto da URL original usada pelo player', () => {
    const originalUrl = 'https://storage.googleapis.com/secure/file.mp4?key=my_sensitive_key_456&h=hash123';
    const source: ExtractedMediaSource = {
      url: originalUrl,
      format: 'MP4',
      discoveryMethod: 'direct_stream',
      corsSupported: true,
      accessible: true,
      statusCode: 200
    };

    const evaluation = evaluateMediaSourceValidation({
      source,
      playbackState: 'idle'
    });

    // A URL original no source deve permanecer idêntica para o player reproduzir
    assert.strictEqual(source.url, originalUrl, 'A URL interna do objeto ExtractedMediaSource não pode ser alterada');
    // A URL sanitizada deve proteger os dados
    assert.strictEqual(evaluation.sanitizedUrl.includes('my_sensitive_key_456'), false);
    assert.ok(evaluation.sanitizedUrl.includes('[token_protegido]'));
  });

  // -------------------------------------------------------------
  // Bloco 3: Validação dos Sete (7) Estados Exatos
  // -------------------------------------------------------------
  await t.test('6. Estado 1: URL Detectada, mas ainda não testada (detected_untested)', () => {
    const source: ExtractedMediaSource = {
      url: 'https://exemplo.com/stream.m3u8',
      format: 'HLS',
      discoveryMethod: 'video_tag',
      corsSupported: null,
      accessible: null
    };

    const evaluation = evaluateMediaSourceValidation({
      source,
      playbackState: 'idle'
    });

    assert.strictEqual(evaluation.state, 'detected_untested');
    assert.strictEqual(evaluation.stateLabel, '1. URL Detectada (Não Testada)');
    assert.ok(evaluation.summaryMessage.includes('Aguardando teste'));
  });

  await t.test('7. Estado 2: Servidor Acessível (server_accessible) - HTTP 200/206 no probe, antes do play', () => {
    const source: ExtractedMediaSource = {
      url: 'https://cdn.exemplo.com/video.mp4',
      format: 'MP4',
      discoveryMethod: 'direct_stream',
      corsSupported: true,
      accessible: true,
      statusCode: 206,
      supportsRange: true
    };

    const evaluation = evaluateMediaSourceValidation({
      source,
      playbackState: 'idle'
    });

    assert.strictEqual(evaluation.state, 'server_accessible');
    assert.strictEqual(evaluation.stateLabel, '2. Servidor Acessível');
    assert.ok(evaluation.summaryMessage.includes('HTTP 206'));
    assert.ok(evaluation.summaryMessage.includes('Range 206 Ativo'));
  });

  await t.test('8. Regra Crítica: HTTP 200 ou 206 isoladamente NUNCA é classificado como reprodução confirmada', () => {
    const source: ExtractedMediaSource = {
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      format: 'MP4',
      discoveryMethod: 'direct_stream',
      corsSupported: true,
      accessible: true,
      statusCode: 200
    };

    // Estado do player é 'canplay' ou 'idle', NÃO 'playing'
    const evalCanPlay = evaluateMediaSourceValidation({
      source,
      playbackState: 'canplay'
    });

    assert.notStrictEqual(evalCanPlay.state, 'playback_confirmed', 'HTTP 200 isolado não pode confirmar reprodução');
    assert.strictEqual(evalCanPlay.state, 'server_accessible');
  });

  await t.test('9. Estado 3: Reprodução Realmente Confirmada (playback_confirmed) - evento playing', () => {
    const source: ExtractedMediaSource = {
      url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
      format: 'HLS',
      discoveryMethod: 'direct_stream',
      corsSupported: true,
      accessible: true,
      statusCode: 200
    };

    const evaluation = evaluateMediaSourceValidation({
      source,
      playbackState: 'playing' // Reprodução ativa com decodificação no navegador
    });

    assert.strictEqual(evaluation.state, 'playback_confirmed');
    assert.strictEqual(evaluation.stateLabel, '3. Reprodução Confirmada');
    assert.ok(evaluation.summaryMessage.includes('Reprodução em andamento confirmada pelo navegador'));
  });

  await t.test('10. Estado 4: Link Temporário ou Potencialmente Expirado (temporary_or_expired)', () => {
    const source: ExtractedMediaSource = {
      url: 'https://cdn.temp.tv/ep.mp4?token=abcde12345&expires=1600000000',
      format: 'MP4',
      discoveryMethod: 'direct_stream',
      corsSupported: false,
      accessible: false,
      statusCode: 403
    };

    const evaluation = evaluateMediaSourceValidation({
      source,
      playbackState: 'error',
      playbackErrorDetail: 'HTTP 403 Forbidden'
    });

    assert.strictEqual(evaluation.state, 'temporary_or_expired');
    assert.strictEqual(evaluation.stateLabel, '4. Link Temporário / Potencialmente Expirado');
    assert.strictEqual(evaluation.isTemporary, true);
    assert.ok(evaluation.summaryMessage.includes('Link com assinatura temporária que pode ter expirado'));
  });

  await t.test('11. Estado 5: Acesso Negado pelo Servidor (access_denied) - HTTP 403 sem token', () => {
    const source: ExtractedMediaSource = {
      url: 'https://storage.googleapis.com/meu-bucket-privado/filme.mp4',
      format: 'MP4',
      discoveryMethod: 'video_tag',
      corsSupported: true,
      accessible: false,
      statusCode: 403
    };

    const evaluation = evaluateMediaSourceValidation({
      source,
      playbackState: 'idle'
    });

    assert.strictEqual(evaluation.state, 'access_denied');
    assert.strictEqual(evaluation.stateLabel, '5. Acesso Negado pelo Servidor');
    assert.strictEqual(evaluation.isTemporary, false);
    assert.ok(evaluation.summaryMessage.includes('Acesso negado pelo servidor remoto (HTTP 403)'));
  });

  await t.test('12. Estado 6: Falha de Reprodução com Causa Evidente (playback_failed) - CORS bloqueado', () => {
    const source: ExtractedMediaSource = {
      url: 'https://cdn.sem-cors.com/stream.m3u8',
      format: 'HLS',
      discoveryMethod: 'source_tag',
      corsSupported: false, // Evidência clara de ausência de CORS
      accessible: true,
      statusCode: 200
    };

    const evaluation = evaluateMediaSourceValidation({
      source,
      playbackState: 'error',
      playbackErrorDetail: 'Erro de rede ou bloqueio de CORS'
    });

    assert.strictEqual(evaluation.state, 'playback_failed');
    assert.strictEqual(evaluation.stateLabel, '6. Falha de Reprodução com Causa Evidente');
    assert.ok(evaluation.evidence.some(e => e.includes('Access-Control-Allow-Origin')));
  });

  await t.test('13. Estado 6: Falha de Reprodução com Causa Evidente (playback_failed) - Arquivo 404', () => {
    const source: ExtractedMediaSource = {
      url: 'https://cdn.exemplo.com/inexistente.mp4',
      format: 'MP4',
      discoveryMethod: 'direct_stream',
      corsSupported: true,
      accessible: false,
      statusCode: 404
    };

    const evaluation = evaluateMediaSourceValidation({
      source,
      playbackState: 'error',
      playbackErrorDetail: 'HTTP 404 Not Found'
    });

    assert.strictEqual(evaluation.state, 'playback_failed');
    assert.ok(evaluation.evidence.some(e => e.includes('404 Not Found')));
  });

  await t.test('14. Estado 7: Resultado Inconclusivo (inconclusive) - Erro sem evidência conclusiva', () => {
    const source: ExtractedMediaSource = {
      url: 'https://servidor-desconhecido.com/stream.mp4',
      format: 'MP4',
      discoveryMethod: 'direct_stream',
      corsSupported: true,
      accessible: true,
      statusCode: 200
    };

    // Navegador dá erro 4 (MEDIA_ERR_SRC_NOT_SUPPORTED) sem detalhes de rede ou recusa de servidor
    const evaluation = evaluateMediaSourceValidation({
      source,
      playbackState: 'error',
      playbackErrorDetail: 'Fonte não suportada ou não pôde ser carregada',
      browserErrorCode: 4
    });

    assert.strictEqual(evaluation.state, 'inconclusive');
    assert.strictEqual(evaluation.stateLabel, '7. Resultado Inconclusivo');
    assert.ok(evaluation.summaryMessage.includes('Resultado inconclusivo'));
    assert.ok(evaluation.summaryMessage.includes('não existem evidências suficientes'));
  });
});
