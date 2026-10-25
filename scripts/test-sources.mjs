import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSources } from '../src/pages/sources.js';

// 零依赖 DOM 替身：节点移除时模拟浏览器丢失焦点，布局与真实键盘另由浏览器验收。
class TestNode {
  constructor(tagName = '') {
    this.tagName = tagName.toUpperCase();
    this.children = []; this.dataset = {}; this.attributes = {}; this.listeners = {};
    this.className = ''; this.scrollTop = 0;
    this.classList = {
      contains: name => this.className.split(' ').includes(name),
      toggle: (name, on) => {
        const names = new Set(this.className.split(' ').filter(Boolean));
        if (on) names.add(name); else names.delete(name);
        this.className = [...names].join(' ');
      },
    };
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child); } }
  contains(node) { return this === node || this.children.some(child => child.contains(node)); }
  get isConnected() { return document.body.contains(this); }
  replaceChildren(...children) {
    if (this.children.some(child => child.contains(document.activeElement))) document.activeElement = document.body;
    for (const child of this.children) child.parentElement = null;
    this.children = []; this.append(...children);
  }
  querySelectorAll(selector) {
    const matches = node => selector.startsWith('.') ? node.classList.contains(selector.slice(1)) : node.tagName === selector.toUpperCase();
    return this.children.flatMap(child => [...(matches(child) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  focus() { if (this.isConnected) document.activeElement = this; }
  click() { this.listeners.click?.({ preventDefault() {} }); }
}

function setup(t, narrow = false, sourceId) {
  const keys = ['Node', 'document', 'window', 'matchMedia'];
  const previous = keys.map(key => [key, globalThis[key]]);
  t.after(() => { for (const [key, value] of previous) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } });
  globalThis.Node = TestNode;
  globalThis.document = { body: new TestNode('body'), createElement: tag => new TestNode(tag), createTextNode: () => new TestNode() };
  document.activeElement = document.body;
  globalThis.matchMedia = () => ({ matches: narrow });
  globalThis.window = { matchMedia: globalThis.matchMedia, scrollX: 0, scrollY: 460,
    scrollTo(x, y) { this.scrollX = x; this.scrollY = y; } };
  const sources = ['a', 'b', 'c'].map(id => ({ id, title: `示例：${id}`, date: '2026-10-25', origin: 'flomo', tags: [], citedBy: [], text: id }));
  const route = id => ({ page: 'sources', params: id ? { sourceId: id } : {} });
  const navigations = [];
  let page;
  const ctx = { model: { sources, byId: { source: new Map(sources.map(source => [source.id, source])) } },
    navigate(hash, options) { navigations.push({ hash, options }); page.update(route(hash.split('/')[2])); } };
  page = renderSources(ctx, route(sourceId));
  document.body.append(page.element, page.evidence);
  page.update(route(sourceId));
  return { page, navigations, route };
}

test('来源选择保留链接节点、焦点、筛选与滚动，仅更新选中态且使用 replace', t => {
  const { page, navigations, route } = setup(t);
  const list = page.element.querySelector('.source-list');
  const search = page.element.querySelector('input');
  search.value = '示例'; search.listeners.input({ target: search });
  const links = list.querySelectorAll('a');
  list.scrollTop = 123;
  for (const link of links) {
    link.focus(); link.click();
    assert.equal(link.isConnected, true);
    assert.equal(document.activeElement, link);
    assert.deepEqual(list.querySelectorAll('a'), links);
    assert.equal(link.getAttribute('aria-current'), 'true');
    assert.equal(link.parentElement.classList.contains('is-selected'), true);
    assert.equal(list.querySelectorAll('a').filter(item => item.getAttribute('aria-current') === 'true').length, 1);
    assert.equal(list.scrollTop, 123);
    assert.equal(search.value, '示例');
  }
  const back = page.evidence.querySelector('.source-detail__back');
  back.focus(); back.click();
  assert.equal(document.activeElement, links.at(-1));
  assert.ok(navigations.every(item => item.options.replace === true));
  links[0].click();
  const citation = page.evidence.querySelector('.source-detail__back');
  citation.focus(); page.update(route('a'));
  assert.equal(document.activeElement, citation);
});

test('窄屏详情聚焦标题，返回归还原链接与列表滚动位置', t => {
  const { page } = setup(t, true);
  const links = page.element.querySelectorAll('.source-row__link');
  const link = links[1];
  link.focus(); link.click();
  const title = page.element.querySelector('.source-detail__title');
  assert.equal(title.getAttribute('tabindex'), '-1');
  assert.equal(document.activeElement, title);
  window.scrollY = 0;
  page.element.querySelector('.source-detail__back').click();
  assert.equal(document.activeElement, link);
  assert.equal(link.isConnected, true);
  assert.equal(window.scrollY, 460);
  assert.deepEqual(page.element.querySelectorAll('.source-row__link'), links);
});

test('窄屏直接打开来源链接也聚焦详情标题', t => {
  const { page } = setup(t, true, 'b');
  assert.equal(document.activeElement, page.element.querySelector('.source-detail__title'));
});
