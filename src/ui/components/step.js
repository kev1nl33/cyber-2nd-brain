import { h } from '../dom.js';
import { PHASE_LABEL } from '../../data/taxonomy.js';
import { fmtShort } from '../../data/dates.js';
import { renderKindTag } from './kind-tag.js';
import { renderConnector } from './connector.js';

export function renderStep(step, { selected = false, refNumbers = [], overlayState, onSelect, onDecide,
  showYear = step.index === 1, latest = step.index === step.total, onRef, onLayout } = {}) {
  const connector = renderConnector(step, overlayState, { onDecide, onLayout });
  const connectionSlot = h('div', { class: 'step__connection' }, connector);
  const body = h('p', { class: 'step__body' }, step.body,
    refNumbers.map((entry, index) => {
      const number = typeof entry === 'number' ? entry : entry.number;
      return h('sup', {}, h('a', { class: 'step__ref', href: `#note-${number}`, 'aria-label': `来源 ${number}`,
        onclick: event => { event.preventDefault(); event.stopPropagation(); onRef?.(index, number); } }, number));
    }));
  const content = h('div', { class: 'step__content' }, renderKindTag(step), h('h2', { class: 'step__title' }, step.title), body);
  const root = h('li', {
    class: `step${selected ? ' is-selected' : ''}${latest ? ' step--latest' : ''}`, tabindex: '0',
    dataset: { stepKey: step.key, stepId: step.id, phase: step.phase, connection: step.connection },
    'aria-label': `第 ${step.index} 步，共 ${step.total} 步，${PHASE_LABEL[step.phase]} · ${step.kind}，${step.date}`,
    onclick: event => { if (!event.target.closest('a,button,input,textarea,summary,details,form')) onSelect?.(step); },
    onkeydown: event => { if (event.target === root && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelect?.(step); } },
  }, step.gapDays >= 14 ? h('div', { class: 'step__gap' }, `间隔 ${step.gapDays} 天`) : null,
  connectionSlot,
  h('div', { class: 'step__date' }, showYear ? h('span', { class: 'step__year' }, step.date?.slice(0, 4)) : null, fmtShort(step.date)),
  h('div', { class: 'step__spine', 'aria-hidden': 'true' }, h('span', { class: 'step__dot' })), content);
  root.updateOverlay = state => connectionSlot.replaceChildren(renderConnector(step, state, { onDecide, onLayout }));
  root.openEditor = () => connectionSlot.firstElementChild?.openEditor?.();
  root.content = content;
  return root;
}
export default renderStep;
