import { h } from '../dom.js';
import { renderStatusPill } from './status-pill.js';

export function renderLessonCard(lesson, { model, overlay = {}, variant = 'compact', showInference = true } = {}) {
  const idea = model?.byId.idea.get(lesson.ideaId);
  const steps = lesson.stepKeys.map(key => model?.byId.step.get(key)).filter(Boolean);
  const hash = `#/q/${encodeURIComponent(lesson.ideaId)}${steps[0] ? `/${encodeURIComponent(steps[0].id)}` : ''}`;
  const decision = overlay.decisions?.[`lesson:${lesson.id}`];
  const count = overlay.uses?.[lesson.id]?.length ?? 0;
  return h('article', { class: `lesson-card lesson-card--${variant}`, dataset: { lessonId: lesson.id } },
    h('p', { class: 'lesson-card__text' }, `「${lesson.text}」`),
    h('div', { class: 'lesson-card__meta' },
      h('a', { href: hash }, `出自〈${idea?.title ?? ''}〉${steps.length ? `第 ${steps.map(step => step.index).join('、')} 步` : ''}`),
      count ? h('span', {}, `已用 ${count} 次`) : null,
      lesson.pending ? renderStatusPill('pending') : null,
      decision ? renderStatusPill(decision.verdict) : null,
      showInference && lesson.hasInference ? h('span', { class: 'lesson-card__inference' }, '含推想') : null));
}
export default renderLessonCard;
