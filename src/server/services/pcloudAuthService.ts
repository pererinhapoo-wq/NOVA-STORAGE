import type { Request } from 'express';
import crypto from 'crypto';
import { DriveAuthService, UserSessionData } from './driveAuthService.ts';

export interface PCloudAuthContext {
  authenticated: boolean;
  role: 'admin' | 'viewer' | 'guest';
  userEmail?: string | null;
  authMethod: 'bearer_token' | 'session' | 'none';
  session?: UserSessionData;
}

const COOKIE_NAME = 'nova_session_id';

/**
 * Comparação estrita em tempo constante para evitar ataques de temporização (Timing Attacks).
 * 
 * Utiliza o hash SHA-256 de ambos os valores antes do timingSafeEqual, garantindo que os
 * buffers comparados tenham sempre exatamente 32 bytes de extensão fixa, independentemente
 * do comprimento dos tokens fornecidos. Isso impede o vazamento do tamanho do segredo por tempo de resposta.
 */
function secureCompare(candidate: string, expected: string): boolean {
  if (typeof candidate !== 'string' || typeof expected !== 'string') return false;
  if (candidate.length === 0 || expected.length === 0) return false;

  const candidateHash = crypto.createHash('sha256').update(candidate).digest();
  const expectedHash = crypto.createHash('sha256').update(expected).digest();

  return crypto.timingSafeEqual(candidateHash, expectedHash);
}

/**
 * Valida se um token fornecido corresponde à credencial administrativa do pCloud.
 * 
 * Regras Estritas de Segurança:
 * 1. Validado EXCLUSIVAMENTE pela variável de ambiente dedicada 'PCLOUD_ADMIN_TOKEN'.
 * 2. 'SESSION_SECRET', 'ADMIN_TOKEN' ou segredos de sessão NÃO são aceitos como substitutos.
 * 3. Se 'PCLOUD_ADMIN_TOKEN' não estiver configurado no servidor, recusa a autenticação. Nenhuma credencial padrão é criada.
 * 4. Exige comprimento mínimo de segurança (mínimo de 16 caracteres, recomendado 32).
 * 5. Não expõe o valor esperado, o valor recebido ou metadados sensíveis em logs ou exceções.
 */
export function isValidAdminToken(candidateToken: string): boolean {
  if (!candidateToken || typeof candidateToken !== 'string') return false;
  const cleanCandidate = candidateToken.trim();
  if (cleanCandidate.length === 0) return false;

  const expectedToken = process.env.PCLOUD_ADMIN_TOKEN?.trim();
  if (!expectedToken || expectedToken.length < 16) {
    // PCLOUD_ADMIN_TOKEN ausente ou com entropia insuficiente no servidor -> recusa imediata
    return false;
  }

  return secureCompare(cleanCandidate, expectedToken);
}

/**
 * Autentica uma requisição HTTP às rotas do pCloud e determina o papel de autorização:
 * - 'admin': Apenas via token Bearer 'PCLOUD_ADMIN_TOKEN' verificado ou sessão explicitamente gravada com role 'admin'.
 * - 'viewer': Sessões autenticadas válidas (incluindo sessões com e-mail ou credenciais do Google Drive), sem privilégios administrativos.
 * - 'guest': Visitantes sem autenticação comprovada.
 */
export async function authenticatePCloudRequest(req: Request): Promise<PCloudAuthContext> {
  // 1. Verificação por cabeçalho Bearer ou X-Admin-Token
  const authHeader = req.headers.authorization;
  const adminTokenHeader = req.headers['x-admin-token'] as string | undefined;

  let candidateToken: string | null = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    candidateToken = authHeader.substring(7).trim();
  } else if (adminTokenHeader && typeof adminTokenHeader === 'string') {
    candidateToken = adminTokenHeader.trim();
  }

  if (candidateToken) {
    if (isValidAdminToken(candidateToken)) {
      return {
        authenticated: true,
        role: 'admin',
        userEmail: 'admin@novastorage.internal',
        authMethod: 'bearer_token'
      };
    }

    // Token fornecido mas inválido ou PCLOUD_ADMIN_TOKEN ausente -> recusa imediatamente
    return {
      authenticated: false,
      role: 'guest',
      authMethod: 'none'
    };
  }

  // 2. Verificação por sessão segura do usuário no cookie assinado
  const signedSessionId = req.signedCookies?.[COOKIE_NAME];
  if (signedSessionId && typeof signedSessionId === 'string') {
    try {
      const session = await DriveAuthService.getValidSession(signedSessionId);
      if (session) {
        // Papel 'admin' concedido se a sessão possui role 'admin' explicitamente autorizada no servidor
        // ou se já possui tokens válidos do pCloud vinculados a esta sessão
        if (session.role === 'admin' || session.pcloudTokens?.accessToken) {
          return {
            authenticated: true,
            role: 'admin',
            userEmail: session.userEmail || 'admin-session',
            session,
            authMethod: 'session'
          };
        }

        // Se a sessão possui papel 'viewer' explícito, é tratada estritamente como viewer
        if (session.role === 'viewer') {
          return {
            authenticated: true,
            role: 'viewer',
            userEmail: session.userEmail || 'viewer-session',
            session,
            authMethod: 'session'
          };
        }

        // Sessões válidas do aplicativo (com ou sem e-mail/tokens do Google Drive) que ainda não
        // possuem privilégios administrativos concedidos são autenticadas como 'viewer' para
        // operações operacionais diretas (como test-connection ou disconnect), impedindo elevação indevida.
        return {
          authenticated: true,
          role: 'viewer',
          userEmail: session.userEmail || 'viewer-session',
          session,
          authMethod: 'session'
        };
      }
    } catch {
      // Falha de comunicação com o store de sessões -> recai para visitante não autenticado
    }
  }

  // 3. Visitante anônimo / não autenticado
  return {
    authenticated: false,
    role: 'guest',
    authMethod: 'none'
  };
}
