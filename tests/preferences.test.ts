import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultPreferences, normalizePreferences } from '../shared/preferences';

test('preferences validate ranges and safely recover old or malformed settings', () => {
  assert.deepEqual(normalizePreferences(null), defaultPreferences);
  assert.deepEqual(normalizePreferences({ defaultZoom: 0, fontSize: Infinity, font: '__proto__', rememberViewport: 'false' }), defaultPreferences);
  assert.deepEqual(normalizePreferences({ defaultZoom: 125, font: 'serif', fontSize: 18, rememberViewport: false }), { defaultZoom: 125, font: 'serif', fontSize: 18, rememberViewport: false });
  assert.equal(normalizePreferences({ fontSize: 20 }).defaultZoom, 83);
});

test('preferences persist across reads, reset, and retain working preferences on storage failure', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const items = new Map<string, string>();
  let fail = false;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => { if (fail) throw new Error('quota'); items.set(key, value); },
  }});
  try {
    const { usePreferences, readPreferences } = await import('../src/preferences');
    usePreferences.getState().update({ defaultZoom: 150, font: 'mono', fontSize: 20 });
    assert.equal(readPreferences().defaultZoom, 150);
    assert.equal(readPreferences().font, 'mono');
    assert.equal(readPreferences().fontSize, 20);
    fail = true;
    usePreferences.getState().update({ fontSize: 32 });
    assert.equal(usePreferences.getState().preferences.fontSize, 20);
    assert.ok(usePreferences.getState().error);
    fail = false;
    usePreferences.getState().update(defaultPreferences);
    assert.deepEqual(readPreferences(), defaultPreferences);
    assert.equal(usePreferences.getState().error, '');
    items.set('ac-preferences:v1', '{invalid');
    assert.deepEqual(readPreferences(), defaultPreferences);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
