import { loadData } from './data/load.js';
import { buildModel } from './data/model.js';
import { todayKey } from './data/dates.js';
import { parse, redirectLegacy } from './router.js';
import { h, icon } from './ui/dom.js';
import { createPrefs } from './ui/prefs.js';
import { mountShell } from './ui/shell.js';
import { renderQuestion } from './pages/question.js';
import { renderToday } from './pages/today.js';
import { renderReview } from './pages/review.js';
import { createStore, decide, undo, snooze, toggleUse, exportOverlay, importOverlay } from './data/overlay.js';
import { showToast } from './ui/components/toast.js';

const model = buildModel(loadData(), { today: todayKey() });
let page, shell;
const store = createStore(model.mode==='sample'?sessionStorage:localStorage,model.mode==='sample'?'c2b.overlay.sample.v1':'c2b.overlay.v1');
const ctx = {model, overlay:store.load(), route:null,
  navigate(hash, {replace=false}={}) { if (replace) {history.replaceState(null,'',hash);render();} else location.hash=hash; },
  refresh() { render(true); },
};
ctx.prefs = createPrefs(()=>shell?.update());
function save(next) {ctx.overlay=next;store.save(next);ctx.refresh();}
function record(next,key) {const previous=ctx.overlay;save(next);showToast('已记录',{label:'撤销',onAction:()=>{const restored={...ctx.overlay,decisions:{...ctx.overlay.decisions},snoozed:{...ctx.overlay.snoozed}};for(const field of ['decisions','snoozed']) {if(Object.hasOwn(previous[field],key)) restored[field][key]=previous[field][key];else delete restored[field][key];}save(restored);}});}
ctx.decide = (key,verdict,note='')=>record(decide(ctx.overlay,key,verdict,note),key);
ctx.snooze = key=>record(snooze(ctx.overlay,key,model.today),key);
ctx.undo = key=>save(undo(ctx.overlay,key));
ctx.toggleUse = id=>save(toggleUse(ctx.overlay,id,model.today));
ctx.exportReview = ()=>{
  const blob=new Blob([JSON.stringify(exportOverlay(ctx.overlay,model),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob);
  const a=h('a',{href:url,download:`c2b-review-${model.today.replaceAll('-','')}.json`});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
ctx.importReview = async file=>{try{const next=importOverlay(ctx.overlay,await file.text());save(next);showToast(`已合并 ${Object.keys(next.decisions).length} 条核对记录`);}catch{showToast('文件无法识别');}};
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
  page=route.page==='question' ? renderQuestion(ctx,route) : route.page==='today' ? renderToday(ctx,route) : route.page==='review' ? renderReview(ctx,route) : {element:h('article',{},h('h1',{tabindex:'-1'},'资料'))};
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
