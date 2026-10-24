import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyOverlay,decide,undo,snooze,toggleUse,exportOverlay,importOverlay,createStore} from '../src/data/overlay.js';
const now='2026-10-24T12:00:00.000Z';
const model={mode:'sample',ideas:[],steps:[],lessons:[]};
test('immutable decisions, undo and revised validation',()=>{
 const o=emptyOverlay(),s=JSON.stringify(o),n=decide(o,'idea:i','revised',' fix ',now);
 assert.equal(JSON.stringify(o),s); assert.equal(n.decisions['idea:i'].note,'fix'); assert.equal(n.decisions['idea:i'].at,now);
 assert.throws(()=>decide(o,'idea:i','revised',' ',now)); assert.throws(()=>decide(o,'idea:i','bad','',now));
 assert.deepEqual(undo(n,'idea:i').decisions,{}); assert.ok(n.decisions['idea:i']);
});
test('seven calendar days and sorted use toggle',()=>{
 const o=emptyOverlay(); assert.equal(snooze(o,'idea:i','2025-12-28').snoozed['idea:i'],'2026-01-04');
 const n=toggleUse(toggleUse(o,'l','2026-10-24'),'l','2026-01-01'); assert.deepEqual(n.uses.l,['2026-01-01','2026-10-24']);
 assert.deepEqual(toggleUse(n,'l','2026-10-24').uses.l,['2026-01-01']); assert.deepEqual(o,emptyOverlay());
});
test('export metadata and atomic merge by timestamps, snooze max and use union',()=>{
 const o=decide(emptyOverlay(),'idea:i','confirmed','',now);
 const e=exportOverlay(o,model); assert.equal(e.app,'cyber-2nd-brain'); assert.deepEqual(e.counts,{ideas:0,steps:0,lessons:0}); assert.equal(e.mode,'sample');
 e.decisions['idea:i']={verdict:'rejected',at:'2026-10-25T00:00:00Z'};
 e.snoozed={'idea:i':'2026-11-01'}; e.uses={l:['2026-10-24','2026-01-01']};
 const local={...o,snoozed:{'idea:i':'2026-11-04'},uses:{l:['2026-10-24','2025-12-01']}};
 const merged=importOverlay(local,JSON.stringify(e)); assert.equal(merged.decisions['idea:i'].verdict,'rejected'); assert.equal(merged.snoozed['idea:i'],'2026-11-04'); assert.deepEqual(merged.uses.l,['2025-12-01','2026-01-01','2026-10-24']);
 assert.equal(importOverlay(merged,exportOverlay(o,model)).decisions['idea:i'].verdict,'rejected');
});
test('reject malformed documents entirely',()=>{
 const e=exportOverlay(emptyOverlay(),model);
 const variants=[null,[],{}, {...e,app:'other'},{...e,version:2},{...e,mode:'bad'},{...e,exportedAt:'bad'},{...e,counts:{ideas:-1,steps:0,lessons:0}},{...e,decisions:[]},{...e,decisions:{'idea:i':{verdict:'oops',at:now}}},{...e,decisions:{'idea:i':{verdict:'confirmed',at:'2026-02-30T00:00:00Z'}}},{...e,decisions:{'idea:i':{verdict:'revised',at:now,note:' '}}},{...e,snoozed:{'idea:i':'2026-02-29'}},{...e,uses:{l:['2026-13-01']}},JSON.parse('{"app":"cyber-2nd-brain","version":1,"decisions":{"__proto__":{}},"snoozed":{},"uses":{}}')];
 const o=emptyOverlay(),before=JSON.stringify(o); for(const v of variants) assert.throws(()=>importOverlay(o,v)); assert.equal(JSON.stringify(o),before);
});
test('prototype-named lesson IDs toggle, merge and survive storage roundtrip',()=>{
 for(const id of ['toString','valueOf','hasOwnProperty','isPrototypeOf','toLocaleString']) {
  const original=emptyOverlay();
  const used=toggleUse(original,id,'2026-10-24');
  assert.deepEqual(used.uses[id],['2026-10-24']); assert.equal(Object.hasOwn(original.uses,id),false);
  assert.deepEqual(toggleUse(used,id,'2026-10-24').uses[id],[]);
  const incoming=exportOverlay(used,model);
  const imported=importOverlay(original,JSON.stringify(incoming));
  assert.deepEqual(imported.uses[id],['2026-10-24']);
  assert.deepEqual(importOverlay(imported,incoming).uses[id],['2026-10-24']);
  let value=null; const store=createStore({getItem:()=>value,setItem:(key,v)=>{value=v;}},'test');
  store.save(imported); assert.deepEqual(store.load(),imported);
 }
});
test('injected storage roundtrip and damaged storage warns once',()=>{
 let value=null,warnings=0; const storage={getItem:()=>value,setItem:(k,v)=>{value=v;}};
 const store=createStore(storage,'test'); store.save(emptyOverlay()); assert.deepEqual(store.load(),emptyOverlay());
 const old=console.warn; console.warn=()=>warnings++; try {value='{';assert.deepEqual(store.load(),emptyOverlay());store.load();assert.equal(warnings,1);} finally {console.warn=old;}
});
