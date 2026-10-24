import { h } from '../ui/dom.js';
import { reviewQueue } from '../data/derive.js';
import { fmtLong } from '../data/dates.js';
import { renderReviewItem, reviewSummary } from '../ui/components/review-item.js';
import { renderPhaseBar } from '../ui/components/phase-bar.js';
import { renderKindTag } from '../ui/components/kind-tag.js';
import { renderEmpty } from '../ui/components/empty.js';

const hashFor = key => key ? `#/review/${encodeURIComponent(key)}` : '#/review';
const isEditable = target => target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])');
const verdictLabel = { confirmed: '确认', revised: '修改', rejected: '不成立' };

export function renderReview(ctx, initialRoute) {
  const model = ctx.model;
  let route = initialRoute;
  let filter = 'all';
  let selected = null;
  let destroyed = false;
  let busy = false;
  let timer;
  let pointer = null;
  let editor;
  let editorInput;
  let detail;
  let list;
  let queue = [];
  let filtered = [];
  const rows = new Map();
  const element = h('section', { class: 'review' });
  const hiddenFile = h('input', { type: 'file', accept: 'application/json', hidden: true, onchange: async () => {
    const file = hiddenFile.files?.[0];
    if (file) await ctx.importReview(file);
    hiddenFile.value = '';
  } });
  const tabs = h('div', { class: 'review__tabs', role: 'tablist', 'aria-label': '待核对分类' });
  const body = h('div', { class: 'review__body' });
  element.append(h('header', { class: 'review__header' }, h('h1', { tabindex: '-1' }, '待核对'),
    h('div', { class: 'review__tools' }, h('button', { class: 'button button--outline', type: 'button', onclick: () => ctx.exportReview() }, '导出核对记录'),
      h('button', { class: 'button button--outline', type: 'button', onclick: () => hiddenFile.click() }, '导入'))),
    model.mode === 'sample' ? h('p', { class: 'review__sample' }, '示例模式 · 核对记录只保存在本次会话') : null, hiddenFile, tabs, body);

  function allItems() {
    return [
      ...model.lessons.filter(target => target.pending).map(target => ({ type: 'lesson', key: `lesson:${target.id}`, target })),
      ...model.steps.filter(target => target.connection === 'inferred').map(target => ({ type: 'conn', key: `conn:${target.key}`, target })),
      ...model.ideas.filter(target => target.status === 'pending').map(target => ({ type: 'idea', key: `idea:${target.id}`, target })),
    ];
  }
  function go(key) {
    route = { page: 'review', params: key ? { key } : {} };
    ctx.navigate(hashFor(key), { replace: true });
  }
  function drawTabs() {
    const done = Object.keys(ctx.overlay?.decisions ?? {}).length;
    const specs = [['all', '全部', queue.length], ['conn', '推断关联', queue.filter(i => i.type === 'conn').length],
      ['lesson', '待确认经验', queue.filter(i => i.type === 'lesson').length], ['idea', '候选问题', queue.filter(i => i.type === 'idea').length], ['done', '已处理', done]];
    tabs.replaceChildren(...specs.map(([id, label, count]) => h('button', {
      type: 'button', role: 'tab', class: `review__tab${(route.params?.done ? id === 'done' : filter === id) ? ' is-active' : ''}`,
      'aria-selected': String(route.params?.done ? id === 'done' : filter === id), onclick: () => {
        if (busy) return;
        if (id === 'done') { ctx.navigate('#/review/done', { replace: true }); return; }
        filter = id;
        route = { page: 'review', params: {} };
        draw();
        go(selected?.key);
      },
    }, `${label} ${count}`)));
  }
  function stepCard(step, label) {
    const refs = model.refs.filter(ref => ref.stepKey === step.key);
    return h('section', { class: 'review-step' }, h('h3', { class: 'review-step__label' }, label),
      h('div', { class: 'review-step__meta' }, fmtLong(step.date), renderKindTag(step)),
      h('h4', { class: 'review-step__title' }, step.title), h('p', { class: 'review-step__body' }, step.body),
      refs.map((ref, index) => {
        const source = model.byId.source.get(ref.sourceId);
        return h('p', { class: `review-step__ref${ref.missing ? ' is-missing' : ''}` }, h('sup', {}, index + 1),
          source ? h('a', { href: `#/q/${encodeURIComponent(step.ideaId)}/${encodeURIComponent(step.id)}/src/${encodeURIComponent(ref.sourceId)}` }, source.title) : '来源缺失',
          ` 「${ref.quote}」`);
      }));
  }
  function operation(action, note) {
    if (!selected || busy) return;
    busy = true;
    const item = selected;
    const index = filtered.findIndex(i => i.key === item.key);
    const next = filtered[index + 1] ?? filtered[index - 1];
    rows.get(item.key)?.classList.add('is-removing');
    detail?.classList.add('is-busy');
    const run = () => {
      if (destroyed) return;
      // Navigate before the coordinator callback refreshes and replaces this page.
      go(next?.key);
      busy = false;
      if (action === 'snooze') ctx.snooze(item.key);
      else ctx.decide(item.key, action, note);
    };
    if (ctx.prefs?.motion === 'off' || document.documentElement.dataset.motion === 'off') run();
    else timer = setTimeout(run, 200);
  }
  function openEditor() {
    if (busy || !editor) return;
    editor.hidden = false; editorInput.focus();
  }
  function drawDetail() {
    editor = null; editorInput = null;
    detail = h('section', { class: 'review__detail', 'aria-label': '核对详情' });
    if (!selected) { detail.append(renderEmpty('都核对过了。', { href: '#/', label: '去看看今天' })); return detail; }
    const { type, target } = selected;
    detail.append(h('a', { class: 'review__back', href: '#/review', onclick: event => { event.preventDefault(); go(); } }, '← 待核对'));
    const prompt = { conn: '这一步真的是从上一步来的吗？', lesson: '这条经验说得准确吗？', idea: '这样整理这个问题，你认可吗？' };
    detail.append(h('h2', { class: 'review__prompt', tabindex: '-1' }, prompt[type]));
    if (type === 'conn') {
      const idea = model.byId.idea.get(target.ideaId);
      const previous = model.byId.step.get(idea.stepKeys[target.index - 2]);
      detail.append(previous ? stepCard(previous, '上一步') : h('section', { class: 'review-step' }, h('h3', {}, '问题'), h('p', {}, idea.title)),
        h('div', { class: 'review__connector', dataset: { connection: 'inferred' } }, `「${target.link}」 推断`), stepCard(target, '这一步'));
    } else if (type === 'lesson') {
      detail.append(h('p', { class: 'review__lesson' }, `「${target.text}」`),
        target.patternIds.map(id => model.byId.pattern.get(id)).filter(Boolean).map(pattern => h('p', { class: 'review__pattern' }, `${pattern.name} · ${pattern.level}`)),
        target.stepKeys.map(key => model.byId.step.get(key)).filter(Boolean).map(step => stepCard(step, `第 ${step.index} 步`)));
    } else {
      detail.append(h('h3', { class: 'review__idea-title' }, target.title), h('p', { class: 'review__status' }, target.statusRaw), renderPhaseBar(target.phases),
        h('ol', { class: 'review__idea-steps' }, target.stepKeys.map(key => model.byId.step.get(key)).filter(Boolean).map(step => h('li', {},
          h('a', { href: `#/q/${encodeURIComponent(target.id)}/${encodeURIComponent(step.id)}` }, step.title)))));
    }
    editorInput = h('textarea', { rows: 4, placeholder: '写下你的修正', 'aria-label': '写下你的修正' });
    const submit = h('button', { type: 'submit', class: 'button', disabled: true }, '修改');
    editor = h('form', { class: 'review__editor', hidden: true, onsubmit: event => {
      event.preventDefault(); if (editorInput.value.trim()) operation('revised', editorInput.value.trim());
    } }, editorInput, submit, h('button', { type: 'button', class: 'button button--text', onclick: closeEditor }, '收起'));
    editorInput.addEventListener('input', () => { submit.disabled = !editorInput.value.trim(); });
    editorInput.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeEditor(); }
      else if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); if (editorInput.value.trim()) operation('revised', editorInput.value.trim()); }
    });
    const actions = h('div', { class: 'review__actions' },
      [['Y', '确认', () => operation('confirmed')], ['E', '修改', openEditor], ['N', '不成立', () => operation('rejected')], ['S', '稍后', () => operation('snooze')]].map(([key, label, onclick]) =>
        h('button', { type: 'button', class: 'button button--outline', onclick }, h('kbd', {}, key), label)));
    detail.append(editor, actions);
    detail.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'touch' || event.target.closest('a,button,textarea,input') || busy || window.innerWidth >= 640) return;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, width: detail.getBoundingClientRect().width };
    });
    detail.addEventListener('pointermove', event => {
      if (!pointer || pointer.id !== event.pointerId) return;
      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) { pointer = null; detail.style.transform = ''; return; }
      if (Math.abs(dx) > 10) { detail.setPointerCapture(event.pointerId); detail.style.transform = `translateX(${dx}px)`; }
    });
    detail.addEventListener('pointerup', event => {
      if (!pointer || pointer.id !== event.pointerId) return;
      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      const threshold = pointer.width * .3;
      pointer = null; detail.style.transform = '';
      if (Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy)) operation(dx > 0 ? 'confirmed' : 'snooze');
    });
    detail.addEventListener('pointercancel', () => { pointer = null; detail.style.transform = ''; });
    return detail;
  }
  function closeEditor() {
    if (!editor) return;
    editor.hidden = true;
    detail.querySelectorAll('.review__actions button')[1]?.focus();
  }
  function drawDone() {
    const items = new Map(allItems().map(item => [item.key, item]));
    const decisions = Object.entries(ctx.overlay?.decisions ?? {}).sort((a, b) => b[1].at.localeCompare(a[1].at));
    return h('div', { class: 'review__done' }, decisions.length ? h('ul', { class: 'review__done-list' }, decisions.map(([key, decision]) => {
      const item = items.get(key);
      const summary = item ? reviewSummary(item, model).title : key;
      const date = new Date(decision.at);
      const time = Number.isNaN(date.getTime()) ? '' : `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
      return h('li', { class: 'review-done' }, h('h2', {}, summary), h('span', { class: 'review-done__verdict' }, verdictLabel[decision.verdict]),
        decision.note ? h('p', { class: 'review-done__note' }, decision.note) : null,
        h('time', { datetime: decision.at }, `${fmtLong(decision.at)} ${time}`),
        h('button', { type: 'button', class: 'button button--text', onclick: () => ctx.undo(key) }, '撤销'));
    })) : renderEmpty('都核对过了。', { href: '#/', label: '去看看今天' }));
  }
  function draw() {
    if (destroyed) return;
    queue = reviewQueue(model, ctx.overlay, model.today);
    filtered = filter === 'all' ? queue : queue.filter(item => item.type === filter);
    const requested = queue.find(item => item.key === route.params?.key);
    if (requested && filter !== 'all' && requested.type !== filter) { filter = 'all'; filtered = queue; }
    selected = requested ?? filtered[0] ?? null;
    element.classList.toggle('review--detail', Boolean(route.params?.key));
    element.classList.toggle('review--done', Boolean(route.params?.done));
    drawTabs(); rows.clear();
    if (route.params?.done) { body.replaceChildren(drawDone()); return; }
    list = h('ul', { class: 'review__list', 'aria-label': '待核对条目' }, filtered.map(item => {
      const row = renderReviewItem(item, { model, selected: item.key === selected?.key, onSelect: () => { if (!busy) go(item.key); } });
      rows.set(item.key, row); return row;
    }));
    body.replaceChildren(list, drawDetail());
  }
  function update(nextRoute) {
    if (nextRoute.page !== 'review') return false;
    route = nextRoute;
    if (!busy) draw();
    return true;
  }
  function onKey(event) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isEditable(event.target) || busy || route.params?.done) return false;
    const key = event.key.toLowerCase();
    const index = filtered.findIndex(item => item.key === selected?.key);
    let handled = true;
    if (['j', 'k', 'arrowdown', 'arrowup'].includes(key)) {
      const next = filtered[Math.max(0, Math.min(filtered.length - 1, index + (key === 'j' || key === 'arrowdown' ? 1 : -1)))];
      if (next) go(next.key);
    } else if (selected && key === 'y') operation('confirmed');
    else if (selected && key === 'e') openEditor();
    else if (selected && key === 'n') operation('rejected');
    else if (selected && key === 's') operation('snooze');
    else handled = false;
    if (handled) event.preventDefault();
    return handled;
  }
  draw();
  return { element, update, onKey, destroy() { destroyed = true; clearTimeout(timer); pointer = null; } };
}
export default renderReview;
