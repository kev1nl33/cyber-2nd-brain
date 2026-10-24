import { h } from '../ui/dom.js';
import { fmtLong, fmtShort } from '../data/dates.js';
import { renderEmpty } from '../ui/components/empty.js';

const originLabel = { flomo: 'flomo', obsidian: 'Obsidian', conversation: '对话' };
const domains = [['invest', '投资'], ['ai', 'AI'], ['create', '创作'], ['read', '阅读'], ['life', '生活'], ['develop', '开发']];
const sourceHash = id => `#/sources${id ? `/${encodeURIComponent(id)}` : ''}`;
export function renderSources(ctx, initialRoute) {
  const { model } = ctx;
  const element = h('section', { class: 'sources-page' });
  const evidence = h('div', { class: 'sources-evidence' });
  const list = h('ul', { class: 'source-list' });
  const mainDetail = h('div', { class: 'sources-page__detail' });
  const filters = h('div', { class: 'sources-page__filters' });
  let route = initialRoute;
  let origin = 'all';
  let domain = null;
  let query = '';
  let onlyCited = false;
  const search = h('input', { type: 'search', class: 'sources-page__search', placeholder: '搜索来源', 'aria-label': '搜索来源标题与标签',
    oninput: event => { query = event.target.value.toLocaleLowerCase(); drawList(); } });
  const controls = h('div', { class: 'sources-page__browse' }, search, filters,
    h('label', { class: 'sources-page__cited' }, h('input', { type: 'checkbox', onchange: event => { onlyCited = event.target.checked; drawList(); } }), '只看被引用的'), list);
  element.append(h('h1', { tabindex: '-1' }, '来源'), controls, mainDetail);
  function drawFilters() {
    filters.replaceChildren(h('div', { class: 'sources-page__origins', role: 'group', 'aria-label': '来源类型' },
      [['all', '全部'], ...Object.entries(originLabel)].map(([id, label]) => h('button', {
        type: 'button', class: `filter-pill${origin === id ? ' is-active' : ''}`, 'aria-pressed': String(origin === id),
        onclick: () => { origin = id; drawFilters(); drawList(); },
      }, label))),
    h('div', { class: 'sources-page__domains', role: 'group', 'aria-label': '领域' }, domains.map(([id, label]) =>
      h('button', { type: 'button', class: `filter-pill${domain === id ? ' is-active' : ''}`, 'aria-pressed': String(domain === id),
        onclick: () => { domain = domain === id ? null : id; drawFilters(); drawList(); } }, label))));
  }
  function drawList() {
    const sources = model.sources.filter(source => (origin === 'all' || source.origin === origin) && (!domain || source.domain === domain)
      && (!onlyCited || source.citedBy.length > 0)
      && (!query || source.title.toLocaleLowerCase().includes(query) || source.tags.some(tag => tag.toLocaleLowerCase().includes(query))))
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.id.localeCompare(b.id));
    let year;
    list.replaceChildren(...sources.map(source => {
      const currentYear = source.date?.slice(0, 4);
      const date = currentYear !== year ? fmtLong(source.date) : fmtShort(source.date);
      year = currentYear;
      return h('li', { class: `source-row${route.params?.sourceId === source.id ? ' is-selected' : ''}` },
        h('a', { class: 'source-row__link', href: sourceHash(source.id), 'aria-current': route.params?.sourceId === source.id ? 'true' : undefined,
          onclick: event => { event.preventDefault(); ctx.navigate(sourceHash(source.id), { replace: true }); } },
        h('time', { datetime: source.date ?? '', class: 'source-row__date' }, date),
        h('span', { class: 'source-row__title' }, source.title),
        h('span', { class: 'source-row__type' }, originLabel[source.origin] ?? source.kind),
        source.domain ? h('span', { class: 'source-row__domain' }, domains.find(([id]) => id === source.domain)?.[1] ?? source.domain) : null,
        source.citedBy.length ? h('span', { class: 'source-row__count' }, `被 ${source.citedBy.length} 步引用`) : null));
    }));
    if (!sources.length) list.append(h('li', { class: 'source-list__empty' }, renderEmpty('没有匹配的来源。')));
  }
  function detail(source) {
    if (!source) return renderEmpty('找不到这个内容。', { href: '#/', label: '回到今天' });
    return h('article', { class: 'source-detail', dataset: { sourceId: source.id } },
      h('a', { class: 'source-detail__back', href: '#/sources', onclick: event => { event.preventDefault(); ctx.navigate('#/sources', { replace: true }); } }, '← 来源'),
      h('h2', { class: 'source-detail__title' }, source.title),
      h('p', { class: 'source-detail__meta' }, `${originLabel[source.origin] ?? source.kind} · ${fmtLong(source.date)}`,
        source.domain ? ` · ${domains.find(([id]) => id === source.domain)?.[1] ?? source.domain}` : ''),
      h('ul', { class: 'source-detail__tags', 'aria-label': '标签' }, source.tags.map(tag => h('li', {}, tag.split('/').map((part, index) =>
        h('span', { class: 'source-detail__tag-part' }, index ? h('span', { class: 'source-detail__separator', 'aria-hidden': 'true' }, ' / ') : null, part))))),
      h('div', { class: 'source-detail__text' }, source.text),
      source.citedBy.length ? h('section', { class: 'source-detail__citations' }, h('h3', {}, '被这些步骤引用'),
        h('ul', {}, source.citedBy.map(key => model.byId.step.get(key)).filter(Boolean).map(step => {
          const idea = model.byId.idea.get(step.ideaId);
          return h('li', {}, h('a', { href: `#/q/${encodeURIComponent(step.ideaId)}/${encodeURIComponent(step.id)}` },
            h('span', { class: 'source-detail__step-title' }, step.title), h('span', { class: 'source-detail__idea-title' }, idea?.title ?? '')));
        }))) : null);
  }
  function update(next) {
    route = next;
    const id = route.params?.sourceId;
    element.classList.toggle('sources-page--detail', Boolean(id));
    evidence.replaceChildren(...(id ? [detail(model.byId.source.get(id))] : []));
    mainDetail.replaceChildren(...(id ? [detail(model.byId.source.get(id))] : []));
    drawList();
    return true;
  }
  drawFilters(); update(route);
  return { element, evidence, update };
}
export default renderSources;
