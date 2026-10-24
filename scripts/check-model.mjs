import { loadData } from '../src/data/load.js';
import { buildModel } from '../src/data/model.js';
import { todayKey } from '../src/data/dates.js';

if (process.argv.includes('--private')) {
  globalThis.window = globalThis;
  await import('../private-data/flomo.js');
  await import('../private-data/thoughts.js');
  await import('../private-data/lessons.js');
}
const model=buildModel(loadData(globalThis),{today:todayKey()});
const counts={
  mode:model.mode,themes:model.themes.length,ideas:model.ideas.length,steps:model.steps.length,
  references:model.refs.length,recordReferences:model.refs.filter(r=>model.byId.source.get(r.sourceId)?.type==='record').length,
  conversationReferences:model.refs.filter(r=>model.byId.source.get(r.sourceId)?.type==='conversation').length,
  missingReferences:model.refs.filter(r=>r.missing).length,
  records:model.sources.filter(s=>s.type==='record').length,conversations:model.sources.filter(s=>s.type==='conversation').length,
  lessons:model.lessons.length,confirmedLessons:model.lessons.filter(l=>!l.pending).length,pendingLessons:model.lessons.filter(l=>l.pending).length,
  patterns:model.patterns.length,inferredSteps:model.steps.filter(s=>s.connection==='inferred').length,
  kinds:new Set(model.steps.map(s=>s.kind)).size,months:new Set(model.steps.map(s=>s.date?.slice(0,7)).filter(Boolean)).size,
  firstDate:model.steps.map(s=>s.date).filter(Boolean).sort()[0] ?? null,lastDate:model.steps.map(s=>s.date).filter(Boolean).sort().at(-1) ?? null,
};
console.log(JSON.stringify(counts,null,2));
