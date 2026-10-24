import test from 'node:test';
import assert from 'node:assert/strict';
import * as timeline from '../src/pages/timeline.js';

test('密集年表合并相交命中区且保留每步', () => {
  assert.equal(typeof timeline.groupTimelineHits, 'function');
  for (const points of [[], [{x:20,y:0}], Array.from({length:200},(_,i)=>({x:(i%7)*12,y:Math.floor(i/7)*3,id:i})), [{x:0,y:0},{x:44,y:0},{x:88,y:0}]]) {
    const groups=timeline.groupTimelineHits(points);
    assert.equal(groups.flatMap(g=>g.items).length,points.length);
    for(const g of groups){assert.ok(g.right-g.left>=44);assert.ok(g.bottom-g.top>=44);}
    for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++){
      const a=groups[i],b=groups[j];
      assert.equal(Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)),0);
    }
  }
});
