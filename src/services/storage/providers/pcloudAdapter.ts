import { StorageProviderAdapter, ProviderConnectionTestResult, RemoteFileMetadata } from '../storageAdapter.interface.ts';
import { ProviderStatus, ProviderType } from '../../../types/storage.ts';

export interface PCloudFileLinkResponse {
  success: boolean;
  fileId?: string;
  streamUrl?: string;
  expiresAt?: string;
  expiresTimestamp?: number | null;
  sizeBytes?: number;
  hosts?: string[];
  code?: string;
  message?: string;
}

/**
 * PCloudStorageAdapter
 * 
 * Conector cliente para o provedor de armazenamento pCloud via rotas de backend protegidas.
 * 
 * Princípios Estritos de Segurança Frontend:
 * - O frontend NUNCA manipula, recebe ou armazena o token administrativo (PCLOUD_ADMIN_TOKEN).
 * - A autenticação e a autorização baseiam-se exclusivamente na sessão segura por cookie assinado (credentials: 'include').
 * - Nenhuma credencial ou token sensível é enviado pelo navegador em cabeçalhos Bearer.
 * - Apenas arquivos catalogados e autorizados pelo servidor têm links emitidos a partir do fileId permanente.
 */
export class PCloudStorageAdapter implements StorageProviderAdapter {
  readonly providerType: ProviderType = 'pcloud';
  readonly providerName: string = 'pCloud';

  private lastKnownStatus: ProviderStatus = 'not_configured';

  constructor() {
    // O adaptador frontend não armazena credenciais administrativas.
    // Todas as solicitações dependem da sessão segura do servidor.
  }

  private getRequestHeaders(contentType?: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'X-Nova-Client': 'storage-v1'
    };
    if (contentType) {
      headers['Content-Type'] = contentType;
    }
    return headers;
  }

  getStatus(): ProviderStatus {
    return this.lastKnownStatus;
  }

  /**
   * Executa a verificação segura de status e conexão contra o backend da aplicação
   * Utiliza exclusivamente a sessão autenticada por cookie do usuário.
   */
  async testConnection(_config?: Record<string, string>): Promise<ProviderConnectionTestResult> {
    try {
      const response = await fetch('/api/storage/pcloud/test-connection', {
        method: 'POST',
        headers: this.getRequestHeaders('application/json'),
        credentials: 'include'
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        this.lastKnownStatus = response.status === 401 || response.status === 403 ? 'error' : 'not_configured';
        return {
          success: false,
          code: response.status === 401 ? 'NOT_CONFIGURED' : (data.code || 'NOT_CONFIGURED'),
          message: data.message || `Erro no servidor backend (HTTP ${response.status}).`,
          checkedAt: new Date().toISOString()
        };
      }

      if (data.status === 'connected') {
        this.lastKnownStatus = 'connected';
        return {
          success: true,
          code: 'OK',
          message: data.message || 'Conexão com a API oficial do pCloud verificada com sucesso.',
          checkedAt: data.checkedAt || new Date().toISOString(),
          details: data.details
        };
      }

      if (data.status === 'invalid_credentials') {
        this.lastKnownStatus = 'error';
        return {
          success: false,
          code: 'INVALID_CREDENTIALS',
          message: data.message || 'Credenciais pCloud rejeitadas pela API oficial (token inválido ou expirado).',
          checkedAt: data.checkedAt || new Date().toISOString()
        };
      }

      this.lastKnownStatus = 'not_configured';
      return {
        success: false,
        code: 'NOT_CONFIGURED',
        message: data.message || 'Variável PCLOUD_ACCESS_TOKEN não configurada no servidor Vercel.',
        checkedAt: data.checkedAt || new Date().toISOString()
      };
    } catch {
      this.lastKnownStatus = 'error';
      return {
        success: false,
        code: 'NOT_CONFIGURED',
        message: 'Não foi possível contatar o servidor backend para verificar o pCloud.',
        checkedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Consulta o status do pCloud no backend utilizando a sessão segura
   */
  async getBackendStatus(): Promise<{
    configured: boolean;
    connected: boolean;
    status: ProviderStatus;
    message: string;
    details?: Record<string, unknown>;
  }> {
    try {
      const res = await fetch('/api/storage/pcloud/status', {
        headers: this.getRequestHeaders(),
        credentials: 'include'
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          configured: false,
          connected: false,
          status: 'not_configured',
          message: data.message || `HTTP ${res.status}: Autenticação necessária.`
        };
      }
      return {
        configured: Boolean(data.configured),
        connected: Boolean(data.connected),
        status: data.status === 'connected' ? 'connected' : 'not_configured',
        message: data.message || '',
        details: data.details
      };
    } catch (err: any) {
      return {
        configured: false,
        connected: false,
        status: 'not_configured',
        message: err.message || 'Servidor backend offline.'
      };
    }
  }

  /**
   * Obtém a URL oficial de autorização OAuth do pCloud gerada no servidor
   */
  async getOAuthUrl(): Promise<{
    url: string;
    state: string;
    redirectUri: string;
    trustedOrigin: string;
  }> {
    const res = await fetch('/api/storage/pcloud/auth-url', {
      headers: this.getRequestHeaders(),
      credentials: 'include'
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || `HTTP ${res.status}: Não foi possível obter URL OAuth do pCloud.`);
    }

    return data;
  }

  /**
   * Solicita ao backend a geração de um link de streaming direto para um arquivo permanente do pCloud
   * Requer que o arquivo esteja autorizado no catálogo do servidor.
   */
  async getFileLink(fileId: string | number): Promise<PCloudFileLinkResponse> {
    const cleanId = String(fileId).trim();
    if (!cleanId) {
      return {
        success: false,
        code: 'MISSING_FILE_ID',
        message: 'Identificador do arquivo no pCloud (fileId) é obrigatório.'
      };
    }

    try {
      const res = await fetch('/api/storage/pcloud/file-link', {
        method: 'POST',
        headers: this.getRequestHeaders('application/json'),
        credentials: 'include',
        body: JSON.stringify({ fileId: cleanId })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          success: false,
          code: data.code || `HTTP_${res.status}`,
          message: data.message || `Erro HTTP ${res.status} ao solicitar link ao pCloud.`
        };
      }

      return data as PCloudFileLinkResponse;
    } catch (err: any) {
      return {
        success: false,
        code: 'NETWORK_ERROR',
        message: err?.message || 'Falha de comunicação com o backend ao solicitar link ao pCloud.'
      };
    }
  }

  /**
   * Implementação da interface StorageProviderAdapter para emissão de link assinado/direto
   */
  async generateSignedStreamToken(fileRemoteId: string): Promise<{
    streamUrl: string | null;
    expiresInSeconds: number;
    notice: string;
  }> {
    const result = await this.getFileLink(fileRemoteId);

    if (result.success && result.streamUrl) {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const expiresInSeconds = result.expiresTimestamp && result.expiresTimestamp > nowSeconds
        ? result.expiresTimestamp - nowSeconds
        : 0;

      return {
        streamUrl: result.streamUrl,
        expiresInSeconds,
        notice: 'Link de streaming direto gerado pela API oficial do pCloud com suporte nativo a HTTP Range (206).'
      };
    }

    return {
      streamUrl: null,
      expiresInSeconds: 0,
      notice: result.message || 'Não foi possível gerar link de streaming para este arquivo no pCloud.'
    };
  }

  /**
   * Listagem de pasta remota: mantida vazia
   */
  async listFolderContents(_folderRemoteId?: string): Promise<RemoteFileMetadata[]> {
    return [];
  }
}
