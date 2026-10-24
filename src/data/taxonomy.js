export const PHASES = ['see', 'think', 'do', 'learn'];
export const PHASE_LABEL = { see: '看见', think: '想', do: '做', learn: '学到' };
export const KIND_PHASE = {
  起点: 'see', 问题: 'see', 输入: 'see', 摘录: 'see', 观察: 'see', 经历: 'see',
  想法: 'think', 反思: 'think', 判断: 'think', 感悟: 'think',
  行动: 'do', 方法: 'do', 结果: 'learn', 反馈: 'learn', 规则: 'learn',
};
export const phaseOf = kind => Object.hasOwn(KIND_PHASE, kind) ? KIND_PHASE[kind] : 'think';
export const STATUS_LABEL = { pending: '待确认', active: '进行中', landed: '已落地' };
const LANDED = new Set(['已发布过作品', '已有实际使用', '个人认识', '已有研究记录']);
export function statusOf(raw = '') {
  if (raw.startsWith('候选整理') || raw.includes('待')) return 'pending';
  return LANDED.has(raw) ? 'landed' : 'active';
}
