import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const forbidden = ['private', 'data'].join('-');
function files(dir, extension) {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path, extension) : path.endsWith(extension) ? [path] : [];
  });
}
function violations(path, source) {
  return source.split('\n').flatMap((line, index) => {
    if (!line.includes(forbidden)) return [];
    if (path === 'src/data/load.js' && /^\s*(\/\/|\/\*|\*)/.test(line)) return [];
    if (path === 'scripts/check-model.mjs' && ['flomo', 'thoughts', 'lessons'].some(name =>
      line.trim() === `await import('../${forbidden}/${name}.js');`)) return [];
    return [`${path}:${index + 1}`];
  });
}
test('源代码与脚本不嵌入本地数据路径，豁免仅限显式加载行', () => {
  const paths = [...files('src', '.js'), ...readdirSync(join(root, 'scripts')).filter(name => name.endsWith('.mjs')).map(name => 'scripts/' + name)];
  assert.deepEqual(paths.flatMap(path => violations(path, readFileSync(join(root, path), 'utf8'))), []);
});
test('守门规则可拦截注释和非加载语句，不能借豁免隐藏数据', () => {
  assert.equal(violations('src/data/model.js', `// ${forbidden}`).length, 1);
  assert.equal(violations('scripts/check-model.mjs', `const text = '${forbidden}'`).length, 1);
  assert.equal(violations('src/data/load.js', `const text = '${forbidden}'`).length, 1);
});
