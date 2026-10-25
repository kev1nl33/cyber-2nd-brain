import test from 'node:test';
import assert from 'node:assert/strict';
import { renderAtlas } from '../src/pages/atlas.js';

// 只替代布局与 Canvas；键盘默认行为另用真实浏览器验收。
class TestNode {
  constructor(tag = '') { this.tagName = tag.toUpperCase(); this.children = []; this.attributes = {}; this.listeners = {}; this.style = {}; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  append(...nodes) { for (const node of nodes) { node.parentElement = this; this.children.push(node); } }
  addEventListener(key, fn) { (this.listeners[key] ??= []).push(fn); }
  closest(selector) { return selector.split(',').some(tag => this.tagName === tag.trim().toUpperCase()) ? this : this.parentElement?.closest(selector); }
  querySelector(selector) { return this.children.find(node => node.tagName === selector.toUpperCase()) ?? this.children.map(node => node.querySelector(selector)).find(Boolean); }
  getBoundingClientRect() { return { left: 0, top: 0, right: 390, bottom: 844, width: 390, height: 844 }; }
  getContext() {
    if (this.context) return this.context;
    const stack = [], calls = [], arcs = [];
    const context = {
      calls, arcs, font: '10px sans-serif', textAlign: 'start', fillStyle: '#000000',
      createRadialGradient: () => ({ addColorStop() {} }),
      measureText: text => ({ width: [...text].reduce((sum, char) => sum + (char === 'I' ? 3 : 7), 0) }),
      fillText(text, x, y) { calls.push({ text, x, y, font: this.font, textAlign: this.textAlign, fillStyle: this.fillStyle }); },
      arc(...args) { arcs.push(args); },
      save() { stack.push({ font: this.font, textAlign: this.textAlign, fillStyle: this.fillStyle }); },
      restore() { Object.assign(this, stack.pop()); },
    };
    this.context = new Proxy(context, { get: (target, key) => target[key] ?? (() => {}) });
    return this.context;
  }
}
function setup(t, days = 31, overrides = {}) {
  const keys = ['Node', 'document', 'devicePixelRatio', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const previous = keys.map(key => [key, globalThis[key]]);
  let page;
  t.after(() => { page?.destroy(); for (const [key, value] of previous) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } });
  globalThis.Node = TestNode;
  globalThis.document = { createElement: tag => new TestNode(tag), createTextNode: text => Object.assign(new TestNode(), { textContent: text }) };
  globalThis.devicePixelRatio = 1;
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  let scheduled = 0, cancelled = 0;
  globalThis.requestAnimationFrame = () => ++scheduled;
  globalThis.cancelAnimationFrame = () => { cancelled++; };
  const model = { steps: [{ date: '2026-01-01' }, { date: new Date(Date.UTC(2026, 0, 1 + days)).toISOString().slice(0, 10) }], themes: [], ideas: [], refs: [], byId: { idea: new Map() } };
  Object.assign(model, overrides);
  const navigations = [];
  page = renderAtlas({ model, prefs: {}, navigate: hash => navigations.push(hash) }, { params: {} });
  const bar = page.element.querySelector('input');
  function key(target, key, extra = {}) {
    const event = { target, key, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra };
    for (let node = target; node; node = node.parentElement) for (const listener of node.listeners.keydown ?? []) listener(event);
    return event;
  }
  // seek 会记录取消播放，以此观察键盘寻址和重复执行。
  return { page, bar, key, navigations, counts: () => ({ scheduled, cancelled }) };
}

test('天区英文按测量宽度加 2px 字距居中且恢复文本状态，中文与星点命中不变', t => {
  const idea = { id: 'idea', themeId: 'theme', stepKeys: ['step'], updated: '2026-01-01' };
  const { page, navigations } = setup(t, 31, {
    themes: [{ id: 'theme', label: '主题', en: 'AI W' }],
    ideas: [idea], steps: [{ key: 'step', ideaId: 'idea', date: '2026-01-01' }],
    byId: { idea: new Map([['idea', idea]]) },
  });
  const canvas = page.element.querySelector('canvas'), c = canvas.getContext('2d');
  // 不提供 letterSpacing；不同字符宽度可抓住等宽假设和末尾多加间距。
  const english = c.calls.filter(call => call.font === '10px "Geist Mono",monospace').slice(0, 4);
  assert.deepEqual(english.map(call => call.text), ['A', 'I', ' ', 'W']);
  const totalWidth = 7 + 3 + 7 + 7 + 3 * 2, left = 195 - totalWidth / 2;
  assert.deepEqual(english.map(call => call.x), [left, left + 9, left + 14, left + 23]);
  assert.ok(english.every(call => call.textAlign === 'left' && Math.abs(call.y - 240.4) < 1e-9));
  const chinese = c.calls.find(call => call.text === '主题');
  assert.equal(chinese.font, '15px "Noto Serif SC",serif');
  assert.equal(chinese.textAlign, 'center');
  assert.equal(chinese.x, 195);
  assert.ok(Math.abs(chinese.y - 224.4) < 1e-9);
  assert.equal(c.font, chinese.font);
  assert.equal(c.textAlign, chinese.textAlign);
  assert.equal(c.fillStyle, '#cfe3ff');
  const x = 195 + 0.045 * 390 * Math.sqrt(0.6), y = 305;
  assert.ok(c.arcs.some(([sx, sy, radius]) => sx === x && sy === y && radius === 3.1));
  for (const click of canvas.listeners.click) click({ clientX: x, clientY: y });
  assert.deepEqual(navigations, ['#/q/idea']);
  for (const click of canvas.listeners.click) click({ clientX: x + 9, clientY: y });
  assert.equal(navigations.length, 1);
});

test('进度键阻止默认步进，每次仅寻址一次且到达正确端点', t => {
  const { bar, key, counts } = setup(t);
  for (const [name, value] of [['Home', 0], ['ArrowRight', 7], ['ArrowLeft', 0], ['End', 31]]) {
    const before = counts().cancelled;
    assert.equal(key(bar, name).defaultPrevented, true, name);
    assert.equal(Number(bar.value), value, name);
    assert.equal(counts().cancelled, before + 1, name);
  }
});

test('按钮、链接和输入框上的空格保留原生语义且不启动播放', t => {
  const { page, bar, key, counts } = setup(t);
  const control = bar.parentElement;
  const targets = [...control.children.filter(node => node.tagName === 'BUTTON'), bar, page.element.querySelector('a')];
  for (const target of targets) {
    const before = counts();
    assert.equal(key(target, ' ').defaultPrevented, false, target.tagName);
    assert.deepEqual(counts(), before);
  }
});

test('页面入口和画布上下文空格仍可播放暂停，已处理事件不重复执行', t => {
  const { page, key, counts } = setup(t);
  const entry = page.element.querySelector('h1');
  assert.equal(key(entry, ' ').defaultPrevented, true);
  assert.equal(counts().scheduled, 1);
  const before = counts().cancelled;
  key(page.element.querySelector('canvas'), ' ');
  assert.equal(counts().cancelled, before + 1);
  const stopped = counts();
  key(entry, ' ', { defaultPrevented: true });
  assert.deepEqual(counts(), stopped);
});
