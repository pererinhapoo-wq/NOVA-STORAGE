import test from 'node:test';
import assert from 'node:assert/strict';
import { PCloudService } from '../src/server/services/pcloudService.ts';
import { PCloudStorageAdapter } from '../src/services/storage/providers/pcloudAdapter.ts';
import { pcloudRouter } from '../src/server/routes/pcloud.ts';
import { DriveAuthService } from '../src/server/services/driveAuthService.ts';

test('Segurança e Autenticação Administrativa das Rotas pCloud - Etapa 3', async (t) => {
  const originalEnv = { ...process.env };
  const VALID_PCLOUD_ADMIN_TOKEN = 'pcloud_exclusive_admin_secret_32_chars';

  t.beforeEach(() => {
    DriveAuthService.setRedisClient(null);
    DriveAuthService.resetInMemoryDevStore();
    PCloudService.resetAuthorizedFiles();
  });

  t.afterEach(() => {
    process.env = { ...originalEnv };
    DriveAuthService.setRedisClient(null);
    DriveAuthService.resetInMemoryDevStore();
    PCloudService.resetAuthorizedFiles();
  });

  // -------------------------------------------------------------
  // Regressão 1: SESSION_SECRET NÃO Concede Acesso Administrativo por Bearer
  // -------------------------------------------------------------
  await t.test('1. Um SESSION_SECRET correto enviado como Bearer NÃO concede acesso administrativo', async () => {
    const SERVER_SESSION_SECRET = 'a_very_secure_random_session_secret_32_chars';
    process.env.SESSION_SECRET = SERVER_SESSION_SECRET;
    process.env.PCLOUD_ADMIN_TOKEN = VALID_PCLOUD_ADMIN_TOKEN;

    await new Promise<void>((resolve) => {
      let statusCode = 200;
      const fakeReq: any = {
        method: 'POST',
        url: '/pcloud/test-connection',
        headers: {
          'content-type': 'application/json',
          'authorization': `Bearer ${SERVER_SESSION_SECRET}`
        },
        body: {},
        signedCookies: {}
      };
      const fakeRes: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(data: any) {
          assert.strictEqual(statusCode, 401, 'SESSION_SECRET não pode ser aceito como credencial administrativa');
          assert.strictEqual(data?.code, 'AUTH_REQUIRED');
          resolve();
          return this;
        }
      };
      pcloudRouter(fakeReq, fakeRes, () => resolve());
    });
  });

  // -------------------------------------------------------------
  // Regressão 2: ADMIN_TOKEN Legado NÃO Concede Acesso Administrativo
  // -------------------------------------------------------------
  await t.test('2. Um ADMIN_TOKEN legado não concede acesso administrativo (exige PCLOUD_ADMIN_TOKEN)', async () => {
    const LEGACY_ADMIN_TOKEN = 'legacy_generic_admin_token_32_characters';
    process.env.ADMIN_TOKEN = LEGACY_ADMIN_TOKEN;
    delete process.env.PCLOUD_ADMIN_TOKEN;

    await new Promise<void>((resolve) => {
      let statusCode = 200;
      const fakeReq: any = {
        method: 'POST',
        url: '/pcloud/test-connection',
        headers: {
          'content-type': 'application/json',
          'authorization': `Bearer ${LEGACY_ADMIN_TOKEN}`
        },
        body: {},
        signedCookies: {}
      };
      const fakeRes: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(data: any) {
          assert.strictEqual(statusCode, 401, 'ADMIN_TOKEN genérico não deve ser aceito sem PCLOUD_ADMIN_TOKEN');
          assert.strictEqual(data?.code, 'AUTH_REQUIRED');
          resolve();
          return this;
        }
      };
      pcloudRouter(fakeReq, fakeRes, () => resolve());
    });
  });

  // -------------------------------------------------------------
  // Regressão 3: PCLOUD_ADMIN_TOKEN Correto Concede Acesso Administrativo
  // -------------------------------------------------------------
  await t.test('3. Um PCLOUD_ADMIN_TOKEN correto concede acesso administrativo nas condições previstas', async () => {
    process.env.PCLOUD_ADMIN_TOKEN = VALID_PCLOUD_ADMIN_TOKEN;
    process.env.PCLOUD_ACCESS_TOKEN = 'valid_pcloud_storage_api_token';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: any) => {
      const url = String(input);
      if (url.includes('/userinfo')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            result: 0,
            userid: 778899,
            email: 'admin@novastorage.io',
            quota: 21474836480,
            usedquota: 1048576,
            premium: true
          })
        } as any;
      }
      return originalFetch(input);
    };

    try {
      await new Promise<void>((resolve) => {
        let statusCode = 200;
        const fakeReq: any = {
          method: 'POST',
          url: '/pcloud/test-connection',
          headers: {
            'content-type': 'application/json',
            'authorization': `Bearer ${VALID_PCLOUD_ADMIN_TOKEN}`
          },
          body: {},
          signedCookies: {}
        };
        const fakeRes: any = {
          status(code: number) {
            statusCode = code;
            return this;
          },
          json(data: any) {
            assert.strictEqual(statusCode, 200);
            assert.strictEqual(data?.status, 'connected');
            assert.strictEqual(data?.code, 'OK');
            assert.strictEqual(data?.details?.email, 'a***n@novastorage.io');
            resolve();
            return this;
          }
        };
        pcloudRouter(fakeReq, fakeRes, () => resolve());
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // -------------------------------------------------------------
  // Regressão 4: Token Incorreto ou Ausente é Recusado
  // -------------------------------------------------------------
  await t.test('4. Token incorreto ou ausente é prontamente recusado com HTTP 401', async () => {
    process.env.PCLOUD_ADMIN_TOKEN = VALID_PCLOUD_ADMIN_TOKEN;

    // 4.1 Token incorreto
    await new Promise<void>((resolve) => {
      let statusCode = 200;
      const fakeReq: any = {
        method: 'POST',
        url: '/pcloud/test-connection',
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer token_completamente_incorreto_xyz'
        },
        body: {},
        signedCookies: {}
      };
      const fakeRes: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(data: any) {
          assert.strictEqual(statusCode, 401);
          assert.strictEqual(data?.code, 'AUTH_REQUIRED');
          resolve();
          return this;
        }
      };
      pcloudRouter(fakeReq, fakeRes, () => resolve());
    });

    // 4.2 Token ausente (sem header e sem cookie)
    await new Promise<void>((resolve) => {
      let statusCode = 200;
      const fakeReq: any = {
        method: 'POST',
        url: '/pcloud/test-connection',
        headers: { 'content-type': 'application/json' },
        body: {},
        signedCookies: {}
      };
      const fakeRes: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(data: any) {
          assert.strictEqual(statusCode, 401);
          assert.strictEqual(data?.code, 'AUTH_REQUIRED');
          resolve();
          return this;
        }
      };
      pcloudRouter(fakeReq, fakeRes, () => resolve());
    });

    // 4.3 PCLOUD_ADMIN_TOKEN não configurado no servidor
    delete process.env.PCLOUD_ADMIN_TOKEN;
    await new Promise<void>((resolve) => {
      let statusCode = 200;
      const fakeReq: any = {
        method: 'POST',
        url: '/pcloud/test-connection',
        headers: {
          'content-type': 'application/json',
          'authorization': `Bearer ${VALID_PCLOUD_ADMIN_TOKEN}`
        },
        body: {},
        signedCookies: {}
      };
      const fakeRes: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(data: any) {
          assert.strictEqual(statusCode, 401, 'Sem PCLOUD_ADMIN_TOKEN configurado, nenhum Bearer é aceito');
          assert.strictEqual(data?.code, 'AUTH_REQUIRED');
          resolve();
          return this;
        }
      };
      pcloudRouter(fakeReq, fakeRes, () => resolve());
    });
  });

  // -------------------------------------------------------------
  // Regressão 5: Sessão com E-mail Não Se Torna Admin Automaticamente
  // -------------------------------------------------------------
  await t.test('5. Uma sessão com e-mail, mas sem papel administrativo explicitamente autorizado, NÃO se torna admin', async () => {
    process.env.PCLOUD_ADMIN_TOKEN = VALID_PCLOUD_ADMIN_TOKEN;

    const session = await DriveAuthService.createSession();
    // Sessão possui e-mail cadastrado, mas NÃO possui role: 'admin'
    session.userEmail = 'usuario_comum@gmail.com';
    await DriveAuthService.saveSession(session);

    await new Promise<void>((resolve) => {
      let statusCode = 200;
      const fakeReq: any = {
        method: 'POST',
        url: '/pcloud/test-connection',
        headers: {
          'content-type': 'application/json',
          'x-nova-client': 'storage-v1',
          'origin': 'http://localhost:3000'
        },
        body: {},
        signedCookies: { nova_session_id: session.id }
      };
      const fakeRes: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(data: any) {
          assert.strictEqual(statusCode, 403, 'Sessão apenas com e-mail não deve executar operações de administrador');
          assert.strictEqual(data?.code, 'FORBIDDEN');
          assert.ok(data?.message?.includes('apenas administradores autorizados'));
          resolve();
          return this;
        }
      };
      pcloudRouter(fakeReq, fakeRes, () => resolve());
    });
  });

  // -------------------------------------------------------------
  // Regressão 6: Sessão do Google Drive Não Recebe Privilégios de Admin
  // -------------------------------------------------------------
  await t.test('6. Uma sessão comum do Google Drive NÃO recebe privilégios administrativos por compatibilidade', async () => {
    process.env.PCLOUD_ADMIN_TOKEN = VALID_PCLOUD_ADMIN_TOKEN;

    const session = await DriveAuthService.createSession();
    // Simula sessão conectada ao Google Drive com tokens OAuth e e-mail
    session.userEmail = 'google_drive_user@gmail.com';
    session.tokens = {
      access_token: 'google_oauth_access_token_xyz',
      refresh_token: 'google_oauth_refresh_token_abc',
      scope: DriveAuthService.REQUIRED_SCOPE,
      token_type: 'Bearer',
      expiry_date: Date.now() + 3600 * 1000
    };
    await DriveAuthService.saveSession(session);

    // Tentativa de executar test-connection (operação administrativa)
    await new Promise<void>((resolve) => {
      let statusCode = 200;
      const fakeReq: any = {
        method: 'POST',
        url: '/pcloud/test-connection',
        headers: {
          'content-type': 'application/json',
          'x-nova-client': 'storage-v1',
          'origin': 'http://localhost:3000'
        },
        body: {},
        signedCookies: { nova_session_id: session.id }
      };
      const fakeRes: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(data: any) {
          assert.strictEqual(statusCode, 403, 'Sessão do Google Drive não deve herdar papel de admin do pCloud');
          assert.strictEqual(data?.code, 'FORBIDDEN');
          resolve();
          return this;
        }
      };
      pcloudRouter(fakeReq, fakeRes, () => resolve());
    });
  });

  // -------------------------------------------------------------
  // Regressão 7: Usuários "viewer" Impedidos de Testar Conexão e Acessar Não Autorizados
  // -------------------------------------------------------------
  await t.test('7. Usuários "viewer" continuam impedidos de testar conexão e acessar arquivos não autorizados', async () => {
    process.env.PCLOUD_ADMIN_TOKEN = VALID_PCLOUD_ADMIN_TOKEN;
    process.env.PCLOUD_ACCESS_TOKEN = 'token_teste_ok';

    const session = await DriveAuthService.createSession();
    session.role = 'viewer';
    session.userEmail = 'viewer@novastorage.io';
    await DriveAuthService.saveSession(session);

    // 7.1 Impedido de testar conexão
    await new Promise<void>((resolve) => {
      let statusCode = 200;
      const fakeReq: any = {
        method: 'POST',
        url: '/pcloud/test-connection',
        headers: {
          'content-type': 'application/json',
          'x-nova-client': 'storage-v1',
          'origin': 'http://localhost:3000'
        },
        body: {},
        signedCookies: { nova_session_id: session.id }
      };
      const fakeRes: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(data: any) {
          assert.strictEqual(statusCode, 403);
          assert.strictEqual(data?.code, 'FORBIDDEN');
          resolve();
          return this;
        }
      };
      pcloudRouter(fakeReq, fakeRes, () => resolve());
    });

    // 7.2 Impedido de obter link para fileId não autorizado (IDOR bloqueado)
    await new Promise<void>((resolve) => {
      let statusCode = 200;
      const fakeReq: any = {
        method: 'POST',
        url: '/pcloud/file-link',
        headers: {
          'content-type': 'application/json',
          'x-nova-client': 'storage-v1',
          'origin': 'http://localhost:3000'
        },
        body: { fileId: '99999999' }, // Arquivo não autorizado
        signedCookies: { nova_session_id: session.id }
      };
      const fakeRes: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(data: any) {
          assert.strictEqual(statusCode, 403);
          assert.strictEqual(data?.code, 'FILE_NOT_AUTHORIZED');
          assert.ok(data?.message?.includes('não pertence ao catálogo autorizado'));
          resolve();
          return this;
        }
      };
      pcloudRouter(fakeReq, fakeRes, () => resolve());
    });
  });

  // -------------------------------------------------------------
  // Regressão 8: Rotas pCloud Recusam Visitantes Anônimos e Preservam Autorização de Arquivos
  // -------------------------------------------------------------
  await t.test('8. As rotas pCloud recusam anônimos (401) e preservam autorização de arquivos no catálogo (200)', async () => {
    process.env.PCLOUD_ADMIN_TOKEN = VALID_PCLOUD_ADMIN_TOKEN;
    process.env.PCLOUD_ACCESS_TOKEN = 'token_teste_ok';

    // 8.1 Visitante anônimo em GET /status é recusado com 401
    await new Promise<void>((resolve) => {
      let statusCode = 200;
      const fakeReq: any = {
        method: 'GET',
        url: '/pcloud/status',
        headers: { accept: 'application/json' },
        signedCookies: {}
      };
      const fakeRes: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(data: any) {
          assert.strictEqual(statusCode, 401);
          assert.strictEqual(data?.code, 'AUTH_REQUIRED');
          resolve();
          return this;
        }
      };
      pcloudRouter(fakeReq, fakeRes, () => resolve());
    });

    // 8.2 Visitante anônimo em POST /file-link é recusado com 401
    await new Promise<void>((resolve) => {
      let statusCode = 200;
      const fakeReq: any = {
        method: 'POST',
        url: '/pcloud/file-link',
        headers: { 'content-type': 'application/json' },
        body: { fileId: '12345678' },
        signedCookies: {}
      };
      const fakeRes: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(data: any) {
          assert.strictEqual(statusCode, 401);
          assert.strictEqual(data?.code, 'AUTH_REQUIRED');
          resolve();
          return this;
        }
      };
      pcloudRouter(fakeReq, fakeRes, () => resolve());
    });

    // 8.3 Usuário autenticado ('viewer') solicitando fileId AUTORIZADO obtém 200 OK
    PCloudService.authorizeFile('55443322');

    const session = await DriveAuthService.createSession();
    session.role = 'viewer';
    await DriveAuthService.saveSession(session);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: any) => {
      const url = String(input);
      if (url.includes('/getfilelink')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            result: 0,
            expires: 'Sat, 24 Oct 2026 23:00:00 +0000',
            hosts: ['p-ams2.pcloud.com'],
            path: '/stream/authorized_ep02.mp4',
            size: 800000000
          })
        } as any;
      }
      return originalFetch(input);
    };

    try {
      await new Promise<void>((resolve) => {
        let statusCode = 200;
        const fakeReq: any = {
          method: 'POST',
          url: '/pcloud/file-link',
          headers: {
            'content-type': 'application/json',
            'x-nova-client': 'storage-v1',
            'origin': 'http://localhost:3000'
          },
          body: { fileId: '55443322' },
          signedCookies: { nova_session_id: session.id }
        };
        const fakeRes: any = {
          status(code: number) {
            statusCode = code;
            return this;
          },
          json(data: any) {
            assert.strictEqual(statusCode, 200);
            assert.strictEqual(data?.success, true);
            assert.strictEqual(data?.fileId, '55443322');
            assert.strictEqual(data?.streamUrl, 'https://p-ams2.pcloud.com/stream/authorized_ep02.mp4');
            resolve();
            return this;
          }
        };
        pcloudRouter(fakeReq, fakeRes, () => resolve());
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // -------------------------------------------------------------
  // Regressão 9: Defesa Contra SSRF e Host Arbitrário
  // -------------------------------------------------------------
  await t.test('9. Injeção de host customizado pelo cliente é barrada pelo guardião SSRF', async () => {
    process.env.PCLOUD_ADMIN_TOKEN = VALID_PCLOUD_ADMIN_TOKEN;

    await new Promise<void>((resolve) => {
      let statusCode = 200;
      const fakeReq: any = {
        method: 'POST',
        url: '/pcloud/file-link',
        headers: {
          'content-type': 'application/json',
          'authorization': `Bearer ${VALID_PCLOUD_ADMIN_TOKEN}`
        },
        body: {
          fileId: '55443322',
          host: '127.0.0.1' // Injeção de loopback
        },
        signedCookies: {}
      };
      const fakeRes: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(data: any) {
          assert.strictEqual(statusCode, 400);
          assert.strictEqual(data?.code, 'UNTRUSTED_HOST_PARAMETER');
          resolve();
          return this;
        }
      };
      pcloudRouter(fakeReq, fakeRes, () => resolve());
    });
  });

  // -------------------------------------------------------------
  // Regressão 10: Zero Vazamento de Tokens ou Credenciais
  // -------------------------------------------------------------
  await t.test('10. PCLOUD_ACCESS_TOKEN e PCLOUD_ADMIN_TOKEN nunca constam em respostas de erro ou sucesso', async () => {
    const SECRET_ACCESS_TOKEN = 'secret_access_token_private_999999';
    process.env.PCLOUD_ACCESS_TOKEN = SECRET_ACCESS_TOKEN;
    process.env.PCLOUD_ADMIN_TOKEN = VALID_PCLOUD_ADMIN_TOKEN;

    await new Promise<void>((resolve) => {
      let statusCode = 200;
      const fakeReq: any = {
        method: 'POST',
        url: '/pcloud/file-link',
        headers: {
          'content-type': 'application/json',
          'authorization': `Bearer ${VALID_PCLOUD_ADMIN_TOKEN}`
        },
        body: { fileId: 'arquivo_nao_cadastrado_77' },
        signedCookies: {}
      };
      const fakeRes: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(data: any) {
          const serialized = JSON.stringify(data);
          assert.strictEqual(serialized.includes(SECRET_ACCESS_TOKEN), false);
          assert.strictEqual(serialized.includes(VALID_PCLOUD_ADMIN_TOKEN), false);
          resolve();
          return this;
        }
      };
      pcloudRouter(fakeReq, fakeRes, () => resolve());
    });
  });

  // -------------------------------------------------------------
  // Regressão 11: Adaptador Frontend NÃO Manipula Segredo Administrativo e Usa Sessão Segura
  // -------------------------------------------------------------
  await t.test('11. PCloudStorageAdapter não possui setAuthToken, não envia Bearer no frontend e usa credentials: include', async () => {
    const adapter = new PCloudStorageAdapter();

    // 11.1 Garante que métodos de injeção de token administrativo não existem no cliente
    assert.strictEqual(
      (adapter as any).setAuthToken,
      undefined,
      'PCloudStorageAdapter NÃO deve expor setAuthToken no frontend'
    );
    assert.strictEqual(
      (adapter as any).authToken,
      undefined,
      'PCloudStorageAdapter NÃO deve manter propriedade interna authToken'
    );

    const originalFetch = globalThis.fetch;
    let capturedHeaders: any = null;
    let capturedCredentials: any = null;
    let capturedMethod: any = null;
    let capturedUrl: any = null;

    globalThis.fetch = async (input: any, init?: any) => {
      capturedUrl = String(input);
      capturedMethod = init?.method;
      capturedHeaders = init?.headers;
      capturedCredentials = init?.credentials;
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: 'connected', configured: true, connected: true })
      } as any;
    };

    try {
      // 11.2 Teste de conexão pelo adaptador: deve usar exclusivamente credentials: 'include' e sem Bearer
      const testResult = await adapter.testConnection();
      assert.strictEqual(testResult.success, true);
      assert.strictEqual(capturedCredentials, 'include', 'Frontend deve usar credentials: include para sessão segura');
      assert.strictEqual(capturedHeaders?.['Authorization'], undefined, 'Frontend NUNCA deve enviar cabeçalho Authorization');
      assert.strictEqual(capturedHeaders?.['authorization'], undefined);

      // 11.3 Consulta de status: também sem Bearer e com credentials: 'include'
      await adapter.getBackendStatus();
      assert.strictEqual(capturedCredentials, 'include');
      assert.strictEqual(capturedHeaders?.['Authorization'], undefined);

      // 11.4 Solicitação de link de arquivo: sem Bearer e com credentials: 'include'
      globalThis.fetch = async (input: any, init?: any) => {
        capturedUrl = String(input);
        capturedMethod = init?.method;
        capturedHeaders = init?.headers;
        capturedCredentials = init?.credentials;
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, fileId: '12345', streamUrl: 'https://p-ams2.pcloud.com/test.mp4' })
        } as any;
      };

      const linkResult = await adapter.getFileLink('12345');
      assert.strictEqual(linkResult.success, true);
      assert.strictEqual(capturedCredentials, 'include');
      assert.strictEqual(capturedHeaders?.['Authorization'], undefined);
      assert.strictEqual(capturedHeaders?.['X-Nova-Client'], 'storage-v1', 'Frontend deve enviar cabeçalho X-Nova-Client: storage-v1');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // -------------------------------------------------------------
  // Regressão 12: Persistência do Catálogo Autorizado em Ambiente Serverless
  // -------------------------------------------------------------
  await t.test('12. Catálogo autorizado suporta persistência serverless via Redis e PCLOUD_AUTHORIZED_FILE_IDS, sem falsa persistência em memória', async () => {
    // 12.1 Arquivo não autorizado retorna false
    const isAuthBefore = await PCloudService.isAuthorizedFile('88889999');
    assert.strictEqual(isAuthBefore, false);

    // 12.2 Autorização via variável de ambiente declarativa (persistência serverless Vercel)
    process.env.PCLOUD_AUTHORIZED_FILE_IDS = '101010,202020,88889999';
    const isAuthFromEnv = await PCloudService.isAuthorizedFile('88889999');
    assert.strictEqual(isAuthFromEnv, true, 'Deve reconhecer arquivo autorizado via PCLOUD_AUTHORIZED_FILE_IDS');

    delete process.env.PCLOUD_AUTHORIZED_FILE_IDS;
    await PCloudService.resetAuthorizedFiles();

    // 12.3 Persistência distribuída via Upstash Redis
    let mockRedisStore: Record<string, string> = {};
    const mockRedis = {
      get: async <T>(key: string): Promise<T | null> => {
        const val = mockRedisStore[key];
        return val ? JSON.parse(val) : null;
      },
      set: async (key: string, value: any): Promise<void> => {
        mockRedisStore[key] = JSON.stringify(value);
      },
      del: async (key: string): Promise<void> => {
        delete mockRedisStore[key];
      }
    };

    DriveAuthService.setRedisClient(mockRedis as any);

    // Salva arquivo autorizado no Redis distribuído
    await PCloudService.authorizeFile('77665544');

    // Limpa memória local simulando reciclagem/cold start da função serverless
    (PCloudService as any).authorizedFiles.clear();

    // Deve resolver positivamente consultando o Redis
    const isAuthFromRedis = await PCloudService.isAuthorizedFile('77665544');
    assert.strictEqual(isAuthFromRedis, true, 'Deve persistir autorização através de instâncias via Redis distribuído');

    // 12.4 IDs de arquivos não autorizados continuam estritamente bloqueados
    const isRandomBlocked = await PCloudService.isAuthorizedFile('11223344');
    assert.strictEqual(isRandomBlocked, false, 'Arquivos não cadastrados no Redis ou env devem ser recusados');
  });

  // -------------------------------------------------------------
  // Regressão 13: Proteção Estrita Anti-CSRF em Rotas Autenticadas por Cookie
  // -------------------------------------------------------------
  await t.test('13. Defesa Anti-CSRF: rejeita ausência de X-Nova-Client, origens não confiáveis e protege rotas por cookie', async () => {
    process.env.PCLOUD_ADMIN_TOKEN = VALID_PCLOUD_ADMIN_TOKEN;
    process.env.PCLOUD_ACCESS_TOKEN = 'valid_pcloud_storage_api_token';
    process.env.APP_URL = 'https://app-oficial.novastorage.com';
    process.env.TRUSTED_ORIGINS = 'https://portal-autorizado.novastorage.com';

    // Cria sessão administrativa válida no servidor
    const adminSession = await DriveAuthService.createSession();
    adminSession.role = 'admin';
    await DriveAuthService.saveSession(adminSession);

    // 13.1 Requisição autenticada por cookie SEM o cabeçalho X-Nova-Client é rejeitada com HTTP 403
    await new Promise<void>((resolve) => {
      let statusCode = 200;
      const fakeReq: any = {
        method: 'POST',
        url: '/pcloud/test-connection',
        headers: {
          'content-type': 'application/json',
          'origin': 'https://app-oficial.novastorage.com'
          // Falta X-Nova-Client
        },
        body: {},
        signedCookies: { nova_session_id: adminSession.id }
      };
      const fakeRes: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(data: any) {
          assert.strictEqual(statusCode, 403, 'Deve rejeitar com 403 requisições sem cabeçalho X-Nova-Client');
          assert.strictEqual(data?.code, 'CSRF_HEADER_MISSING');
          resolve();
          return this;
        }
      };
      pcloudRouter(fakeReq, fakeRes, () => resolve());
    });

    // 13.2 Requisição autenticada por cookie com ORIGEM NÃO CONFIÁVEL é rejeitada com HTTP 403
    await new Promise<void>((resolve) => {
      let statusCode = 200;
      const fakeReq: any = {
        method: 'POST',
        url: '/pcloud/test-connection',
        headers: {
          'content-type': 'application/json',
          'x-nova-client': 'storage-v1',
          'origin': 'https://site-malicioso-atacante.com' // Origem externa não autorizada
        },
        body: {},
        signedCookies: { nova_session_id: adminSession.id }
      };
      const fakeRes: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(data: any) {
          assert.strictEqual(statusCode, 403, 'Deve rejeitar com 403 origens externas não confiáveis');
          assert.strictEqual(data?.code, 'CSRF_ORIGIN_UNTRUSTED');
          resolve();
          return this;
        }
      };
      pcloudRouter(fakeReq, fakeRes, () => resolve());
    });

    // 13.3 Requisição autenticada por cookie com ORIGEM AUSENTE é rejeitada com HTTP 403
    await new Promise<void>((resolve) => {
      let statusCode = 200;
      const fakeReq: any = {
        method: 'POST',
        url: '/pcloud/file-link',
        headers: {
          'content-type': 'application/json',
          'x-nova-client': 'storage-v1'
          // Falta Origin e Referer
        },
        body: { fileId: '55443322' },
        signedCookies: { nova_session_id: adminSession.id }
      };
      const fakeRes: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(data: any) {
          assert.strictEqual(statusCode, 403, 'Deve rejeitar com 403 requisições sem origem informada');
          assert.strictEqual(data?.code, 'CSRF_ORIGIN_UNTRUSTED');
          resolve();
          return this;
        }
      };
      pcloudRouter(fakeReq, fakeRes, () => resolve());
    });

    // 13.4 Requisição com cabeçalho correto e origem confiável configurada em APP_URL prossegue
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ result: 0, userid: 112233, quota: 1000, usedquota: 100 })
    } as any);

    try {
      await new Promise<void>((resolve) => {
        let statusCode = 200;
        const fakeReq: any = {
          method: 'POST',
          url: '/pcloud/test-connection',
          headers: {
            'content-type': 'application/json',
            'x-nova-client': 'storage-v1',
            'origin': 'https://app-oficial.novastorage.com' // Origem confiável
          },
          body: {},
          signedCookies: { nova_session_id: adminSession.id }
        };
        const fakeRes: any = {
          status(code: number) {
            statusCode = code;
            return this;
          },
          json(data: any) {
            assert.strictEqual(statusCode, 200, 'Origem confiável e cabeçalho anti-CSRF devem prosseguir');
            assert.strictEqual(data?.status, 'connected');
            resolve();
            return this;
          }
        };
        pcloudRouter(fakeReq, fakeRes, () => resolve());
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    // 13.5 Chamadas server-to-server com Bearer PCLOUD_ADMIN_TOKEN são imunes a CSRF
    await new Promise<void>((resolve) => {
      let statusCode = 200;
      const fakeReq: any = {
        method: 'POST',
        url: '/pcloud/file-link',
        headers: {
          'content-type': 'application/json',
          'authorization': `Bearer ${VALID_PCLOUD_ADMIN_TOKEN}`
          // Não envia X-Nova-Client nem Origin: Bearer server-to-server não depende de CSRF de cookie
        },
        body: { fileId: '123' },
        signedCookies: {}
      };
      const fakeRes: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(data: any) {
          // Arquivo 123 não autorizado -> retorna 403 FILE_NOT_AUTHORIZED e NÃO CSRF_HEADER_MISSING
          assert.strictEqual(statusCode, 403);
          assert.strictEqual(data?.code, 'FILE_NOT_AUTHORIZED');
          resolve();
          return this;
        }
      };
      pcloudRouter(fakeReq, fakeRes, () => resolve());
    });
  });
});

// ============================================================================
// SUÍTE: Conexão OAuth 2.0 Oficial do pCloud na NOVA STORAGE
// ============================================================================
test('Conexão OAuth 2.0 Oficial do pCloud na NOVA STORAGE', async (t) => {
  const originalEnv = { ...process.env };
  const VALID_PCLOUD_ADMIN_TOKEN = 'pcloud_exclusive_admin_secret_32_chars';
  const MOCK_CLIENT_ID = 'test_pcloud_client_id_12345';
  const MOCK_CLIENT_SECRET = 'test_pcloud_client_secret_67890';
  const TRUSTED_ORIGIN = 'http://localhost:3000';

  t.beforeEach(() => {
    DriveAuthService.setRedisClient(null);
    DriveAuthService.resetInMemoryDevStore();
    PCloudService.resetAuthorizedFiles();
    process.env.APP_URL = TRUSTED_ORIGIN;
    process.env.PCLOUD_ADMIN_TOKEN = VALID_PCLOUD_ADMIN_TOKEN;
    process.env.PCLOUD_CLIENT_ID = MOCK_CLIENT_ID;
    process.env.PCLOUD_CLIENT_SECRET = MOCK_CLIENT_SECRET;
  });

  t.afterEach(() => {
    process.env = { ...originalEnv };
    DriveAuthService.setRedisClient(null);
    DriveAuthService.resetInMemoryDevStore();
    PCloudService.resetAuthorizedFiles();
  });

  // --------------------------------------------------------------------------
  // 1. Rota de Inicialização: GET /api/storage/pcloud/auth-url
  // --------------------------------------------------------------------------
  await t.test('1.1 Visitante anônimo é recusado com HTTP 401 AUTH_REQUIRED', async () => {
    await new Promise<void>((resolve) => {
      let statusCode = 200;
      const fakeReq: any = {
        method: 'GET',
        url: '/pcloud/auth-url',
        headers: {},
        signedCookies: {}
      };
      const fakeRes: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(data: any) {
          assert.strictEqual(statusCode, 401);
          assert.strictEqual(data?.code, 'AUTH_REQUIRED');
          resolve();
          return this;
        }
      };
      pcloudRouter(fakeReq, fakeRes, () => resolve());
    });
  });

  await t.test('1.2 Usuário autenticado como viewer (não-admin) é recusado com HTTP 403 FORBIDDEN', async () => {
    const session = await DriveAuthService.createSession();
    session.role = 'viewer';
    await DriveAuthService.saveSession(session);

    await new Promise<void>((resolve) => {
      let statusCode = 200;
      const fakeReq: any = {
        method: 'GET',
        url: '/pcloud/auth-url',
        headers: {
          'x-nova-client': 'storage-v1',
          'origin': TRUSTED_ORIGIN
        },
        signedCookies: { [DriveAuthService.COOKIE_NAME]: session.id }
      };
      const fakeRes: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(data: any) {
          assert.strictEqual(statusCode, 403);
          assert.strictEqual(data?.code, 'FORBIDDEN');
          resolve();
          return this;
        }
      };
      pcloudRouter(fakeReq, fakeRes, () => resolve());
    });
  });

  await t.test('1.3 Sessão administrativa sem cabeçalho anti-CSRF ou de origem não confiável é bloqueada com HTTP 403', async () => {
    const adminSession = await DriveAuthService.createSession();
    adminSession.role = 'admin';
    await DriveAuthService.saveSession(adminSession);

    // Sem cabeçalho X-Nova-Client
    await new Promise<void>((resolve) => {
      let statusCode = 200;
      const fakeReq: any = {
        method: 'GET',
        url: '/pcloud/auth-url',
        headers: { 'origin': TRUSTED_ORIGIN },
        signedCookies: { [DriveAuthService.COOKIE_NAME]: adminSession.id }
      };
      const fakeRes: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(data: any) {
          assert.strictEqual(statusCode, 403);
          assert.strictEqual(data?.code, 'CSRF_HEADER_MISSING');
          resolve();
          return this;
        }
      };
      pcloudRouter(fakeReq, fakeRes, () => resolve());
    });

    // Com origem maliciosa
    await new Promise<void>((resolve) => {
      let statusCode = 200;
      const fakeReq: any = {
        method: 'GET',
        url: '/pcloud/auth-url',
        headers: {
          'x-nova-client': 'storage-v1',
          'origin': 'https://evil-attacker.com'
        },
        signedCookies: { [DriveAuthService.COOKIE_NAME]: adminSession.id }
      };
      const fakeRes: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(data: any) {
          assert.strictEqual(statusCode, 403);
          assert.strictEqual(data?.code, 'CSRF_ORIGIN_UNTRUSTED');
          resolve();
          return this;
        }
      };
      pcloudRouter(fakeReq, fakeRes, () => resolve());
    });
  });

  await t.test('1.4 Retorna HTTP 400 CONFIG_ERROR quando PCLOUD_CLIENT_ID ou PCLOUD_CLIENT_SECRET estão ausentes', async () => {
    delete process.env.PCLOUD_CLIENT_ID;

    const adminSession = await DriveAuthService.createSession();
    adminSession.role = 'admin';
    await DriveAuthService.saveSession(adminSession);

    await new Promise<void>((resolve) => {
      let statusCode = 200;
      const fakeReq: any = {
        method: 'GET',
        url: '/pcloud/auth-url',
        headers: {
          'x-nova-client': 'storage-v1',
          'origin': TRUSTED_ORIGIN
        },
        signedCookies: { [DriveAuthService.COOKIE_NAME]: adminSession.id }
      };
      const fakeRes: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(data: any) {
          assert.strictEqual(statusCode, 400);
          assert.strictEqual(data?.code, 'CONFIG_ERROR');
          resolve();
          return this;
        }
      };
      pcloudRouter(fakeReq, fakeRes, () => resolve());
    });
  });

  await t.test('1.5 Administrador com sessão gera URL de autorização com state seguro vinculado à sessão', async () => {
    const adminSession = await DriveAuthService.createSession();
    adminSession.role = 'admin';
    await DriveAuthService.saveSession(adminSession);

    await new Promise<void>((resolve) => {
      let statusCode = 200;
      const fakeReq: any = {
        method: 'GET',
        url: '/pcloud/auth-url',
        headers: {
          'x-nova-client': 'storage-v1',
          'origin': TRUSTED_ORIGIN
        },
        signedCookies: { [DriveAuthService.COOKIE_NAME]: adminSession.id }
      };
      const fakeRes: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        async json(data: any) {
          assert.strictEqual(statusCode, 200);
          assert.ok(data?.url);
          assert.ok(data?.state);
          assert.strictEqual(typeof data.state, 'string');
          assert.strictEqual(data.state.length, 64); // 32 bytes em hex

          // Verifica parâmetros na URL gerada
          const parsedUrl = new URL(data.url);
          assert.strictEqual(parsedUrl.hostname, 'my.pcloud.com');
          assert.strictEqual(parsedUrl.pathname, '/oauth2/authorize');
          assert.strictEqual(parsedUrl.searchParams.get('client_id'), MOCK_CLIENT_ID);
          assert.strictEqual(parsedUrl.searchParams.get('response_type'), 'code');
          assert.strictEqual(parsedUrl.searchParams.get('state'), data.state);
          assert.strictEqual(parsedUrl.searchParams.get('redirect_uri'), `${TRUSTED_ORIGIN}/api/storage/pcloud/callback`);

          // Verifica se o state foi vinculado e persistido na sessão com expiração
          const updatedSession = await DriveAuthService.getValidSession(adminSession.id);
          assert.strictEqual(updatedSession?.pcloudCsrfState, data.state);
          assert.ok(updatedSession?.pcloudCsrfExpiresAt && updatedSession.pcloudCsrfExpiresAt > Date.now());

          resolve();
          return this;
        }
      };
      pcloudRouter(fakeReq, fakeRes, () => resolve());
    });
  });

  await t.test('1.6 Administrador via Bearer PCLOUD_ADMIN_TOKEN também pode gerar URL de autorização', async () => {
    await new Promise<void>((resolve) => {
      let statusCode = 200;
      let issuedCookie: string | undefined;
      const fakeReq: any = {
        method: 'GET',
        url: '/pcloud/auth-url',
        headers: {
          'authorization': `Bearer ${VALID_PCLOUD_ADMIN_TOKEN}`
        },
        signedCookies: {}
      };
      const fakeRes: any = {
        cookie(name: string, val: string) {
          if (name === DriveAuthService.COOKIE_NAME) {
            issuedCookie = val;
          }
          return this;
        },
        status(code: number) {
          statusCode = code;
          return this;
        },
        async json(data: any) {
          assert.strictEqual(statusCode, 200);
          assert.ok(data?.url);
          assert.ok(data?.state);
          assert.ok(issuedCookie);

          // Verifica que a sessão emitida recebeu privilégio admin
          const session = await DriveAuthService.getValidSession(issuedCookie!);
          assert.strictEqual(session?.role, 'admin');
          assert.strictEqual(session?.pcloudCsrfState, data.state);
          resolve();
          return this;
        }
      };
      pcloudRouter(fakeReq, fakeRes, () => resolve());
    });
  });

  // --------------------------------------------------------------------------
  // 2. Rota de Callback: GET /api/storage/pcloud/callback
  // --------------------------------------------------------------------------
  await t.test('2.1 Retorno com parâmetro error do pCloud retorna HTTP 400 e emite PCLOUD_OAUTH_ERROR via postMessage', async () => {
    await new Promise<void>((resolve) => {
      let statusCode = 200;
      const fakeReq: any = {
        method: 'GET',
        url: '/pcloud/callback?error=access_denied',
        query: { error: 'access_denied' },
        headers: {},
        signedCookies: {}
      };
      const fakeRes: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        send(html: string) {
          assert.strictEqual(statusCode, 400);
          assert.ok(html.includes('PCLOUD_OAUTH_ERROR'));
          assert.ok(html.includes('access_denied'));
          assert.ok(html.includes(TRUSTED_ORIGIN));
          resolve();
          return this;
        }
      };
      pcloudRouter(fakeReq, fakeRes, () => resolve());
    });
  });

  await t.test('2.2 Callback com code ou state ausentes retorna HTTP 400', async () => {
    await new Promise<void>((resolve) => {
      let statusCode = 200;
      const fakeReq: any = {
        method: 'GET',
        url: '/pcloud/callback',
        query: {},
        headers: {},
        signedCookies: {}
      };
      const fakeRes: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        send(html: string) {
          assert.strictEqual(statusCode, 400);
          assert.ok(html.includes('Parâmetros ausentes'));
          resolve();
          return this;
        }
      };
      pcloudRouter(fakeReq, fakeRes, () => resolve());
    });
  });

  await t.test('2.3 Callback sem sessão válida no cookie retorna HTTP 400', async () => {
    await new Promise<void>((resolve) => {
      let statusCode = 200;
      const fakeReq: any = {
        method: 'GET',
        url: '/pcloud/callback?code=mock_code&state=mock_state',
        query: { code: 'mock_code', state: 'mock_state' },
        headers: {},
        signedCookies: {} // Sem cookie de sessão
      };
      const fakeRes: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        send(html: string) {
          assert.strictEqual(statusCode, 400);
          assert.ok(html.includes('Sessão Não Encontrada'));
          resolve();
          return this;
        }
      };
      pcloudRouter(fakeReq, fakeRes, () => resolve());
    });
  });

  await t.test('2.4 State inválido ou adulterado (ataque CSRF) é recusado com HTTP 400 e invalida state', async () => {
    const session = await DriveAuthService.createSession();
    session.pcloudCsrfState = 'legitimate_state_64_characters_long_0123456789abcdef0123456789abcdef';
    session.pcloudCsrfExpiresAt = Date.now() + 600000;
    await DriveAuthService.saveSession(session);

    let fetchCalled = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      fetchCalled = true;
      return { ok: true, json: async () => ({}) } as any;
    };

    try {
      await new Promise<void>((resolve) => {
        let statusCode = 200;
        const fakeReq: any = {
          method: 'GET',
          url: '/pcloud/callback?code=mock_code&state=tampered_malicious_state',
          query: { code: 'mock_code', state: 'tampered_malicious_state' },
          headers: {},
          signedCookies: { [DriveAuthService.COOKIE_NAME]: session.id }
        };
        const fakeRes: any = {
          status(code: number) {
            statusCode = code;
            return this;
          },
          async send(html: string) {
            assert.strictEqual(statusCode, 400);
            assert.ok(html.includes('Validação CSRF falhou'));
            assert.strictEqual(fetchCalled, false, 'Troca de código NÃO pode ser chamada em caso de falha CSRF');

            // Verifica que o state foi limpo imediatamente para mitigar reutilização
            const reloadedSession = await DriveAuthService.getValidSession(session.id);
            assert.strictEqual(reloadedSession?.pcloudCsrfState, null);
            resolve();
            return this;
          }
        };
        pcloudRouter(fakeReq, fakeRes, () => resolve());
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test('2.5 State expirado (> 10 minutos) é recusado com HTTP 400 e limpa state', async () => {
    const session = await DriveAuthService.createSession();
    session.pcloudCsrfState = 'expired_state_abcdef0123456789';
    session.pcloudCsrfExpiresAt = Date.now() - 5000; // Expirado há 5 segundos
    await DriveAuthService.saveSession(session);

    await new Promise<void>((resolve) => {
      let statusCode = 200;
      const fakeReq: any = {
        method: 'GET',
        url: `/pcloud/callback?code=mock_code&state=${session.pcloudCsrfState}`,
        query: { code: 'mock_code', state: session.pcloudCsrfState },
        headers: {},
        signedCookies: { [DriveAuthService.COOKIE_NAME]: session.id }
      };
      const fakeRes: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        async send(html: string) {
          assert.strictEqual(statusCode, 400);
          assert.ok(html.includes('expirou'));
          const reloadedSession = await DriveAuthService.getValidSession(session.id);
          assert.strictEqual(reloadedSession?.pcloudCsrfState, null);
          resolve();
          return this;
        }
      };
      pcloudRouter(fakeReq, fakeRes, () => resolve());
    });
  });

  await t.test('2.6 Falha no token endpoint do pCloud retorna HTTP 400 e HTML com postMessage de erro', async () => {
    const session = await DriveAuthService.createSession();
    const VALID_STATE = 'valid_state_0123456789abcdef0123456789abcdef0123456789abcdef01234567';
    session.pcloudCsrfState = VALID_STATE;
    session.pcloudCsrfExpiresAt = Date.now() + 600000;
    await DriveAuthService.saveSession(session);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: any) => {
      const url = String(input);
      if (url.includes('/oauth2_token')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            result: 1000,
            error: 'Log in required: authorization code has expired'
          })
        } as any;
      }
      return originalFetch(input);
    };

    try {
      await new Promise<void>((resolve) => {
        let statusCode = 200;
        const fakeReq: any = {
          method: 'GET',
          url: `/pcloud/callback?code=expired_code&state=${VALID_STATE}`,
          query: { code: 'expired_code', state: VALID_STATE },
          headers: {},
          signedCookies: { [DriveAuthService.COOKIE_NAME]: session.id }
        };
        const fakeRes: any = {
          status(code: number) {
            statusCode = code;
            return this;
          },
          send(html: string) {
            assert.strictEqual(statusCode, 400);
            assert.ok(html.includes('PCLOUD_OAUTH_ERROR'));
            assert.ok(html.includes('Log in required'));
            resolve();
            return this;
          }
        };
        pcloudRouter(fakeReq, fakeRes, () => resolve());
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test('2.7 Troca bem-sucedida (Região Global, locationid: 1) persiste token na sessão e emite HTML seguro', async () => {
    const session = await DriveAuthService.createSession();
    const VALID_STATE = 'state_us_global_1234567890abcdef1234567890abcdef1234567890abcdef1234';
    session.pcloudCsrfState = VALID_STATE;
    session.pcloudCsrfExpiresAt = Date.now() + 600000;
    await DriveAuthService.saveSession(session);

    const SECRET_ACCESS_TOKEN = 'secret_pcloud_token_returned_by_api_us_998877';
    const originalFetch = globalThis.fetch;
    let exchangeRequestBody: string = '';

    globalThis.fetch = async (input: any, init?: any) => {
      const url = String(input);
      if (url.includes('/oauth2_token')) {
        exchangeRequestBody = String(init?.body || '');
        return {
          ok: true,
          status: 200,
          json: async () => ({
            result: 0,
            access_token: SECRET_ACCESS_TOKEN,
            token_type: 'bearer',
            userid: 100200,
            locationid: 1,
            hostname: 'api.pcloud.com'
          })
        } as any;
      }
      return originalFetch(input, init);
    };

    try {
      await new Promise<void>((resolve) => {
        let statusCode = 200;
        const fakeReq: any = {
          method: 'GET',
          url: `/pcloud/callback?code=good_code_123&state=${VALID_STATE}`,
          query: { code: 'good_code_123', state: VALID_STATE },
          headers: {},
          signedCookies: { [DriveAuthService.COOKIE_NAME]: session.id }
        };
        const fakeRes: any = {
          status(code: number) {
            statusCode = code;
            return this;
          },
          async send(html: string) {
            assert.strictEqual(statusCode, 200);
            assert.ok(html.includes('PCLOUD_OAUTH_COMPLETED'));
            assert.ok(html.includes('api.pcloud.com'));
            assert.ok(html.includes(TRUSTED_ORIGIN));

            // CRÍTICO: Garantir que segredos NUNCA vazam no HTML de resposta
            assert.strictEqual(html.includes(SECRET_ACCESS_TOKEN), false, 'Token de acesso não pode constar no HTML');
            assert.strictEqual(html.includes(MOCK_CLIENT_SECRET), false, 'Client secret não pode constar no HTML');

            // Verifica que a requisição de troca enviou as credenciais corretas no backend
            assert.ok(exchangeRequestBody.includes(`client_id=${MOCK_CLIENT_ID}`));
            assert.ok(exchangeRequestBody.includes(`client_secret=${MOCK_CLIENT_SECRET}`));
            assert.ok(exchangeRequestBody.includes('code=good_code_123'));

            // Verifica se os tokens foram gravados com sucesso na sessão do servidor
            const reloadedSession = await DriveAuthService.getValidSession(session.id);
            assert.strictEqual(reloadedSession?.pcloudTokens?.accessToken, SECRET_ACCESS_TOKEN);
            assert.strictEqual(reloadedSession?.pcloudTokens?.userId, 100200);
            assert.strictEqual(reloadedSession?.pcloudTokens?.locationId, 1);
            assert.strictEqual(reloadedSession?.pcloudTokens?.hostname, 'api.pcloud.com');
            assert.strictEqual(reloadedSession?.pcloudCsrfState, null); // State consumido

            resolve();
            return this;
          }
        };
        pcloudRouter(fakeReq, fakeRes, () => resolve());
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test('2.8 Troca bem-sucedida na Região Europa (locationid: 2) configura hostname eapi.pcloud.com', async () => {
    const session = await DriveAuthService.createSession();
    const VALID_STATE = 'state_eu_europe_1234567890abcdef1234567890abcdef1234567890abcdef1234';
    session.pcloudCsrfState = VALID_STATE;
    session.pcloudCsrfExpiresAt = Date.now() + 600000;
    await DriveAuthService.saveSession(session);

    const EU_TOKEN = 'eu_secret_pcloud_token_334455';
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (input: any, init?: any) => {
      const url = String(input);
      if (url.includes('/oauth2_token')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            result: 0,
            access_token: EU_TOKEN,
            token_type: 'bearer',
            userid: 556677,
            locationid: 2
            // Sem hostname explícito -> deve recair em eapi.pcloud.com por locationid: 2
          })
        } as any;
      }
      return originalFetch(input, init);
    };

    try {
      await new Promise<void>((resolve) => {
        let statusCode = 200;
        const fakeReq: any = {
          method: 'GET',
          url: `/pcloud/callback?code=eu_code_456&state=${VALID_STATE}`,
          query: { code: 'eu_code_456', state: VALID_STATE },
          headers: {},
          signedCookies: { [DriveAuthService.COOKIE_NAME]: session.id }
        };
        const fakeRes: any = {
          status(code: number) {
            statusCode = code;
            return this;
          },
          async send(html: string) {
            assert.strictEqual(statusCode, 200);
            assert.ok(html.includes('eapi.pcloud.com'));

            const reloadedSession = await DriveAuthService.getValidSession(session.id);
            assert.strictEqual(reloadedSession?.pcloudTokens?.hostname, 'eapi.pcloud.com');
            assert.strictEqual(reloadedSession?.pcloudTokens?.locationId, 2);

            // Verifica se o getApiHost do serviço agora resolve para eapi.pcloud.com
            assert.strictEqual(PCloudService.getApiHost(reloadedSession!), 'eapi.pcloud.com');
            resolve();
            return this;
          }
        };
        pcloudRouter(fakeReq, fakeRes, () => resolve());
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test('2.9 Validação estrita de hostname retornado pelo pCloud (Prevenção SSRF)', async () => {
    // 2.9.1 Hostname confiável *.pcloud.com é aceito
    assert.strictEqual(PCloudService.isValidPCloudHost('api.pcloud.com'), true);
    assert.strictEqual(PCloudService.isValidPCloudHost('eapi.pcloud.com'), true);
    assert.strictEqual(PCloudService.isValidPCloudHost('api12.pcloud.com'), true);
    assert.strictEqual(PCloudService.isValidPCloudHost('https://api.pcloud.com/'), true);

    // 2.9.2 Domínios maliciosos, loopback, ou injeção de parâmetros são rejeitados
    assert.strictEqual(PCloudService.isValidPCloudHost('evil.com'), false);
    assert.strictEqual(PCloudService.isValidPCloudHost('attacker-pcloud.com'), false);
    assert.strictEqual(PCloudService.isValidPCloudHost('pcloud.com.attacker.com'), false);
    assert.strictEqual(PCloudService.isValidPCloudHost('127.0.0.1'), false);
    assert.strictEqual(PCloudService.isValidPCloudHost('169.254.169.254'), false);
    assert.strictEqual(PCloudService.isValidPCloudHost('localhost'), false);

    // Se a API retornar um host malicioso, resolveApiHost deve recair com segurança no host padrão
    const safeHost = PCloudService.resolveApiHost(1, 'http://169.254.169.254/metadata');
    assert.strictEqual(safeHost, 'api.pcloud.com');
  });

  await t.test('2.10 State consumido não pode ser reutilizado (proteção contra replay)', async () => {
    const session = await DriveAuthService.createSession();
    const VALID_STATE = 'single_use_state_abcdef1234567890abcdef1234567890abcdef1234567890';
    session.pcloudCsrfState = VALID_STATE;
    session.pcloudCsrfExpiresAt = Date.now() + 600000;
    await DriveAuthService.saveSession(session);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        result: 0,
        access_token: 'tok_replay_test',
        locationid: 1,
        hostname: 'api.pcloud.com'
      })
    } as any);

    try {
      // Primeira chamada: Sucesso
      await new Promise<void>((resolve) => {
        const fakeReq: any = {
          method: 'GET',
          url: `/pcloud/callback?code=replay_code&state=${VALID_STATE}`,
          query: { code: 'replay_code', state: VALID_STATE },
          headers: {},
          signedCookies: { [DriveAuthService.COOKIE_NAME]: session.id }
        };
        const fakeRes: any = {
          status: () => fakeRes,
          send: () => {
            resolve();
            return fakeRes;
          }
        };
        pcloudRouter(fakeReq, fakeRes, () => resolve());
      });

      // Segunda chamada com mesmo code e state: Falha (state já foi invalidado)
      await new Promise<void>((resolve) => {
        let statusCode = 200;
        const fakeReq: any = {
          method: 'GET',
          url: `/pcloud/callback?code=replay_code&state=${VALID_STATE}`,
          query: { code: 'replay_code', state: VALID_STATE },
          headers: {},
          signedCookies: { [DriveAuthService.COOKIE_NAME]: session.id }
        };
        const fakeRes: any = {
          status(code: number) {
            statusCode = code;
            return this;
          },
          send(html: string) {
            assert.strictEqual(statusCode, 400);
            assert.ok(html.includes('Validação CSRF falhou'));
            resolve();
            return this;
          }
        };
        pcloudRouter(fakeReq, fakeRes, () => resolve());
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // --------------------------------------------------------------------------
  // 3. Integração com Adapter Frontend
  // --------------------------------------------------------------------------
  await t.test('3.1 PCloudStorageAdapter.getOAuthUrl solicita URL com headers anti-CSRF e credentials include', async () => {
    const adapter = new PCloudStorageAdapter();
    const originalFetch = globalThis.fetch;

    let capturedHeaders: any = {};
    let capturedCredentials: any = '';

    globalThis.fetch = async (input: any, init?: any) => {
      const url = String(input);
      if (url.includes('/api/storage/pcloud/auth-url')) {
        capturedHeaders = init?.headers || {};
        capturedCredentials = init?.credentials;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            url: 'https://my.pcloud.com/oauth2/authorize?mock=1',
            state: 'mock_state_123',
            redirectUri: `${TRUSTED_ORIGIN}/api/storage/pcloud/callback`,
            trustedOrigin: TRUSTED_ORIGIN
          })
        } as any;
      }
      return originalFetch(input, init);
    };

    try {
      const result = await adapter.getOAuthUrl();
      assert.strictEqual(capturedCredentials, 'include');
      assert.strictEqual(capturedHeaders['X-Nova-Client'], 'storage-v1');
      assert.ok(result.url.includes('my.pcloud.com'));
      assert.strictEqual(result.state, 'mock_state_123');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test('3.2 PCLOUD_REDIRECT_URI sem APP_URL na Vercel resolve origem confiável para postMessage e proteção CSRF', async () => {
    delete process.env.APP_URL;
    process.env.PCLOUD_REDIRECT_URI = 'https://nova-storage-prod.vercel.app/api/storage/pcloud/callback';

    const origin = PCloudService.getTrustedOrigin();
    assert.strictEqual(origin, 'https://nova-storage-prod.vercel.app');

    const session = await DriveAuthService.createSession();
    session.role = 'admin';
    await DriveAuthService.saveSession(session);

    const { getTrustedOrigins } = await import('../src/server/routes/pcloud.ts');
    const trustedList = getTrustedOrigins();
    assert.ok(trustedList.includes('https://nova-storage-prod.vercel.app'));
  });

  await t.test('3.3 POST /api/storage/pcloud/disconnect encerra a sessão OAuth e limpa os tokens da sessão', async () => {
    const session = await DriveAuthService.createSession();
    session.role = 'admin';
    session.pcloudTokens = {
      accessToken: 'valid_token_to_disconnect',
      tokenType: 'bearer',
      userId: 12345
    };
    await DriveAuthService.saveSession(session);

    await new Promise<void>((resolve) => {
      let statusCode = 200;
      const fakeReq: any = {
        method: 'POST',
        url: '/pcloud/disconnect',
        headers: {
          'content-type': 'application/json',
          'x-nova-client': 'storage-v1',
          'origin': TRUSTED_ORIGIN
        },
        body: {},
        signedCookies: { [DriveAuthService.COOKIE_NAME]: session.id }
      };
      const fakeRes: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        async json(data: any) {
          assert.strictEqual(statusCode, 200);
          assert.strictEqual(data?.success, true);

          const reloaded = await DriveAuthService.getValidSession(session.id);
          assert.strictEqual(reloaded?.pcloudTokens, null);
          resolve();
          return this;
        }
      };
      pcloudRouter(fakeReq, fakeRes, () => resolve());
    });
  });

  await t.test('3.4 Callback OAuth processa hints de locationid e hostname retornados na query da URL', async () => {
    const session = await DriveAuthService.createSession();
    const VALID_STATE = 'hints_state_1234567890abcdef1234567890abcdef1234567890abcdef1234';
    session.pcloudCsrfState = VALID_STATE;
    session.pcloudCsrfExpiresAt = Date.now() + 600000;
    await DriveAuthService.saveSession(session);

    const originalFetch = globalThis.fetch;
    let endpointHit = '';

    globalThis.fetch = async (input: any) => {
      endpointHit = String(input);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          result: 0,
          access_token: 'tok_hint_eu',
          locationid: 2,
          hostname: 'eapi.pcloud.com'
        })
      } as any;
    };

    try {
      await new Promise<void>((resolve) => {
        let statusCode = 200;
        const fakeReq: any = {
          method: 'GET',
          url: `/pcloud/callback?code=hint_code&state=${VALID_STATE}&locationid=2&hostname=eapi.pcloud.com`,
          query: {
            code: 'hint_code',
            state: VALID_STATE,
            locationid: '2',
            hostname: 'eapi.pcloud.com'
          },
          headers: {},
          signedCookies: { [DriveAuthService.COOKIE_NAME]: session.id }
        };
        const fakeRes: any = {
          status(code: number) {
            statusCode = code;
            return this;
          },
          async send(html: string) {
            assert.strictEqual(statusCode, 200);
            assert.ok(endpointHit.includes('eapi.pcloud.com/oauth2_token'));
            assert.ok(html.includes('eapi.pcloud.com'));

            const reloaded = await DriveAuthService.getValidSession(session.id);
            assert.strictEqual(reloaded?.pcloudTokens?.hostname, 'eapi.pcloud.com');
            assert.strictEqual(reloaded?.pcloudTokens?.locationId, 2);
            resolve();
            return this;
          }
        };
        pcloudRouter(fakeReq, fakeRes, () => resolve());
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

