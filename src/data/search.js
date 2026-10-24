const GROUPS = ['idea','step','lesson','theme','source','command'];
export function buildIndex(model, commands = []) {
  const index=[];
  const add=(type,group,target,title,fields,date='')=>index.push({id:target.key ?? target.id,type,group,title:title ?? '',fields:fields.map(v=>String(v ?? '')),date:date ?? '',target});
  for (const i of model.ideas) add('idea','idea',i,i.title,[i.summary],i.updated);
  for (const s of model.steps) add('step','step',s,s.title,[s.body],s.date);
  for (const l of model.lessons) add('lesson','lesson',l,l.text,[]);
  for (const p of model.patterns) add('pattern','lesson',p,p.name,[]);
  for (const t of model.themes) add('theme','theme',t,t.label,[t.en],t.latest);
  for (const s of model.sources) add('source','source',s,s.title,s.tags ?? [],s.date);
  for (const c of commands) add('command','command',c,c.name ?? c.title ?? c.label,[]);
  return index;
}
export function snippet(value, query) {
  const chars=Array.from(String(value ?? '')), q=String(query ?? '').toLowerCase();
  const lower=chars.join('').toLowerCase(), offset=q?lower.indexOf(q):-1;
  if (offset<0) return {before:chars.slice(0,24).join(''),match:'',after:''};
  const start=Array.from(lower.slice(0,offset)).length, length=Array.from(q).length;
  return {before:chars.slice(Math.max(0,start-12),start).join(''),match:chars.slice(start,start+length).join(''),after:chars.slice(start+length,start+length+12).join('')};
}
export function search(index, query) {
  const q=String(query ?? '').trim().toLowerCase();
  const result=Object.fromEntries(GROUPS.map(g=>[g,[]]));
  const matches=[];
  for (const entry of index) {
    if (!q) {if (entry.group==='command') matches.push({...entry,rank:0,snippet:null}); continue;}
    const title=entry.title.toLowerCase(), field=entry.fields.find(v=>v.toLowerCase().includes(q));
    const rank=title.startsWith(q)?0:title.includes(q)?1:field!==undefined?2:-1;
    if(rank>=0) matches.push({...entry,rank,snippet:rank===2?snippet(field,q):null});
  }
  matches.sort((a,b)=>a.rank-b.rank || GROUPS.indexOf(a.group)-GROUPS.indexOf(b.group) || (b.date>a.date?1:b.date<a.date?-1:0));
  for (const entry of matches) {
    if (!q || result[entry.group].length < 5) result[entry.group].push(entry);
  }
  return result;
}
