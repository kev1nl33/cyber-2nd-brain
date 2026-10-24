import test from 'node:test';
import assert from 'node:assert/strict';
import {buildModel} from '../src/data/model.js';
import {loadData} from '../src/data/load.js';
import {SAMPLE_THOUGHTS,SAMPLE_BRAIN_DATA,SAMPLE_LESSONS} from '../src/data/sample-data.js';
const raw={mode:'sample',thoughts:SAMPLE_THOUGHTS,brain:SAMPLE_BRAIN_DATA,lessons:SAMPLE_LESSONS};
test('sample contract and coverage',()=>{
 const m=buildModel(raw,{today:'2026-10-24'});
 assert.equal(m.themes.length,5); assert.equal(m.ideas.length,10); assert.equal(m.steps.length,30); assert.equal(m.lessons.length,8); assert.equal(m.patterns.length,2);
 assert.ok(m.themes.every(t=>t.ideaIds.length>=2)); assert.equal(new Set(m.steps.map(s=>s.kind)).size,15);
 assert.ok(new Set(m.steps.map(s=>s.date.slice(0,7))).size>=8);
 assert.equal([...m.steps].sort((a,b)=>a.date.localeCompare(b.date))[0].date.slice(0,7),'2025-10');
 assert.equal([...m.steps].sort((a,b)=>b.date.localeCompare(a.date))[0].date.slice(0,7),'2026-10');
 assert.ok(m.steps.filter(s=>s.gapDays>=14).length>=2); assert.ok(m.steps.filter(s=>s.connection==='inferred').length>=5);
 assert.ok(m.ideas.some(i=>!i.stepKeys.length)); assert.ok(m.ideas.some(i=>!i.summary));
 assert.ok(m.refs.some(r=>r.missing)); assert.ok(m.sources.some(s=>s.origin==='flomo')); assert.ok(m.sources.some(s=>s.origin==='obsidian'));
 assert.ok(m.lessons.filter(l=>!l.patternIds.length).length>=2); assert.ok(m.lessons.some(l=>l.patternIds.length===2));
 assert.equal(m.themes.reduce((n,t)=>n+t.stepCount,0),m.steps.length);
 assert.ok(m.byId.step instanceof Map); assert.ok(m.ideas.every(i=>i.phases instanceof Set));
 assert.deepEqual(raw,{mode:'sample',thoughts:SAMPLE_THOUGHTS,brain:SAMPLE_BRAIN_DATA,lessons:SAMPLE_LESSONS});
});
test('load switches all sources together and tolerates absent globals',()=>{
 assert.equal(loadData({}).mode,'sample');
 const thoughts={themes:[{id:'x',ideas:[]}]};
 assert.deepEqual(loadData({CYBER_THOUGHTS:thoughts}),{mode:'private',thoughts,brain:{records:[]},lessons:{lessons:[],patterns:[]}});
 assert.equal(loadData({CYBER_THOUGHTS:{themes:[]},BRAIN_DATA:{records:[{}]}}).brain,SAMPLE_BRAIN_DATA);
});
test('model removes dangling evidence, counts citations uniquely and preserves step order',()=>{
 const m=buildModel({mode:'sample',thoughts:{themes:[{id:'t',ideas:[{id:'i',nodes:[{id:'a',date:'2026-01-01',kind:'起点',refs:[{id:'s'},{id:'s'}]},{id:'b',date:'2026-01-16',kind:'规则',refs:[{id:'absent'}]}]}]}],sources:[{id:'s',date:'2026-01-01'}]},brain:{},lessons:{lessons:[{id:'l',ideaId:'i',stepIds:['a','bad'],status:'confirmed'}],patterns:[{id:'p',lessonIds:['l','bad']}]}},{today:'2026-10-24'});
 assert.deepEqual(m.lessons[0].stepKeys,['i/a']); assert.deepEqual(m.patterns[0].lessonIds,['l']);
 assert.equal(m.steps[1].gapDays,15); assert.equal(m.steps[0].gapDays,null); assert.deepEqual([...m.ideas[0].phases],['see','learn']);
 assert.deepEqual(m.sources[0].citedBy,['i/a']); assert.equal(m.sources[0].origin,'conversation'); assert.equal(m.refs[2].missing,true);
});
