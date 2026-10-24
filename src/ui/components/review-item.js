import { h } from '../dom.js';

export function reviewSummary(item, model) {
  const target = item.target;
  if (item.type === 'lesson') return { title: `经验 · ${Array.from(target.text).slice(0, 18).join('')}`, subtitle: '' };
  if (item.type === 'idea') return { title: `问题 · ${target.title}`, subtitle: target.statusRaw };
  const idea = model.byId.idea.get(target.ideaId);
  const previous = model.byId.step.get(idea?.stepKeys[target.index - 2]);
  return { title: `推断 · ${previous?.kind ?? '问题'} → ${target.kind}`, subtitle: idea?.title ?? '' };
}
export function renderReviewItem(item, { model, selected = false, onSelect } = {}) {
  const { title, subtitle } = reviewSummary(item, model);
  return h('li', { class: `review-item${selected ? ' is-selected' : ''}`, dataset: { key: item.key } },
    h('a', { class: 'review-item__link', href: `#/review/${encodeURIComponent(item.key)}`,
      'aria-current': selected ? 'true' : undefined,
      onclick: event => { if (onSelect) { event.preventDefault(); onSelect(item); } } },
    h('span', { class: 'review-item__title' }, title), subtitle ? h('span', { class: 'review-item__subtitle' }, subtitle) : null));
}
export default renderReviewItem;
