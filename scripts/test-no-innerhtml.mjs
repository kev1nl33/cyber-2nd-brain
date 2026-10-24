import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../src/', import.meta.url));
// 当前没有图标模块需要使用静态 HTML，白名单保持为空。
const iconModules = new Set();
function scan(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? scan(path) : path.endsWith('.js') ? [path] : [];
  });
}
test('所有源代码禁止未经许可的 HTML 赋值', () => {
  for (const path of scan(root)) {
    const source = readFileSync(path, 'utf8');
    if (!iconModules.has(path.slice(root.length))) {
      assert.doesNotMatch(source, /(?:\.\s*innerHTML|\[\s*['"]innerHTML['"]\s*\])\s*(?:=|\+=)/, path);
      assert.doesNotMatch(source, /insertAdjacentHTML\s*\(/, path);
    }
  }
});
test('纯逻辑模块不访问浏览器全局对象', () => {
  const paths = [...scan(join(root, 'data')).filter(path => !path.endsWith('/load.js')), join(root, 'router.js')];
  for (const path of paths) {
    assert.doesNotMatch(readFileSync(path, 'utf8'), /\b(?:window|document|history|location|localStorage|sessionStorage)\b/, path);
  }
});
