import { h } from '../dom.js';
import { STATUS_LABEL } from '../../data/taxonomy.js';

export function renderStatusPill(status, { label } = {}) {
  const labels = { ...STATUS_LABEL, confirmed: '已核对', revised: '已核对', reviewed: '已核对', rejected: '你认为不成立' };
  return h('span', { class: `status-pill status-pill--${status}` }, label ?? labels[status] ?? status);
}
export default renderStatusPill;
