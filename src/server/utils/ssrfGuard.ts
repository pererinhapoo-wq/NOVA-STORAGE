import dns from 'node:dns';
import net from 'node:net';

/**
 * Validador e Guardião contra ataques SSRF (Server-Side Request Forgery),
 * DNS Rebinding, Acesso a Metadados de Nuvem e Redirecionamentos Não Autorizados.
 */

export interface SsrfValidationResult {
  valid: boolean;
  error?: string;
  url?: URL;
  resolvedIps?: string[];
}

export interface SafeFetchResult {
  body: string;
  finalUrl: string;
  contentType: string;
  status: number;
  headers: Record<string, string>;
  responseSizeBytes: number;
  redirectCount: number;
  isMediaStream?: boolean;
}

/**
 * Determina se um endereço IPv4 está em faixas privadas, loopback ou reservadas.
 */
function isPrivateOrReservedIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
    return true; // Formato inválido é considerado inseguro
  }

  const [a, b] = parts;

  // 0.0.0.0/8 (Current network)
  if (a === 0) return true;

  // 10.0.0.0/8 (Rede privada RFC 1918)
  if (a === 10) return true;

  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;

  // 100.64.0.0/10 (Carrier-Grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true;

  // 169.254.0.0/16 (Link-Local e Provedores de Nuvem - ex: 169.254.169.254 metadata)
  if (a === 169 && b === 254) return true;

  // 172.16.0.0/12 (Rede privada RFC 1918)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.0.0.0/24 (IETF Protocol Assignments)
  if (a === 192 && b === 0 && parts[2] === 0) return true;

  // 192.0.2.0/24 (TEST-NET-1)
  if (a === 192 && b === 0 && parts[2] === 2) return true;

  // 192.168.0.0/16 (Rede privada RFC 1918)
  if (a === 192 && b === 168) return true;

  // 198.51.100.0/24 (TEST-NET-2)
  if (a === 198 && b === 51 && parts[2] === 100) return true;

  // 203.0.113.0/24 (TEST-NET-3)
  if (a === 203 && b === 0 && parts[2] === 113) return true;

  // 224.0.0.0/4 (Multicast)
  if (a >= 224 && a <= 239) return true;

  // 240.0.0.0/4 (Reservado para uso futuro)
  if (a >= 240) return true;

  return false;
}

/**
 * Determina se um endereço IPv6 está em faixas privadas, loopback ou reservadas.
 */
function isPrivateOrReservedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  // Loopback (::1) ou Não especificado (::)
  if (normalized === '::1' || normalized === '::') return true;

  // Link-Local (fe80::/10)
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) {
    return true;
  }

  // Unique Local Address - Privado (fc00::/7 - fc.. ou fd..)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) {
    return true;
  }

  // IPv4-Mapped IPv6 Address (::ffff:192.0.2.128)
  if (normalized.includes('::ffff:')) {
    const ipv4Part = normalized.split('::ffff:')[1];
    if (ipv4Part && net.isIPv4(ipv4Part)) {
      return isPrivateOrReservedIPv4(ipv4Part);
    }
    return true;
  }

  return false;
}

/**
 * Verifica se um endereço IP (v4 ou v6) é privado ou reservado.
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  if (!ip) return true;

  const version = net.isIP(ip);
  if (version === 4) {
    return isPrivateOrReservedIPv4(ip);
  }
  if (version === 6) {
    return isPrivateOrReservedIPv6(ip);
  }

  return true; // Se não for IP reconhecido, bloqueia preventivamente
}

/**
 * Validação rigorosa de URL contra SSRF antes de qualquer requisição.
 */
export async function validateUrlForSsrf(
  rawUrl: string,
  allowedProtocols = ['https:', 'http:']
): Promise<SsrfValidationResult> {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) {
    return { valid: false, error: 'URL vazia ou não informada.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: 'A URL informada possui formato sintático inválido.' };
  }

  // 1. Verificação de Protocolo
  if (!allowedProtocols.includes(parsed.protocol)) {
    return {
      valid: false,
      error: `Protocolo "${parsed.protocol}" não permitido. Apenas ${allowedProtocols.join(' e ')} são aceitos.`
    };
  }

  // 2. Bloqueio de credenciais embutidas na URL (ex: https://user:pass@host)
  if (parsed.username || parsed.password) {
    return {
      valid: false,
      error: 'URLs com credenciais ou senhas embutidas não são permitidas por motivos de segurança.'
    };
  }

  const hostname = parsed.hostname.toLowerCase();

  // 3. Bloqueio direto de hostnames locais conhecidos
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname === 'metadata.google.internal' ||
    hostname === '169.254.169.254'
  ) {
    return {
      valid: false,
      error: `Acesso ao host "${hostname}" bloqueado pela política de proteção contra SSRF.`
    };
  }

  // 4. Se o hostname já for um IP direto, valida imediatamente sem DNS
  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      return {
        valid: false,
        error: `O endereço IP "${hostname}" pertence a uma faixa privada, local ou reservada e foi bloqueado.`
      };
    }
    return {
      valid: true,
      url: parsed,
      resolvedIps: [hostname]
    };
  }

  // 5. Resolução DNS e verificação de todos os IPs retornados
  try {
    const lookupResults = await dns.promises.lookup(hostname, { all: true });

    if (!lookupResults || lookupResults.length === 0) {
      return {
        valid: false,
        error: `Não foi possível resolver o domínio "${hostname}" via DNS.`
      };
    }

    const resolvedIps = lookupResults.map(r => r.address);

    for (const res of lookupResults) {
      if (isPrivateOrReservedIp(res.address)) {
        return {
          valid: false,
          error: `O domínio "${hostname}" resolveu para o IP protegido/privado ${res.address} (bloqueio SSRF ativado).`
        };
      }
    }

    return {
      valid: true,
      url: parsed,
      resolvedIps
    };
  } catch (err: any) {
    return {
      valid: false,
      error: `Falha na resolução de DNS para "${hostname}": ${err?.message || 'Host desconhecido'}`
    };
  }
}

/**
 * Busca segura com limites estritos de tamanho, tempo e redirecionamentos.
 */
export async function safeFetchPageWithLimits(
  targetUrl: string,
  options: {
    maxRedirects?: number;
    maxSizeBytes?: number;
    timeoutMs?: number;
  } = {}
): Promise<SafeFetchResult> {
  const maxRedirects = options.maxRedirects ?? 3;
  const maxSizeBytes = options.maxSizeBytes ?? 512 * 1024; // 512 KB
  const timeoutMs = options.timeoutMs ?? 5000; // 5 segundos

  let currentUrl = targetUrl;
  let redirectCount = 0;

  while (redirectCount <= maxRedirects) {
    // 1. Validação SSRF do endereço em cada salto
    const validation = await validateUrlForSsrf(currentUrl);
    if (!validation.valid || !validation.url) {
      throw new Error(`SSRF_BLOCKED: ${validation.error}`);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(currentUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 NOVA-STORAGE-Inspector/1.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
        },
        redirect: 'manual', // Controle manual estrito de redirecionamentos
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // 2. Trata redirecionamentos manuais com validação no próximo ciclo
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) {
          throw new Error('Redirecionamento recebido sem cabeçalho Location.');
        }

        const nextUrl = new URL(location, currentUrl).toString();
        redirectCount++;
        currentUrl = nextUrl;
        continue;
      }

      // 3. Lê o corpo da resposta respeitando o limite máximo de bytes
      const contentType = response.headers.get('content-type') || 'text/html';
      const lowerContentType = contentType.toLowerCase();
      const isMediaContent =
        lowerContentType.startsWith('video/') ||
        lowerContentType.startsWith('audio/') ||
        lowerContentType.includes('application/vnd.apple.mpegurl') ||
        lowerContentType.includes('application/x-mpegurl');

      if (isMediaContent) {
        const reader = response.body?.getReader();
        if (reader) {
          try {
            await reader.cancel();
          } catch {
            // Ignora erro ao cancelar stream de mídia
          }
        }

        const headersMap: Record<string, string> = {};
        response.headers.forEach((v, k) => {
          headersMap[k.toLowerCase()] = v;
        });

        return {
          body: '',
          finalUrl: currentUrl,
          contentType,
          status: response.status,
          headers: headersMap,
          responseSizeBytes: 0,
          redirectCount,
          isMediaStream: true
        };
      }

      const reader = response.body?.getReader();

      if (!reader) {
        throw new Error('Corpo de resposta indisponível.');
      }

      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (value) {
          totalBytes += value.length;
          if (totalBytes > maxSizeBytes) {
            reader.cancel();
            throw new Error(`RESPONSE_TOO_LARGE: A página excedeu o limite máximo de ${maxSizeBytes / 1024} KB.`);
          }
          chunks.push(value);
        }
      }

      const buffer = Buffer.concat(chunks);
      const body = buffer.toString('utf-8');

      const headersMap: Record<string, string> = {};
      response.headers.forEach((v, k) => {
        headersMap[k.toLowerCase()] = v;
      });

      return {
        body,
        finalUrl: currentUrl,
        contentType,
        status: response.status,
        headers: headersMap,
        responseSizeBytes: totalBytes,
        redirectCount
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`TIMEOUT: A requisição excedeu o limite de ${timeoutMs / 1000} segundos.`);
      }
      throw err;
    }
  }

  throw new Error(`MAX_REDIRECTS_EXCEEDED: O servidor ultrapassou o limite de ${maxRedirects} redirecionamentos.`);
}

/**
 * Limitador de taxa (Rate Limiter) simples em memória por IP
 */
class InMemoryRateLimiter {
  private requests = new Map<string, number[]>();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(windowMs = 60000, maxRequests = 20) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  isRateLimited(clientIp: string): boolean {
    const now = Date.now();
    const timestamps = (this.requests.get(clientIp) || []).filter(t => now - t < this.windowMs);

    if (timestamps.length >= this.maxRequests) {
      return true;
    }

    timestamps.push(now);
    this.requests.set(clientIp, timestamps);
    return false;
  }
}

export const inspectRateLimiter = new InMemoryRateLimiter(60000, 20); // 20 requisições por minuto por IP
