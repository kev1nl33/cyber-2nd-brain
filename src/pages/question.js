import { h } from '../ui/dom.js';
import { fmtLong, fmtShort } from '../data/dates.js';
import { sharedSourceIdeas } from '../data/derive.js';
import { renderPhaseBar } from '../ui/components/phase-bar.js';
import { renderStatusPill } from '../ui/components/status-pill.js';
import { renderStep } from '../ui/components/step.js';
import { renderNote } from '../ui/components/note.js';
import { renderLessonCard } from '../ui/components/lesson-card.js';
import { renderEmpty } from '../ui/components/empty.js';

const qhash = (ideaId, stepId, sourceId) => `#/q/${encodeURIComponent(ideaId)}${stepId ? `/${encodeURIComponent(stepId)}` : ''}${stepId && sourceId ? `/src/${encodeURIComponent(sourceId)}` : ''}`;
const editable = target => target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])');

export function renderQuestion(ctx, route) {
  const { model } = ctx;
  const idea = model.byId.idea.get(route.params?.ideaId);
  if (!idea) {
    return { element: h('div', { class: 'question' }, h('h1', { tabindex: '-1' }, '找不到这个内容。'),
      renderEmpty('', { href: '#/', label: '回到今天' })), update: () => false, onKey: () => false };
  }
  const theme = model.byId.theme.get(idea.themeId);
  const steps = idea.stepKeys.map(key => model.byId.step.get(key)).filter(Boolean);
  const siblings = theme.ideaIds;
  const siblingIndex = siblings.indexOf(idea.id);
  const previous = model.byId.idea.get(siblings[siblingIndex - 1]);
  const next = model.byId.idea.get(siblings[siblingIndex + 1]);
  const element = h('article', { class: 'question', dataset: { ideaId: idea.id } });
  const evidence = h('div', { class: 'question-evidence' });
  const pillSlot = h('span', { class: 'question__review-state' });
  const range = idea.firstDate ? `${fmtLong(idea.firstDate)} 至 ${idea.firstDate.slice(0, 4) === idea.lastDate?.slice(0, 4) ? fmtShort(idea.lastDate) : fmtLong(idea.lastDate)}` : '';
  element.append(h('header', { class: 'question__header' },
    h('a', { class: 'question__theme', href: `#/t/${encodeURIComponent(theme.id)}` }, `${theme.code} · ${theme.label}`),
    h('h1', { tabindex: '-1' }, idea.title),
    h('div', { class: 'question__meta' }, renderStatusPill(idea.status), pillSlot,
      h('span', { class: 'question__status-raw' }, idea.statusRaw), h('span', {}, `${steps.length} 步`), range ? h('span', {}, range) : null),
    renderPhaseBar(idea.phases)));
  const trace = h('ol', { class: 'trace' });
  const stepEls = new Map();
  const entries = [];
  const inlineGroups = new Map();
  const groups = new Map();
  const fingerprints = new Map();
  let selectedId = null;
  let openNumber = null;
  let activeNumber = null;
  let frame = null;
  let pendingScroll = false;
  let destroyed = false;
  const desktop = window.matchMedia('(min-width: 1280px)');
  const mobile = window.matchMedia('(max-width: 639px)');
  const motion = () => ctx.prefs?.motion === 'off' || ctx.prefs?.motion === false || document.documentElement.dataset.motion === 'off' ? 'auto' : 'smooth';
  const navigate = (stepId, sourceId) => ctx.navigate(qhash(idea.id, stepId, sourceId), { replace: true });
  const schedule = () => {
    if (destroyed || frame !== null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      if (pendingScroll && element.isConnected) { pendingScroll = false; scrollSelected(); }
      alignNotes();
    });
  };
  function alignNotes() {
    if (destroyed || !element.isConnected || !evidence.isConnected) return;
    evidence.classList.toggle('is-positioned', desktop.matches);
    let bottom = 0;
    const origin = evidence.getBoundingClientRect().top;
    for (const [stepId, group] of groups) {
      group.style.position = desktop.matches ? 'static' : '';
      const li = stepEls.get(stepId);
      let top = Math.max(0, li.getBoundingClientRect().top - origin);
      for (const entry of entries.filter(item => item.step.id === stepId)) {
        const card = entry.desktop;
        card.style.position = desktop.matches ? 'absolute' : '';
        if (desktop.matches) {
          top = Math.max(top, bottom);
          card.style.top = `${top}px`;
          bottom = top + card.getBoundingClientRect().height + 12;
          top = bottom;
        } else card.style.top = '';
      }
    }
    evidence.style.position = desktop.matches ? 'relative' : '';
    evidence.style.minHeight = desktop.matches ? `${bottom}px` : '';
  }
  function applyNotes() {
    for (const entry of entries) {
      const expanded = entry.number === openNumber;
      // Only one original is expanded, including across the responsive copies.
      entry.desktop.setExpanded(expanded && !mobile.matches);
      entry.inline.setExpanded(expanded && mobile.matches);
      for (const card of [entry.desktop, entry.inline]) card.classList.toggle('is-highlighted', entry.number === activeNumber);
      if (expanded && mobile.matches) inlineGroups.get(entry.step.id).open = true;
    }
    schedule();
  }
  function toggleNote(entry) {
    const opening = openNumber !== entry.number;
    openNumber = opening ? entry.number : null;
    activeNumber = entry.number;
    applyNotes();
    navigate(entry.step.id, opening ? entry.ref.sourceId : undefined);
  }
  function scrollSelected() {
    stepEls.get(selectedId)?.scrollIntoView({ block: 'center', behavior: motion() });
    if (!desktop.matches && !mobile.matches) groups.get(selectedId)?.scrollIntoView({ block: 'nearest', behavior: motion() });
  }
  function select(stepId, { scroll = true } = {}) {
    const changed = selectedId !== stepId;
    selectedId = stepId;
    for (const [id, li] of stepEls) {
      li.classList.toggle('is-selected', id === stepId);
      if (id === stepId) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    }
    if (scroll && changed && stepId) {
      if (element.isConnected) scrollSelected();
      else { pendingScroll = true; schedule(); }
    }
  }
  function decide(key, verdict, note) {
    const result = ctx.decide(key, verdict, note);
    Promise.resolve(result).then(() => { if (!destroyed) { syncOverlay(); ctx.refresh?.(); schedule(); } });
  }
  steps.forEach((step, index) => {
    const refs = model.refs.filter(ref => ref.stepKey === step.key);
    const local = refs.map(ref => ({ ref, step, number: entries.length + 1 + refs.indexOf(ref) }));
    const li = renderStep(step, {
      refNumbers: local, overlayState: ctx.overlay,
      showYear: index === 0 || step.date.slice(0, 4) !== steps[index - 1].date.slice(0, 4),
      latest: step === steps.filter(item => item.date === idea.lastDate).at(-1),
      onSelect: () => { select(step.id); navigate(step.id); }, onDecide: decide, onLayout: schedule,
      onRef: refIndex => {
        const entry = local[refIndex];
        activeNumber = entry.number;
        select(step.id, { scroll: false });
        if (mobile.matches) inlineGroups.get(step.id).open = true;
        applyNotes();
        const card = mobile.matches ? entry.inline : entry.desktop;
        card.scrollIntoView({ block: 'nearest', behavior: motion() }); card.focus({ preventScroll: true });
        navigate(step.id);
      },
    });
    stepEls.set(step.id, li);
    trace.append(li);
    if (local.length) {
      const group = h('section', { class: 'question-evidence__group', dataset: { stepId: step.id }, 'aria-label': step.title },
        h('h2', { class: 'question-evidence__heading' }, step.title));
      groups.set(step.id, group); evidence.append(group);
      const inline = h('details', { class: 'step__sources', ontoggle: schedule },
        h('summary', {}, `来源 ${local.length} ▾`));
      inlineGroups.set(step.id, inline); li.content.append(inline);
      local.forEach(entry => {
        const source = model.byId.source.get(entry.ref.sourceId);
        entry.desktop = renderNote(entry.ref, source, entry.number, { id: `note-${entry.number}`, onToggle: () => toggleNote(entry) });
        entry.inline = renderNote(entry.ref, source, entry.number, { id: `note-inline-${entry.number}`, onToggle: () => toggleNote(entry) });
        group.append(entry.desktop); inline.append(entry.inline); entries.push(entry);
      });
    }
  });
  element.append(steps.length ? trace : renderEmpty('这个问题还没有记录步骤。'));
  if (idea.summary) element.append(h('section', { class: 'question__summary' }, h('h2', {}, '当前理解'), h('p', {}, idea.summary)));
  const lessons = model.lessons.filter(lesson => lesson.ideaId === idea.id);
  const lessonList = h('div', { class: 'question__lesson-list' });
  if (lessons.length) element.append(h('section', { class: 'question__lessons' }, h('h2', {}, `由此得出的经验 · ${lessons.length}`), lessonList));
  const shared = sharedSourceIdeas(model, idea.id);
  if (shared.length) element.append(h('section', { class: 'question__shared' }, h('h2', {}, `共用来源的问题 · ${shared.length}`),
    h('ul', {}, shared.map(({ idea: other, shared: count }) => h('li', {},
      h('a', { href: qhash(other.id) }, other.title), h('span', {}, `共用 ${count} 条来源`),
      h('span', {}, model.byId.theme.get(other.themeId)?.label))))));
  element.append(h('nav', { class: 'question__pagination', 'aria-label': '相邻问题' },
    previous ? h('a', { href: qhash(previous.id), rel: 'prev' }, '← 上一个问题') : h('span'),
    next ? h('a', { href: qhash(next.id), rel: 'next' }, '下一个问题 →') : h('span')));
  let lessonFingerprint;
  function syncOverlay() {
    const overlay = ctx.overlay ?? {};
    const ideaDecision = overlay.decisions?.[`idea:${idea.id}`];
    const fingerprint = JSON.stringify(ideaDecision);
    if (fingerprints.get('idea') !== fingerprint) {
      pillSlot.replaceChildren(...(ideaDecision ? [renderStatusPill(ideaDecision.verdict)] : []));
      fingerprints.set('idea', fingerprint);
    }
    for (const step of steps) {
      const value = JSON.stringify(overlay.decisions?.[`conn:${step.key}`]);
      if (!fingerprints.has(step.key) || fingerprints.get(step.key) !== value) {
        stepEls.get(step.id).updateOverlay(overlay); fingerprints.set(step.key, value);
      }
    }
    const value = JSON.stringify(lessons.map(lesson => [overlay.decisions?.[`lesson:${lesson.id}`], overlay.uses?.[lesson.id]]));
    if (value !== lessonFingerprint) {
      lessonList.replaceChildren(...lessons.map(lesson => renderLessonCard(lesson, { model, overlay, variant: 'compact' })));
      lessonFingerprint = value;
    }
  }
  function update(nextRoute) {
    if (nextRoute.params?.ideaId !== idea.id) return false;
    syncOverlay();
    const requested = steps.find(step => step.id === nextRoute.params?.stepId);
    select(requested?.id ?? null);
    const found = requested && entries.find(entry => entry.step.id === requested.id && entry.ref.sourceId === nextRoute.params?.sourceId);
    if (found && openNumber !== found.number) { openNumber = found.number; activeNumber = found.number; }
    else if (!found) openNumber = null;
    applyNotes();
    return true;
  }
  function onKey(event) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || editable(event.target)) return false;
    const key = event.key.toLowerCase();
    const index = steps.findIndex(step => step.id === selectedId);
    let handled = true;
    if (key === 'j' || key === 'k') {
      const target = steps[index < 0 ? (key === 'j' ? 0 : steps.length - 1) : Math.max(0, Math.min(steps.length - 1, index + (key === 'j' ? 1 : -1)))];
      if (target) { select(target.id); navigate(target.id); }
    } else if (key === '[' || key === ']') {
      const target = key === '[' ? previous : next;
      if (target) ctx.navigate(qhash(target.id));
    } else if (key === 'o') {
      const entry = entries.find(item => item.step.id === selectedId);
      if (entry && !entry.ref.missing) toggleNote(entry);
    } else if (['y', 'e', 'n'].includes(key)) {
      const step = steps[index];
      if (step?.connection !== 'inferred' || ctx.overlay?.decisions?.[`conn:${step.key}`]) handled = false;
      else if (key === 'e') stepEls.get(step.id).openEditor();
      else decide(`conn:${step.key}`, key === 'y' ? 'confirmed' : 'rejected');
    } else handled = false;
    if (handled) event.preventDefault();
    return handled;
  }
  const breakpoint = () => { applyNotes(); schedule(); };
  window.addEventListener('resize', breakpoint);
  // Scroll can move the reading column independently of the evidence column.
  element.addEventListener('load', schedule, true);
  desktop.addEventListener('change', breakpoint); mobile.addEventListener('change', breakpoint);
  document.fonts?.ready.then(schedule);
  update(route);
  // The shell attaches both returned elements after renderQuestion returns.
  schedule();
  return { element, evidence, update, onKey, destroy() {
    destroyed = true;
    if (frame !== null) cancelAnimationFrame(frame);
    window.removeEventListener('resize', breakpoint);
    element.removeEventListener('load', schedule, true);
    desktop.removeEventListener('change', breakpoint); mobile.removeEventListener('change', breakpoint);
  } };
}
export default renderQuestion;
