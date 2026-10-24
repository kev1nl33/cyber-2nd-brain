import { h } from '../ui/dom.js';
import { renderLessonCard } from '../ui/components/lesson-card.js';
import { renderEmpty } from '../ui/components/empty.js';

const chineseNumber = number => {
  const digits = '零一二三四五六七八九';
  if (number < 10) return digits[number];
  if (number < 20) return `十${number % 10 ? digits[number % 10] : ''}`;
  return `${digits[Math.floor(number / 10)] ?? number}十${number % 10 ? digits[number % 10] : ''}`;
};
export function renderLessons(ctx, initialRoute) {
  const { model } = ctx;
  const element = h('section', { class: 'lessons-page' });
  const evidence = h('nav', { class: 'lessons-toc', 'aria-label': '经验目录' });
  const content = h('div', { class: 'lessons-page__chapters' });
  const filters = h('div', { class: 'lessons-page__filters', role: 'group', 'aria-label': '经验筛选' });
  const allInference = model.lessons.length > 0 && model.lessons.every(lesson => lesson.hasInference);
  let filter = 'all';
  let route = initialRoute;
  let observer;
  let destroyed = false;
  let frame;
  let fingerprint;
  const sections = new Map();
  const tocLinks = new Map();
  element.append(h('header', { class: 'lessons-page__header' }, h('h1', { tabindex: '-1' }, '太史公曰'),
    h('p', { class: 'lessons-page__subtitle' }, `${model.lessons.length} 条经验，归入 ${model.patterns.length} 种行为模式。每一条都能回到当时的思考。`),
    allInference ? h('p', { class: 'lessons-page__inference' }, '以下经验均含推想成分，请对照出处阅读。') : null), filters, content);
  function highlight(id) {
    for (const [key, link] of tocLinks) {
      link.classList.toggle('is-active', key === id);
      if (key === id) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
    }
  }
  function scrollToChapter(id) {
    if (!id || !sections.has(id)) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (destroyed) return;
      sections.get(id)?.scrollIntoView({ block: 'start', behavior: ctx.prefs?.motion === 'off' ? 'auto' : 'smooth' });
      highlight(id);
    });
  }
  function matches(lesson) {
    const overlay = ctx.overlay ?? {};
    if (filter === 'pending') return lesson.pending;
    if (filter === 'used') return (overlay.uses?.[lesson.id]?.length ?? 0) > 0;
    if (filter === 'reviewed') return Boolean(overlay.decisions?.[`lesson:${lesson.id}`]);
    return true;
  }
  function card(lesson) {
    const result = renderLessonCard(lesson, { model, overlay: ctx.overlay ?? {}, variant: 'full', showInference: !allInference });
    const used = ctx.overlay?.uses?.[lesson.id]?.includes(model.today);
    result.append(h('button', { type: 'button', class: `button button--outline lesson-use${used ? ' is-used' : ''}`, 'aria-pressed': String(Boolean(used)),
      onclick: () => { ctx.toggleUse(lesson.id); draw(); } }, used ? '今天用上了 ✓' : '今天用上了'));
    return result;
  }
  function draw() {
    observer?.disconnect(); sections.clear(); tocLinks.clear();
    fingerprint = JSON.stringify([ctx.overlay?.decisions, ctx.overlay?.uses]);
    filters.replaceChildren(...[['all', '全部'], ['pending', '待确认'], ['used', '用过的'], ['reviewed', '已核对']].map(([key, label]) =>
      h('button', { type: 'button', class: `filter-pill${filter === key ? ' is-active' : ''}`, 'aria-pressed': String(filter === key), onclick: () => { filter = key; draw(); } }, label)));
    const nodes = [];
    const toc = [];
    const addChapter = (id, title, section) => {
      section.id = `lesson-chapter-${id}`;
      section.dataset.patternId = id;
      sections.set(id, section); nodes.push(section);
      const link = h('a', { href: `#/lessons/${encodeURIComponent(id)}`, onclick: event => {
        event.preventDefault(); ctx.navigate(`#/lessons/${encodeURIComponent(id)}`, { replace: true });
      } }, title);
      tocLinks.set(id, link); toc.push(h('li', {}, link));
    };
    model.patterns.forEach((pattern, index) => {
      const lessons = pattern.lessonIds.map(id => model.byId.lesson.get(id)).filter(Boolean).filter(matches);
      const section = h('section', { class: 'lesson-chapter' },
        h('p', { class: 'lesson-chapter__number' }, `其${chineseNumber(index + 1)}`),
        h('h2', { class: 'lesson-chapter__title' }, pattern.name, h('span', { class: 'lesson-chapter__level' }, pattern.level)),
        h('p', { class: 'lesson-chapter__description' }, pattern.description), h('div', { class: 'lesson-chapter__cards' }, lessons.map(card)));
      addChapter(pattern.id, pattern.name, section);
    });
    const unsorted = model.lessons.filter(lesson => lesson.patternIds.length === 0).filter(matches);
    const section = h('section', { class: 'lesson-chapter' }, h('h2', { class: 'lesson-chapter__title' }, '未归类'));
    for (const theme of model.themes) {
      const lessons = unsorted.filter(lesson => model.byId.idea.get(lesson.ideaId)?.themeId === theme.id);
      if (lessons.length) section.append(h('section', { class: 'lesson-chapter__theme' }, h('h3', {}, theme.label), lessons.map(card)));
    }
    addChapter('unsorted', '未归类', section);
    content.replaceChildren(...(model.lessons.length ? nodes : [renderEmpty('还没有经验数据。')]));
    evidence.replaceChildren(h('ol', {}, toc));
    if (typeof IntersectionObserver !== 'undefined') {
      const visible = new Map();
      observer = new IntersectionObserver(entries => {
        for (const entry of entries) { if (entry.isIntersecting) visible.set(entry.target.dataset.patternId, entry.boundingClientRect.top); else visible.delete(entry.target.dataset.patternId); }
        const first = [...visible].sort((a, b) => a[1] - b[1])[0];
        if (first) highlight(first[0]);
      }, { rootMargin: '-64px 0px -50% 0px', threshold: 0 });
      for (const node of sections.values()) observer.observe(node);
    }
    if (route.params?.patternId) highlight(route.params.patternId);
  }
  function update(next) {
    const changed = next.params?.patternId !== route.params?.patternId;
    route = next;
    if (fingerprint !== JSON.stringify([ctx.overlay?.decisions, ctx.overlay?.uses])) draw();
    if (changed) scrollToChapter(route.params?.patternId);
    return true;
  }
  draw(); scrollToChapter(route.params?.patternId);
  return { element, evidence, update, destroy() { destroyed = true; observer?.disconnect(); cancelAnimationFrame(frame); } };
}
export default renderLessons;
