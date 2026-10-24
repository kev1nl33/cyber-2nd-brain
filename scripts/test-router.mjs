import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, build, redirectLegacy } from '../src/router.js';

const routes = [
  ['#/', 'today', {}], ['#/review', 'review', {}],
  ['#/review/conn%3Aa%2Fb', 'review', { key: 'conn:a/b' }],
  ['#/review/done', 'review', { done: true }],
  ['#/q/a', 'question', { ideaId: 'a' }],
  ['#/q/a/b', 'question', { ideaId: 'a', stepId: 'b' }],
  ['#/q/a/b/src/c', 'question', { ideaId: 'a', stepId: 'b', sourceId: 'c' }],
  ['#/t/a', 'theme', { themeId: 'a' }],
  ['#/lessons', 'lessons', {}], ['#/lessons/unsorted', 'lessons', { patternId: 'unsorted' }],
  ['#/sources', 'sources', {}], ['#/sources/a', 'sources', { sourceId: 'a' }],
  ['#/timeline', 'timeline', {}], ['#/atlas', 'atlas', {}],
  ['#/atlas/2026-10', 'atlas', { month: '2026-10' }],
];
for (const [hash, page, params] of routes) {
  test(`路由往返 ${hash}`, () => {
    assert.deepEqual(parse(hash), { page, params });
    assert.equal(build({ page, params }), hash);
  });
}
test('所有 ID 独立编码，中文和斜线均可往返', () => {
  const route = { page: 'question', params: { ideaId: '示例/a', stepId: 'b:c', sourceId: '#来源' } };
  assert.deepEqual(parse(build(route)), route);
});
test('空值与非法路由回今天', () => {
  for (const hash of ['', '#', '#/unknown', '#/q', '#/q/a/b/wrong/c', '#/%ZZ', '#/review/%ZZ', '#/atlas/2026-13', '#/timeline/extra']) {
    assert.deepEqual(parse(hash), { page: 'today', params: {} });
  }
  assert.equal(build({ page: 'unknown' }), '#/');
  assert.equal(build({ page: 'question', params: {} }), '#/');
});
test('旧链接四种形式，只有已知主题才转换', () => {
  const ids = ['invest', 'review'];
  for (const [old, next] of [
    ['#/invest', '#/t/invest'], ['#/invest/a', '#/q/a'],
    ['#/invest/a/b', '#/q/a/b'], ['#/invest/a/b/source/c', '#/q/a/b/src/c'],
  ]) assert.equal(redirectLegacy(old, ids), next);
  for (const hash of ['#/other/a', '#/review/a', '#/invest/a/b/oops/c', '#/%ZZ']) {
    assert.equal(redirectLegacy(hash, ids), null);
  }
});
