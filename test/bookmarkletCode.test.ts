import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOOKMARKLET_MINIFIED_CODE,
  BRAVE_BOOKMARKLET_STEPS
} from '../src/services/storage/bookmarkletSnippet.ts';

test('Bookmarklet Detector de Mídia para Navegadores Móveis (Brave Android)', async (t) => {
  await t.test('1. Código inicia com o esquema javascript: e IIFE válida', () => {
    assert.ok(BOOKMARKLET_MINIFIED_CODE.startsWith('javascript:(function()'));
    assert.ok(BOOKMARKLET_MINIFIED_CODE.endsWith(')();'));
  });

  await t.test('2. Não acessa cookies, senhas nem armazenamento local privado', () => {
    assert.strictEqual(BOOKMARKLET_MINIFIED_CODE.includes('document.cookie'), false);
    assert.strictEqual(BOOKMARKLET_MINIFIED_CODE.includes('localStorage'), false);
    assert.strictEqual(BOOKMARKLET_MINIFIED_CODE.includes('sessionStorage'), false);
    assert.strictEqual(BOOKMARKLET_MINIFIED_CODE.includes('indexedDB'), false);
  });

  await t.test('3. Valida exclusivamente protocolos HTTP e HTTPS', () => {
    assert.ok(BOOKMARKLET_MINIFIED_CODE.includes('http://'));
    assert.ok(BOOKMARKLET_MINIFIED_CODE.includes('https://'));
    assert.ok(
      BOOKMARKLET_MINIFIED_CODE.includes("protocol === 'http:' || p.protocol === 'https:'") ||
      BOOKMARKLET_MINIFIED_CODE.includes("protocol==='http:'||p.protocol==='https:'")
    );
  });

  await t.test('4. Inspeciona tags de vídeo e a API de desempenho de recursos (Resource Timing)', () => {
    assert.ok(BOOKMARKLET_MINIFIED_CODE.includes("querySelectorAll('video')"));
    assert.ok(BOOKMARKLET_MINIFIED_CODE.includes("querySelectorAll('video source,source')"));
    assert.ok(BOOKMARKLET_MINIFIED_CODE.includes("performance.getEntriesByType('resource')"));
    assert.ok(BOOKMARKLET_MINIFIED_CODE.includes('.m3u8'));
    assert.ok(BOOKMARKLET_MINIFIED_CODE.includes('.mp4'));
  });

  await t.test('5. Contém modal flutuante limpo com botão de cópia e encerramento', () => {
    assert.ok(BOOKMARKLET_MINIFIED_CODE.includes('nova-storage-sniffer-modal'));
    assert.ok(BOOKMARKLET_MINIFIED_CODE.includes('ns-close'));
    assert.ok(BOOKMARKLET_MINIFIED_CODE.includes('ns-cpy'));
    assert.ok(BOOKMARKLET_MINIFIED_CODE.includes('clipboard.writeText'));
  });

  await t.test('6. Instruções para Brave Android possuem 4 etapas claras e didáticas', () => {
    assert.strictEqual(BRAVE_BOOKMARKLET_STEPS.length, 4);
    assert.ok(BRAVE_BOOKMARKLET_STEPS[0].instruction.toLowerCase().includes('copiar'));
    assert.ok(BRAVE_BOOKMARKLET_STEPS[1].instruction.toLowerCase().includes('favorito'));
    assert.ok(BRAVE_BOOKMARKLET_STEPS[2].instruction.toLowerCase().includes('editar'));
    assert.ok(BRAVE_BOOKMARKLET_STEPS[3].instruction.toLowerCase().includes('play'));
  });

  await t.test('7. Inspeciona de forma síncrona atributos de iframe e tags de player', () => {
    assert.ok(BOOKMARKLET_MINIFIED_CODE.includes("querySelectorAll('iframe')"));
    assert.ok(BOOKMARKLET_MINIFIED_CODE.includes('data-src'));
    assert.ok(BOOKMARKLET_MINIFIED_CODE.includes('data-lazy-src'));
    assert.ok(BOOKMARKLET_MINIFIED_CODE.includes('data-player'));
    assert.ok(BOOKMARKLET_MINIFIED_CODE.includes('data-player-url'));
    assert.ok(BOOKMARKLET_MINIFIED_CODE.includes('data-url'));
    assert.ok(BOOKMARKLET_MINIFIED_CODE.includes('[data-player],[data-player-url],[data-iframe-src]'));
  });

  await t.test('8. Renderiza seção dedicada "Player Incorporado Detectado" e ação "Abrir Player em Nova Aba"', () => {
    assert.ok(BOOKMARKLET_MINIFIED_CODE.includes('Player Incorporado Detectado'));
    assert.ok(BOOKMARKLET_MINIFIED_CODE.includes('Abrir Player em Nova Aba'));
    assert.ok(BOOKMARKLET_MINIFIED_CODE.includes('target=\\"_blank\\"'));
    assert.ok(BOOKMARKLET_MINIFIED_CODE.includes('rel=\\"noopener noreferrer\\"'));
    assert.ok(BOOKMARKLET_MINIFIED_CODE.includes('ns-ifr-list'));
  });

  await t.test('9. Mantém separação estrita entre streams diretos e players em iframe', () => {
    assert.ok(BOOKMARKLET_MINIFIED_CODE.includes('const u=new Set(),ifr=new Set();'));
    assert.ok(BOOKMARKLET_MINIFIED_CODE.includes('ns-list'));
    assert.ok(BOOKMARKLET_MINIFIED_CODE.includes('ns-ifr-list'));
    assert.ok(BOOKMARKLET_MINIFIED_CODE.includes('addIfr'));
  });

  await t.test('10. Etapa 4 das instruções no Brave Android orienta sobre players incorporados e nova aba', () => {
    const step4 = BRAVE_BOOKMARKLET_STEPS.find((s) => s.stepNumber === 4);
    assert.ok(step4);
    assert.ok(step4.detail.includes('players incorporados'));
    assert.ok(step4.detail.includes('Abrir Player em Nova Aba'));
  });

  await t.test('11. Ausência de sistemas complexos: sem PerformanceObserver, re-render assíncrono ou mutação contínua', () => {
    assert.strictEqual(BOOKMARKLET_MINIFIED_CODE.includes('PerformanceObserver'), false);
    assert.strictEqual(BOOKMARKLET_MINIFIED_CODE.includes('setInterval'), false);
    assert.strictEqual(BOOKMARKLET_MINIFIED_CODE.includes('MutationObserver'), false);
    // Garantir limite de tamanho compatível com navegadores móveis Android (< 7.500 caracteres)
    assert.ok(
      BOOKMARKLET_MINIFIED_CODE.length < 7500,
      `Tamanho do bookmarklet (${BOOKMARKLET_MINIFIED_CODE.length}) deve ser menor que 7.500 caracteres`
    );
  });

  await t.test('12. Código compila sem erros no motor de script (V8 / vm.Script)', async () => {
    const vm = await import('node:vm');
    const rawJs = BOOKMARKLET_MINIFIED_CODE.replace(/^javascript:/, '');
    assert.doesNotThrow(() => {
      new vm.Script(rawJs);
    });
  });
});

