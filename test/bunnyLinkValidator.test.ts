import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBunnyUrl, isBunnyDomain, isBunnyEmbedDomain } from '../src/services/storage/bunnyLinkValidator.ts';

test('Validação e Segurança do Testador de Links Bunny', async (t) => {
  await t.test('1. Bloqueia strings vazias ou nulas', () => {
    const res = validateBunnyUrl('');
    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.type, 'unsupported');
    assert.match(res.error || '', /informe uma URL/);
  });

  await t.test('2. Bloqueia URLs malformadas sem protocolo ou com formato quebrado', () => {
    const res = validateBunnyUrl('não-é-uma-url');
    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.type, 'unsupported');
    assert.match(res.error || '', /Formato de URL inválido/);
  });

  await t.test('3. Bloqueia conexões inseguras HTTP ou outros protocolos (javascript:, data:)', () => {
    const httpRes = validateBunnyUrl('http://iframe.mediadelivery.net/embed/1234/5678');
    assert.strictEqual(httpRes.isValid, false);
    assert.match(httpRes.error || '', /Apenas URLs seguras com HTTPS/);

    const jsRes = validateBunnyUrl('javascript:alert(1)');
    assert.strictEqual(jsRes.isValid, false);
  });

  await t.test('4. Bloqueia domínios arbitrários e sites de terceiros (Anti-Clickjacking)', () => {
    const blockedDomains = [
      'https://google.com/video.mp4',
      'https://youtube.com/watch?v=123',
      'https://malicious-site.attacker.com/embed/123/456',
      'https://notbunny.b-cdn.net.evil.com/video.mp4'
    ];

    for (const url of blockedDomains) {
      const res = validateBunnyUrl(url);
      assert.strictEqual(res.isValid, false, `Deveria bloquear ${url}`);
      assert.strictEqual(res.type, 'unsupported');
      assert.match(res.error || '', /não autorizado/);
    }
  });

  await t.test('5. Valida Bunny Stream Embed com ID de biblioteca e vídeo', () => {
    const embedUrl = 'https://iframe.mediadelivery.net/embed/15234/9a8b7c6d-1234-5678-90ab-cdef12345678';
    const res = validateBunnyUrl(embedUrl);

    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.type, 'bunny_embed');
    assert.strictEqual(res.detectedFormat, 'EMBED');
    assert.strictEqual(res.details?.libraryId, '15234');
    assert.strictEqual(res.details?.videoId, '9a8b7c6d-1234-5678-90ab-cdef12345678');
    assert.strictEqual(res.normalizedUrl, embedUrl);
  });

  await t.test('6. Normaliza Bunny Stream /play/... para /embed/... preservando tokens', () => {
    const playUrl = 'https://iframe.mediadelivery.net/play/15234/9a8b7c6d?token=sec_token_123&expires=1799999999';
    const res = validateBunnyUrl(playUrl);

    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.type, 'bunny_embed');
    assert.strictEqual(res.hasAuthToken, true);
    assert.strictEqual(res.details?.tokenParamName, 'token');
    assert.strictEqual(res.details?.expiresTimestamp, '1799999999');
    assert.ok(res.details?.expiresFormatted, 'Deve formatar data de expiração');
    // Normalização mantém tokens na query string
    assert.strictEqual(
      res.normalizedUrl,
      'https://iframe.mediadelivery.net/embed/15234/9a8b7c6d?token=sec_token_123&expires=1799999999'
    );
  });

  await t.test('7. Valida link direto de vídeo MP4 em CDN Bunny (*.b-cdn.net)', () => {
    const directMp4 = 'https://vz-742a0b.b-cdn.net/sample-video/play_720p.mp4?token=temp_abc&expires=1850000000';
    const res = validateBunnyUrl(directMp4);

    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.type, 'direct_video');
    assert.strictEqual(res.detectedFormat, 'MP4');
    assert.strictEqual(res.detectedResolution, '720p');
    assert.strictEqual(res.hasAuthToken, true);
    assert.strictEqual(res.normalizedUrl, directMp4);
  });

  await t.test('8. Valida link direto de vídeo WebM em CDN Bunny (*.bunnycdn.com)', () => {
    const directWebm = 'https://myzone.bunnycdn.com/episodes/ep01_1080p.webm';
    const res = validateBunnyUrl(directWebm);

    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.type, 'direct_video');
    assert.strictEqual(res.detectedFormat, 'WEBM');
    assert.strictEqual(res.detectedResolution, '1080p');
    assert.strictEqual(res.hasAuthToken, false);
  });

  await t.test('9. Informa mensagens claras para formatos não suportados nativamente (HLS, MKV, AVI)', () => {
    const hls = validateBunnyUrl('https://vz-123.b-cdn.net/playlist.m3u8');
    assert.strictEqual(hls.isValid, false);
    assert.match(hls.error || '', /HLS \(\.m3u8\)/);

    const mkv = validateBunnyUrl('https://vz-123.b-cdn.net/anime_raw.mkv');
    assert.strictEqual(mkv.isValid, false);
    assert.match(mkv.error || '', /O formato MKV não é suportado/);

    const avi = validateBunnyUrl('https://vz-123.b-cdn.net/old_series.avi');
    assert.strictEqual(avi.isValid, false);
    assert.match(avi.error || '', /O formato AVI não é suportado/);
  });

  await t.test('10. Função isBunnyDomain reconhece sufixos oficiais e rejeita domínios falsos', () => {
    assert.strictEqual(isBunnyDomain('iframe.mediadelivery.net'), true);
    assert.strictEqual(isBunnyDomain('video.mediadelivery.net'), true);
    assert.strictEqual(isBunnyDomain('my-zone.b-cdn.net'), true);
    assert.strictEqual(isBunnyDomain('storage.bunnycdn.com'), true);
    assert.strictEqual(isBunnyDomain('bunny.net'), true);

    assert.strictEqual(isBunnyDomain('fake-b-cdn.net.evil.org'), false);
    assert.strictEqual(isBunnyDomain('mediadelivery.net.attacker.io'), false);
    assert.strictEqual(isBunnyDomain('b-cdn.net.phishing.com'), false);
    assert.strictEqual(isBunnyDomain('google.com'), false);
  });
});
