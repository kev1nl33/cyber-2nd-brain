export function createPrefs(onChange = () => {}) {
  const dark = matchMedia('(prefers-color-scheme: dark)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('c2b.prefs.v1')) ?? {}; } catch {}
  const prefs = {
    get theme() { return ['dark','light'].includes(saved.theme) ? saved.theme : dark.matches ? 'dark' : 'light'; },
    get motion() { return ['on','off'].includes(saved.motion) ? saved.motion : reduced.matches ? 'off' : 'on'; },
    toggleTheme() { saved.theme = prefs.theme === 'dark' ? 'light' : 'dark'; persist(); },
    toggleMotion() { saved.motion = prefs.motion === 'on' ? 'off' : 'on'; persist(); },
  };
  function apply() { document.documentElement.dataset.theme = prefs.theme; document.documentElement.dataset.motion = prefs.motion; onChange(prefs); }
  function persist() { try { localStorage.setItem('c2b.prefs.v1', JSON.stringify(saved)); } catch {} apply(); }
  dark.addEventListener('change', apply); reduced.addEventListener('change', apply); apply();
  return prefs;
}
