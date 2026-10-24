import test from 'node:test';
import assert from 'node:assert/strict';
import {buildModel} from '../src/data/model.js';
import {sharedSourceIdeas,dailyLesson,staleIdea,reviewQueue,monthlyCounts} from '../src/data/derive.js';
function fixture(){return buildModel({mode:'sample',thoughts:{themes:[{id:'t',ideas:Array.from({length:8},(_,i)=>({id:`i${i}`,updated:`2026-01-0${i+1}`,status:'规则待验证',nodes:[{id:'a',date:'2025-10-01',kind:'起点',refs:[{id:'s'}]},{id:'b',date:`2026-01-0${i+1}`,kind:'反思',connection:'inferred',refs:i<2?[{id:'s2'}]:[]}]}))}],sources:[{id:'s'},{id:'s2'}]},lessons:{lessons:[{id:'z',ideaId:'i0'},{id:'a',ideaId:'i0'}]}},{today:'2026-10-24'});}
test('shared sources sort by unique overlap then updated and cap at five',()=>{
 const m=fixture();
 // Repeated citations count once; unresolved sources never create overlap.
 m.refs.push({...m.refs[0]},
   {stepKey:'i0/a',sourceId:'absent',missing:true},
   {stepKey:'i6/a',sourceId:'absent',missing:true});
 assert.deepEqual(sharedSourceIdeas(m,'i0').map(r=>[r.idea.id,r.shared]),[
   ['i1',2],['i7',1],['i6',1],['i5',1],['i4',1]
 ]);
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
 const m=fixture();
 assert.deepEqual(reviewQueue(m,{},m.today).map(r=>r.key),[
   'lesson:a','lesson:z',
   'conn:i7/b','conn:i6/b','conn:i5/b','conn:i4/b','conn:i3/b','conn:i2/b','conn:i1/b','conn:i0/b',
   'idea:i7','idea:i6','idea:i5','idea:i4','idea:i3','idea:i2','idea:i1','idea:i0'
 ]);
 const overlay={decisions:{'lesson:a':{},'conn:i4/b':{},'idea:i3':{}},
   snoozed:{'lesson:z':'2026-10-25','conn:i7/b':'2026-10-24','idea:i0':'2026-10-23'}};
 assert.deepEqual(reviewQueue(m,overlay,'2026-10-23').map(r=>r.key),[
   'conn:i6/b','conn:i5/b','conn:i3/b','conn:i2/b','conn:i1/b','conn:i0/b',
   'idea:i7','idea:i6','idea:i5','idea:i4','idea:i2','idea:i1','idea:i0'
 ]);
 assert.deepEqual(reviewQueue(m,overlay,'2026-10-24').map(r=>r.key),[
   'conn:i7/b','conn:i6/b','conn:i5/b','conn:i3/b','conn:i2/b','conn:i1/b','conn:i0/b',
   'idea:i7','idea:i6','idea:i5','idea:i4','idea:i2','idea:i1','idea:i0'
 ]);
 assert.deepEqual(reviewQueue(m,overlay,'2026-10-25').map(r=>r.key),[
   'lesson:z',
   'conn:i7/b','conn:i6/b','conn:i5/b','conn:i3/b','conn:i2/b','conn:i1/b','conn:i0/b',
   'idea:i7','idea:i6','idea:i5','idea:i4','idea:i2','idea:i1','idea:i0'
 ]);
});
