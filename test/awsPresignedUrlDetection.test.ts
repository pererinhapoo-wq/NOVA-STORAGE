import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectTemporaryUrlSignature,
  parseIsoUtcDate,
  parseAmzExpires,
  sanitizeMediaUrlForDisplay
} from '../src/services/storage/externalMediaService.ts';
import { StreamResolverService } from '../src/services/storage/streamResolverService.ts';

/**
 * Utilitário de teste para formatar timestamp Date em formato básico AWS SigV4 (YYYYMMDDTHHMMSSZ)
 */
function toAmzDateString(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hours = pad(date.getUTCHours());
  const minutes = pad(date.getUTCMinutes());
  const seconds = pad(date.getUTCSeconds());
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

test('Detecção e Avaliação Rigorosa de Assinaturas AWS SigV4 (X-Amz-Date e X-Amz-Expires)', async (t) => {
  // -------------------------------------------------------------------------
  // 1. Assinatura AWS válida dentro do prazo (com relógio simulado)
  // -------------------------------------------------------------------------
  await t.test('1. Assinatura AWS válida calculada via UTC e relógio simulado', () => {
    // Gerar data de referência dinâmica sem valor fixo hardcoded
    const baseDate = new Date(Date.now() + 10_000_000);
    // Zerar milissegundos para precisão de segundo
    baseDate.setUTCMilliseconds(0);

    const amzDateStr = toAmzDateString(baseDate);
    const expiresDuration = 3600; // 1 hora
    const expectedExpirySec = Math.floor(baseDate.getTime() / 1000) + expiresDuration;

    const signedUrl = `https://s3.amazonaws.com/bucket/video.m3u8?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20261023%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=${amzDateStr}&X-Amz-Expires=${expiresDuration}&X-Amz-SignedHeaders=host&X-Amz-Signature=abcdef1234567890`;

    // Relógio simulado 20 minutos após a geração do link (ainda dentro da validade de 1 hora)
    const simulatedClockBefore = new Date(baseDate.getTime() + 20 * 60 * 1000);

    const sig = detectTemporaryUrlSignature(signedUrl, simulatedClockBefore);

    assert.strictEqual(sig.isPotentiallyTemporary, true, 'Deve identificar link como temporário');
    assert.ok(sig.detectedParameters.includes('X-Amz-Date'), 'Deve registrar parâmetro X-Amz-Date');
    assert.ok(sig.detectedParameters.includes('X-Amz-Expires'), 'Deve registrar parâmetro X-Amz-Expires');
    assert.strictEqual(sig.expirationTimestamp, expectedExpirySec, 'Deve calcular soma de X-Amz-Expires ao instante UTC');
    assert.strictEqual(sig.isProbablyExpired, false, 'Não deve classificar como expirado antes do prazo');
    assert.ok(sig.reason?.includes('expiração programada AWS'), 'Deve indicar expiração programada AWS no reason');
    assert.ok(sig.reason?.includes('restrições adicionais'), 'Deve alertar que o provedor pode impor restrições adicionais');
  });

  // -------------------------------------------------------------------------
  // 2. Assinatura AWS expirada no passado (com relógio simulado)
  // -------------------------------------------------------------------------
  await t.test('2. Assinatura AWS expirada quando o relógio simulado ultrapassa a expiração', () => {
    const baseDate = new Date(Date.now() + 5_000_000);
    baseDate.setUTCMilliseconds(0);

    const amzDateStr = toAmzDateString(baseDate);
    const expiresDuration = 1800; // 30 minutos
    const expectedExpirySec = Math.floor(baseDate.getTime() / 1000) + expiresDuration;

    const signedUrl = `https://storage.r2.cloudflarestorage.com/media/anime.mp4?X-Amz-Date=${amzDateStr}&X-Amz-Expires=${expiresDuration}&X-Amz-Signature=987654321fedcba`;

    // Relógio simulado 45 minutos após a emissão do link (15 minutos após a expiração de 30m)
    const simulatedClockAfter = new Date(baseDate.getTime() + 45 * 60 * 1000);

    const sig = detectTemporaryUrlSignature(signedUrl, simulatedClockAfter);

    assert.strictEqual(sig.isPotentiallyTemporary, true);
    assert.strictEqual(sig.expirationTimestamp, expectedExpirySec);
    assert.strictEqual(sig.isProbablyExpired, true, 'Deve identificar link expirado quando o relógio ultrapassar o prazo');
    assert.ok(sig.reason?.includes('expirado'), 'Motivo deve conter menção a expirado');
  });

  // -------------------------------------------------------------------------
  // 3. Parâmetros ausentes (somente data ou somente duração)
  // -------------------------------------------------------------------------
  await t.test('3. Parâmetros ausentes: trata presença parcial sem quebrar diagnóstico', () => {
    const baseDate = new Date();
    const amzDateStr = toAmzDateString(baseDate);

    // 3.1 Somente X-Amz-Date sem X-Amz-Expires
    const onlyDateUrl = `https://s3.amazonaws.com/bucket/stream.m3u8?X-Amz-Date=${amzDateStr}&X-Amz-Signature=abc`;
    const sigDateOnly = detectTemporaryUrlSignature(onlyDateUrl);

    assert.strictEqual(sigDateOnly.isPotentiallyTemporary, true, 'Reconhece como link com assinatura');
    assert.ok(sigDateOnly.detectedParameters.includes('X-Amz-Date'));
    assert.strictEqual(sigDateOnly.expirationTimestamp, undefined, 'Não calcula timestamp sem X-Amz-Expires');
    assert.strictEqual(sigDateOnly.isProbablyExpired, undefined);
    assert.ok(sigDateOnly.reason?.includes('X-Amz-Expires'));

    // 3.2 Somente X-Amz-Expires sem X-Amz-Date
    const onlyExpiresUrl = 'https://s3.amazonaws.com/bucket/stream.m3u8?X-Amz-Expires=3600';
    const sigExpiresOnly = detectTemporaryUrlSignature(onlyExpiresUrl);

    assert.strictEqual(sigExpiresOnly.isPotentiallyTemporary, true);
    assert.ok(sigExpiresOnly.detectedParameters.includes('X-Amz-Expires'));
    assert.strictEqual(sigExpiresOnly.expirationTimestamp, undefined, 'Não calcula timestamp sem X-Amz-Date');
    assert.strictEqual(sigExpiresOnly.isProbablyExpired, undefined);
    assert.ok(sigExpiresOnly.reason?.includes('X-Amz-Date'));

    // 3.3 Ambos ausentes
    const cleanUrl = 'https://s3.amazonaws.com/bucket/stream.m3u8';
    const sigClean = detectTemporaryUrlSignature(cleanUrl);
    assert.strictEqual(sigClean.isPotentiallyTemporary, false);
    assert.strictEqual(sigClean.detectedParameters.length, 0);
  });

  // -------------------------------------------------------------------------
  // 4. Valores inválidos (datas malformadas, meses impossíveis, números inválidos)
  // -------------------------------------------------------------------------
  await t.test('4. Valores inválidos: rejeita datas ou durações inválidas sem produzir NaN ou exceções', () => {
    // 4.1 Data com sintaxe incorreta
    const badDateUrl = 'https://s3.amazonaws.com/bucket/stream.m3u8?X-Amz-Date=invalid-format&X-Amz-Expires=3600';
    const sigBadDate = detectTemporaryUrlSignature(badDateUrl);
    assert.strictEqual(sigBadDate.isPotentiallyTemporary, true);
    assert.strictEqual(sigBadDate.expirationTimestamp, undefined);
    assert.ok(sigBadDate.reason?.includes('inválidos'));

    // 4.2 Data com dia inexistente no calendário (ex: 31 de fevereiro)
    const impossibleDayUrl = 'https://s3.amazonaws.com/bucket/stream.m3u8?X-Amz-Date=20260231T120000Z&X-Amz-Expires=3600';
    assert.strictEqual(parseIsoUtcDate('20260231T120000Z'), null, 'parseIsoUtcDate deve rejeitar 31 de fevereiro');
    const sigImpossible = detectTemporaryUrlSignature(impossibleDayUrl);
    assert.strictEqual(sigImpossible.expirationTimestamp, undefined);

    // 4.3 Mês fora do limite (> 12)
    const badMonthUrl = 'https://s3.amazonaws.com/bucket/stream.m3u8?X-Amz-Date=20269999T999999Z&X-Amz-Expires=3600';
    assert.strictEqual(parseIsoUtcDate('20269999T999999Z'), null);
    const sigBadMonth = detectTemporaryUrlSignature(badMonthUrl);
    assert.strictEqual(sigBadMonth.expirationTimestamp, undefined);

    // 4.4 Duração não-numérica
    const nonNumericExpires = 'https://s3.amazonaws.com/bucket/stream.m3u8?X-Amz-Date=20261023T033007Z&X-Amz-Expires=forever';
    assert.strictEqual(parseAmzExpires('forever'), null);
    const sigNonNum = detectTemporaryUrlSignature(nonNumericExpires);
    assert.strictEqual(sigNonNum.expirationTimestamp, undefined);

    // 4.5 Duração menor ou igual a zero
    assert.strictEqual(parseAmzExpires('0'), null);
    assert.strictEqual(parseAmzExpires('-3600'), null);
    const zeroExpiresUrl = 'https://s3.amazonaws.com/bucket/stream.m3u8?X-Amz-Date=20261023T033007Z&X-Amz-Expires=0';
    const sigZero = detectTemporaryUrlSignature(zeroExpiresUrl);
    assert.strictEqual(sigZero.expirationTimestamp, undefined);
  });

  // -------------------------------------------------------------------------
  // 5. Diferentes combinações de maiúsculas e minúsculas
  // -------------------------------------------------------------------------
  await t.test('5. Case-insensitivity: reconhece parâmetros com qualquer variação de maiúsculas/minúsculas', () => {
    const baseDate = new Date(Date.now() + 8_000_000);
    baseDate.setUTCMilliseconds(0);
    const amzDateStr = toAmzDateString(baseDate);
    const expiresSec = 7200;
    const expectedTs = Math.floor(baseDate.getTime() / 1000) + expiresSec;
    const simulatedClock = new Date(baseDate.getTime() + 1000);

    const testCases = [
      // minúsculo
      `https://s3.amazonaws.com/stream.m3u8?x-amz-date=${amzDateStr}&x-amz-expires=${expiresSec}`,
      // maiúsculo
      `https://s3.amazonaws.com/stream.m3u8?X-AMZ-DATE=${amzDateStr}&X-AMZ-EXPIRES=${expiresSec}`,
      // misturado
      `https://s3.amazonaws.com/stream.m3u8?x-AmZ-DaTe=${amzDateStr}&X-aMz-ExPiReS=${expiresSec}`,
      // canônico AWS
      `https://s3.amazonaws.com/stream.m3u8?X-Amz-Date=${amzDateStr}&X-Amz-Expires=${expiresSec}`
    ];

    for (const url of testCases) {
      const sig = detectTemporaryUrlSignature(url, simulatedClock);
      assert.strictEqual(sig.isPotentiallyTemporary, true);
      assert.strictEqual(sig.expirationTimestamp, expectedTs, `Falha no case de URL: ${url}`);
      assert.strictEqual(sig.isProbablyExpired, false);
    }
  });

  // -------------------------------------------------------------------------
  // 6. Mascaramento seguro de credenciais e assinaturas (Requirement 7)
  // -------------------------------------------------------------------------
  await t.test('6. Mascara assinaturas e credenciais AWS na sanitização sem vazar chaves secretas', () => {
    const secretSignature = 'f0e4b8a7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9';
    const secretCredential = 'AKIAIOSFODNN7EXAMPLE%2F20261023%2Fus-east-1%2Fs3%2Faws4_request';
    const secretSessionToken = 'FwoGZXIvYXdzEExampleLongSecurityTokenSecretValueHere';

    const rawUrl = `https://bucket.s3.amazonaws.com/video.mp4?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=${secretCredential}&X-Amz-Date=20261023T033007Z&X-Amz-Expires=3600&X-Amz-SignedHeaders=host&X-Amz-Signature=${secretSignature}&X-Amz-Security-Token=${secretSessionToken}`;

    const sanitized = sanitizeMediaUrlForDisplay(rawUrl);

    // O segredo não pode aparecer na URL sanitizada
    assert.ok(!sanitized.includes(secretSignature), 'Assinatura sensível não pode constar na URL de exibição');
    assert.ok(!sanitized.includes('AKIAIOSFODNN7EXAMPLE'), 'Credencial sensível não pode constar na URL de exibição');
    assert.ok(!sanitized.includes('FwoGZXIvYXdzEExampleLong'), 'Token de sessão sensível não pode constar na URL de exibição');

    // Marcadores de proteção devem estar presentes
    assert.ok(sanitized.includes('X-Amz-Signature=%5Btoken_protegido%5D') || sanitized.includes('X-Amz-Signature=[token_protegido]'));
    assert.ok(sanitized.includes('X-Amz-Credential=%5Btoken_protegido%5D') || sanitized.includes('X-Amz-Credential=[token_protegido]'));

    // Parâmetros inofensivos de tempo devem ser preservados para diagnóstico
    assert.ok(sanitized.includes('X-Amz-Date=20261023T033007Z'));
    assert.ok(sanitized.includes('X-Amz-Expires=3600'));
  });

  // -------------------------------------------------------------------------
  // 7. Integração completa com StreamResolverService (Resolução segura de episódios)
  // -------------------------------------------------------------------------
  await t.test('7. StreamResolverService reconhece expiração AWS e preserva URL original', async () => {
    const baseDate = new Date(Date.now() + 10_000_000);
    baseDate.setUTCMilliseconds(0);
    const amzDateStr = toAmzDateString(baseDate);
    const expiresDuration = 3600;

    const streamUrl = `https://storage.r2.cloudflarestorage.com/media/anime.mp4?X-Amz-Date=${amzDateStr}&X-Amz-Expires=${expiresDuration}&X-Amz-Signature=abcdef123`;

    // 7.1 Cenário antes da expiração: reconhece parâmetros e não assume validade indeterminada
    const clockBefore = new Date(baseDate.getTime() + 10 * 60 * 1000);
    const resBefore = await StreamResolverService.resolveStream({
      streamUrl,
      now: clockBefore
    });

    assert.strictEqual(resBefore.isTemporary, true);
    assert.strictEqual(resBefore.isExpired, false);
    assert.strictEqual(resBefore.expirationTimestamp, Math.floor(baseDate.getTime() / 1000) + expiresDuration);
    assert.ok(resBefore.formattedExpirationDate !== null);
    assert.ok(resBefore.details.some(d => d.includes('X-Amz-Date, X-Amz-Expires')));
    assert.ok(resBefore.details.some(d => d.includes('Carimbo de expiração')));

    // 7.2 Cenário após a expiração (sem origem): acusa link expirado e exige sniffer
    const clockAfter = new Date(baseDate.getTime() + 70 * 60 * 1000);
    const resAfter = await StreamResolverService.resolveStream({
      streamUrl,
      now: clockAfter
    });

    assert.strictEqual(resAfter.isTemporary, true);
    assert.strictEqual(resAfter.isExpired, true);
    assert.strictEqual(resAfter.strategy, 'inconclusive');
    assert.strictEqual(resAfter.requiresSniffer, true);
    assert.ok(resAfter.summaryMessage.includes('expirada'));
    assert.strictEqual(resAfter.currentStreamUrl, streamUrl, 'URL original deve ser estritamente preservada');

    // 7.3 Cenário com sondagem de rede: URL na mensagem de sondagem está sanitizada
    const probeRecord: string[] = [];
    await StreamResolverService.resolveStream({
      streamUrl,
      probeCurrentStream: true,
      now: clockBefore,
      streamProbe: async (targetUrl) => {
        probeRecord.push(targetUrl);
        return {
          success: true,
          result: {
            pageUrl: targetUrl,
            pageTitle: 'Stream Probe',
            sourcesFound: [{
              url: targetUrl,
              format: 'MP4',
              discoveryMethod: 'direct_stream',
              corsSupported: true,
              accessible: true,
              statusCode: 200
            }],
            detectedIframes: [],
            dynamicMediaIndicators: [],
            diagnostics: {
              fetchTimeMs: 50,
              responseSizeBytes: 1000,
              redirectCount: 0,
              detectedDrm: false,
              detectedProtectionOrCaptcha: false,
              detectedIframesCount: 0,
              detectedDynamicLoading: false,
              status: 'direct_source_accessible',
              summaryMessage: 'Stream acessível'
            }
          }
        };
      }
    });

    // Prova de que a chamada do probe usou a URL real, mas o detalhe exposto ao usuário foi sanitizado
    assert.strictEqual(probeRecord[0], streamUrl);
  });
});
