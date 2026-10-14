import test from 'node:test';
import assert from 'node:assert/strict';
import { DriveAuthService, UserSessionData, IRedisClient } from '../src/server/services/driveAuthService.ts';

// Test suite for OAuth token renewal and Upstash Redis session persistence
test('Ciclo de sessões e renovação de tokens com Upstash Redis', async (t) => {
  // Ensure dummy credentials exist for test environment
  process.env.GOOGLE_CLIENT_ID = 'test-client-id-12345.apps.googleusercontent.com';
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret-abcde';
  process.env.APP_URL = 'http://localhost:3000';
  process.env.NODE_ENV = 'test';

  t.beforeEach(() => {
    DriveAuthService.setRedisClient(null);
    DriveAuthService.resetInMemoryDevStore();
  });

  t.afterEach(() => {
    DriveAuthService.setRedisClient(null);
    DriveAuthService.resetInMemoryDevStore();
  });

  await t.test('1. Bloqueio estrito de fallback em ambiente de produção sem credenciais Upstash Redis', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalUrl = process.env.KV_REST_API_URL;
    const originalToken = process.env.KV_REST_API_TOKEN;

    try {
      process.env.NODE_ENV = 'production';
      delete process.env.KV_REST_API_URL;
      delete process.env.KV_REST_API_TOKEN;

      assert.throws(
        () => {
          DriveAuthService.getRedisClient();
        },
        (err: any) => {
          assert.match(err.message, /Configuração obrigatória ausente em produção/);
          assert.match(err.message, /KV_REST_API_URL e KV_REST_API_TOKEN devem estar configurados/);
          return true;
        },
        'Deve lançar erro controlado e proibir fallback silencioso em produção'
      );
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      if (originalUrl) process.env.KV_REST_API_URL = originalUrl;
      if (originalToken) process.env.KV_REST_API_TOKEN = originalToken;
    }
  });

  await t.test('2. Renovação de access_token sem novo refresh_token preserva o refresh_token e grava no Redis', async () => {
    // Simulate Upstash Redis in-memory storage
    const redisStore = new Map<string, { value: any; ex?: number }>();
    const mockRedis: IRedisClient = {
      get: async <T>(k: string) => {
        const item = redisStore.get(k);
        return (item ? JSON.parse(JSON.stringify(item.value)) : null) as T;
      },
      set: async (k: string, v: any, opts?: { ex?: number }) => {
        redisStore.set(k, { value: JSON.parse(JSON.stringify(v)), ex: opts?.ex });
        return 'OK';
      },
      del: async (k: string) => {
        const existed = redisStore.delete(k);
        return existed ? 1 : 0;
      }
    };

    DriveAuthService.setRedisClient(mockRedis);

    const session = await DriveAuthService.createSession();
    const initialTokens = {
      access_token: 'initial_access_token_aaa',
      refresh_token: 'vital_refresh_token_xyz',
      scope: DriveAuthService.REQUIRED_SCOPE,
      token_type: 'Bearer',
      expiry_date: Date.now() + 3600 * 1000
    };

    session.tokens = initialTokens;
    await DriveAuthService.saveSession(session);

    // Simulate Google issuing a refreshed access token WITHOUT a refresh_token
    const googleRenewalResponse = {
      access_token: 'new_renewed_access_token_bbb',
      expiry_date: Date.now() + 3600 * 1000
    };

    await DriveAuthService.updateSessionTokens(session, googleRenewalResponse as any);

    // Assert in-memory object
    assert.equal(session.tokens?.access_token, 'new_renewed_access_token_bbb');
    assert.equal(session.tokens?.refresh_token, 'vital_refresh_token_xyz');

    // Assert Upstash Redis persistence
    const savedInRedis = await mockRedis.get<UserSessionData>(`nova:session:${session.id}`);
    assert.ok(savedInRedis, 'Sessão deve estar persistida no Redis');
    assert.equal(savedInRedis.tokens?.access_token, 'new_renewed_access_token_bbb');
    assert.equal(savedInRedis.tokens?.refresh_token, 'vital_refresh_token_xyz');

    // Verify TTL was set to 14 days (1,209,600s)
    const storedItem = redisStore.get(`nova:session:${session.id}`);
    assert.equal(storedItem?.ex, 14 * 24 * 60 * 60);
  });

  await t.test('3. Preservação estrita quando refresh_token é undefined e suporte à rotação de tokens', async () => {
    const redisStore = new Map<string, any>();
    const mockRedis: IRedisClient = {
      get: async (k) => redisStore.get(k) || null,
      set: async (k, v) => { redisStore.set(k, v); return 'OK'; },
      del: async (k) => { redisStore.delete(k); return 1; }
    };
    DriveAuthService.setRedisClient(mockRedis);

    const session = await DriveAuthService.createSession();
    session.tokens = {
      access_token: 'token_1',
      refresh_token: 'original_refresh_token',
      expiry_date: 1000
    };
    await DriveAuthService.saveSession(session);

    // 1: Update with explicit undefined refresh_token
    await DriveAuthService.updateSessionTokens(session, {
      access_token: 'token_2',
      refresh_token: undefined as any,
      expiry_date: 2000
    });

    assert.equal(session.tokens?.access_token, 'token_2');
    assert.equal(session.tokens?.refresh_token, 'original_refresh_token');

    let saved = await mockRedis.get(`nova:session:${session.id}`);
    assert.equal(saved.tokens?.refresh_token, 'original_refresh_token');

    // 2: Update with explicit new refresh_token (token rotation from Google)
    await DriveAuthService.updateSessionTokens(session, {
      access_token: 'token_3',
      refresh_token: 'rotated_new_refresh_token',
      expiry_date: 3000
    });

    assert.equal(session.tokens?.access_token, 'token_3');
    assert.equal(session.tokens?.refresh_token, 'rotated_new_refresh_token');

    saved = await mockRedis.get(`nova:session:${session.id}`);
    assert.equal(saved.tokens?.refresh_token, 'rotated_new_refresh_token');
  });

  await t.test('4. Falha de comunicação com o Redis gera erro controlado e não simula persistência', async () => {
    // Failing Redis mock
    const failingRedis: IRedisClient = {
      get: async () => {
        throw new Error('Connection timeout to https://upstash.io');
      },
      set: async () => {
        throw new Error('ECONNREFUSED Upstash cluster unreachable');
      },
      del: async () => {
        throw new Error('Connection reset');
      }
    };

    DriveAuthService.setRedisClient(failingRedis);

    // getValidSession must throw controlled error and not pretend session exists or is valid
    await assert.rejects(
      async () => {
        await DriveAuthService.getValidSession('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
      },
      (err: any) => {
        assert.match(err.message, /Falha na comunicação com o serviço de sessões/);
        return true;
      }
    );

    // saveSession must throw controlled error when Redis write fails
    const dummySession: UserSessionData = {
      id: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      csrfState: null,
      csrfExpiresAt: null,
      targetFolderId: null,
      tokens: null,
      userEmail: null,
      userName: null,
      connectedAt: null,
      lastVerifiedAt: null,
      lastActivityAt: Date.now(),
      createdAt: Date.now()
    };

    await assert.rejects(
      async () => {
        await DriveAuthService.saveSession(dummySession);
      },
      (err: any) => {
        assert.match(err.message, /Falha na comunicação com o serviço de sessões/);
        return true;
      }
    );
  });

  await t.test('5. getAuthenticatedClient registra listener tokens e propaga renovação para o Redis', async () => {
    const redisStore = new Map<string, any>();
    const mockRedis: IRedisClient = {
      get: async (k) => redisStore.get(k) || null,
      set: async (k, v) => { redisStore.set(k, v); return 'OK'; },
      del: async (k) => { redisStore.delete(k); return 1; }
    };
    DriveAuthService.setRedisClient(mockRedis);

    const session = await DriveAuthService.createSession();
    session.tokens = {
      access_token: 'access_before_event',
      refresh_token: 'permanent_refresh_token',
      expiry_date: 100
    };
    await DriveAuthService.saveSession(session);

    const client = DriveAuthService.getAuthenticatedClient(session);
    assert.ok(client, 'Deve criar cliente autenticado');

    // Simulate oauth2Client emitting 'tokens' event during an API request
    client.emit('tokens', {
      access_token: 'access_after_event_refreshed',
      expiry_date: 200
    });

    // Wait a brief tick for async event handler
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Check that session tokens and Redis are updated
    assert.equal(session.tokens?.access_token, 'access_after_event_refreshed');
    assert.equal(session.tokens?.refresh_token, 'permanent_refresh_token');

    const saved = await mockRedis.get(`nova:session:${session.id}`);
    assert.equal(saved.tokens?.access_token, 'access_after_event_refreshed');
    assert.equal(saved.tokens?.refresh_token, 'permanent_refresh_token');
  });

  await t.test('6. Preservação de scope, token_type, id_token e não exposição de tokens em status', async () => {
    const redisStore = new Map<string, any>();
    const mockRedis: IRedisClient = {
      get: async (k) => redisStore.get(k) || null,
      set: async (k, v) => { redisStore.set(k, v); return 'OK'; },
      del: async (k) => { redisStore.delete(k); return 1; }
    };
    DriveAuthService.setRedisClient(mockRedis);

    const session = await DriveAuthService.createSession();
    session.tokens = {
      access_token: 'initial_access_token',
      refresh_token: 'initial_refresh_token',
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      token_type: 'Bearer',
      id_token: 'initial_id_token_jwt',
      expiry_date: 1000
    };
    await DriveAuthService.saveSession(session);

    // Google returns a renewal response where scope, token_type, id_token, and refresh_token are undefined
    const renewalWithUndefinedFields = {
      access_token: 'renewed_access_token_456',
      expiry_date: 2000,
      scope: undefined as any,
      token_type: undefined as any,
      refresh_token: undefined as any
    };

    await DriveAuthService.updateSessionTokens(session, renewalWithUndefinedFields);

    // Verify fields preserved
    assert.equal(session.tokens?.access_token, 'renewed_access_token_456');
    assert.equal(session.tokens?.expiry_date, 2000);
    assert.equal(session.tokens?.refresh_token, 'initial_refresh_token');
    assert.equal(session.tokens?.scope, 'https://www.googleapis.com/auth/drive.readonly');
    assert.equal(session.tokens?.token_type, 'Bearer');
    assert.equal(session.tokens?.id_token, 'initial_id_token_jwt');

    const saved = await mockRedis.get(`nova:session:${session.id}`);
    assert.equal(saved.tokens?.scope, 'https://www.googleapis.com/auth/drive.readonly');
    assert.equal(saved.tokens?.token_type, 'Bearer');
    assert.equal(saved.tokens?.id_token, 'initial_id_token_jwt');

    // Verify getStatus doesn't expose raw tokens in its returned payload
    const statusResult = await DriveAuthService.getStatus(session);
    assert.equal((statusResult as any).tokens, undefined);
    assert.equal((statusResult as any).access_token, undefined);
    assert.equal((statusResult as any).refresh_token, undefined);
  });

  await t.test('7. Expiração de sessão (TTL de 14 dias) e limpeza automática', async () => {
    const redisStore = new Map<string, any>();
    const mockRedis: IRedisClient = {
      get: async (k) => redisStore.get(k) || null,
      set: async (k, v) => { redisStore.set(k, v); return 'OK'; },
      del: async (k) => { redisStore.delete(k); return 1; }
    };
    DriveAuthService.setRedisClient(mockRedis);

    const session = await DriveAuthService.createSession();
    // Simulate expired session (lastActivityAt older than 14 days)
    session.lastActivityAt = Date.now() - (15 * 24 * 60 * 60 * 1000);
    await DriveAuthService.saveSession(session);

    const retrieved = await DriveAuthService.getValidSession(session.id);
    assert.equal(retrieved, null, 'Sessão expirada deve retornar null');
    assert.equal(redisStore.has(`nova:session:${session.id}`), false, 'Sessão expirada deve ser removida do Redis');
  });

  await t.test('8. Validação CSRF OAuth: expiração de 10 minutos e proteção contra reutilização', async () => {
    const redisStore = new Map<string, any>();
    const mockRedis: IRedisClient = {
      get: async (k) => redisStore.get(k) || null,
      set: async (k, v) => { redisStore.set(k, v); return 'OK'; },
      del: async (k) => { redisStore.delete(k); return 1; }
    };
    DriveAuthService.setRedisClient(mockRedis);

    const session = await DriveAuthService.createSession();
    const { state } = await DriveAuthService.generateAuthorizationUrl(session, 'folder_123');

    assert.ok(state, 'CSRF state deve ser gerado');
    assert.equal(session.csrfState, state);
    assert.equal(session.targetFolderId, 'folder_123');

    // 1: Rejection on mismatched state
    const badStateResult = await DriveAuthService.handleCallback(session, 'code_123', 'wrong_state');
    assert.equal(badStateResult.success, false);
    assert.match(badStateResult.error || '', /Validação CSRF falhou/);
    assert.equal(session.csrfState, null, 'CSRF state deve ser invalidado após tentativa falha');

    // 2: Rejection on expired CSRF state (> 10 minutes)
    await DriveAuthService.generateAuthorizationUrl(session);
    session.csrfExpiresAt = Date.now() - 1000; // expired
    const expiredResult = await DriveAuthService.handleCallback(session, 'code_123', session.csrfState!);
    assert.equal(expiredResult.success, false);
    assert.match(expiredResult.error || '', /tempo limite de 10 minutos/);
  });

  await t.test('9. Desconexão revoga tokens e limpa estado do usuário no Redis', async () => {
    const redisStore = new Map<string, any>();
    const mockRedis: IRedisClient = {
      get: async (k) => redisStore.get(k) || null,
      set: async (k, v) => { redisStore.set(k, v); return 'OK'; },
      del: async (k) => { redisStore.delete(k); return 1; }
    };
    DriveAuthService.setRedisClient(mockRedis);

    const session = await DriveAuthService.createSession();
    session.tokens = { access_token: 'token_to_disconnect' };
    session.userEmail = 'test@example.com';
    session.userName = 'Tester';
    session.targetFolderId = 'folder_abc';
    await DriveAuthService.saveSession(session);

    const disconnected = await DriveAuthService.disconnect(session);
    assert.equal(disconnected, true);
    assert.equal(session.tokens, null);
    assert.equal(session.userEmail, null);
    assert.equal(session.userName, null);
    assert.equal(session.targetFolderId, null);

    const saved = await mockRedis.get(`nova:session:${session.id}`);
    assert.equal(saved.tokens, null);
    assert.equal(saved.userEmail, null);
  });

  await t.test('10. Resolução tolerante de SESSION_SECRET com resiliência a quotes, whitespace e aliases', async () => {
    const { resolveSessionSecret, getEffectiveCookieSecret } = await import('../src/server/utils/sessionSecret.ts');

    const originalSecret = process.env.SESSION_SECRET;
    const originalAuth = process.env.AUTH_SECRET;
    const originalApp = process.env.APP_SESSION_SECRET;

    try {
      // 1: Variable absent
      delete process.env.SESSION_SECRET;
      delete process.env.AUTH_SECRET;
      delete process.env.APP_SESSION_SECRET;
      let status = resolveSessionSecret();
      assert.equal(status.configured, false);
      assert.equal(status.present, false);
      assert.equal(status.length, 0);

      // In non-production, getEffectiveCookieSecret still generates a working ephemeral key
      const devKey = getEffectiveCookieSecret(false);
      assert.ok(devKey && devKey.length >= 32);

      // In production, returns placeholder without crashing
      const prodPlaceholder = getEffectiveCookieSecret(true);
      assert.ok(prodPlaceholder.includes('placeholder'));

      // 2: Valid key with exact 32 chars
      process.env.SESSION_SECRET = '0123456789abcdef0123456789abcdef';
      status = resolveSessionSecret();
      assert.equal(status.configured, true);
      assert.equal(status.present, true);
      assert.equal(status.length, 32);
      assert.equal(status.secret, '0123456789abcdef0123456789abcdef');

      // 3: Secret with quotes (e.g. pasted into Vercel UI as "my-secret...")
      process.env.SESSION_SECRET = '"0123456789abcdef0123456789abcdef"';
      status = resolveSessionSecret();
      assert.equal(status.configured, true);
      assert.equal(status.length, 32);
      assert.equal(status.secret, '0123456789abcdef0123456789abcdef');

      // 4: Secret with 20 chars (valid >= 16)
      process.env.SESSION_SECRET = 'valid-twenty-chars!!';
      status = resolveSessionSecret();
      assert.equal(status.configured, true);
      assert.equal(status.length, 20);

      // 5: Secret too short (< 16 chars)
      process.env.SESSION_SECRET = 'short';
      status = resolveSessionSecret();
      assert.equal(status.configured, false);
      assert.equal(status.present, true);
      assert.equal(status.length, 5);

      // 6: Alias AUTH_SECRET when SESSION_SECRET is undefined
      delete process.env.SESSION_SECRET;
      process.env.AUTH_SECRET = 'auth_secret_with_more_than_16_chars!';
      status = resolveSessionSecret();
      assert.equal(status.configured, true);
      assert.equal(status.present, true);
      assert.equal(status.secret, 'auth_secret_with_more_than_16_chars!');
    } finally {
      if (originalSecret) process.env.SESSION_SECRET = originalSecret;
      else delete process.env.SESSION_SECRET;
      if (originalAuth) process.env.AUTH_SECRET = originalAuth;
      else delete process.env.AUTH_SECRET;
      if (originalApp) process.env.APP_SESSION_SECRET = originalApp;
      else delete process.env.APP_SESSION_SECRET;
    }
  });

  await t.test('11. Compatibilidade com cookies assinados na Vercel quando req.cookies vem pré-populado', async () => {
    const http = await import('node:http');
    const { default: app } = await import('../api/index.ts');

    const server = http.createServer((req, res) => {
      // Simulate Vercel pre-populating req.cookies
      (req as any).cookies = { vercel_internal: 'token' };
      app(req, res);
    });

    await new Promise<void>((resolve) => {
      server.listen(0, async () => {
        try {
          const port = (server.address() as any).port;
          const res = await fetch(`http://127.0.0.1:${port}/api/storage/drive/auth-url`);
          assert.equal(res.status, 200);
          const data = await res.json();
          assert.ok(data.url);
          assert.ok(data.state);

          // Verify that Set-Cookie header contains a properly signed cookie
          const setCookieHeader = res.headers.get('set-cookie');
          assert.ok(setCookieHeader);
          assert.match(setCookieHeader, /nova_session_id=s%3A/);
        } finally {
          server.close();
          resolve();
        }
      });
    });
  });
});


