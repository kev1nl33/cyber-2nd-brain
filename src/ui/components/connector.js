import { h } from '../dom.js';

export function renderConnector(step, overlayState, handlers = {}) {
  const decision = overlayState?.decisions?.[`conn:${step.key}`] ?? (overlayState?.verdict ? overlayState : null);
  const inferred = step.connection === 'inferred';
  const root = h('div', { class: `connector connector--${inferred ? 'inferred' : 'recorded'}`, dataset: { connection: step.connection } });
  if (!inferred) {
    root.append(h('span', { class: 'connector__link' }, step.link));
    return root;
  }
  root.append(h('span', { class: 'connector__link' }, `「${step.link}」`));
  const labels = { confirmed: '推断 · 你已确认', revised: `推断 · 你的修正：${decision?.note ?? ''}`, rejected: '推断 · 你认为不成立' };
  root.append(h('span', { class: `connector__state${decision ? ` is-${decision.verdict}` : ''}` }, decision ? labels[decision.verdict] : '推断 · 待确认'));
  if (decision) return root;
  const actions = h('div', { class: 'connector__actions' });
  const editor = h('form', { class: 'connector__editor', hidden: true });
  const input = h('textarea', { placeholder: '写下你的修正', 'aria-label': '写下你的修正', rows: 3 });
  const submit = h('button', { class: 'button button--small', type: 'submit', disabled: true }, '修改');
  const close = () => { editor.hidden = true; actions.hidden = false; edit.focus(); handlers.onLayout?.(); };
  const decide = (verdict, note) => handlers.onDecide?.(`conn:${step.key}`, verdict, note);
  const save = event => {
    event.preventDefault();
    if (input.value.trim()) decide('revised', input.value.trim());
  };
  input.addEventListener('input', () => { submit.disabled = !input.value.trim(); });
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') save(event);
  });
  editor.addEventListener('submit', save);
  editor.append(input, submit, h('button', { class: 'button button--text button--small', type: 'button', onclick: close }, '收起'));
  const edit = h('button', { class: 'button button--small', type: 'button', onclick: () => {
    editor.hidden = false; actions.hidden = true; input.focus(); handlers.onLayout?.();
  } }, '修改');
  actions.append(h('button', { class: 'button button--small', type: 'button', onclick: () => decide('confirmed') }, '确认'), edit,
    h('button', { class: 'button button--small', type: 'button', onclick: () => decide('rejected') }, '不成立'));
  root.append(actions, editor);
  root.openEditor = () => edit.click();
  return root;
}
export default renderConnector;
