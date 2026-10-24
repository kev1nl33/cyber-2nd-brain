const RESERVED = new Set(['review', 'q', 't', 'lessons', 'sources', 'timeline', 'atlas']);
const home = () => ({ page: 'today', params: {} });
const monthValid = (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

function segments(hash) {
  if (!hash || hash === '#' || hash === '#/') return [];
  if (typeof hash !== 'string' || !hash.startsWith('#/')) return null;
  try {
    const parts = hash.slice(2).split('/').map(decodeURIComponent);
    return parts.every(Boolean) ? parts : null;
  } catch {
    return null;
  }
}

export function parse(hash) {
  const parts = segments(hash);
  if (!parts?.length) return home();
  const [head, a, b, marker, c] = parts;
  const count = parts.length;
  if (head === 'review' && count <= 2) {
    return { page: 'review', params: !a ? {} : a === 'done' ? { done: true } : { key: a } };
  }
  if (head === 'q' && (count === 2 || count === 3 || (count === 5 && marker === 'src'))) {
    return { page: 'question', params: { ideaId: a, ...(b && { stepId: b }), ...(c && { sourceId: c }) } };
  }
  if (head === 't' && count === 2) return { page: 'theme', params: { themeId: a } };
  if (head === 'lessons' && count <= 2) return { page: head, params: a ? { patternId: a } : {} };
  if (head === 'sources' && count <= 2) return { page: head, params: a ? { sourceId: a } : {} };
  if (head === 'timeline' && count === 1) return { page: head, params: {} };
  if (head === 'atlas' && (count === 1 || (count === 2 && monthValid(a)))) {
    return { page: head, params: a ? { month: a } : {} };
  }
  return home();
}

export function build({ page, params = {} } = {}) {
  const { ideaId, stepId, sourceId, themeId, patternId, key, done, month } = params;
  let parts;
  switch (page) {
    case 'today': return '#/';
    case 'review': parts = ['review', ...(done ? ['done'] : key ? [key] : [])]; break;
    case 'question':
      if (!ideaId || (sourceId && !stepId)) return '#/';
      parts = ['q', ideaId, ...(stepId ? [stepId] : []), ...(sourceId ? ['src', sourceId] : [])]; break;
    case 'theme': if (!themeId) return '#/'; parts = ['t', themeId]; break;
    case 'lessons': parts = ['lessons', ...(patternId ? [patternId] : [])]; break;
    case 'sources': parts = ['sources', ...(sourceId ? [sourceId] : [])]; break;
    case 'timeline': parts = ['timeline']; break;
    case 'atlas':
      if (month && !monthValid(month)) return '#/';
      parts = ['atlas', ...(month ? [month] : [])]; break;
    default: return '#/';
  }
  return '#/' + parts.map(encodeURIComponent).join('/');
}

export function redirectLegacy(hash, themeIds) {
  const parts = segments(hash);
  if (!parts?.length) return null;
  const [themeId, ideaId, stepId, marker, sourceId] = parts;
  if (RESERVED.has(themeId) || !Array.from(themeIds).includes(themeId)) return null;
  if (parts.length === 1) return build({ page: 'theme', params: { themeId } });
  if (parts.length === 2 || parts.length === 3 || (parts.length === 5 && marker === 'source')) {
    return build({ page: 'question', params: { ideaId, stepId, sourceId } });
  }
  return null;
}
