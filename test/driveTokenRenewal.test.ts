import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DriveAuthService, UserSessionData } from '../src/server/services/driveAuthService.ts';

// Test suite for OAuth token renewal and preservation
test('Ciclo de renovação de tokens OAuth do Google Drive', async (t) => {
  // Ensure dummy credentials exist for test environment
  process.env.GOOGLE_CLIENT_ID = 'test-client-id-12345.apps.googleusercontent.com';
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret-abcde';
  process.env.APP_URL = 'http://localhost:3000';

  await t.test('1. Renovação com novo access_token sem novo refresh_token preserva o refresh_token', () => {
    const session = DriveAuthService.createSession();
    const initialTokens = {
      access_token: 'initial_access_token_aaa',
      refresh_token: 'vital_refresh_token_xyz',
      scope: DriveAuthService.REQUIRED_SCOPE,
      token_type: 'Bearer',
      expiry_date: Date.now() + 3600 * 1000
    };

    session.tokens = initialTokens;

    // Simulate Google issuing a refreshed access token WITHOUT a refresh_token
    const googleRenewalResponse = {
      access_token: 'new_renewed_access_token_bbb',
      expiry_date: Date.now() + 3600 * 1000
    };

    DriveAuthService.updateSessionTokens(session, googleRenewalResponse as any);

    // Assertions
    assert.equal(session.tokens?.access_token, 'new_renewed_access_token_bbb');
    assert.equal(session.tokens?.refresh_token, 'vital_refresh_token_xyz');

    // Verify disk persistence
    const sessionsFile = path.resolve(process.cwd(), '.data', 'sessions.json');
    assert.ok(fs.existsSync(sessionsFile), 'Arquivo .data/sessions.json deve existir');
    const diskSessions = JSON.parse(fs.readFileSync(sessionsFile, 'utf-8'));
    const saved = diskSessions.find((s: UserSessionData) => s.id === session.id);
    assert.ok(saved, 'Sessão deve estar persistida em disco');
    assert.equal(saved.tokens?.access_token, 'new_renewed_access_token_bbb');
    assert.equal(saved.tokens?.refresh_token, 'vital_refresh_token_xyz');
  });

  await t.test('2. Preservação estrita do refresh_token quando refresh_token é undefined e suporte à rotação', () => {
    const session = DriveAuthService.createSession();
    session.tokens = {
      access_token: 'token_1',
      refresh_token: 'original_refresh_token',
      expiry_date: 1000
    };

    // Update with explicit undefined refresh_token
    DriveAuthService.updateSessionTokens(session, {
      access_token: 'token_2',
      refresh_token: undefined as any,
      expiry_date: 2000
    });

    assert.equal(session.tokens?.access_token, 'token_2');
    assert.equal(session.tokens?.refresh_token, 'original_refresh_token');

    // Update with explicit new refresh_token (token rotation from Google)
    DriveAuthService.updateSessionTokens(session, {
      access_token: 'token_3',
      refresh_token: 'rotated_new_refresh_token',
      expiry_date: 3000
    });

    assert.equal(session.tokens?.access_token, 'token_3');
    assert.equal(session.tokens?.refresh_token, 'rotated_new_refresh_token');
  });

  await t.test('3. Falha de renovação e tratamento de erro gracioso', async () => {
    const session = DriveAuthService.createSession();
    // Simulate expired or revoked tokens
    session.tokens = {
      access_token: 'invalid_expired_token',
      refresh_token: 'revoked_refresh_token',
      expiry_date: 1
    };

    // getStatus should catch Google API errors and return error status without crashing
    const statusResult = await DriveAuthService.getStatus(session);
    assert.equal(statusResult.configured, true);
    assert.equal(statusResult.connected, false);
    assert.equal(statusResult.status, 'error');
    assert.match(statusResult.message, /Falha na validação do token/);

    // listFiles should catch Google API errors and return safe empty list without crashing
    const listResult = await DriveAuthService.listFiles(session, {});
    assert.equal(listResult.status, 'error');
    assert.equal(listResult.total, 0);
    assert.deepEqual(listResult.files, []);
    assert.match(listResult.error || '', /Erro da API do Google Drive/);
  });

  await t.test('4. getAuthenticatedClient registra listener tokens e propaga renovação', async () => {
    const session = DriveAuthService.createSession();
    session.tokens = {
      access_token: 'access_before_event',
      refresh_token: 'permanent_refresh_token',
      expiry_date: 100
    };

    const client = DriveAuthService.getAuthenticatedClient(session);
    assert.ok(client, 'Deve criar cliente autenticado');

    // Simulate oauth2Client emitting 'tokens' event during an API request
    client.emit('tokens', {
      access_token: 'access_after_event_refreshed',
      expiry_date: 200
    });

    // Check that session tokens and disk are updated immediately
    assert.equal(session.tokens?.access_token, 'access_after_event_refreshed');
    assert.equal(session.tokens?.refresh_token, 'permanent_refresh_token');

    const sessionsFile = path.resolve(process.cwd(), '.data', 'sessions.json');
    const diskSessions = JSON.parse(fs.readFileSync(sessionsFile, 'utf-8'));
    const saved = diskSessions.find((s: UserSessionData) => s.id === session.id);
    assert.equal(saved.tokens?.access_token, 'access_after_event_refreshed');
    assert.equal(saved.tokens?.refresh_token, 'permanent_refresh_token');
  });

  await t.test('5. Preservação de scope, token_type e outros campos quando novos valores forem undefined ou ausentes', () => {
    const session = DriveAuthService.createSession();
    session.tokens = {
      access_token: 'initial_access_token',
      refresh_token: 'initial_refresh_token',
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      token_type: 'Bearer',
      id_token: 'initial_id_token_jwt',
      expiry_date: 1000
    };

    // Google returns a renewal response where scope, token_type, id_token, and refresh_token are undefined
    const renewalWithUndefinedFields = {
      access_token: 'renewed_access_token_456',
      expiry_date: 2000,
      scope: undefined as any,
      token_type: undefined as any,
      refresh_token: undefined as any
    };

    DriveAuthService.updateSessionTokens(session, renewalWithUndefinedFields);

    // Verify all pre-existing fields are intact and not wiped by undefined properties
    assert.equal(session.tokens?.access_token, 'renewed_access_token_456');
    assert.equal(session.tokens?.expiry_date, 2000);
    assert.equal(session.tokens?.refresh_token, 'initial_refresh_token');
    assert.equal(session.tokens?.scope, 'https://www.googleapis.com/auth/drive.readonly');
    assert.equal(session.tokens?.token_type, 'Bearer');
    assert.equal(session.tokens?.id_token, 'initial_id_token_jwt');

    // Also check disk persistence preserves those fields
    const sessionsFile = path.resolve(process.cwd(), '.data', 'sessions.json');
    const diskSessions = JSON.parse(fs.readFileSync(sessionsFile, 'utf-8'));
    const saved = diskSessions.find((s: UserSessionData) => s.id === session.id);
    assert.equal(saved.tokens?.scope, 'https://www.googleapis.com/auth/drive.readonly');
    assert.equal(saved.tokens?.token_type, 'Bearer');
    assert.equal(saved.tokens?.id_token, 'initial_id_token_jwt');
  });

  await t.test('6. Limpeza do arquivo temporário quando gravação/renomeação falhar, sem apagar o arquivo principal', () => {
    const session = DriveAuthService.createSession();
    session.tokens = {
      access_token: 'token_before_io_failure',
      refresh_token: 'refresh_before_io_failure'
    };
    DriveAuthService.updateSessionTokens(session, session.tokens);

    const sessionsFile = path.resolve(process.cwd(), '.data', 'sessions.json');
    assert.ok(fs.existsSync(sessionsFile), 'Arquivo sessions.json deve existir');
    const contentBeforeFailure = fs.readFileSync(sessionsFile, 'utf-8');

    // Mock fs.renameSync to simulate I/O failure after temp file write
    const originalRenameSync = fs.renameSync;
    let renameAttempted = false;
    let attemptedTempFile = '';

    fs.renameSync = ((oldPath: fs.PathLike, newPath: fs.PathLike) => {
      renameAttempted = true;
      attemptedTempFile = String(oldPath);
      throw new Error('Simulated I/O disk rename error (EACCES/EBUSY)');
    }) as any;

    try {
      // Trigger saveSessionsToDisk via updateSessionTokens
      DriveAuthService.updateSessionTokens(session, {
        access_token: 'failed_save_token'
      });

      assert.ok(renameAttempted, 'A tentativa de renomeação atômica deve ter ocorrido');
      assert.ok(attemptedTempFile.endsWith('.tmp'), 'Arquivo temporário deve ter sido criado');
      assert.equal(fs.existsSync(attemptedTempFile), false, 'Arquivo temporário deve ter sido removido na limpeza do erro');

      // Verify that the main sessions.json file was NOT deleted or corrupted
      assert.ok(fs.existsSync(sessionsFile), 'Arquivo sessions.json principal NUNCA deve ser apagado');
      assert.equal(fs.readFileSync(sessionsFile, 'utf-8'), contentBeforeFailure, 'Conteúdo do sessions.json deve permanecer íntegro');

      // Verify no orphan .tmp files remain in .data directory
      const dataDir = path.resolve(process.cwd(), '.data');
      const orphanTmpFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.tmp'));
      assert.deepEqual(orphanTmpFiles, [], 'Nenhum arquivo .tmp órfão deve sobrar na pasta .data');
    } finally {
      fs.renameSync = originalRenameSync;
    }
  });
});

