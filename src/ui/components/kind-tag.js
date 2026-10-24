import { h } from '../dom.js';
import { PHASE_LABEL, phaseOf } from '../../data/taxonomy.js';

export function renderKindTag(step) {
  const kind = typeof step === 'string' ? step : step.kind;
  const phase = typeof step === 'string' ? phaseOf(kind) : step.phase ?? phaseOf(kind);
  return h('span', { class: 'kind-tag', dataset: { phase } },
    h('span', { class: 'kind-tag__dot', 'aria-hidden': 'true' }), `${PHASE_LABEL[phase]} · ${kind}`);
}
export default renderKindTag;
