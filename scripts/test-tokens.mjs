import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const guide = readFileSync(new URL('docs/v3-build-guide.md', root), 'utf8');
const css = readFileSync(new URL('src/styles/tokens.css', root), 'utf8');
function luminance(hex) {
  const values = hex.match(/[a-f\d]{2}/gi).map(value => parseInt(value, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}
function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
test('令牌逐字等于指南第 8.2 节', () => {
  const expected = guide.split('### 8.2 ')[1].split('```css\n')[1].split('```')[0];
  assert.equal(css, expected);
});
for (const theme of ['dark', 'light']) {
  test(`${theme} 的正文与语义色满足对比度规则`, () => {
    const block = css.match(new RegExp('\\[data-theme="' + theme + '"\\]\\s*\\{([^}]+)'))[1];
    const tokens = Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[a-f\d]{6})/gi)].map(match => [match[1], match[2]]));
    for (const key of ['text', 'text-2', 'text-3', 'accent', 'gold', 'doubt', 'seal']) {
      assert.ok(contrast(tokens[key], tokens.bg) >= 4.5, `${key} 对 bg`);
    }
    assert.ok(contrast(tokens['text-3'], tokens.surface) >= 4.5, '辅助文字对 surface');
  });
}
test('HTML 逐字使用第 2.4 节骨架，所有本地链接文件存在', () => {
  const html = readFileSync(new URL('index.html', root), 'utf8');
  assert.equal(html, guide.split('```html\n')[1].split('```')[0]);
  for (const [, path] of html.matchAll(/(?:href|src)="(\.\/src\/[^\"]+)"/g)) {
    assert.doesNotThrow(() => readFileSync(new URL(path, root)));
  }
});
