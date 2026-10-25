import { h } from '../ui/dom.js';
import { fnv1a } from '../data/derive.js';

function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const lerp=(a,b,t)=>a+(b-a)*t;
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));

export function renderAtlas(ctx, route) {
  const { model } = ctx;
  const steps=[...model.steps].filter(s=>s.date).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
  const start=steps[0]?.date, end=steps.at(-1)?.date;
  const totalDays=Math.max(0,Math.round((Date.parse(end)-Date.parse(start))/86400000));
  const element=h('section',{class:'atlas'},h('canvas',{class:'atlas-canvas','aria-hidden':'true'}),h('ol',{class:'visually-hidden'},steps.map(s=>h('li',{},h('a',{href:`#/q/${encodeURIComponent(s.ideaId)}/${encodeURIComponent(s.id)}`},`${s.date} ${model.byId.idea.get(s.ideaId)?.title}：${s.title}`)))));
  let speed=1, playing=false, stars=false, bridges=true, day=totalDays, labels=[], flashes=[], raf=null, lastT=0, hovered=null;
  const DAILY=24*1000*3600;
  const fullDuration=()=>24000/speed;
  const control=h('div',{class:'atlas-control'});
  const playBtn=h('button',{class:'atlas-button',onclick:toggle},'播放');
  const bar=h('input',{class:'atlas-progress',type:'range',min:0,max:totalDays,step:1,value:totalDays,'aria-label':'时间进度'});
  const dateLabel=h('time',{class:'atlas-date'},'');
  const speedBtn=h('button',{class:'atlas-button',onclick:()=>{speed=speed===1?2:1;speedBtn.textContent=`${speed}×`;lastT=performance.now();}},'1×');
  const starBtn=h('button',{class:'atlas-button','aria-pressed':'false',onclick:()=>{stars=!stars;starBtn.setAttribute('aria-pressed',String(stars));draw();}},'星座');
  const bridgeBtn=h('button',{class:'atlas-button','aria-pressed':'true',onclick:()=>{bridges=!bridges;bridgeBtn.setAttribute('aria-pressed',String(bridges));draw();}},'光桥');
  const back=h('a',{class:'atlas-back',href:ctx.atlasOrigin??'#/',onclick:event=>{event.preventDefault();ctx.leaveAtlas?.();}},'← 返回');
  const firstMonthLabel=start?start.slice(0,7):'', lastMonthLabel=end?end.slice(0,7):'';
  control.append(playBtn,h('span',{class:'atlas-bound'},firstMonthLabel),bar,h('span',{class:'atlas-bound'},lastMonthLabel),dateLabel,speedBtn,starBtn,bridgeBtn);
  bar.addEventListener('input',()=>seek(Number(bar.value)));
  element.append(back,control,h('h1',{class:'visually-hidden',tabindex:'-1'},'回望'));
  const canvas=element.querySelector('canvas'), dpr=Math.min(2,devicePixelRatio||1);
  let W=0,H=0,S=0;
  function resize(){const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;W=rect.width;H=rect.height;canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);layout();if(playing){for(const step of steps){if(!litKeys.has(step.key))continue;const star=starOf.get(step.ideaId);if(star){star.lit++;star.lastLit=step.date;}}}else applyDay();draw();}
  const themes=model.themes.slice(0,5);
  const zones=themes.map((t,i)=>{const angle=(-90+i*72)*Math.PI/180;return {theme:t,cx:Math.cos(angle),cy:Math.sin(angle)};});
  const ideas=model.ideas.filter(i=>i.stepKeys.length);
  const starOf=new Map();
  const sourcesOf=new Map(ideas.map(idea=>[idea.id,new Set(model.refs.filter(ref=>!ref.missing&&model.byId.step.get(ref.stepKey)?.ideaId===idea.id).map(ref=>ref.sourceId))]));
  const bridgePairs=[];
  for(let i=0;i<ideas.length;i++)for(let j=i+1;j<ideas.length;j++)if([...sourcesOf.get(ideas[i].id)].some(id=>sourcesOf.get(ideas[j].id).has(id)))bridgePairs.push([ideas[i].id,ideas[j].id]);
  function layout(){S=Math.min(W,H);for(const zone of zones){zone.x=W/2+zone.cx*0.30*S;zone.y=H/2+zone.cy*0.30*S;}
    for(const zone of zones){const list=ideas.filter(i=>i.themeId===zone.theme.id).sort((a,b)=>a.updated<b.updated?-1:1);list.forEach((idea,k)=>{const theta=k*137.508*Math.PI/180,r=0.045*S*Math.sqrt(k+0.6);starOf.set(idea.id,{idea,zone,x:zone.x+r*Math.cos(theta),y:zone.y+r*Math.sin(theta),radius:2+1.1*idea.stepKeys.length,lit:0,lastLit:null});});}}
  const bgStars=[];const rng=mulberry32(fnv1a('bg'));for(let i=0;i<260;i++)bgStars.push({x:rng(),y:rng(),r:lerp(0.3,1.1,rng()),a:lerp(0.15,0.5,rng())});
  const glow=document.createElement('canvas');glow.width=glow.height=64;const g=glow.getContext('2d');const grad=g.createRadialGradient(32,32,0,32,32,32);grad.addColorStop(0,'rgba(255,255,255,0.9)');grad.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=grad;g.fillRect(0,0,64,64);
  function starColor(days){if(days<=0)return '#cfe3ff';if(days>=365)return '#f0b46a';if(days<=180)return mix('#cfe3ff','#f4ecd8',days/180);return mix('#f4ecd8','#f0b46a',(days-180)/185);}
  function mix(a,b,t){const pa=parseInt(a.slice(1),16),pb=parseInt(b.slice(1),16);const r=Math.round(lerp(pa>>16,pb>>16,t)),gg=Math.round(lerp(pa>>8&255,pb>>8&255,t)),bl=Math.round(lerp(pa&255,pb&255,t));return `rgb(${r},${gg},${bl})`;}
  function brightness(star){return star.lit?Math.max(0.25,star.lit/star.idea.stepKeys.length):0;}
  function draw(){
    if(!W||!H)return;
    const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,W,H);
    c.fillStyle='#06080f';c.fillRect(0,0,W,H);
    c.fillStyle='#ffffff';
    for(const s of bgStars){c.globalAlpha=s.a;c.beginPath();c.arc(s.x*W,s.y*H,s.r,0,7);c.fill();}
    c.globalAlpha=1;
    const currentDate=dayToDate(day);
    for(const zone of zones){const rg=c.createRadialGradient(zone.x,zone.y,0,zone.x,zone.y,0.14*S);rg.addColorStop(0,'rgba(255,255,255,0.035)');rg.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=rg;c.beginPath();c.arc(zone.x,zone.y,0.14*S,0,7);c.fill();
      c.textAlign='center';c.fillStyle='rgba(231,233,230,0.7)';c.font='15px "Noto Serif SC",serif';c.fillText(zone.theme.label,zone.x,zone.y-0.14*S-26);c.fillStyle='rgba(231,233,230,0.4)';c.font='10px "Geist Mono",monospace';c.fillText(zone.theme.en,zone.x,zone.y-0.14*S-10);}
    if(bridges){c.strokeStyle='rgba(240,230,210,0.16)';c.lineWidth=1;for(const [a,b] of bridgePairs){const star=starOf.get(a),other=starOf.get(b);if(!other||!star||other.lit===0||star.lit===0)continue;const mx=(star.x+other.x)/2,my=(star.y+other.y)/2;const cx=lerp(mx,W/2,0.15),cy=lerp(my,H/2,0.15);c.beginPath();c.moveTo(star.x,star.y);c.quadraticCurveTo(cx,cy,other.x,other.y);c.stroke();}}
    if(stars){c.save();c.strokeStyle='rgba(224,180,92,0.55)';c.setLineDash([3,4]);c.lineWidth=1;
      for(const pattern of model.patterns){const pts=[...new Set(model.lessons.filter(l=>l.patternIds.includes(pattern.id)).map(l=>starOf.get(l.ideaId)).filter(s=>s&&s.lit))];if(!pts.length)continue;let cx=0,cy=0;for(const p of pts){cx+=p.x;cy+=p.y;}cx/=pts.length;cy/=pts.length;
        const ordered=[...pts].sort((a,b)=>Math.atan2(a.y-cy,a.x-cx)-Math.atan2(b.y-cy,b.x-cx));c.beginPath();if(pts.length===1){c.arc(pts[0].x,pts[0].y,6,0,7);}else{ordered.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));if(pts.length>2)c.closePath();}c.stroke();
        c.fillStyle='rgba(224,180,92,0.8)';c.font='13px "Noto Serif SC",serif';c.textAlign='center';c.fillText(pattern.name,cx,cy+4);}
      c.restore();}
    const now=performance.now();
    for(const star of starOf.values()){if(!star.lit)continue;const b=brightness(star);const age=star.lastLit!==null?Math.round((currentDate-Date.parse(star.lastLit))/DAILY):0;const col=starColor(age);
      c.globalAlpha=0.9*b;c.drawImage(glow,star.x-star.radius*6,star.y-star.radius*6,star.radius*12,star.radius*12);c.globalAlpha=1;c.fillStyle=col;c.beginPath();c.arc(star.x,star.y,star.radius,0,7);c.fill();}
    for(const f of flashes){const t=clamp((now-f.at)/300,0,1);if(t>=1)continue;c.globalAlpha=(1-t)*0.6;c.strokeStyle=colOf(f);c.lineWidth=1;c.beginPath();c.arc(f.x,f.y,f.r*(1+2*t),0,7);c.stroke();c.globalAlpha=1;}
    for(const l of labels){const t=clamp((now-l.at)/2000,0,1);if(t>=1)continue;c.globalAlpha=t<0.85?1:1-(t-0.85)/0.15;c.fillStyle='#e7e9e6';c.font='13px "Noto Serif SC",serif';c.textAlign='center';c.fillText(l.text,l.x,l.y-14);c.globalAlpha=1;}
    labels=labels.filter(l=>performance.now()-l.at<2000);flashes=flashes.filter(f=>performance.now()-f.at<300);
    dateLabel.textContent=fmt(dayToDate(day));
    bar.value=day;
    playBtn.textContent=playing?'暂停':day>=totalDays&&wasPlayed?'重播':'播放';
  }
  let wasPlayed=false;
  const colOf=f=>f.color;
  function dayToDate(d){return new Date(Date.parse(start)+d*DAILY);}
  const fmt=d=>`${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
  let pendingEvents=[];
  function light(step,now){const star=starOf.get(step.ideaId);if(!star||litKeys.has(step.key))return;litKeys.add(step.key);star.lit+=1;star.lastLit=step.date;if(!ctx.prefs.reducedMotion){flashes.push({x:star.x,y:star.y,r:star.radius,color:starColor(0),at:now});labels.push({x:star.x,y:star.y,text:star.idea.title,at:now});if(labels.length>3)labels.shift();}}
  function enqueue(events,now){let previousDate=null,index=0;for(const step of events){index=step.date===previousDate?index+1:0;previousDate=step.date;pendingEvents.push({step,at:now+index*120});}}
  function play(){if(!steps.length)return;const replay=day>=totalDays;if(replay){seek(0);litKeys=new Set();for(const star of starOf.values()){star.lit=0;star.lastLit=null;}}else applyDay();playing=true;wasPlayed=true;lastT=performance.now();if(replay)enqueue(steps.filter(step=>step.date===start),lastT);loop();}
  let litKeys=new Set();
  function loop(){const now=performance.now();if(playing){const dt=(now-lastT)*(totalDays/fullDuration());lastT=now;const before=day;day=Math.min(totalDays,day+dt);
    enqueue(steps.filter(step=>{const sd=Math.round((Date.parse(step.date)-Date.parse(start))/DAILY);return sd>before&&sd<=day&&!litKeys.has(step.key);}),now);}
    const due=pendingEvents.filter(event=>event.at<=now);pendingEvents=pendingEvents.filter(event=>event.at>now);for(const event of due)light(event.step,now);
    if(day>=totalDays&&!pendingEvents.length)playing=false;draw();if(playing||pendingEvents.length||labels.length||flashes.length)raf=requestAnimationFrame(loop);}
  function toggle(){playing?stop():play();}
  function stop(){playing=false;cancelAnimationFrame(raf);pendingEvents=[];labels=[];flashes=[];applyDay();draw();}
  element.addEventListener('keydown',e=>{
    if(e.defaultPrevented)return;
    if(e.key===' '){
      if(e.target.closest('button,a,input,select,textarea,[contenteditable]:not([contenteditable="false"])'))return;
      e.preventDefault();toggle();return;
    }
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
    e.preventDefault();
    if(e.key==='ArrowRight')seek(Math.round(day)+7);
    else if(e.key==='ArrowLeft')seek(Math.round(day)-7);
    else seek(e.key==='Home'?0:totalDays);
  });
  function seek(target){playing=false;cancelAnimationFrame(raf);day=clamp(target,0,totalDays);pendingEvents=[];labels=[];flashes=[];lastT=performance.now();applyDay();draw();}
  function applyDay(){litKeys=new Set();for(const s of starOf.values()){s.lit=0;s.lastLit=null;}for(const step of steps){const sd=Math.round((Date.parse(step.date)-Date.parse(start))/DAILY);if(sd<=day){litKeys.add(step.key);const star=starOf.get(step.ideaId);if(star){star.lit+=1;star.lastLit=step.date;}}}}
  const tooltip=h('div',{class:'atlas-tooltip',role:'tooltip',hidden:true});element.append(tooltip);
  function hit(event){const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height||event.clientX<rect.left||event.clientX>=rect.right||event.clientY<rect.top||event.clientY>=rect.bottom)return null;const x=(event.clientX-rect.left)*W/rect.width,y=(event.clientY-rect.top)*H/rect.height;return [...starOf.values()].find(s=>s.lit&&Math.hypot(x-s.x,y-s.y)<=Math.max(8,s.radius+4))??null;}
  canvas.addEventListener('pointermove',e=>{hovered=hit(e);canvas.style.cursor=hovered?'pointer':'default';tooltip.hidden=!hovered;if(hovered){const rect=canvas.getBoundingClientRect(),parent=element.getBoundingClientRect();const x=(rect.left-parent.left+hovered.x*rect.width/W)*element.offsetWidth/parent.width,y=(rect.top-parent.top+hovered.y*rect.height/H)*element.offsetHeight/parent.height;tooltip.replaceChildren(h('p',{},hovered.idea.title),h('p',{},`${hovered.zone.theme.label} · ${hovered.idea.stepKeys.length} 步`));tooltip.style.left=`${clamp(x,12,Math.max(12,element.clientWidth-260))}px`;tooltip.style.top=`${y+16}px`;}draw();});
  canvas.addEventListener('pointerleave',()=>{hovered=null;tooltip.hidden=true;});
  canvas.addEventListener('click',event=>{const star=hit(event);if(star)ctx.navigate(`#/q/${encodeURIComponent(star.idea.id)}`);});
  const observer=new ResizeObserver(resize);observer.observe(element);
  resize();
  function update(nextRoute){if(nextRoute.page!=='atlas')return false;if(nextRoute.params.month){const [year,month]=nextRoute.params.month.split('-').map(Number);const target=Date.UTC(year,month,0);seek(Math.round((target-Date.parse(start))/DAILY));}return true;}
  if(route.params.month)update(route);
  else if(ctx.autoplayAtAtlas){ctx.autoplayAtAtlas=false;day=0;applyDay();draw();if(!ctx.prefs.reducedMotion)play();}
  else {applyDay();draw();}
  return {element,update,destroy(){observer.disconnect();cancelAnimationFrame(raf);playing=false;pendingEvents=[];labels=[];flashes=[];}};
}
export default renderAtlas;
