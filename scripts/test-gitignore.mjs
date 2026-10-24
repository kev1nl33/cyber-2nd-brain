import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const boundary = ['private', 'data/'].join('-');
test('忽略规则保留本地数据边界，Git 实际忽略嵌套文件', () => {
  const rules = readFileSync(new URL('.gitignore', root), 'utf8').split(/\r?\n/);
  assert.ok(rules.includes(boundary));
  assert.equal(execFileSync('git', ['check-ignore', '--no-index', boundary + 'example.js'], { cwd: root, encoding: 'utf8' }).trim(), boundary + 'example.js');
});
