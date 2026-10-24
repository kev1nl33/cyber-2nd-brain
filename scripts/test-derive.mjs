import test from 'node:test';
import assert from 'node:assert/strict';
import {buildModel} from '../src/data/model.js';
import {sharedSourceIdeas,dailyLesson,staleIdea,reviewQueue,monthlyCounts} from '../src/data/derive.js';
function fixture(){return buildModel({mode:'sample',thoughts:{themes:[{id:'t',ideas:Array.from({length:8},(_,i)=>({id:`i${i}`,updated:`2026-01-0${i+1}`,status:'规则待验证',nodes:[{id:'a',date:'2025-10-01',kind:'起点',refs:[{id:'s'}]},{id:'b',date:`2026-01-0${i+1}`,kind:'反思',connection:'inferred',refs:i<2?[{id:'s2'}]:[]}]}))}],sources:[{id:'s'},{id:'s2'}]},lessons:{lessons:[{id:'z',ideaId:'i0'},{id:'a',ideaId:'i0'}]}},{today:'2026-10-24'});}
test('shared sources sort by unique overlap then updated and cap at five',()=>{
 const r=sharedSourceIdeas(fixture(),'i0'); assert.equal(r.length,5); assert.equal(r[0].idea.id,'i1'); assert.equal(r[0].shared,2); assert.equal(r[1].idea.id,'i7');
 assert.deepEqual(sharedSourceIdeas(fixture(),'missing'),[]);
});
test('daily lesson deterministic, variable, empty safe',()=>{
 const m=fixture(); assert.equal(dailyLesson(m,'2026-01-01'),dailyLesson(m,'2026-01-01'));
 assert.ok(new Set(Array.from({length:20},(_,i)=>dailyLesson(m,`2026-01-${i+1}`).id)).size>1);
 assert.equal(dailyLesson({lessons:[]},'2026-01-01'),null);
});
test('stale phases and monthly gaps',()=>{
 const m=fixture(),r=staleIdea(m); assert.equal(r.idea.id,'i0'); assert.equal(r.stoppedAt,'think'); assert.equal(r.missing,'do'); assert.equal(r.days,296);
 assert.equal(staleIdea({...m,ideas:[]}),null);
 assert.deepEqual(monthlyCounts(m),[{month:'2025-10',count:8},{month:'2025-11',count:0},{month:'2025-12',count:0},{month:'2026-01',count:8}]);
});
test('queue order, decisions, snooze expiry',()=>{
 const m=fixture(); const all=reviewQueue(m,{},m.today);
 assert.deepEqual(all.slice(0,3).map(r=>r.key),['lesson:a','lesson:z','conn:i7/b']);
 const q=reviewQueue(m,{decisions:{'lesson:a':{}},snoozed:{'lesson:z':'2026-10-25','conn:i7/b':'2026-10-24'}},m.today);
 assert.equal(q[0].key,'conn:i7/b'); assert.equal(q.filter(r=>r.type==='idea')[0].key,'idea:i7');
});
