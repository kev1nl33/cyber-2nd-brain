import { trapFocus } from './components/palette.js';
import { h, icon } from './dom.js';
import { reviewQueue } from '../data/derive.js';
import { renderPhaseBar } from './components/phase-bar.js';

export function mountShell(ctx) {
  const sidebar = document.querySelector('#sidebar'), topbar = document.querySelector('#topbar'), tabbar = document.querySelector('#tabbar');
  const labels = {today:'今天',review:'待核对',timeline:'年表',atlas:'回望',lessons:'太史公曰',sources:'来源'};
  const hrefs = {today:'#/',review:'#/review',timeline:'#/timeline',atlas:'#/atlas',lessons:'#/lessons',sources:'#/sources'};
  let expanded = {};
  try { expanded = JSON.parse(sessionStorage.getItem('c2b.sidebar.v1')) ?? {}; } catch {}
  function link(page, count, label=labels[page]) {
    return h('a',{href:hrefs[page],class:`nav-item ${ctx.route?.page === page ? 'current' : ''}`,...(ctx.route?.page===page?{'aria-current':'page'}:{})},icon(page),h('span',{class:'nav-label'},label),count ? h('span',{class:page==='review'?'count seal-count':'count'},count) : null);
  }
  let releaseDrawer;
  function closeDrawer(){const el=document.querySelector('#evidence');el.classList.remove('is-open');el.removeAttribute('aria-modal');el.removeAttribute('role');el.querySelector('.evidence-close')?.remove();document.querySelector('.evidence-toggle')?.setAttribute('aria-expanded','false');const release=releaseDrawer;releaseDrawer=null;release?.();}
  function toggleDrawer(event){const el=document.querySelector('#evidence');if(el.classList.contains('is-open')){closeDrawer();return;}el.classList.add('is-open');el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');const button=event.currentTarget;button.setAttribute('aria-expanded','true');el.prepend(h('button',{class:'evidence-close','aria-label':'关闭',onclick:closeDrawer},'关闭'));releaseDrawer=trapFocus(el,closeDrawer,button);}
  ctx.closeDrawer=()=>{if(releaseDrawer)closeDrawer();};
  ctx.escape=closeDrawer;
  function update() {
    const route = ctx.route, count = reviewQueue(ctx.model,ctx.overlay).length;
    const idea = ctx.model.byId.idea.get(route?.params.ideaId), theme = ctx.model.byId.theme.get(idea?.themeId ?? route?.params.themeId);
    if (idea) expanded[idea.themeId] = true;
    sidebar.replaceChildren(h('a',{class:'brand',href:'#/'},icon('theme'),h('span',{class:'nav-label'},'赛博第二大脑')),
      h('div',{class:'primary-nav'},link('today'),link('review',count),link('timeline'),link('atlas')),
      h('div',{class:'nav-heading'},'问题'));
    for (const t of ctx.model.themes) {
      const details = h('details',{class:'theme-nav',open:!!expanded[t.id]},h('summary',{},icon('arrow'),h('span',{class:'nav-label'},`${t.code} ${t.label}`),h('span',{class:'count'},t.ideaIds.length)));
      details.addEventListener('toggle',()=>{expanded[t.id]=details.open;try{sessionStorage.setItem('c2b.sidebar.v1',JSON.stringify(expanded));}catch{}});
      for (const id of t.ideaIds) {
        const item = ctx.model.byId.idea.get(id);
        details.append(h('a',{href:`#/q/${encodeURIComponent(id)}`,class:`idea-nav ${id===idea?.id?'current':''}`,title:item.title,...(id===idea?.id?{'aria-current':'page'}:{})},renderPhaseBar(item.phases,{mini:true}),h('span',{class:'nav-label'},item.title)));
      }
      sidebar.append(details);
    }
    sidebar.append(h('div',{class:'nav-heading'},'资料'),link('lessons',ctx.model.lessons.length),link('sources',ctx.model.sources.length),h('footer',{class:'sidebar-footer'},h('div',{class:'pref-buttons'},h('button',{'aria-label':`切换到${ctx.prefs.theme==='dark'?'浅色':'深色'}`,onclick:()=>ctx.prefs.toggleTheme()},icon('theme'),h('span',{class:'nav-label'},ctx.prefs.theme==='dark'?'深色':'浅色')),h('button',{'aria-label':`动效${ctx.prefs.motion==='on'?'开':'关'}，点击切换`,onclick:()=>ctx.prefs.toggleMotion()},icon('motion'),h('span',{class:'nav-label'},`动效 ${ctx.prefs.motion==='on'?'开':'关'}`))),ctx.model.mode==='sample'?h('span',{class:'sample-badge nav-label'},'示例数据'):null,h('a',{href:'https://aikevin.dpdns.org/',class:'nav-label'},'返回博客 ↗')));
    const title = idea?.title ?? theme?.label ?? labels[route?.page] ?? '今天';
    topbar.replaceChildren(h('div',{class:'breadcrumbs'},theme?h('a',{href:`#/t/${theme.id}`},theme.label):null,theme?h('span',{},' / '):null,h('a',{href:location.hash||'#/'},title)),h('div',{class:'topbar-actions'},h('button',{'aria-label':'搜索',onclick:()=>ctx.openPalette?.()},icon('search'),h('span',{class:'desktop-label'},'搜索'),h('kbd',{class:'desktop-label'},navigator.platform.includes('Mac')?'⌘K':'Ctrl K')),h('button',{class:'copy-link desktop-label','aria-live':'polite','aria-label':'复制链接',onclick:async e=>{const button=e.currentTarget,span=button.querySelector('.copy-text');try{await navigator.clipboard.writeText(location.href);}catch{ctx.openCopy?.();return;}span.textContent='已复制';button.setAttribute('aria-label','已复制');setTimeout(()=>{if(button.isConnected){span.textContent='复制链接';button.setAttribute('aria-label','复制链接');}},1500);}},icon('copy'),h('span',{class:'copy-text'},'复制链接')),h('button',{class:'evidence-toggle','aria-controls':'evidence','aria-expanded':String(document.querySelector('#evidence').classList.contains('is-open')),onclick:toggleDrawer},'证据')));
    tabbar.replaceChildren(link('today'),link('review',count),h('button',{onclick:()=>ctx.openMenu?.('questions')},icon('arrow'),h('span',{},'问题')),link('lessons',null,'经验'),h('button',{onclick:()=>ctx.openMenu?.('more')},icon('arrow'),h('span',{},'更多')));
    document.querySelector('#app').dataset.page=route?.page ?? 'today';
  }
  update(); return {update};
}
