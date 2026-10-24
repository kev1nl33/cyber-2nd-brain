import { PHASES, phaseOf, statusOf } from './taxonomy.js';
import { day, diffDays } from './dates.js';

export function buildModel(raw, { today }) {
  const model = { mode: raw.mode, today, themes: [], ideas: [], steps: [], refs: [], sources: [], lessons: [], patterns: [],
    byId: Object.fromEntries(['theme','idea','step','source','lesson','pattern'].map(k => [k, new Map()])) };
  const add = (collection, map, item, key = item.id) => { model[collection].push(item); model.byId[map].set(key, item); };
  for (const r of raw.brain?.records ?? []) {
    add('sources','source',{id:r.id,type:'record',title:r.title ?? '',date:day(r.date),text:r.text ?? '',kind:r.kind ?? '',origin:r.origin,domain:r.domain,tags:[...(r.tags ?? [])],citedBy:[]});
  }
  for (const s of raw.thoughts?.sources ?? []) {
    add('sources','source',{id:s.id,type:'conversation',title:s.title ?? '',date:day(s.date),text:s.text ?? '',kind:s.kind ?? '',origin:'conversation',tags:[],citedBy:[]});
  }
  for (const t of raw.thoughts?.themes ?? []) {
    const theme = {id:t.id,label:t.label ?? '',en:t.en ?? '',code:t.code ?? '',description:t.description ?? '',latest:day(t.latest),ideaIds:[],stepCount:0,phaseCounts:Object.fromEntries(PHASES.map(p=>[p,0]))};
    add('themes','theme',theme);
    for (const i of t.ideas ?? []) {
      const nodes = i.nodes ?? [];
      const idea = {id:i.id,themeId:t.id,title:i.title ?? '',summary:i.summary ?? '',statusRaw:i.status ?? '',status:statusOf(i.status ?? ''),updated:day(i.updated),stepKeys:[],phases:new Set(),firstDate:day(nodes[0]?.date),lastDate:day(nodes.at(-1)?.date),lessonIds:[]};
      add('ideas','idea',idea); theme.ideaIds.push(i.id);
      nodes.forEach((n,index) => {
        const key = `${i.id}/${n.id}`, phase = phaseOf(n.kind);
        const step = {key,id:n.id,ideaId:i.id,themeId:t.id,index:index+1,total:nodes.length,date:day(n.date),kind:n.kind ?? '',phase,title:n.title ?? '',body:n.body ?? '',connection:n.connection ?? 'recorded',link:n.link ?? '',refIds:(n.refs ?? []).map(r=>r.id),gapDays:index ? diffDays(nodes[index-1].date,n.date) : null};
        add('steps','step',step,key); idea.stepKeys.push(key); idea.phases.add(phase); theme.stepCount++; theme.phaseCounts[phase]++;
        for (const r of n.refs ?? []) {
          const source = model.byId.source.get(r.id);
          model.refs.push({stepKey:key,sourceId:r.id,quote:r.quote ?? '',missing:!source});
          if (source && !source.citedBy.includes(key)) source.citedBy.push(key);
        }
      });
    }
  }
  for (const l of raw.lessons?.lessons ?? []) {
    const lesson = {id:l.id,ideaId:l.ideaId,text:l.text ?? '',stepKeys:(l.stepIds ?? []).map(s=>`${l.ideaId}/${s}`).filter(k=>model.byId.step.has(k)),pending:l.status!=='confirmed',hasInference:!!l.hasInference,patternIds:[...(l.patternIds ?? [])]};
    add('lessons','lesson',lesson); model.byId.idea.get(l.ideaId)?.lessonIds.push(l.id);
  }
  for (const p of raw.lessons?.patterns ?? []) {
    add('patterns','pattern',{id:p.id,name:p.name ?? '',description:p.description ?? '',level:p.level ?? '',lessonIds:(p.lessonIds ?? []).filter(id=>model.byId.lesson.has(id))});
  }
  return model;
}
