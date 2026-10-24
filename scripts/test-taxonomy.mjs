import test from 'node:test';
import assert from 'node:assert/strict';
import { PHASES, KIND_PHASE, phaseOf, statusOf } from '../src/data/taxonomy.js';
test('all fifteen kinds and fallback', () => {
 const groups = [['起点','问题','输入','摘录','观察','经历'],['想法','反思','判断','感悟'],['行动','方法'],['结果','反馈','规则']];
 assert.equal(Object.keys(KIND_PHASE).length,15);
 groups.forEach((kinds,i)=>kinds.forEach(k=>assert.equal(phaseOf(k),PHASES[i])));
 for(const k of ['未知','toString',null]) assert.equal(phaseOf(k),'think');
});
test('status normalization',()=>{
 for(const s of ['候选整理 · 隐私待确认','规则待验证','待办']) assert.equal(statusOf(s),'pending');
 for(const s of ['已有实际使用','个人认识','已有研究记录','已发布过作品']) assert.equal(statusOf(s),'landed');
 for(const s of ['正在探索','整理中的联系','']) assert.equal(statusOf(s),'active');
});
