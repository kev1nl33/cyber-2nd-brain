import test from 'node:test';
import assert from 'node:assert/strict';
import { openPalette } from '../src/ui/components/palette.js';
import { buildIndex, search } from '../src/data/search.js';

// 仅模拟面板使用的 DOM 接口，真实快捷键另由浏览器验收。
class TestNode {
  constructor(tag = '', text = '') {
    this.tagName = tag; this.text = text; this.children = []; this.attributes = {}; this.listeners = {}; this.value = '';
    this.classList = { toggle() {} };
  }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key]; }
  addEventListener(key, fn) { this.listeners[key] = fn; }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  replaceChildren() { this.children = []; }
  remove() { this.parent.children = this.parent.children.filter(node => node !== this); }
  focus() { document.activeElement = this; }
  scrollIntoView() {}
  get isConnected() { return true; }
  get textContent() { return this.text + this.children.map(node => node.textContent).join(''); }
  querySelectorAll(selector) {
    const match = node => selector.startsWith('#') ? node.attributes.id === selector.slice(1)
      : selector.startsWith('.') ? node.className === selector.slice(1)
      : selector === '[role=option]' ? node.attributes.role === 'option' : selector.split(',').includes(node.tagName);
    return this.children.flatMap(node => [...(match(node) ? [node] : []), ...node.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
}
function setup(t) {
  const previous = ['Node', 'document'].map(key => [key, globalThis[key]]);
  t.after(() => { for (const [key, value] of previous) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } });
  globalThis.Node = TestNode;
  const root = new TestNode('div'); root.setAttribute('id', 'overlay-root');
  globalThis.document = {
    activeElement: new TestNode('button'), querySelector: selector => selector === '#overlay-root' ? root : root.querySelector(selector),
    createElement: tag => new TestNode(tag), createElementNS: (_, tag) => new TestNode(tag),
    createTextNode: text => new TestNode('', text), addEventListener() {}, removeEventListener() {},
  };
  const model = Object.fromEntries(['ideas','steps','lessons','patterns','themes','sources'].map(key => [key, []]));
  const executed = [];
  const commands = ['今天','待核对','年表','回望','太史公曰','来源','切换深色/浅色','切换动效','导出核对记录','复制当前链接']
    .map((name, i) => ({ id: i < 6 ? `go-${i}` : ['theme','motion','export','copy'][i - 6], name, run: () => executed.push(i) }));
  const modal = openPalette({ model }, commands);
  const input = modal.dialog.querySelector('input'), results = modal.dialog.querySelector('#palette-results');
  const key = value => input.listeners.keydown({ key: value, preventDefault() {} });
  const query = value => { input.value = value; input.listeners.input(); };
  return { input, results, key, query, executed, model, commands };
}

test('空查询和空格查询分为前往6项、操作4项，保持命令顺序', t => {
  const { results, query, commands } = setup(t);
  for (const value of ['', '   ']) {
    query(value);
    assert.deepEqual(results.querySelectorAll('h3').map(node => node.textContent), ['前往','操作']);
    assert.deepEqual(results.children.map(node => node.textContent), ['前往', ...commands.slice(0,6).map(c => c.name), '操作', ...commands.slice(6).map(c => c.name)]);
    assert.deepEqual(results.querySelectorAll('[role=option]').map(node => node.attributes.id), commands.map((_, i) => `palette-option-${i}`));
  }
});

test('上下键跨组连续移动且 Enter 执行对应操作', t => {
  const { input, key, executed } = setup(t);
  for (let i = 0; i < 6; i++) key('ArrowDown');
  assert.equal(input.getAttribute('aria-activedescendant'), 'palette-option-6');
  key('ArrowUp');
  assert.equal(input.getAttribute('aria-activedescendant'), 'palette-option-5');
  key('ArrowDown'); key('Enter');
  assert.deepEqual(executed, [6]);
});

test('非空查询保留类型标题、搜索顺序和每组上限5', t => {
  const { results, query, model, commands } = setup(t);
  for (const group of ['ideas','steps','lessons','patterns','themes','sources']) {
    model[group].push(...Array.from({ length: 7 }, (_, i) => ({ id: `${group}-${i}`, key: `${group}-${i}`, title: `示例${i}`, text: `示例${i}`, name: `示例${i}`, label: `示例${i}` })));
  }
  commands.forEach(command => { command.name = `示例${command.name}`; });
  // 重新打开以建立含六类结果的真实索引。
  document.querySelector('.modal-backdrop').remove();
  const modal = openPalette({ model }, commands);
  const input = modal.dialog.querySelector('input'), list = modal.dialog.querySelector('#palette-results');
  input.value = '示例'; input.listeners.input();
  const expected = search(buildIndex(model, commands), '示例');
  assert.deepEqual(list.querySelectorAll('h3').map(node => node.textContent), ['问题','步骤','经验','主题','来源','命令']);
  assert.deepEqual(list.querySelectorAll('[role=option]').map(node => node.textContent), Object.values(expected).flat().map(entry => entry.title));
  assert.deepEqual(Object.values(expected).map(items => items.length), [5,5,5,5,5,5]);
});
