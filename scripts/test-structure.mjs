import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const root = new URL('../', import.meta.url);
function walk(dir) {
  return readdirSync(new URL(dir + '/', root), { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}
test('新 src 目录与第 2.3 节文件树完全一致', () => {
  const expected = [
    'main.js', 'router.js',
    ...['load', 'model', 'taxonomy', 'derive', 'overlay', 'search', 'dates', 'sample-data'].map(name => `data/${name}.js`),
    ...['dom', 'shell', 'prefs'].map(name => `ui/${name}.js`),
    ...['phase-bar', 'status-pill', 'kind-tag', 'step', 'connector', 'note', 'lesson-card', 'review-item', 'palette', 'toast', 'empty'].map(name => `ui/components/${name}.js`),
    ...['today', 'review', 'question', 'theme', 'lessons', 'sources', 'timeline', 'atlas'].map(name => `pages/${name}.js`),
    ...['tokens', 'base', 'shell', 'components', 'pages', 'atlas'].map(name => `styles/${name}.css`),
  ].map(path => 'src/' + path).sort();
  assert.deepEqual(walk('src').sort(), expected);
});
test('legacy 自迁移提交后未修改', () => {
  const paths = execFileSync('git', ['ls-tree', '-r', '--name-only', 'b84561a', 'legacy'], { cwd: root, encoding: 'utf8' }).trim().split('\n');
  assert.deepEqual(walk('legacy').sort(), paths.sort());
  for (const path of paths) {
    const original = execFileSync('git', ['show', `b84561a:${path}`], { cwd: root });
    assert.deepEqual(readFileSync(new URL(path, root)), original, path);
  }
});
