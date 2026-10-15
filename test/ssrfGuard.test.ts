import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPrivateOrReservedIp,
  validateUrlForSsrf,
  inspectRateLimiter
} from '../src/server/utils/ssrfGuard.ts';

test('Proteção e Guardião Rigoroso contra SSRF', async (t) => {
  await t.test('1. Bloqueia endereços de loopback IPv4 e IPv6', () => {
    assert.strictEqual(isPrivateOrReservedIp('127.0.0.1'), true);
    assert.strictEqual(isPrivateOrReservedIp('127.255.255.255'), true);
    assert.strictEqual(isPrivateOrReservedIp('::1'), true);
    assert.strictEqual(isPrivateOrReservedIp('::'), true);
  });

  await t.test('2. Bloqueia serviço de metadados de nuvem (169.254.169.254) e faixas link-local', () => {
    assert.strictEqual(isPrivateOrReservedIp('169.254.169.254'), true);
    assert.strictEqual(isPrivateOrReservedIp('169.254.0.1'), true);
    assert.strictEqual(isPrivateOrReservedIp('fe80::1'), true);
  });

  await t.test('3. Bloqueia faixas de rede privada RFC 1918 (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)', () => {
    assert.strictEqual(isPrivateOrReservedIp('10.0.0.1'), true);
    assert.strictEqual(isPrivateOrReservedIp('10.255.255.255'), true);
    assert.strictEqual(isPrivateOrReservedIp('172.16.0.1'), true);
    assert.strictEqual(isPrivateOrReservedIp('172.31.255.255'), true);
    assert.strictEqual(isPrivateOrReservedIp('192.168.1.1'), true);
    assert.strictEqual(isPrivateOrReservedIp('192.168.254.254'), true);
    assert.strictEqual(isPrivateOrReservedIp('fc00::1'), true);
    assert.strictEqual(isPrivateOrReservedIp('fd00::1'), true);
  });

  await t.test('4. Bloqueia Carrier-Grade NAT (100.64.0.0/10) e multicast', () => {
    assert.strictEqual(isPrivateOrReservedIp('100.64.0.1'), true);
    assert.strictEqual(isPrivateOrReservedIp('100.127.255.255'), true);
    assert.strictEqual(isPrivateOrReservedIp('224.0.0.1'), true);
    assert.strictEqual(isPrivateOrReservedIp('240.0.0.1'), true);
  });

  await t.test('5. Permite endereços IP públicos legítimos da Internet', () => {
    assert.strictEqual(isPrivateOrReservedIp('8.8.8.8'), false); // Google DNS
    assert.strictEqual(isPrivateOrReservedIp('1.1.1.1'), false); // Cloudflare DNS
    assert.strictEqual(isPrivateOrReservedIp('151.101.1.69'), false);
  });

  await t.test('6. Valida URLs e bloqueia protocolos não-HTTP (file, ftp, gopher, javascript)', async () => {
    const fileRes = await validateUrlForSsrf('file:///etc/passwd');
    assert.strictEqual(fileRes.valid, false);
    assert.match(fileRes.error || '', /Protocolo.*não permitido/);

    const ftpRes = await validateUrlForSsrf('ftp://1.1.1.1/video.mp4');
    assert.strictEqual(ftpRes.valid, false);

    const gopherRes = await validateUrlForSsrf('gopher://127.0.0.1:70');
    assert.strictEqual(gopherRes.valid, false);
  });

  await t.test('7. Bloqueia credenciais ou senhas embutidas na URL', async () => {
    const res = await validateUrlForSsrf('https://admin:supersecret@1.1.1.1/video.mp4');
    assert.strictEqual(res.valid, false);
    assert.match(res.error || '', /credenciais ou senhas embutidas/);
  });

  await t.test('8. Bloqueia acessos diretos para localhost e metadados de nuvem', async () => {
    const localhostRes = await validateUrlForSsrf('http://localhost:3000/api/health');
    assert.strictEqual(localhostRes.valid, false);
    assert.match(localhostRes.error || '', /bloqueado pela política de proteção contra SSRF/);

    const metadataRes = await validateUrlForSsrf('http://169.254.169.254/latest/meta-data');
    assert.strictEqual(metadataRes.valid, false);
    assert.match(metadataRes.error || '', /bloqueado|faixa privada/);
  });

  await t.test('9. Rate limiter bloqueia requisições em excesso por IP', () => {
    const testIp = '203.0.113.199';
    // Faz 20 requisições (limite)
    for (let i = 0; i < 20; i++) {
      assert.strictEqual(inspectRateLimiter.isRateLimited(testIp), false);
    }
    // A 21ª requisição deve ser bloqueada
    assert.strictEqual(inspectRateLimiter.isRateLimited(testIp), true);
  });
});
