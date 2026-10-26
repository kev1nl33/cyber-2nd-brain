import { h } from '../ui/dom.js';
import { dailyLesson, staleIdea, reviewQueue, monthlyCounts } from '../data/derive.js';
import { diffDays, fmtToday, fmtAgo, fmtShort } from '../data/dates.js';
import { PHASE_LABEL } from '../data/taxonomy.js';
import { renderLessonCard } from '../ui/components/lesson-card.js';
import { renderPhaseBar } from '../ui/components/phase-bar.js';
import { renderKindTag } from '../ui/components/kind-tag.js';

export function reviewSummary(item, model) {
  if(item.type==='lesson') return `经验 · ${Array.from(item.target.text).slice(0,18).join('')}`;
  if(item.type==='idea') return `问题 · ${item.target.title}`;
  const s=item.target, idea=model.byId.idea.get(s.ideaId), prev=model.byId.step.get(idea.stepKeys[s.index-2]);
  return `推断 · ${prev?.kind ?? '问题'} → ${s.kind}`;
}
export function renderToday(ctx) {
  const {model}=ctx, queue=reviewQueue(model,ctx.overlay), lesson=dailyLesson(model,model.today), stale=staleIdea(model);
  const recent=[...model.steps].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5), months=monthlyCounts(model);
  const panel=(title,cls,...children)=>h('section',{class:`today-panel ${cls}`},h('h2',{},title),...children);
  const experience=panel('今日经验','today-lesson',lesson?renderLessonCard(lesson,{model,overlay:ctx.overlay,variant:'full',showUses:false,pendingCorner:true}):h('p',{class:'muted'},'还没有经验数据。'));
  if(lesson) {
    const patterns=lesson.patternIds.map(id=>model.byId.pattern.get(id)).filter(Boolean);
    if(patterns.length) experience.querySelector('.lesson-card__meta')?.prepend(h('span',{},patterns.map(p=>`${p.name} · ${p.level}`).join(' · ')));
    const uses=ctx.overlay.uses[lesson.id] ?? [], used=uses.includes(model.today);
    experience.append(h('div',{class:'lesson-use'},h('button',{class:`button ${used?'is-used':''}`,onclick:()=>ctx.toggleUse(lesson.id)},used?'今天用上了 ✓':'今天用上了'),uses.length?h('span',{},`已用 ${uses.length} 次`):null));
  }
  const waiting=panel('待核对','today-review',queue.length?h('ul',{},queue.slice(0,3).map(item=>h('li',{},h('a',{href:`#/review/${encodeURIComponent(item.key)}`},reviewSummary(item,model))))):h('p',{},'都核对过了'),h('a',{href:'#/review',class:'section-link'},`全部 ${queue.length} 条 →`));
  const stalled=panel('搁置最久','today-stale',stale?h('div',{},h('h3',{},stale.idea.title),h('div',{class:'muted'},`${model.byId.theme.get(stale.idea.themeId).label} · ${fmtAgo(stale.days)}`),renderPhaseBar(stale.idea.phases),h('p',{class:'stale-copy'},`停在「${PHASE_LABEL[stale.stoppedAt]}」${stale.missing?`，还没有「${PHASE_LABEL[stale.missing]}」`:''}`),h('a',{class:'button',href:`#/q/${stale.idea.id}`},'继续')):null);
  const thinking=panel('最近在想','today-recent',h('ol',{},recent.map(s=>h('li',{},h('a',{href:`#/q/${s.ideaId}/${s.id}`,title:`${s.date} · ${PHASE_LABEL[s.phase]} · ${s.kind} · ${s.title} · 〈${model.byId.idea.get(s.ideaId).title}〉`},h('time',{},fmtShort(s.date)),renderKindTag(s),h('span',{class:'recent-title',title:s.title},s.title),h('span',{class:'recent-idea',title:model.byId.idea.get(s.ideaId).title},`〈${model.byId.idea.get(s.ideaId).title}〉`))))));
  const max=Math.max(1,...months.map(m=>m.count));
  const rewind=panel('一年回望','today-atlas',h('div',{class:'monthly-bars',role:'img','aria-label':months.map(m=>`${m.month}：${m.count} 步`).join('；')},months.map(m=>h('span',{title:`${m.month} · ${m.count} 步`,style:{height:`${m.count/max*40}px`,background:m.month===model.today.slice(0,7)?'var(--accent)':'var(--text-3)'}}))),h('div',{class:'rewind-meta'},`${model.steps.length} 步 · ${months.length} 个月`,h('a',{class:'button',href:'#/atlas',onclick:()=>{ctx.autoplayAtAtlas=ctx.prefs.motion!=='off';}},'播放')));
  const last=recent[0];
  return {element:h('article',{class:'today page'},h('header',{class:'today-header'},h('h1',{tabindex:'-1'},fmtToday(model.today)),h('span',{class:'today-seal','aria-hidden':'true'},'今')),h('div',{class:'today-summary'},`${queue.length?`你有 ${queue.length} 处待核对。`:'都核对过了。'}最近一步：${last?fmtAgo(diffDays(last.date,model.today)):''}。`),h('div',{class:'today-grid'},experience,waiting,stalled,thinking,rewind))};
}
