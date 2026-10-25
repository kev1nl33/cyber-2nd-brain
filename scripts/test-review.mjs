import test from 'node:test';
import assert from 'node:assert/strict';
import { renderReview } from '../src/pages/review.js';
import { buildModel } from '../src/data/model.js';
import { loadData } from '../src/data/load.js';

class TestNode {
  constructor(tag = '') {
    this.tagName = tag.toUpperCase(); this.children = []; this.attributes = {}; this.dataset = {}; this.listeners = {}; this.className = ''; this.style = { setProperty() {} };
    this.classList = {
      contains: name => this.className.split(' ').includes(name),
      toggle: (name, on) => { const names = new Set(this.className.split(' ').filter(Boolean)); if (on) names.add(name); else names.delete(name); this.className = [...names].join(' '); },
      add: name => this.classList.toggle(name, true),
    };
  }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  removeAttribute(key) { delete this.attributes[key]; }
  addEventListener(key, fn) { this.listeners[key] = fn; }
  append(...nodes) { for (const node of nodes) { node.remove(); node.parentElement = this; this.children.push(node); } }
  remove() { if (this.parentElement) this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1); this.parentElement = null; }
  replaceChildren(...nodes) { for (const node of [...this.children]) node.remove(); this.append(...nodes); }
  replaceWith(node) { const parent = this.parentElement, index = parent.children.indexOf(this); this.remove(); node.parentElement = parent; parent.children.splice(index, 0, node); }
  insertBefore(node, cursor) { node.remove(); node.parentElement = this; this.children.splice(cursor ? this.children.indexOf(cursor) : this.children.length, 0, node); }
  get firstChild() { return this.children[0]; }
  get nextSibling() { return this.parentElement?.children[this.parentElement.children.indexOf(this) + 1]; }
  get isConnected() { return document.body.contains(this); }
  contains(node) { return this === node || this.children.some(child => child.contains(node)); }
  matches(selector) { return selector.startsWith('.') ? this.classList.contains(selector.slice(1)) : this.tagName === selector.split('[')[0].toUpperCase(); }
  closest(selector) { return selector.split(',').some(s => this.matches(s)) ? this : this.parentElement?.closest(selector); }
  querySelectorAll(selector) { if (selector.includes(' ')) { const [first, rest] = selector.split(' '); return this.querySelectorAll(first).flatMap(node => node.querySelectorAll(rest)); } return this.children.flatMap(node => [...(node.matches(selector) ? [node] : []), ...node.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  focus() { if (this.isConnected) document.activeElement = this; }
  click() { this.listeners.click?.({ preventDefault() {} }); }
  getBoundingClientRect() { return { width: 390, height: 68 }; }
  setPointerCapture() {}
}
function setup(t, initialKey) {
  const previous = ['Node', 'document', 'window', 'ResizeObserver'].map(key => [key, globalThis[key]]);
  t.after(() => { for (const [key, value] of previous) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } });
  globalThis.Node = TestNode;
  globalThis.document = { body: new TestNode('body'), documentElement: new TestNode('html'), createElement: tag => new TestNode(tag), createTextNode: () => new TestNode(), querySelector: () => null };
  document.activeElement = document.body;
  globalThis.window = { innerWidth: 390, scrollX: 0, scrollY: 160, scrollTo(x, y) { this.scrollX = x; this.scrollY = y; } };
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  const route = key => ({ page: 'review', params: key ? { key } : {} });
  const operations = [];
  let page;
  const ctx = { model: buildModel(loadData({}), { today: '2026-10-25' }), overlay: { decisions: {}, snoozed: {} }, prefs: { motion: 'off' },
    navigate(hash) { page.update(route(hash.split('/')[2] ? decodeURIComponent(hash.split('/')[2]) : null)); },
    decide: (...args) => operations.push(['decide', ...args]), snooze: key => operations.push(['snooze', key]) };
  page = renderReview(ctx, route(initialKey)); document.body.append(page.element); page.update(route(initialKey));
  return { page, operations };
}
test('手机详情进入首项聚焦标题，返回保留筛选、节点、滚动并归还原条目焦点', t => {
  const { page } = setup(t);
  page.element.querySelectorAll('.review__tab')[1].click();
  assert.equal(page.element.classList.contains('review--detail'), false);
  const list = page.element.querySelector('.review__list');
  const links = list.querySelectorAll('a'); const link = links[0];
  link.focus(); link.click();
  assert.equal(document.activeElement, page.element.querySelector('.review__prompt'));
  window.scrollY = 0;
  page.element.querySelector('.review__back').click();
  assert.equal(document.activeElement, link);
  assert.equal(window.scrollY, 160);
  assert.deepEqual(list.querySelectorAll('a'), links);
  assert.equal(page.element.querySelectorAll('.review__tab')[1].getAttribute('aria-selected'), 'true');
});
test('手机左右滑动以视口宽度 30% 为阈值，未达阈值回弹', t => {
  const { page, operations } = setup(t);
  page.element.querySelector('.review-item__link').click();
  const swipe = dx => {
    const detail = page.element.querySelector('.review__detail');
    const target = page.element.querySelector('.review__prompt');
    const event = x => ({ pointerType: 'touch', pointerId: 1, clientX: x, clientY: 100, target });
    detail.listeners.pointerdown(event(150)); detail.listeners.pointermove(event(150 + dx)); detail.listeners.pointerup(event(150 + dx));
    return detail;
  };
  swipe(116); assert.equal(operations.length, 0);
  swipe(-116); assert.equal(operations.length, 0);
  swipe(117); assert.equal(operations[0][0], 'decide'); assert.equal(operations[0][2], 'confirmed');
  swipe(-117); assert.equal(operations[1][0], 'snooze');
});

test('手机直接打开详情链接在挂载后聚焦详情标题', t => {
  const { page } = setup(t, 'lesson:demo-l1');
  assert.equal(document.activeElement, page.element.querySelector('.review__prompt'));
});
