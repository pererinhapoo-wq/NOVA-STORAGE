import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalCatalogService } from '../src/services/storage/localCatalogService.ts';
import { EpisodeFile } from '../src/types/storage.ts';

test('Retrocompatibilidade do Catálogo Local e Preservação de Metadados de Origem', async (t) => {
  // Simulação de localStorage em memória para os testes no Node
  const storageMap = new Map<string, string>();
  const mockLocalStorage = {
    getItem: (key: string) => storageMap.get(key) || null,
    setItem: (key: string, val: string) => { storageMap.set(key, String(val)); },
    removeItem: (key: string) => { storageMap.delete(key); },
    clear: () => { storageMap.clear(); }
  };

  const originalLocalStorage = globalThis.localStorage;
  (globalThis as unknown as { localStorage: typeof mockLocalStorage }).localStorage = mockLocalStorage;

  t.after(() => {
    (globalThis as unknown as { localStorage: typeof originalLocalStorage }).localStorage = originalLocalStorage;
  });

  await t.test('1. Preserva retrocompatibilidade com episódios existentes sem campos de origem', () => {
    storageMap.clear();
    const episodes = LocalCatalogService.getEpisodes();
    assert.ok(episodes.length > 0, 'Deve carregar lista inicial de episódios');

    // Verifica que registros legados continuam válidos sem originUrl ou capturedAt
    const legacyEp = episodes[0];
    assert.ok(legacyEp.id);
    assert.ok(legacyEp.title);
    assert.strictEqual(typeof legacyEp.fileSizeBytes, 'number');
    assert.strictEqual(legacyEp.originUrl, undefined);
    assert.strictEqual(legacyEp.capturedAt, undefined);
  });

  await t.test('2. Permite adicionar e persistir originUrl, originTitle e capturedAt de forma não-destrutiva', () => {
    storageMap.clear();
    const episodes = LocalCatalogService.getEpisodes();
    const targetId = episodes[0].id;
    const initialTitle = episodes[0].title;
    const initialSize = episodes[0].fileSizeBytes;

    const updated = LocalCatalogService.updateEpisodeStreamOrigin(targetId, {
      streamUrl: 'https://cdn.exemplo.com/master.m3u8?token=xyz',
      originUrl: 'https://site-origem.com/animes/frieren/ep-01',
      originTitle: 'Frieren - Episódio 01 - Assistir Online',
      capturedAt: '2026-10-22T21:00:00.000Z',
      streamUrlExpiresAt: '2026-10-22T22:00:00.000Z'
    });

    assert.ok(updated);
    assert.strictEqual(updated.id, targetId);
    assert.strictEqual(updated.title, initialTitle, 'Título original deve ser preservado');
    assert.strictEqual(updated.fileSizeBytes, initialSize, 'Tamanho original deve ser preservado');
    assert.strictEqual(updated.streamUrl, 'https://cdn.exemplo.com/master.m3u8?token=xyz');
    assert.strictEqual(updated.originUrl, 'https://site-origem.com/animes/frieren/ep-01');
    assert.strictEqual(updated.originTitle, 'Frieren - Episódio 01 - Assistir Online');
    assert.strictEqual(updated.capturedAt, '2026-10-22T21:00:00.000Z');
    assert.strictEqual(updated.streamUrlExpiresAt, '2026-10-22T22:00:00.000Z');

    // Recarrega do armazenamento para verificar persistência no JSON
    const reloaded = LocalCatalogService.getEpisodes().find(e => e.id === targetId);
    assert.ok(reloaded);
    assert.strictEqual(reloaded.originUrl, 'https://site-origem.com/animes/frieren/ep-01');
    assert.strictEqual(reloaded.originTitle, 'Frieren - Episódio 01 - Assistir Online');
    assert.strictEqual(reloaded.capturedAt, '2026-10-22T21:00:00.000Z');
  });

  await t.test('3. Permite criar novos episódios contendo dados de origem opcionais', () => {
    storageMap.clear();
    const newEpisode = LocalCatalogService.addEpisode({
      folderId: 'fld-test',
      title: 'Episódio com Origem',
      originalFileName: 'ep01.mp4',
      seriesName: 'Série Teste',
      seasonNumber: 1,
      episodeNumber: 1,
      fileSizeBytes: 1000000,
      durationSeconds: 1200,
      resolution: '1080p',
      dimensions: { width: 1920, height: 1080 },
      frameRate: 24,
      videoCodec: 'AVC / H.264',
      bitrateKbps: 4000,
      audioStreams: [],
      subtitleStreams: [],
      containerFormat: 'MP4',
      checksumSha256: 'abc123hash',
      originUrl: 'https://site-origem.com/ep-01',
      originTitle: 'Página do Episódio 01',
      capturedAt: '2026-10-22T21:30:00.000Z'
    });

    assert.ok(newEpisode.id);
    assert.strictEqual(newEpisode.originUrl, 'https://site-origem.com/ep-01');
    assert.strictEqual(newEpisode.originTitle, 'Página do Episódio 01');
    assert.strictEqual(newEpisode.capturedAt, '2026-10-22T21:30:00.000Z');
  });
});
