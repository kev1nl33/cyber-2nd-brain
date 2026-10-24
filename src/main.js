import { loadData } from './data/load.js';
import { buildModel } from './data/model.js';
import { todayKey } from './data/dates.js';
import { parse, build, redirectLegacy } from './router.js';
import { h, icon } from './ui/dom.js';
import { createPrefs } from './ui/prefs.js';
import { mountShell } from './ui/shell.js';
import { renderQuestion } from './pages/question.js';
import { renderToday } from './pages/today.js';
import { renderReview } from './pages/review.js';
import { createStore, decide, undo, snooze, toggleUse, exportOverlay, importOverlay } from './data/overlay.js';
import { showToast } from './ui/components/toast.js';
import { openPalette, openDialog } from './ui/components/palette.js';
import { renderTheme } from './pages/theme.js';
import { renderLessons } from './pages/lessons.js';
import { renderSources } from './pages/sources.js';
import { renderTimeline } from './pages/timeline.js';
import { renderAtlas } from './pages/atlas.js';

const model = buildModel(loadData(), { today: todayKey() });
let page, shell;
const store = createStore(model.mode==='sample'?sessionStorage:localStorage,model.mode==='sample'?'c2b.overlay.sample.v1':'c2b.overlay.v1');
function samePage(a,b) {
  return a?.page===b?.page && (b.page!=='question' || a.params.ideaId===b.params.ideaId) && (b.page!=='theme' || a.params.themeId===b.params.themeId);
}
const ctx = {model, overlay:store.load(), route:null, atlasOrigin:null,
  navigate(hash, {replace=false}={}) {
    const target=parse(hash);
    if (replace || samePage(ctx.route,target)) {history.replaceState(null,'',hash);render();}
    else location.hash=hash;
  },
  returnFromAtlas() { ctx.navigate(ctx.atlasOrigin ?? '#/'); },
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
main.setAttribute('aria-label','正文');
ctx.openCopy=()=>openDialog('复制链接',h('input',{value:location.href,readonly:true,'aria-label':'复制链接',onclick:e=>e.target.select()}));
ctx.copyLink=async()=>{try{await navigator.clipboard.writeText(location.href);showToast('已复制');}catch{ctx.openCopy();}};
const destinations=[['今天','#/'],['待核对','#/review'],['年表','#/timeline'],['回望','#/atlas'],['太史公曰','#/lessons'],['来源','#/sources']];
ctx.openPalette=()=>openPalette(ctx,[...destinations.map(([name,hash],i)=>({id:`go-${i}`,name,run:()=>ctx.navigate(hash)})),{id:'theme',name:'切换深色/浅色',run:()=>ctx.prefs.toggleTheme()},{id:'motion',name:'切换动效',run:()=>ctx.prefs.toggleMotion()},{id:'export',name:'导出核对记录',run:ctx.exportReview},{id:'copy',name:'复制当前链接',run:ctx.copyLink}]);
ctx.openMenu=type=>{const items=type==='questions'?model.themes.map(t=>[t.label,`#/t/${t.id}`]):destinations.slice(2);const content=h('div',{class:'menu-links'});const modal=openDialog(type==='questions'?'问题':'更多',content);for(const [label,hash]of items)content.append(h('a',{href:hash,onclick:()=>modal.close()},label));if(type!=='questions')content.append(h('button',{onclick:()=>ctx.prefs.toggleTheme()},'深色'),h('button',{onclick:()=>ctx.prefs.toggleMotion()},'动效'),h('a',{href:'https://aikevin.dpdns.org/'},'返回博客'));};
let gAt=0;
window.addEventListener('keydown',e=>{
  const editable=e.target instanceof Element && e.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])');
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();ctx.openPalette();return;}
  if(editable||document.querySelector('.modal-backdrop')||e.metaKey||e.ctrlKey||e.altKey)return;
  if(e.key==='/'){e.preventDefault();ctx.openPalette();return;}
  if(e.key==='?'){e.preventDefault();openDialog('快捷键',h('dl',{class:'shortcut-list'},[['⌘K / Ctrl K / /','搜索'],['G T','今天'],['G R','待核对'],['G L','太史公曰'],['G S','来源'],['G Y','年表'],['G A','回望'],['J / K','下一步 / 上一步'],['O','查看原文'],['Y / E / N / S','确认 / 修改 / 不成立 / 稍后'],['Esc','关闭']].map(([key,label])=>h('div',{},h('dt',{},h('kbd',{},key)),h('dd',{},label)))));return;}
  const key=e.key.length===1?e.key.toLowerCase():'';if(key==='g'){gAt=Date.now();return;}if(gAt&&Date.now()-gAt<1000){gAt=0;const hash={t:'#/',r:'#/review',l:'#/lessons',s:'#/sources',y:'#/timeline',a:'#/atlas'}[key];if(hash){e.preventDefault();ctx.navigate(hash);}}
});
function render(force=false) {
  if(location.hash==='#main') {main.focus();return;}
  const legacy=redirectLegacy(location.hash, model.themes.map(t=>t.id));
  if(legacy) history.replaceState(null,'',legacy);
  const route=parse(location.hash), previous=ctx.route;
  if(route.page==='atlas' && previous && previous.page!=='atlas') ctx.atlasOrigin=build(previous);
  ctx.route=route;
  const same=samePage(previous,route);
  if(same && page?.update && (!force || route.page==='review')) {page.update(route,{refresh:force});shell?.update();return;}
  const active=document.activeElement;
  page?.destroy?.(); evidence.replaceChildren(); evidence.classList.remove('is-open');
  const renderers={question:renderQuestion,today:renderToday,review:renderReview,theme:renderTheme,lessons:renderLessons,sources:renderSources,timeline:renderTimeline,atlas:renderAtlas};
  page=renderers[route.page]?.(ctx,route) ?? {element:h('article',{},h('h1',{tabindex:'-1'},'资料'))};
  main.replaceChildren(page.element);
  if(page.evidence) evidence.append(page.evidence);
  shell?.update();
  const entry=main.querySelector('h1');
  entry?.setAttribute('tabindex','-1');
  if(!force) window.scrollTo(0,0);
  if(!document.querySelector('[aria-modal="true"]') && (!force || !active?.isConnected)) (entry ?? main).focus({preventScroll:true});
  page.update?.(route);
}
shell=mountShell(ctx);
document.addEventListener('click',event=>{
  if(event.defaultPrevented || event.button!==0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link=event.target instanceof Element ? event.target.closest('a[href]') : null;
  if(!link || link.hasAttribute('download') || (link.target && link.target!=='_self')) return;
  const url=new URL(link.href,location.href);
  if(url.origin!==location.origin || url.pathname!==location.pathname || url.search!==location.search || !url.hash.startsWith('#/')) return;
  event.preventDefault();ctx.navigate(url.hash);
});
window.addEventListener('hashchange',()=>render());
window.addEventListener('keydown',e=>{if(e.defaultPrevented || document.querySelector('[aria-modal="true"]') || !(e.target instanceof Element)||e.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])') || e.metaKey || e.ctrlKey || e.altKey)return;page?.onKey?.(e);});
window.addEventListener('keydown',e=>{if(e.key!=='Escape'||e.defaultPrevented||document.querySelector('.modal-backdrop'))return;if(ctx.route?.page==='atlas'){e.preventDefault();ctx.returnFromAtlas();return;}ctx.escape?.(e);});
render();
