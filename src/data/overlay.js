import { day } from './dates.js';

export const emptyOverlay = () => ({version:1,decisions:{},snoozed:{},uses:{}});
const verdicts = new Set(['confirmed','revised','rejected']);
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v) && [Object.prototype,null].includes(Object.getPrototypeOf(v));
const safeKey = k => typeof k === 'string' && k.length > 0 && !['__proto__','prototype','constructor'].includes(k);
const reviewKey = k => safeKey(k) && /^(lesson|idea):.+$|^conn:.+\/.+$/.test(k);
const dateKey = v => typeof v === 'string' && day(v) === v;
function timestamp(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(v) || !day(v)) return false;
  const time = v.slice(11,19).split(':').map(Number);
  const zone = v.match(/([+-])(\d{2}):(\d{2})$/);
  return time[0]<24 && time[1]<60 && time[2]<60 && (!zone || (+zone[2]<24 && +zone[3]<60)) && Number.isFinite(Date.parse(v));
}
function requireValid(ok) { if (!ok) throw new TypeError('文件无法识别'); }
function validate(o) {
  requireValid(object(o) && o.version===1 && object(o.decisions) && object(o.snoozed) && object(o.uses));
  for (const [key,d] of Object.entries(o.decisions)) {
    requireValid(reviewKey(key) && object(d) && verdicts.has(d.verdict) && timestamp(d.at));
    requireValid(d.note===undefined || typeof d.note==='string');
    requireValid(d.verdict!=='revised' || (typeof d.note==='string' && d.note.trim().length>0));
  }
  for (const [key,date] of Object.entries(o.snoozed)) requireValid(reviewKey(key) && dateKey(date));
  for (const [key,dates] of Object.entries(o.uses)) requireValid(safeKey(key) && Array.isArray(dates) && dates.every(dateKey));
  return o;
}
function copy(o) {
  validate(o);
  return {version:1,decisions:Object.fromEntries(Object.entries(o.decisions).map(([k,v])=>[k,{...v}])),snoozed:{...o.snoozed},uses:Object.fromEntries(Object.entries(o.uses).map(([k,v])=>[k,[...new Set(v)].sort()]))};
}
export function decide(o,key,verdict,note='',now=new Date().toISOString()) {
  const at = now instanceof Date ? now.toISOString() : now;
  requireValid(reviewKey(key) && verdicts.has(verdict) && timestamp(at) && typeof note==='string');
  requireValid(verdict!=='revised' || note.trim().length>0);
  const n=copy(o); n.decisions[key]={verdict,at,...(note.trim()?{note:note.trim()}:{})}; return n;
}
export function undo(o,key) { const n=copy(o); delete n.decisions[key]; return n; }
export function snooze(o,key,today) {
  requireValid(reviewKey(key) && dateKey(today));
  const d=new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate()+7);
  const n=copy(o); n.snoozed[key]=d.toISOString().slice(0,10); return n;
}
export function toggleUse(o,lessonId,today) {
  requireValid(safeKey(lessonId) && dateKey(today));
  const n = copy(o);
  const dates = new Set(Object.hasOwn(n.uses, lessonId) ? n.uses[lessonId] : []);
  if (dates.has(today)) dates.delete(today); else dates.add(today);
  n.uses[lessonId]=[...dates].sort(); return n;
}
export function exportOverlay(o,model) {
  const n=copy(o);
  return {app:'cyber-2nd-brain',version:1,exportedAt:new Date().toISOString(),mode:model.mode,counts:{ideas:model.ideas.length,steps:model.steps.length,lessons:model.lessons.length},decisions:n.decisions,snoozed:n.snoozed,uses:n.uses};
}
export function importOverlay(o,json) {
  const data=typeof json==='string'?JSON.parse(json):json;
  requireValid(object(data) && data.app==='cyber-2nd-brain' && data.version===1 && ['sample','private'].includes(data.mode) && timestamp(data.exportedAt));
  requireValid(object(data.counts) && ['ideas','steps','lessons'].every(k=>Number.isSafeInteger(data.counts[k]) && data.counts[k]>=0));
  validate(data);
  const n=copy(o);
  for (const [key, d] of Object.entries(data.decisions)) {
    if (!Object.hasOwn(n.decisions, key) || Date.parse(d.at) > Date.parse(n.decisions[key].at)) {
      n.decisions[key] = {...d};
    }
  }
  for (const [key, date] of Object.entries(data.snoozed)) {
    if (!Object.hasOwn(n.snoozed, key) || date > n.snoozed[key]) n.snoozed[key] = date;
  }
  for (const [key, dates] of Object.entries(data.uses)) {
    const existing = Object.hasOwn(n.uses, key) ? n.uses[key] : [];
    n.uses[key] = [...new Set([...existing, ...dates])].sort();
  }
  return n;
}
export function createStore(storage,key) {
  let warned=false;
  return {
    load() {
      try { const value=storage.getItem(key); return value===null ? emptyOverlay() : copy(JSON.parse(value)); }
      catch { if (!warned) {console.warn('核对记录无法读取，已使用空记录。');warned=true;} return emptyOverlay(); }
    },
    save(o) { storage.setItem(key,JSON.stringify(copy(o))); },
  };
}
