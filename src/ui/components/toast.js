import { h } from '../dom.js';

const active = [];
export function showToast(message, { label, onAction, duration = 5000 } = {}) {
  let region = document.getElementById('toasts');
  if (!region) {
    region = h('div', { id: 'toasts', class: 'toast-region', role: 'status', 'aria-live': 'polite' });
    document.body.append(region);
  }
  let timer;
  let closed = false;
  const element = h('div', { class: 'toast' }, h('span', { class: 'toast__message' }, message));
  const close = () => {
    if (closed) return;
    closed = true; clearTimeout(timer); element.remove();
    const index = active.indexOf(close); if (index >= 0) active.splice(index, 1);
  };
  if (label && onAction) element.append(h('button', { class: 'toast__action button button--text', type: 'button', onclick: () => { close(); onAction(); } }, label));
  while (active.length >= 2) active[0]();
  active.push(close); region.append(element);
  timer = setTimeout(close, duration);
  return { element, close };
}
export default showToast;
