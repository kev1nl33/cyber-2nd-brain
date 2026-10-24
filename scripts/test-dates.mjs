import test from 'node:test';
import assert from 'node:assert/strict';
import {day,diffDays,todayKey,fmtShort,fmtLong,fmtToday,fmtAgo} from '../src/data/dates.js';
test('strict calendar days and UTC differences',()=>{
 assert.equal(day('2026-10-24 12:00:00'),'2026-10-24');
 for(const x of ['',null,'2026-02-29','2026-04-31','2026-13-01','x']) assert.equal(day(x),null);
 assert.equal(day('2024-02-29'),'2024-02-29');
 assert.equal(diffDays('2025-12-31','2026-01-02'),2);
 assert.equal(diffDays('2026-02-28','2026-03-01'),1);
 assert.equal(diffDays('bad','2026-01-01'),null);
 assert.equal(todayKey(new Date(2026,9,24,23,59)),'2026-10-24');
});
test('date labels and relative boundaries',()=>{
 assert.equal(fmtShort('2026-10-15'),'10.15'); assert.equal(fmtLong('2026-10-15'),'2026.10.15');
 assert.equal(fmtToday('2026-10-24'),'10 月 24 日 · 周六');
 for(const f of [fmtShort,fmtLong,fmtToday]) assert.equal(f(''),'');
 [0,1,2,29,30,364,365].forEach((n,i)=>assert.equal(fmtAgo(n),['今天','昨天','2 天前','29 天前','1 个月前','12 个月前','一年多前'][i]));
});
