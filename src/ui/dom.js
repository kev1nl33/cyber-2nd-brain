export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'value') el.value = value;
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child !== null && child !== undefined && child !== false) el.append(child instanceof Node ? child : text(child));
  }
  return el;
}
export function text(value) { return document.createTextNode(String(value)); }
export function clear(el) { el.replaceChildren(); }
export function icon(name) {
  const paths = { today: 'M2 11h12M4 9a4 4 0 0 1 8 0M8 1v2M1 6l2 1M15 6l-2 1', review: 'M3 2h10v12H3zM5 8l2 2 4-5', timeline: 'M5 1v14M3 4h4M3 11h4M10 4h4M10 11h4', atlas: 'M8 1l2 5 5 2-5 2-2 5-2-5-5-2 5-2z', lessons: 'M8 4C6 2 3 2 1 3v10c3-1 5-1 7 1 2-2 4-2 7-1V3c-2-1-5-1-7 1v10', sources: 'M3 1h7l3 3v11H3zM9 1v4h4M5 8h6M5 11h6', search: 'M11 11l4 4M12 7a5 5 0 1 1-10 0 5 5 0 0 1 10 0', copy: 'M5 5h9v10H5zM11 3V1H1v10h2', theme: 'M8 1a7 7 0 1 0 0 14V1z', motion: 'M1 8c3-10 4 10 7 0s4 10 7 0', close: 'M3 3l10 10M13 3L3 13', arrow: 'M5 3l5 5-5 5' };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({ viewBox:'0 0 16 16', width:'16', height:'16', fill:'none', stroke:'currentColor', 'stroke-width':'1.5', 'stroke-linecap':'round', 'stroke-linejoin':'round', 'aria-hidden':'true' })) svg.setAttribute(key,value);
  const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', paths[name] ?? paths.arrow); svg.append(path); return svg;
}
