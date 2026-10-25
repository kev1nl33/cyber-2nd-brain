import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrefs } from '../src/ui/prefs.js';

test('侧栏偏好校验、折叠保留宽度且不覆盖主题与动效', () => {
  const previous = { matchMedia: globalThis.matchMedia, localStorage: globalThis.localStorage, document: globalThis.document };
  let value = JSON.stringify({ theme: 'dark', motion: 'off', sidebarWidthPx: 280 });
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
  globalThis.localStorage = { getItem: () => value, setItem: (_, next) => { value = next; } };
  globalThis.document = { documentElement: { dataset: {} } };
  try {
    const prefs = createPrefs();
    assert.equal(prefs.sidebarWidthPx, 280);
    assert.equal(prefs.sidebarCollapsed, false);
    prefs.setSidebar({ collapsed: true });
    assert.equal(prefs.sidebarWidthPx, 280);
    assert.equal(createPrefs().sidebarCollapsed, true);
    prefs.setSidebar({ collapsed: false, widthPx: 500 });
    assert.equal(prefs.sidebarWidthPx, 360);
    prefs.setSidebar({ widthPx: 170 });
    assert.equal(prefs.sidebarWidthPx, 200);
    assert.equal(JSON.parse(value).theme, 'dark');
    assert.equal(JSON.parse(value).motion, 'off');
    value = JSON.stringify({ sidebarWidthPx: 'bad', sidebarCollapsed: 'true' });
    assert.equal(createPrefs().sidebarWidthPx, null);
    assert.equal(createPrefs().sidebarCollapsed, false);
  } finally {
    for (const [key, val] of Object.entries(previous)) {
      if (val === undefined) delete globalThis[key]; else globalThis[key] = val;
    }
  }
});
