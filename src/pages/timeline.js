import { h } from '../ui/dom.js';
import { PHASE_LABEL } from '../data/taxonomy.js';
import { fmtLong, fmtShort, diffDays } from '../data/dates.js';
import { renderEmpty } from '../ui/components/empty.js';
import { openDialog } from '../ui/components/palette.js';

const dayPx = 3;
export function groupTimelineHits(points) {
  const groups = [];
  for (const point of points) {
    const group = { left: point.x - 22, right: point.x + 22, top: point.y - 22, bottom: point.y + 22, items: [point] };
    let index = 0;
    while (index < groups.length) {
      const other = groups[index];
      if (group.left < other.right && group.right > other.left && group.top < other.bottom && group.bottom > other.top) {
        group.left = Math.min(group.left, other.left); group.right = Math.max(group.right, other.right);
        group.top = Math.min(group.top, other.top); group.bottom = Math.max(group.bottom, other.bottom);
        group.items.push(...other.items); groups.splice(index, 1); index = 0;
      } else index++;
    }
    groups.push(group);
  }
  return groups;
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
    tooltip.style.left = `${Math.min(Math.max(box.left - host.left + box.width / 2, 12), host.width - 12)}px`;
    tooltip.style.top = `${box.top - host.top}px`;
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
    for (const item of positioned) {
      const node = h('span', { class: 'timeline-dot', 'aria-hidden': 'true',
        dataset: { phase: item.step.phase }, style: { top: `${item.day * dayPx}px`, left: `${item.offset * 100}%` } });
      lanes[item.lane].append(node);
      item.node = node;
    }
    for (const theme of model.themes) {
      const items = positioned.filter(item => item.step.themeId === theme.id);
      const grouped = new Map();
      for (const item of items) { const list = grouped.get(item.step.ideaId) ?? []; list.push(item); grouped.set(item.step.ideaId, list); }
      for (const [ideaId, list] of grouped) {
        list.sort((a, b) => a.day - b.day);
        for (let i = 1; i < list.length; i++) {
          const inferred = list[i].step.connection === 'inferred';
          const rise = list[i].day - list[i - 1].day;
          lanes[list[i].lane].append(h('span', { class: `timeline-link${inferred ? ' timeline-link--inferred' : ''}`,
            style: { top: `${list[i - 1].day * dayPx}px`, height: `${rise * dayPx}px`, left: `${(list[i].offset + list[i - 1].offset) / 2 * 100}%` }, 'aria-hidden': 'true' }));
        }
      }
    }
    const hitLayer = h('div', { class: 'timeline__hits' });
    const chartLanes = h('div', { class: 'timeline__lanes', style: { gridTemplateColumns: `repeat(${columns.length}, minmax(0,1fr))` } }, marks, lanes, hitLayer);
    desktop.replaceChildren(header, h('div', { class: 'timeline__grid', style: { height: `${totalDays * dayPx}px` } }, months, chartLanes));
    const describe = item => `${item.step.date} ${model.byId.idea.get(item.step.ideaId)?.title ?? ''}：${item.step.title}`;
    const href = item => `#/q/${encodeURIComponent(item.step.ideaId)}/${encodeURIComponent(item.step.id)}`;
    function updateHits() {
      if (!chartLanes.clientWidth) return;
      const width = chartLanes.clientWidth;
      const points = positioned.map(item => ({ ...item, x: (item.lane + item.offset) * width / columns.length, y: item.day * dayPx }));
      hitLayer.replaceChildren(...groupTimelineHits(points).map(group => {
        const items = group.items.sort((a, b) => a.day - b.day || a.step.key.localeCompare(b.step.key));
        const first = items[0];
        const node = h('a', { class: 'timeline-hit', href: href(first),
          style: { left: `${group.left}px`, top: `${group.top}px`, width: `${group.right - group.left}px`, height: `${group.bottom - group.top}px` },
          'aria-label': items.map(describe).join('；'),
          ...(items.length > 1 ? { 'aria-haspopup': 'dialog' } : {}),
          onfocus: () => show(first.node, first.step), onblur: () => hide(node),
          onmousemove: event => { const box = chartLanes.getBoundingClientRect(); const nearest = items.reduce((a, b) => Math.hypot(event.clientX-box.left-a.x,event.clientY-box.top-a.y) <= Math.hypot(event.clientX-box.left-b.x,event.clientY-box.top-b.y) ? a : b); show(nearest.node, nearest.step); },
          onmouseleave: () => hide(node),
          onclick: event => { if (items.length < 2) return; event.preventDefault(); hide(node); const dialog = openDialog('年表', h('div', { class: 'timeline-choices' }, items.map(item => h('a', { href: href(item), onclick: () => dialog.close() }, describe(item))))); }
        });
        return node;
      }));
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
