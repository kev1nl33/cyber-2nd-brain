import { h } from '../dom.js';
import { PHASES, PHASE_LABEL } from '../../data/taxonomy.js';

export function renderPhaseBar(phases = [], { mini = false, size } = {}) {
  const present = new Set(phases);
  const compact = mini || size === 'mini';
  const labels = list => list.map(p => PHASE_LABEL[p]).join('、') || '无';
  return h('span', {
    class: `phase-bar phase-bar--${compact ? 'mini' : 'full'}`, role: 'img',
    'aria-label': `已有：${labels(PHASES.filter(p => present.has(p)))}；还没有：${labels(PHASES.filter(p => !present.has(p)))}`,
  }, PHASES.map(phase => h('span', {
    class: `phase-bar__phase${present.has(phase) ? ' is-present' : ''}`, dataset: { phase }, 'aria-hidden': 'true',
  }, h('span', { class: 'phase-bar__dot' }), compact ? null : PHASE_LABEL[phase])));
}
export default renderPhaseBar;
