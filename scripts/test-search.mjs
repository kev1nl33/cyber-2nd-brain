import test from 'node:test';
import assert from 'node:assert/strict';
import {buildIndex,search,snippet} from '../src/data/search.js';
const model={ideas:[{id:'a',title:'STAR start',summary:'',updated:'2025-01-01'},{id:'b',title:'a star',summary:'',updated:'2026-01-01'},{id:'c',title:'other',summary:'STAR insight',updated:'2026-10-01'}],steps:[{key:'i/s',title:'中文月亮',body:'宇航员',date:'2026-01-01'}],lessons:[{id:'l',text:'示例月亮经验'}],patterns:[{id:'p',name:'月亮模式'}],themes:[{id:'t',label:'月亮',en:'MOON'}],sources:[{id:'s',title:'source',tags:['月亮/演示'],text:'SECRET_BODY_ONLY',date:'2026-01-01'}]};
test('title prefix then title substring then other fields',()=>{
 const r=search(buildIndex(model),'star'); assert.deepEqual(r.idea.map(x=>x.id),['a','b','c']);
 assert.equal(search(buildIndex(model),'secret_body_only').source.length,0);
 assert.deepEqual(Object.keys(r),['idea','step','lesson','theme','source','command']);
});
test('Chinese matching, pattern grouping, commands and group cap',()=>{
 const index=buildIndex(model,[{id:'go',name:'前往月亮'}]); const r=search(index,'月亮');
 assert.equal(r.step.length,1); assert.equal(r.lesson.length,2); assert.equal(r.lesson[0].type,'pattern'); assert.equal(r.source.length,1); assert.equal(r.command.length,1);
 assert.equal(search(index,'').command.length,1); assert.equal(search(index,'').idea.length,0);
 assert.equal(search(buildIndex({...model,ideas:Array.from({length:8},(_,i)=>({id:String(i),title:'月亮'}))}),'月亮').idea.length,5);
});
test('empty query preserves all ten default commands while typed queries cap five',()=>{
 const names=['今天','待核对','年表','回望','太史公曰','来源','切换深色/浅色','切换动效','导出核对记录','复制当前链接'];
 const commands=names.map((name,i)=>({id:String(i),name:`示例 ${name}`}));
 const index=buildIndex(model,commands);
 for (const query of ['', '   ']) assert.deepEqual(search(index,query).command.map(c=>c.target),commands);
 assert.equal(search(index,'示例').command.length,5);
});
test('snippet returns literal text with twelve characters context and explicit match',()=>{
 assert.deepEqual(snippet('abcdefghijklmnop月亮qrstuvwxyz123456','月亮'),{before:'efghijklmnop',match:'月亮',after:'qrstuvwxyz12'});
 assert.deepEqual(snippet('<b>HELLO</b>','hello'),{before:'<b>',match:'HELLO',after:'</b>'});
 assert.deepEqual(snippet('abc','z'),{before:'abc',match:'',after:''});
});
