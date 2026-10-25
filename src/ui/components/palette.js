import { h, icon } from '../dom.js';
import { buildIndex, search } from '../../data/search.js';
const names={idea:'问题',step:'步骤',lesson:'经验',theme:'主题',source:'来源',command:'命令'};
export function trapFocus(dialog, close, previous=document.activeElement) {
  function onKey(event){if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return;}if(event.key!=='Tab')return;const items=[...dialog.querySelectorAll('button,a[href],input,textarea,summary,[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length);const first=items[0],last=items.at(-1);if(!items.length){event.preventDefault();dialog.focus();}else if(event.shiftKey&&(document.activeElement===first||!dialog.contains(document.activeElement))){event.preventDefault();last.focus();}else if(!event.shiftKey&&(document.activeElement===last||!dialog.contains(document.activeElement))){event.preventDefault();first.focus();}}
  document.addEventListener('keydown',onKey,true);dialog.querySelector('button,a[href],input')?.focus();
  return ()=>{document.removeEventListener('keydown',onKey,true);(previous?.isConnected?previous:document.querySelector('#main h1[tabindex],#main'))?.focus?.();};
}
export function openDialog(title, content) {
  const previous=document.activeElement;
  const close=()=>{backdrop.remove();document.removeEventListener('keydown',onKey,true);const target=previous?.isConnected?previous:document.querySelector('#main h1[tabindex],#main');target?.focus?.();};
  const dialog=h('section',{class:'modal',role:'dialog','aria-modal':'true','aria-label':title},h('div',{class:'modal-header'},h('h2',{},title),h('button',{'aria-label':'关闭',onclick:close},icon('close'))),content);
  const backdrop=h('div',{class:'modal-backdrop',onclick:e=>{if(e.target===backdrop)close();}},dialog);
  function onKey(e) {
    if(document.querySelector('#overlay-root')?.lastElementChild!==backdrop)return;
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();return;}
    if(e.key==='Tab') {const els=[...dialog.querySelectorAll('button,a[href],input,textarea,[tabindex="0"]')].filter(el=>!el.disabled&&!el.hidden);const first=els[0],last=els.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
  }
  document.querySelector('#overlay-root').append(backdrop);document.addEventListener('keydown',onKey,true);dialog.querySelector('input,button,a')?.focus();
  return {close,dialog};
}
export function openPalette(ctx,commands) {
  if(document.querySelector('.modal-backdrop'))return;
  let active=0, entries=[];
  const results=h('div',{id:'palette-results',class:'palette-results',role:'listbox'});
  const input=h('input',{class:'palette-input',placeholder:'搜索问题、步骤、经验、来源，或输入命令',role:'combobox','aria-label':'搜索问题、步骤、经验、来源，或输入命令','aria-controls':'palette-results','aria-expanded':'true','aria-autocomplete':'list',oninput:()=>{active=0;draw();}});
  const modal=openDialog('搜索',h('div',{},input,results));
  const index=buildIndex(ctx.model,commands);
  function execute(entry) {
    modal.close();const t=entry.target;
    if(entry.type==='command'){t.run();return;}
    const hashes={idea:`#/q/${encodeURIComponent(t.id)}`,step:`#/q/${encodeURIComponent(t.ideaId)}/${encodeURIComponent(t.id)}`,lesson:`#/q/${encodeURIComponent(t.ideaId)}/${encodeURIComponent(ctx.model.byId.step.get(t.stepKeys[0])?.id??'')}`,pattern:`#/lessons/${encodeURIComponent(t.id)}`,theme:`#/t/${encodeURIComponent(t.id)}`,source:`#/sources/${encodeURIComponent(t.id)}`};
    ctx.navigate(hashes[entry.type]);
  }
  function select() {results.querySelectorAll('[role=option]').forEach((el,i)=>{el.classList.toggle('is-active',i===active);el.setAttribute('aria-selected',String(i===active));});input.setAttribute('aria-activedescendant',`palette-option-${active}`);results.querySelector(`#palette-option-${active}`)?.scrollIntoView({block:'nearest'});}
  function draw() {
    const groups=search(index,input.value), displayGroups=input.value.trim()?Object.entries(groups).map(([group,items])=>[names[group],items]):[['前往',groups.command.filter(item=>item.id.startsWith('go-'))],['操作',groups.command.filter(item=>!item.id.startsWith('go-'))]];entries=[];results.replaceChildren();
    for(const [title,items] of displayGroups) {
      if(!items.length)continue;
      results.append(h('h3',{class:'palette-group'},title));
      for(const item of items){const i=entries.length;entries.push(item);results.append(h('button',{class:'palette-result',id:`palette-option-${i}`,role:'option',tabindex:'-1',onclick:()=>execute(item)},h('span',{},item.title),item.snippet?h('small',{},item.snippet.before,h('mark',{},item.snippet.match),item.snippet.after):null));}
    }
    select();
  }
  input.addEventListener('keydown',e=>{if(['ArrowDown','ArrowUp','Enter'].includes(e.key)){e.preventDefault();if(e.key==='Enter'){if(entries[active])execute(entries[active]);}else{active=Math.max(0,Math.min(entries.length-1,active+(e.key==='ArrowDown'?1:-1)));select();}}});
  draw();input.focus();return modal;
}
