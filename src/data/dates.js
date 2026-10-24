const pad = n => String(n).padStart(2, '0');
export function day(value) {
  if (typeof value !== 'string') return null;
  const s = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
}
export function diffDays(a, b) {
  const first = day(a), last = day(b);
  return first && last ? (Date.parse(`${last}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86400000 : null;
}
export function todayKey(date = new Date()) {
  return `${String(date.getFullYear()).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
export function fmtShort(value) { return day(value)?.slice(5).replace('-', '.') ?? ''; }
export function fmtLong(value) { return day(value)?.replaceAll('-', '.') ?? ''; }
export function fmtToday(value) {
  const s = day(value);
  if (!s) return '';
  const d = new Date(`${s}T00:00:00Z`);
  return `${d.getUTCMonth() + 1} 月 ${d.getUTCDate()} 日 · 周${'日一二三四五六'[d.getUTCDay()]}`;
}
export function fmtAgo(days) {
  if (!Number.isFinite(days) || days < 0) return '';
  if (days === 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 30) return `${Math.floor(days)} 天前`;
  if (days < 365) return `${Math.floor(days / 30)} 个月前`;
  return '一年多前';
}
