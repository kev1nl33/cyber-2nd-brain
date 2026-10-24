import { h } from '../ui/dom.js';
import { fnv1a, sharedSourceIdeas } from '../data/derive.js';

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
  const speedBtn=h('button',{class:'atlas-button',onclick:()=>{speed=speed===1?2:1;speedBtn.textContent=`${speed}×`;if(playing)stop();}},'1×');
  const starBtn=h('button',{class:'atlas-button','aria-pressed':'false',onclick:()=>{stars=!stars;starBtn.setAttribute('aria-pressed',String(stars));draw();}},'星座');
  const bridgeBtn=h('button',{class:'atlas-button','aria-pressed':'true',onclick:()=>{bridges=!bridges;bridgeBtn.setAttribute('aria-pressed',String(bridges));draw();}},'光桥');
  const back=h('a',{class:'atlas-back',href:'#/'},'← 返回');
  const firstMonthLabel=start?start.slice(0,7):'', lastMonthLabel=end?end.slice(0,7):'';
  control.append(playBtn,h('span',{class:'atlas-bound'},firstMonthLabel),bar,h('span',{class:'atlas-bound'},lastMonthLabel),dateLabel,speedBtn,starBtn,bridgeBtn);
  bar.addEventListener('input',()=>{day=Number(bar.value);labels=[];flashes=[];draw();});
  element.append(back,control,h('h1',{class:'visually-hidden'},'回望'));
  const canvas=element.querySelector('canvas'), dpr=Math.min(2,devicePixelRatio||1);
  let W=0,H=0,S=0;
  function resize(){W=innerWidth;H=innerHeight;canvas.width=W*dpr;canvas.height=H*dpr;canvas.style.width=W+'px';canvas.style.height=H+'px';layout();applyDay();draw();}
  const themes=model.themes.slice(0,5);
  const zones=themes.map((t,i)=>{const angle=(-90+i*72)*Math.PI/180;return {theme:t,cx:Math.cos(angle),cy:Math.sin(angle)};});
  const ideas=model.ideas.filter(i=>i.stepKeys.length);
  const starOf=new Map();
  function layout(){S=Math.min(W,H);for(const zone of zones){zone.x=W/2+zone.cx*0.30*S;zone.y=H/2+zone.cy*0.30*S;}
    for(const zone of zones){const list=ideas.filter(i=>i.themeId===zone.theme.id).sort((a,b)=>a.updated<b.updated?-1:1);list.forEach((idea,k)=>{const theta=k*137.508*Math.PI/180,r=0.045*S*Math.sqrt(k+0.6);starOf.set(idea.id,{idea,zone,x:zone.x+r*Math.cos(theta),y:zone.y+r*Math.sin(theta),radius:2+1.1*idea.stepKeys.length,lit:0,lastLit:null});});}}
  const bgStars=[];const rng=mulberry32(fnv1a('bg'));for(let i=0;i<260;i++)bgStars.push({x:rng(),y:rng(),r:lerp(0.3,1.1,rng()),a:lerp(0.15,0.5,rng())});
  const glow=document.createElement('canvas');glow.width=glow.height=64;const g=glow.getContext('2d');const grad=g.createRadialGradient(32,32,0,32,32,32);grad.addColorStop(0,'rgba(255,255,255,0.9)');grad.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=grad;g.fillRect(0,0,64,64);
  function starColor(days){if(days<=0)return '#cfe3ff';if(days>=365)return '#f0b46a';if(days<=180)return mix('#cfe3ff','#f4ecd8',days/180);return mix('#f4ecd8','#f0b46a',(days-180)/185);}
  function mix(a,b,t){const pa=parseInt(a.slice(1),16),pb=parseInt(b.slice(1),16);const r=Math.round(lerp(pa>>16,pb>>16,t)),gg=Math.round(lerp(pa>>8&255,pb>>8&255,t)),bl=Math.round(lerp(pa&255,pb&255,t));return `rgb(${r},${gg},${bl})`;}
  function brightness(star){return star.lit?Math.max(0.25,star.lit/star.idea.stepKeys.length):0;}
  function draw(){
    const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,W,H);
    c.fillStyle='#06080f';c.fillRect(0,0,W,H);
    c.fillStyle='#ffffff';
    for(const s of bgStars){c.globalAlpha=s.a;c.beginPath();c.arc(s.x*W,s.y*H,s.r,0,7);c.fill();}
    c.globalAlpha=1;
    const currentDate=dayToDate(day);
    for(const zone of zones){const rg=c.createRadialGradient(zone.x,zone.y,0,zone.x,zone.y,0.14*S);rg.addColorStop(0,'rgba(255,255,255,0.035)');rg.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=rg;c.beginPath();c.arc(zone.x,zone.y,0.14*S,0,7);c.fill();
      c.textAlign='center';c.fillStyle='rgba(231,233,230,0.7)';c.font='15px "Noto Serif SC",serif';c.fillText(zone.theme.label,zone.x,zone.y-0.14*S-26);c.fillStyle='rgba(231,233,230,0.4)';c.font='10px "Geist Mono",monospace';c.fillText(zone.theme.en,zone.x,zone.y-0.14*S-10);}
    if(bridges){c.strokeStyle='rgba(240,230,210,0.16)';c.lineWidth=1;for(const star of starOf.values()){for(const {idea}of sharedSourceIdeas(model,star.idea.id)){const other=starOf.get(idea.id);if(!other||other.lit===0||star.lit===0)continue;const mx=(star.x+other.x)/2,my=(star.y+other.y)/2;const cx=lerp(mx,W/2,0.15),cy=lerp(my,H/2,0.15);c.beginPath();c.moveTo(star.x,star.y);c.quadraticCurveTo(cx,cy,other.x,other.y);c.stroke();}}}
    if(stars){c.save();c.strokeStyle='rgba(224,180,92,0.55)';c.setLineDash([3,4]);c.lineWidth=1;
      for(const pattern of model.patterns){const pts=[...new Set(model.lessons.filter(l=>l.patternIds.includes(pattern.id)).map(l=>starOf.get(l.ideaId)).filter(s=>s&&s.lit))];if(!pts.length)continue;let cx=0,cy=0;for(const p of pts){cx+=p.x;cy+=p.y;}cx/=pts.length;cy/=pts.length;
        const ordered=[...pts].sort((a,b)=>Math.atan2(a.y-cy,a.x-cx)-Math.atan2(b.y-cy,b.x-cx));c.beginPath();if(pts.length===1){c.arc(pts[0].x,pts[0].y,6,0,7);}else{ordered.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));if(pts.length>2)c.closePath();c.stroke();}
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
  function play(){if(!steps.length)return;playing=true;wasPlayed=true;lastT=performance.now();day=day>=totalDays?0:day;litKeys=new Set();for(const s of starOf.values()){s.lit=0;s.lastLit=null;}loop();}
  let litKeys=new Set();
  function loop(){if(!playing)return;const now=performance.now();const dt=(now-lastT)*(totalDays/fullDuration());lastT=now;const before=day;day=Math.min(totalDays,day+dt);
    for(const step of steps){const sd=Math.round((Date.parse(step.date)-Date.parse(start))/DAILY);if(sd>before&&sd<=day&&!litKeys.has(step.key)){litKeys.add(step.key);const star=starOf.get(step.ideaId);if(star){if(star.lit===0){flashes.push({x:star.x,y:star.y,r:star.radius,color:starColor(0),at:now});if(ctx.prefs.motion!=='off')labels.push({x:star.x,y:star.y,text:star.idea.title,at:now});if(labels.length>3)labels.shift();}star.lit+=1;star.lastLit=step.date;}}}
    draw();if(day>=totalDays){playing=false;draw();return;}raf=requestAnimationFrame(loop);}
  function toggle(){playing?stop():play();}
  function stop(){playing=false;cancelAnimationFrame(raf);draw();}
  playBtn.addEventListener('click',toggle);
  element.addEventListener('keydown',e=>{if(e.key===' '){e.preventDefault();toggle();}if(e.key==='ArrowRight'){day=Math.min(totalDays,Math.round(day)+7);sync();}if(e.key==='ArrowLeft'){day=Math.max(0,Math.round(day)-7);sync();}if(e.key==='Home'){day=0;sync();}if(e.key==='End'){day=totalDays;sync();}});
  function sync(){stop();applyDay();draw();}
  function applyDay(){litKeys=new Set();for(const s of starOf.values()){s.lit=0;s.lastLit=null;}for(const step of steps){const sd=Math.round((Date.parse(step.date)-Date.parse(start))/DAILY);if(sd<=day){litKeys.add(step.key);const star=starOf.get(step.ideaId);if(star){star.lit+=1;star.lastLit=step.date;}}}}
  canvas.addEventListener('pointermove',e=>{hovered=[...starOf.values()].find(s=>s.lit&&Math.hypot(e.clientX-s.x,e.clientY-s.y)<=Math.max(8,s.radius+4))??null;canvas.style.cursor=hovered?'pointer':'default';draw();});
  canvas.addEventListener('click',()=>{if(hovered)ctx.navigate(`#/q/${encodeURIComponent(hovered.idea.id)}`);});
  new ResizeObserver(resize).observe(element);
  resize();
  if(route.params.month){const target=`${route.params.month}-28`;day=clamp(Math.round((Date.parse(target)-Date.parse(start))/DAILY),0,totalDays);applyDay();draw();}
  else if(ctx.autoplayAtAtlas){ctx.autoplayAtAtlas=false;day=0;applyDay();draw();if(ctx.prefs.motion!=='off')play();}
  else {applyDay();draw();}
  return {element,destroy(){cancelAnimationFrame(raf);playing=false;}};
}
export default renderAtlas;
