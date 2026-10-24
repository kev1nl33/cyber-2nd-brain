import { h } from '../dom.js';
import { fmtShort } from '../../data/dates.js';

export function renderNote(ref, sourceDoc, number, { expanded = false, onToggle, id } = {}) {
  const missing = ref.missing || !sourceDoc;
  const contentId = `${id ?? `note-${number}`}-text`;
  const body = h('div', { class: 'note__original', id: contentId, hidden: !expanded }, sourceDoc?.text ?? '');
  const toggle = h('button', { class: 'note__toggle button button--text button--small', type: 'button',
    'aria-expanded': String(expanded), 'aria-controls': contentId, onclick: () => onToggle?.() }, expanded ? '收起' : '查看原文');
  const origin = { flomo: 'flomo', obsidian: 'Obsidian', conversation: '对话' };
  const root = h('article', { class: `note${missing ? ' note--missing' : ''}`, id, tabindex: '-1', dataset: { sourceId: ref.sourceId, number } },
    h('div', { class: 'note__heading' }, h('sup', { class: 'note__number' }, number),
      h('span', { class: 'note__title' }, missing ? '来源缺失' : sourceDoc.title)),
    missing ? null : h('p', { class: 'note__meta' }, `${origin[sourceDoc.origin] ?? sourceDoc.kind} · ${fmtShort(sourceDoc.date)}`),
    h('blockquote', { class: 'note__quote' }, `「${ref.quote}」`), missing ? null : toggle, missing ? null : body);
  root.setExpanded = value => {
    body.hidden = !value; toggle.textContent = value ? '收起' : '查看原文';
    toggle.setAttribute('aria-expanded', String(value));
  };
  return root;
}
export default renderNote;
