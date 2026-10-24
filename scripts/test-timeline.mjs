import test from 'node:test';
import assert from 'node:assert/strict';
import * as timeline from '../src/pages/timeline.js';

test('逐点布局保留独立目标、固定横坐标且命中区不相交', () => {
  assert.equal(typeof timeline.layoutTimelinePoints, 'function');
  for (const points of [[], [{x:22,day:0,key:'a'}], Array.from({length:480},(_,i)=>({x:22+(i%40)*12,day:Math.floor(i/40),key:String(i)})), [{x:22,day:0,key:'a'},{x:66,day:0,key:'b'},{x:22,day:30,key:'c'}]]) {
    const {items, dayY} = timeline.layoutTimelinePoints(points);
    assert.equal(items.length, points.length);
    assert.deepEqual(new Set(items.map(p=>p.key)),new Set(points.map(p=>p.key)));
    for(const p of items) assert.equal(p.x,points.find(q=>q.key===p.key).x);
    for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
      const a=items[i],b=items[j];
      assert.equal(Math.max(0,44-Math.abs(a.x-b.x))*Math.max(0,44-Math.abs(a.y-b.y)),0);
    }
    assert.ok(dayY(40)>=dayY(0)+120);
    assert.deepEqual(timeline.layoutTimelinePoints([...points].reverse()).items,items);
  }
});

test('无冲突时保留每天3px，月首与边界留足命中空间', () => {
  assert.equal(typeof timeline.layoutTimelinePoints, 'function');
  const {items,dayY}=timeline.layoutTimelinePoints([{x:22,day:0,key:'a'},{x:22,day:30,key:'b'}]);
  assert.equal(items[0].y,22);
  assert.equal(items[1].y-items[0].y,90);
  assert.equal(dayY(30),items[1].y);
});
