import { PHASES } from './taxonomy.js';
import { diffDays } from './dates.js';
const asc = (a,b) => a < b ? -1 : a > b ? 1 : 0;
export function sharedSourceIdeas(model, ideaId) {
  const sources = new Map();
  for (const ref of model.refs) {
    if (ref.missing) continue;
    const id = model.byId.step.get(ref.stepKey)?.ideaId;
    if (!sources.has(id)) sources.set(id,new Set());
    sources.get(id).add(ref.sourceId);
  }
  const own = sources.get(ideaId) ?? new Set();
  return model.ideas.filter(i=>i.id!==ideaId).map(idea=>({idea,shared:[...(sources.get(idea.id) ?? [])].filter(s=>own.has(s)).length}))
    .filter(r=>r.shared>0).sort((a,b)=>b.shared-a.shared || asc(b.idea.updated,a.idea.updated)).slice(0,5);
}
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (const c of str) { h ^= c.codePointAt(0); h = Math.imul(h,0x01000193); }
  return h >>> 0;
}
export function dailyLesson(model, todayKey) {
  return model.lessons.length ? model.lessons[fnv1a(`lesson:${todayKey}`)%model.lessons.length] : null;
}
export function staleIdea(model) {
  const idea = model.ideas.filter(i=>i.stepKeys.length && i.status!=='landed')
    .sort((a,b)=>asc(a.updated,b.updated) || asc(a.id,b.id))[0];
  if (!idea) return null;
  const stoppedAt = model.byId.step.get(idea.stepKeys.at(-1)).phase;
  return {idea,days:diffDays(idea.updated,model.today),stoppedAt,missing:PHASES.slice(PHASES.indexOf(stoppedAt)+1).find(p=>!idea.phases.has(p)) ?? null};
}
export function reviewQueue(model, overlay = {}, today = model.today) {
  const lessons = model.lessons.filter(l=>l.pending).sort((a,b)=>asc(a.id,b.id)).map(target=>({key:`lesson:${target.id}`,type:'lesson',target}));
  const connections = model.steps.filter(s=>s.connection==='inferred').sort((a,b)=>asc(b.date,a.date)).map(target=>({key:`conn:${target.key}`,type:'conn',target}));
  const ideas = model.ideas.filter(i=>i.status==='pending').sort((a,b)=>asc(b.updated,a.updated)).map(target=>({key:`idea:${target.id}`,type:'idea',target}));
  return [...lessons,...connections,...ideas].filter(r=>!Object.hasOwn(overlay.decisions ?? {},r.key) && !((overlay.snoozed ?? {})[r.key]>today));
}
export function monthlyCounts(model) {
  const counts = new Map();
  for (const s of model.steps) if(s.date) { const month=s.date.slice(0,7); counts.set(month,(counts.get(month) ?? 0)+1); }
  const months=[...counts.keys()].sort();
  if (!months.length) return [];
  const result=[]; let [year,month]=months[0].split('-').map(Number);
  while (true) {
    const key=`${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}`;
    result.push({month:key,count:counts.get(key) ?? 0});
    if (key===months.at(-1)) break;
    if (++month===13) {year++;month=1;}
  }
  return result;
}
