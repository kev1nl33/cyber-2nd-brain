import { h } from '../ui/dom.js';
import { PHASES, PHASE_LABEL } from '../data/taxonomy.js';
import { fmtLong, fmtAgo, diffDays } from '../data/dates.js';
import { renderPhaseBar } from '../ui/components/phase-bar.js';
import { renderStatusPill } from '../ui/components/status-pill.js';
import { renderEmpty } from '../ui/components/empty.js';

export function renderTheme(ctx, route) {
  const element = h('section', { class: 'theme-page' });
  function update(next) {
    const theme = ctx.model.byId.theme.get(next.params?.themeId);
    if (!theme) {
      element.replaceChildren(h('h1', { tabindex: '-1' }, '找不到这个内容。'), renderEmpty('', { href: '#/', label: '回到今天' }));
      return true;
    }
    const ideas = theme.ideaIds.map(id => ctx.model.byId.idea.get(id)).filter(Boolean).sort((a, b) => (b.updated ?? '').localeCompare(a.updated ?? ''));
    const distribution = h('div', { class: 'theme-distribution' },
      h('div', { class: 'theme-distribution__bar', role: 'img', 'aria-label': PHASES.map(p => `${PHASE_LABEL[p]} ${theme.phaseCounts[p]} 步`).join('，') },
        PHASES.map(phase => h('span', { class: 'theme-distribution__segment', dataset: { phase }, title: `${PHASE_LABEL[phase]} ${theme.phaseCounts[phase]} 步`, style: { flexGrow: String(theme.phaseCounts[phase]), flexBasis: '0' }, 'aria-hidden': 'true' }))),
      h('ul', { class: 'theme-distribution__legend' }, PHASES.map(phase => h('li', { dataset: { phase } },
        h('span', { class: 'theme-distribution__dot', 'aria-hidden': 'true' }), `${PHASE_LABEL[phase]} ${theme.phaseCounts[phase]}`))));
    element.replaceChildren(h('header', { class: 'theme-page__header' }, h('p', { class: 'theme-page__code' }, `${theme.code} · ${theme.en}`),
      h('h1', { tabindex: '-1' }, theme.label), h('p', { class: 'theme-page__description' }, theme.description),
      h('p', { class: 'theme-page__meta' }, `${ideas.length} 个问题 · ${theme.stepCount} 步${theme.latest ? ` · 最近 ${fmtLong(theme.latest)}` : ''}`), distribution),
      h('h2', {}, '问题'), h('ul', { class: 'theme-ideas' }, ideas.map(idea => h('li', { class: 'theme-idea' },
        h('a', { class: 'theme-idea__link', href: `#/q/${encodeURIComponent(idea.id)}` }, renderPhaseBar(idea.phases, { mini: true }),
          h('span', { class: 'theme-idea__body' }, h('span', { class: 'theme-idea__title' }, idea.title),
            h('span', { class: 'theme-idea__meta' }, `${idea.stepKeys.length} 步${idea.updated ? ` · ${fmtAgo(diffDays(idea.updated, ctx.model.today))}` : ''} · ${idea.statusRaw}`)),
          renderStatusPill(idea.status), ctx.overlay?.decisions?.[`idea:${idea.id}`] ? renderStatusPill(ctx.overlay.decisions[`idea:${idea.id}`].verdict) : null)))));
    return true;
  }
  update(route);
  return { element, update };
}
export default renderTheme;
