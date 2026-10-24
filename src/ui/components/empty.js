import { h } from '../dom.js';

export function renderEmpty(message, { href, label, title } = {}) {
  return h('div', { class: 'empty' }, title ? h('h2', {}, title) : null,
    h('p', {}, message), href ? h('a', { href }, label) : null);
}
export default renderEmpty;
