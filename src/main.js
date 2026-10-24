import { loadData } from './data/load.js';
import { buildModel } from './data/model.js';
import { todayKey } from './data/dates.js';
import { parse, redirectLegacy } from './router.js';
import { h } from './ui/dom.js';
import { createPrefs } from './ui/prefs.js';
import { mountShell } from './ui/shell.js';
import { renderQuestion } from './pages/question.js';

const model = buildModel(loadData(), { today: todayKey() });
let page, shell;
const ctx = {model, overlay:{version:1,decisions:{},snoozed:{},uses:{}}, route:null,
  navigate(hash, {replace=false}={}) { if (replace) {history.replaceState(null,'',hash);render();} else location.hash=hash; },
  refresh() { render(true); },
};
ctx.prefs = createPrefs(()=>shell?.update());
ctx.decide = ()=>{};
const main=document.querySelector('#main'), evidence=document.querySelector('#evidence');
function render(force=false) {
  if(location.hash==='#main') {main.focus();return;}
  const legacy=redirectLegacy(location.hash, model.themes.map(t=>t.id));
  if(legacy) history.replaceState(null,'',legacy);
  const route=parse(location.hash), previous=ctx.route;
  ctx.route=route;
  const same=previous?.page===route.page && (route.page!=='question' || previous.params.ideaId===route.params.ideaId);
  if(same && page?.update && !force) {page.update(route);shell?.update();return;}
  page?.destroy?.(); evidence.replaceChildren(); evidence.classList.remove('is-open');
  page=route.page==='question' ? renderQuestion(ctx,route) : {element:h('article',{},h('h1',{tabindex:'-1'},route.page==='today'?'今天':'资料'))};
  main.replaceChildren(page.element);
  if(page.evidence) evidence.append(page.evidence);
  shell?.update();
  window.scrollTo(0,0);main.querySelector('h1')?.focus({preventScroll:true});
  page.update?.(route);
}
shell=mountShell(ctx);
window.addEventListener('hashchange',()=>render());
window.addEventListener('keydown',e=>{if(e.target.closest('input,textarea,[contenteditable="true"]') || e.metaKey || e.ctrlKey || e.altKey)return;page?.onKey?.(e);});
render();
