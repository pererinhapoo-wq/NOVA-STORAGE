import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMuxInput, parseMuxToken } from '../src/services/storage/muxLinkValidator.ts';

test('Validação e Segurança do Testador de Vídeos Mux', async (t) => {
  await t.test('1. Bloqueia entradas vazias ou em branco', () => {
    const res = validateMuxInput('');
    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.inputType, 'unsupported');
    assert.match(res.error || '', /insira um Playback ID/);
  });

  await t.test('2. Valida Playback ID público direto do Mux', () => {
    const playbackId = 'sFk98Z01abcDEF234567';
    const res = validateMuxInput(playbackId);

    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.playbackId, playbackId);
    assert.strictEqual(res.inputType, 'playback_id');
    assert.strictEqual(res.streamUrl, `https://stream.mux.com/${playbackId}.m3u8`);
    assert.strictEqual(res.thumbnailUrl, `https://image.mux.com/${playbackId}/thumbnail.jpg`);
    assert.strictEqual(res.hasToken, false);
    assert.strictEqual(res.isSigned, false);
  });

  await t.test('3. Limpa extensão .m3u8 digitada acidentalmente no campo de Playback ID', () => {
    const res = validateMuxInput('a4ashK2mO123.m3u8');
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.playbackId, 'a4ashK2mO123');
    assert.strictEqual(res.streamUrl, 'https://stream.mux.com/a4ashK2mO123.m3u8');
  });

  await t.test('4. Valida URL completa oficial do Mux (stream.mux.com)', () => {
    const url = 'https://stream.mux.com/00abcd1234efgh5678.m3u8';
    const res = validateMuxInput(url);

    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.inputType, 'stream_url');
    assert.strictEqual(res.playbackId, '00abcd1234efgh5678');
    assert.strictEqual(res.streamUrl, url);
  });

  await t.test('5. Bloqueia conexões HTTP não seguras', () => {
    const res = validateMuxInput('http://stream.mux.com/test12345.m3u8');
    assert.strictEqual(res.isValid, false);
    assert.match(res.error || '', /Apenas URLs seguras com HTTPS/);
  });

  await t.test('6. Bloqueia domínios de terceiros e sites arbitrários (Anti-SSRF)', () => {
    const blockedUrls = [
      'https://malicious.com/stream.m3u8',
      'https://stream.mux.com.attacker.org/video.m3u8',
      'https://youtube.com/watch?v=12345'
    ];

    for (const url of blockedUrls) {
      const res = validateMuxInput(url);
      assert.strictEqual(res.isValid, false, `Deveria bloquear ${url}`);
      assert.match(res.error || '', /não autorizado/);
    }
  });

  await t.test('7. Suporta token de assinatura na query string da URL', () => {
    const token = 'header.payload.signature';
    const url = `https://stream.mux.com/playId1234.m3u8?token=${token}`;
    const res = validateMuxInput(url);

    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.hasToken, true);
    assert.strictEqual(res.isSigned, true);
    assert.strictEqual(res.playbackId, 'playId1234');
    assert.ok(res.streamUrl.includes(`token=${token}`));
    assert.ok(res.thumbnailUrl.includes(`token=${token}`));
  });

  await t.test('8. Suporta fornecimento de token JWT no campo opcional', () => {
    // Cria um payload JWT simulado com expiração futura
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const payloadJson = JSON.stringify({ sub: 'playId999', aud: 'video', exp: futureExp });
    const b64Payload = Buffer.from(payloadJson).toString('base64url');
    const mockJwt = `eyJhbGciOiJIUzI1NiJ9.${b64Payload}.mock_sig_hash`;

    const res = validateMuxInput('playId999', mockJwt);
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.isSigned, true);
    assert.strictEqual(res.tokenDetails?.isJwtFormat, true);
    assert.strictEqual(res.tokenDetails?.subject, 'playId999');
    assert.strictEqual(res.tokenDetails?.expiresTimestamp, futureExp);
    assert.strictEqual(res.tokenDetails?.isExpired, false);
    assert.ok(res.tokenDetails?.expiresFormatted);
  });

  await t.test('9. Alerta se o token JWT fornecido já estiver expirado', () => {
    const pastExp = Math.floor(Date.now() / 1000) - 1000;
    const payloadJson = JSON.stringify({ sub: 'playIdExpired', exp: pastExp });
    const b64Payload = Buffer.from(payloadJson).toString('base64url');
    const expiredJwt = `eyJhbGciOiJIUzI1NiJ9.${b64Payload}.mock_sig`;

    const details = parseMuxToken(expiredJwt);
    assert.ok(details);
    assert.strictEqual(details.isExpired, true);
  });

  await t.test('10. Rejeita caracteres inválidos em Playback ID direto', () => {
    const invalidIds = ['id with spaces', 'id<script>', 'id/with/slashes', 'id!@#$'];
    for (const invalid of invalidIds) {
      const res = validateMuxInput(invalid);
      assert.strictEqual(res.isValid, false, `Deveria rejeitar ${invalid}`);
      assert.match(res.error || '', /Playback ID inválido/);
    }
  });
});
