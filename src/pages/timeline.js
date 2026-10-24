import { h } from '../ui/dom.js';
import { PHASE_LABEL } from '../data/taxonomy.js';
import { fmtLong, fmtShort, diffDays } from '../data/dates.js';
import { renderEmpty } from '../ui/components/empty.js';
const dayPx = 3;
export function layoutTimelinePoints(points) {
  const items = [], shifts = [];
  let shift = 22;
  for (const point of [...points].sort((a, b) => a.day - b.day || a.key.localeCompare(b.key))) {
    let y = point.day * dayPx + shift;
    for (const previous of items) {
      if (Math.abs(point.x - previous.x) < 44) y = Math.max(y, previous.y + 44);
    }
    shift = y - point.day * dayPx;
    shifts.push({ day: point.day, shift });
    items.push({ ...point, y });
  }
  const dayY = day => {
    let offset = 22;
    for (const entry of shifts) {
      if (entry.day > day) break;
      offset = entry.shift;
      if (entry.day === day) break;
    }
    return day * dayPx + offset;
  };
  return { items, dayY };
}
export function renderTimeline(ctx) {
  const { model } = ctx;
  const element = h('section', { class: 'timeline' });
  const desktop = h('div', { class: 'timeline__chart' });
  const mobile = h('div', { class: 'timeline__list' });
  const tooltip = h('div', { class: 'timeline-tooltip', role: 'tooltip', hidden: true });
  element.append(h('h1', { tabindex: '-1' }, '年表'), desktop, mobile, tooltip);
  const positionOf = idea => {
    const theme = model.byId.theme.get(idea.themeId);
    const ordered = [...new Set(theme.ideaIds.map(id => model.byId.idea.get(id)).filter(idea => idea.stepKeys.length).map(idea => idea.id))].sort();
    const count = Math.min(7, Math.max(ordered.length, 1));
    const index = ordered.indexOf(idea.id);
    return { count, offset: index < 0 ? 0.5 : (index % count + 0.5) / count };
  };
  function show(node, step) {
    const idea = model.byId.idea.get(step.ideaId);
    tooltip.replaceChildren(h('p', { class: 'timeline-tooltip__meta' }, `${fmtLong(step.date)} · ${PHASE_LABEL[step.phase]} · ${step.kind}`),
      h('p', {}, step.title), h('p', { class: 'timeline-tooltip__idea' }, idea?.title ?? ''));
    tooltip.hidden = false;
    const box = node.getBoundingClientRect();
    const host = element.getBoundingClientRect();
    const anchorX = box.left - host.left + box.width / 2;
    tooltip.style.left = `${anchorX}px`;
    tooltip.style.top = `${box.top - host.top + box.height / 2}px`;
    tooltip.style.transform = anchorX + tooltip.offsetWidth > host.width ? 'translateX(-100%)' : '';
    node.setAttribute('aria-describedby', 'timeline-tooltip');
    tooltip.id = 'timeline-tooltip';
  }
  const hide = node => { tooltip.hidden = true; node?.removeAttribute('aria-describedby'); };
  function draw() {
    const steps = model.steps.filter(step => step.date);
    if (!steps.length) { element.replaceChildren(h('h1', { tabindex: '-1' }, '年表'), renderEmpty('还没有步骤数据。')); return; }
    const first = steps.reduce((min, step) => step.date < min ? step.date : min, steps[0].date);
    const lastDate = steps.reduce((max, step) => step.date > max ? step.date : max, steps[0].date);
    const start = new Date(`${first.slice(0, 7)}-01T00:00:00Z`);
    const endMonth = `${lastDate.slice(0, 7)}-01`;
    const endDate = new Date(Date.UTC(new Date(`${endMonth}T00:00:00Z`).getUTCFullYear(), new Date(`${endMonth}T00:00:00Z`).getUTCMonth() + 1, 0));
    const totalDays = Math.round((endDate - start) / 86400000) + 1;
    const columns = model.themes.slice(0, 5);
    const offsetMap = new Map(steps.map(step => [step.key, diffDays(start.toISOString().slice(0, 10), step.date)]));
    const positioned = steps.map(step => {
      const idea = model.byId.idea.get(step.ideaId);
      const { count, offset } = positionOf(idea);
      return { step, lane: columns.findIndex(theme => theme.id === step.themeId), offset, count, day: offsetMap.get(step.key) };
    }).filter(item => item.lane >= 0);
    const header = h('div', { class: 'timeline__header' }, h('div', { class: 'timeline__months-head', 'aria-hidden': 'true' }),
      columns.map(theme => h('div', { class: 'timeline__column-head' }, h('span', {}, `${theme.code} ${theme.label}`), h('span', { class: 'timeline__column-count' }, `${theme.stepCount} 步`))));
    const months = h('div', { class: 'timeline__months' });
    const marks = h('div', { class: 'timeline__marks', 'aria-hidden': 'true' });
    let cursor = new Date(start);
    const firstMonth = start.toISOString().slice(0, 7);
    while (cursor <= endDate) {
      const month = cursor.toISOString().slice(0, 7);
      const dayIndex = diffDays(start.toISOString().slice(0, 10), `${month}-01`);
      const year = cursor.getUTCFullYear();
      const label = month === firstMonth || cursor.getUTCMonth() === 0 ? `${year}.${String(cursor.getUTCMonth() + 1).padStart(2, '0')}` : `${String(cursor.getUTCMonth() + 1).padStart(2, '0')} 月`;
      marks.append(h('div', { class: 'timeline__month-line', style: { top: `${dayIndex * dayPx}px` } }));
      months.append(h('div', { class: 'timeline__month', style: { top: `${dayIndex * dayPx}px` } }, label));
      cursor = new Date(Date.UTC(year, cursor.getUTCMonth() + 1, 1));
    }
    const lanes = columns.map((theme, index) => h('div', { class: 'timeline__lane', dataset: { themeId: theme.id } }));
    const chartLanes = h('div', { class: 'timeline__lanes', style: { gridTemplateColumns: `repeat(${columns.length}, minmax(0,1fr))` } }, marks, lanes);
    const grid = h('div', { class: 'timeline__grid' }, months, chartLanes);
    desktop.replaceChildren(header, grid);
    function updateHits() {
      if (!chartLanes.clientWidth) return;
      hide();
      const laneWidth = chartLanes.clientWidth / columns.length;
      const { items, dayY } = layoutTimelinePoints(positioned.map(item => ({ ...item, key: item.step.key,
        x: item.lane * laneWidth + 22 + item.offset * Math.max(0, laneWidth - 44) })));
      grid.style.height = `${dayY(totalDays) + 22}px`;
      [...marks.children].forEach((node, i) => { node.style.top = `${dayY(diffDays(start.toISOString().slice(0,10), new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth()+i, 1)).toISOString().slice(0,10)))}px`; });
      [...months.children].forEach((node, i) => { node.style.top = marks.children[i].style.top; });
      lanes.forEach(lane => lane.replaceChildren());
      for (const item of items) {
        const idea = model.byId.idea.get(item.step.ideaId);
        const node = h('a', { class: 'timeline-dot', href: `#/q/${encodeURIComponent(item.step.ideaId)}/${encodeURIComponent(item.step.id)}`,
          dataset: { phase: item.step.phase, key: item.key },
          'aria-label': `${item.step.date} ${idea?.title ?? ''}：${item.step.title}`,
          style: { top: `${item.y}px`, left: `${item.x-item.lane*laneWidth}px` },
          onfocus: () => show(node, item.step), onblur: () => hide(node),
          onmouseenter: () => show(node, item.step), onmouseleave: () => hide(node) });
        lanes[item.lane].append(node);
      }
      const previous = new Map();
      for (const item of items) {
        const before = previous.get(item.step.ideaId);
        if (before) lanes[item.lane].append(h('span', { class: `timeline-link${item.step.connection === 'inferred' ? ' timeline-link--inferred' : ''}`,
          style: { top: `${before.y}px`, height: `${item.y-before.y}px`, left: `${item.x-item.lane*laneWidth}px` }, 'aria-hidden': 'true' }));
        previous.set(item.step.ideaId, item);
      }
    }
    const observer = new ResizeObserver(updateHits);
    observer.observe(chartLanes);
    cleanup = () => observer.disconnect();
    updateHits();
    const monthKey = date => date.slice(0, 7);
    const byMonth = new Map();
    for (const step of [...steps].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.key.localeCompare(b.key)))) {
      const list = byMonth.get(monthKey(step.date)) ?? [];
      list.push(step); byMonth.set(monthKey(step.date), list);
    }
    for (const [month, list] of byMonth) {
      const section = h('section', { class: 'timeline-month' },
        h('h2', { class: 'timeline-month__title' }, `${month.replace('-', '.')} · ${list.length} 步`),
        h('ul', {}, list.map(step => {
          const idea = model.byId.idea.get(step.ideaId);
          return h('li', { class: 'timeline-month__item' }, h('a', { href: `#/q/${encodeURIComponent(step.ideaId)}/${encodeURIComponent(step.id)}` },
            h('time', { class: 'timeline-month__date' }, fmtShort(step.date)),
            h('span', { class: 'timeline-month__dot', dataset: { phase: step.phase }, 'aria-hidden': 'true' }),
            h('span', { class: 'timeline-month__body' },
              h('span', { class: 'timeline-month__step-title' }, step.title),
              h('span', { class: 'timeline-month__idea-title' }, idea?.title ?? ''))));
        })));
      mobile.append(section);
    }
  }
  let cleanup = () => {};
  draw();
  return { element, update: () => true, destroy() { cleanup(); tooltip.hidden = true; } };
}
export default renderTimeline;
