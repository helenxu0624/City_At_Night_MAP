/* Geographic reference is packaged locally. Tile imagery is an optional overlay. */
(function(){
 'use strict';
 const D=window.ATLAS_DATA,C=window.AtlasCore,$=id=>document.getElementById(id);
 const DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
 const SHORT=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
 const RATE={1:'#71868D',2:'#A4AD9C',3:'#DEC897',4:'#F5B76F',5:'#F68D4F'};
 const canvas=$('map'),ctx=canvas.getContext('2d'),hist=$('hist'),hc=hist.getContext('2d');
 const state={mode:'business',day:5,minute:1260,category:'all',rating:'all',onlyOpen:false,heat:false,
  crossLight:false,crossBusiness:false,compare:false,buildings:true,poles:true,bulb:'all',street:false,manualTheme:null};
 let W=innerWidth,H=innerHeight,dpr=1,view={x:0,y:0,scale:1},selected=null,hits=[],buildingHits=[],frame=0,playing=null,browseOpen=false,drag=null,toastTimer;
 const tileCache=new Map();let tileWarning=false;
 const records=new Map();
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const clock=m=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
 for(const p of D.places){p.kind='place';p.xy=C.project(p.lon,p.lat);p.near=C.nearestPole(p,D.poles);records.set(p.id,p);}
 for(const p of D.poles){p.kind='pole';p.xy=C.project(p.lon,p.lat);records.set(p.id,p);}
 for(const p of D.lightBuildings){p.kind='building';p.xy=C.project(p.lon,p.lat);p.rings=p.geometry.coordinates.map(r=>r.map(a=>C.project(...a)));records.set(p.id,p);}
 const roads=D.roads.map(r=>({...r,xy:r.coordinates.map(p=>C.project(...p))}));
 const footprints=D.footprints.map(poly=>poly.map(r=>r.map(p=>C.project(...p))));
 const boundary=D.boundary.features.flatMap(f=>f.geometry.type==='MultiPolygon'?f.geometry.coordinates:[f.geometry.coordinates]).map(poly=>poly[0].map(p=>C.project(...p)));
 const allBoundary=boundary.flat(),xs=allBoundary.map(p=>p[0]),ys=allBoundary.map(p=>p[1]);
 const bounds={minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)};
 const latitude=D.places.reduce((s,p)=>s+p.lat,0)/D.places.length;
 const groundFactor=Math.cos(latitude*Math.PI/180),sigma=90/groundFactor;
 const densityMax=Math.max(...D.places.map(p=>D.places.reduce((n,q)=>n+Math.exp(-((p.xy[0]-q.xy[0])**2+(p.xy[1]-q.xy[1])**2)/(2*sigma*sigma)),0)));
 const densityCanvas=document.createElement('canvas'),dc=densityCanvas.getContext('2d');
 const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
 let darkness=C.nightAmount(state.minute),targetDarkness=darkness,lastPaletteFrame=0;
 function themeAmount(){return state.manualTheme==='day'?0:state.manualTheme==='night'?1:state.mode==='light'?1:C.nightAmount(state.minute);}
 function modeTheme(){return themeAmount()>=.5?'night':'day';}
 function palette(day,night){return C.mixColor(day,night,darkness);}
 function applyPalette(){
  const style=document.documentElement.style;
  for(const [key,day,night] of [
   ['--bg','#F4F4EF','#111B22'],
   ['--line','#CFD4C8','#3A494E'],['--soft','#E7E9E1','#24333A']
  ])style.setProperty(key,palette(day,night));
  style.setProperty('--panel',palette('#F4F4EF','#17232B')+'EF');
  // Keep labels readable through the middle tones instead of fading text into its background.
  style.setProperty('--fg',darkness<.55?'#17211B':'#F7F8F3');
  style.setProperty('--muted',darkness<.55?'#3F4D40':'#D3DED6');
  document.documentElement.dataset.theme=darkness>=.5?'night':'day';
 }
 function advancePalette(timestamp){
  const delta=lastPaletteFrame?Math.min(64,Math.max(1,timestamp-lastPaletteFrame)):16;
  lastPaletteFrame=timestamp;
  darkness=reducedMotion.matches?targetDarkness:darkness+(targetDarkness-darkness)*(1-Math.exp(-delta/140));
  if(Math.abs(targetDarkness-darkness)<.001)darkness=targetDarkness;
  applyPalette();
  return darkness!==targetDarkness;
 }
 function visiblePlaces(){return D.places.filter(p=>(state.category==='all'||p.category===state.category)&&(!state.onlyOpen||C.isOpen(p,state.day,state.minute)));}
 function openPlaces(){return D.places.filter(p=>(state.category==='all'||p.category===state.category)&&C.isOpen(p,state.day,state.minute));}
 function eveningDay(){return state.minute<360?(state.day+6)%7:state.day;}
 function visibleBuildings(){return D.lightBuildings.filter(p=>state.rating==='all'||p.rating===Number(state.rating));}
 function visiblePoles(){return D.poles.filter(p=>state.bulb==='all'||p.bulb===state.bulb);}
 function color(p){return C.colors[C.categories.indexOf(p.category)]||'#A0AAAA';}
 function screen(p){return[(p[0]-view.x)*view.scale+W/2,H/2-(p[1]-view.y)*view.scale];}
 function world(x,y){return[view.x+(x-W/2)/view.scale,view.y-(y-H/2)/view.scale];}
 function fit(){
  const mobile=W<640,left=mobile?24:45,right=mobile?135:315,top=mobile?280:238,bottom=mobile?246:225;
  const width=Math.max(200,W-left-right),height=Math.max(120,H-top-bottom);
  view.scale=Math.min(width/(bounds.maxX-bounds.minX),height/(bounds.maxY-bounds.minY))*.94;
  const centerX=(left+W-right)/2,centerY=(top+H-bottom)/2;
  view.x=(bounds.minX+bounds.maxX)/2-(centerX-W/2)/view.scale;
  view.y=(bounds.minY+bounds.maxY)/2+(centerY-H/2)/view.scale;
  scheduleDraw();
 }
 function resize(){W=innerWidth;H=innerHeight;dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);fit();histogram();}
 function scheduleDraw(){if(!frame)frame=requestAnimationFrame(timestamp=>{
  frame=0;const transitioning=advancePalette(Number.isFinite(timestamp)?timestamp:Date.now());draw();
  if(transitioning){histogram();scheduleDraw();}else lastPaletteFrame=0;
 });}
 function paths(rings,fill,stroke,width=1){ctx.beginPath();for(const ring of rings){ring.forEach((p,i)=>{const[x,y]=screen(p);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();}if(fill){ctx.fillStyle=fill;ctx.fill('evenodd');}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}}
 function tiles(){
  const circumference=2*Math.PI*6378137,z=Math.max(10,Math.min(19,Math.round(Math.log2(view.scale*circumference/256)))),size=circumference/2**z;
  const [lx,ty]=world(0,0),[rx,by]=world(W,H),xmin=Math.floor((lx+circumference/2)/size),xmax=Math.floor((rx+circumference/2)/size),ymin=Math.floor((circumference/2-ty)/size),ymax=Math.floor((circumference/2-by)/size);
  for(let x=xmin;x<=xmax;x++)for(let y=ymin;y<=ymax;y++){
   if(y<0||y>=2**z)continue;const key=`${z}/${x}/${y}`;let tile=tileCache.get(key);
   if(!tile){tile=new Image();tile.crossOrigin='anonymous';tile.onload=scheduleDraw;tile.onerror=()=>{if(!tileWarning){tileWarning=true;notify('Street tiles could not load. The packaged OSM street reference remains available.');}};tile.src=`https://tile.openstreetmap.org/${key}.png`;tileCache.set(key,tile);}
   if(tile.complete&&tile.naturalWidth){const[sx,sy]=screen([x*size-circumference/2,circumference/2-y*size]);ctx.save();ctx.filter=`brightness(${1-.7*darkness}) saturate(${1-.65*darkness})`;ctx.drawImage(tile,sx,sy,size*view.scale+1,size*view.scale+1);ctx.restore();}
  }
 }
 function drawHeat(active){
  if(!active.length)return;
  const step=14,nx=Math.ceil(W/step),ny=Math.ceil(H/step);densityCanvas.width=nx;densityCanvas.height=ny;
  const img=dc.createImageData(nx,ny);
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
   const p=world((x+.5)*step,(y+.5)*step);if(!boundary.some(r=>C.inRing(p,r)))continue;
   let n=0;for(const q of active){const d=(p[0]-q.xy[0])**2+(p[1]-q.xy[1])**2;if(d<20*sigma*sigma)n+=Math.exp(-d/(2*sigma*sigma));}
   const a=Math.min(1,n/densityMax);if(a<.02)continue;const i=(y*nx+x)*4;img.data[i]=246;img.data[i+1]=Math.round(185-85*a);img.data[i+2]=Math.round(110-35*a);img.data[i+3]=Math.round(175*a**.65);
  }
  dc.putImageData(img,0,0);ctx.save();ctx.imageSmoothingEnabled=true;ctx.drawImage(densityCanvas,0,0,W,H);ctx.restore();
 }
 function drawLights(){
  if(state.mode==='business'||state.buildings)for(const p of visibleBuildings()){
   const fill=RATE[p.rating];ctx.save();ctx.globalAlpha=.62;paths(p.rings,fill,null);ctx.globalAlpha=.95;paths(p.rings,null,fill,1.2);ctx.restore();buildingHits.push(p);
   const[x,y]=screen(p.xy);if(view.scale>.4){ctx.fillStyle=palette('#263B3C','#FAF5E4');ctx.font='10px Calibri,Arial';ctx.textAlign='center';ctx.fillText(String(p.rating),x,y+3);}
  }
  if(state.mode==='business'||state.poles)for(const p of visiblePoles()){
   const[x,y]=screen(p.xy);if(x<0||x>W||y<0||y>H)continue;const fill=p.bulb==='LED'?'#F5CB82':'#AFBDB6';
   ctx.save();ctx.shadowColor=fill;ctx.shadowBlur=7;ctx.beginPath();ctx.arc(x,y,2.4,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();ctx.restore();hits.push({p,x,y,r:8});
  }
 }
 function drawBusiness(overlay=false){
  const active=openPlaces();if(state.heat&&!overlay)drawHeat(active);
  if(state.compare&&!overlay){for(const p of D.places){if(state.category!=='all'&&p.category!==state.category)continue;if(C.isOpen(p,eveningDay(),1080)&&!C.isOpen(p,state.day,state.minute)){const[x,y]=screen(p.xy);ctx.beginPath();ctx.arc(x,y,8,0,Math.PI*2);ctx.setLineDash([2,3]);ctx.strokeStyle='#F08F75';ctx.lineWidth=1.4;ctx.stroke();ctx.setLineDash([]);}}}
  for(const p of (overlay?active:visiblePlaces())){
   const[x,y]=screen(p.xy);if(x<0||x>W||y<0||y>H)continue;
   const open=C.isOpen(p,state.day,state.minute),fill=color(p);
   ctx.save();ctx.beginPath();ctx.arc(x,y,open?5.6:3.3,0,Math.PI*2);ctx.lineWidth=open?1.1:1;
   if(open){ctx.shadowBlur=5+9*darkness;ctx.shadowColor=fill;ctx.fillStyle=fill;ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle=palette('#FFFFFF','#EDEFE8');ctx.stroke();}
   else{ctx.strokeStyle=palette('#A7B2AC','#62767B');ctx.stroke();}
   ctx.restore();hits.push({p,x,y,r:10});
  }
 }
 function streetLabels(){
  const labels=new Map();for(const r of roads){if(!r.name)continue;const len=r.xy.reduce((n,p,i)=>i?n+Math.hypot(p[0]-r.xy[i-1][0],p[1]-r.xy[i-1][1]):n,0);if(!labels.has(r.name)||labels.get(r.name).len<len)labels.set(r.name,{r,len});}
  ctx.font='11px Calibri,Arial';ctx.textAlign='center';ctx.fillStyle=palette('#71817A','#9CAFAA');
  for(const {r,len} of labels.values()){
   if(len*view.scale<90)continue;const mid=r.xy[Math.floor(r.xy.length/2)],[x,y]=screen(mid);if(x<40||x>W-100||y<225||y>H-220)continue;
   const a=screen(r.xy[0]),b=screen(r.xy[r.xy.length-1]);let angle=Math.atan2(b[1]-a[1],b[0]-a[0]);if(angle>Math.PI/2||angle< -Math.PI/2)angle+=Math.PI;
   ctx.save();ctx.translate(x,y-6);ctx.rotate(angle);ctx.fillText(r.name.replace('North ','N ').replace(' Street',' St'),0,0);ctx.restore();
  }
 }
 function draw(){
  ctx.clearRect(0,0,W,H);ctx.fillStyle=palette('#F4F4EF','#111B22');ctx.fillRect(0,0,W,H);hits=[];buildingHits=[];
  if(state.street)tiles();
  ctx.save();ctx.globalAlpha=state.street ? .28 : 1;
  for(const b of footprints)paths(b,palette('#E5E8E0','#1E2C33'),null);
  ctx.beginPath();for(const r of roads){r.xy.forEach((p,i)=>{const[x,y]=screen(p);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});}ctx.strokeStyle=palette('#CCD4CA','#35484E');ctx.lineWidth=.85;ctx.stroke();ctx.restore();
  ctx.save();ctx.setLineDash([4,5]);paths(boundary,null,palette('#92A291','#6E8986'),1);ctx.restore();
  if(state.mode==='light'||state.crossLight)drawLights();
  if(state.mode==='business')drawBusiness();else if(state.crossBusiness)drawBusiness(true);
  if(!state.street)streetLabels();
  if(selected){const[x,y]=screen(selected.xy);ctx.beginPath();ctx.arc(x,y,12,0,Math.PI*2);ctx.strokeStyle=palette('#273C3D','#FFF8E8');ctx.lineWidth=1.8;ctx.stroke();}
  // A true ground-distance scale, corrected for Mercator latitude.
  const meters=200,width=meters/groundFactor*view.scale,x=25,y=H-(W<640?258:242);
  if(width>20&&width<W*.4){ctx.strokeStyle=palette('#718271','#9AAFA8');ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+width,y);ctx.stroke();ctx.font='10px Calibri,Arial';ctx.fillStyle=ctx.strokeStyle;ctx.textAlign='left';ctx.fillText('200 m',x,y-7);}
 }
 function row(label,n,total,fill){return `<div class="type-row"><span>${escape(label)}</span><span class="bar"><i style="width:${total?n/total*100:0}%;background:${fill}"></i></span><b>${n}</b></div>`;}
 function update(){
  const light=state.mode==='light';document.body.dataset.mode=state.mode;targetDarkness=themeAmount();
  $('businessTab').setAttribute('aria-selected',!light);$('lightTab').setAttribute('aria-selected',light);
  for(const id of ['businessDock','businessLayers'])$(id).hidden=light;
  for(const id of ['lightDock','lightLayers'])$(id).hidden=!light;
  $('clock').textContent=light?'Light & frontage':clock(state.minute);
  $('when').textContent=light?'Field observations · 21 buildings / 100 poles':`${DAYS[state.day]} · local time · scheduled availability`;
  $('count').innerHTML=light?`${state.buildings?visibleBuildings().length:0}<span>/21</span>`:`${openPlaces().length}<span>/${D.places.filter(p=>state.category==='all'||p.category===state.category).length}</span>`;
  $('countLabel').textContent=light?`rated buildings · ${state.poles?visiblePoles().length:0} mapped poles`:'places scheduled open';
  $('breakdownTitle').textContent=light?'Observed brightness ratings':'Open now, by type';
  $('rows').innerHTML=light?[1,2,3,4,5].map(r=>row(`${r}${r===1?' · dimmer':r===5?' · brighter':''}`,D.lightBuildings.filter(p=>p.rating===r).length,21,RATE[r])).join(''):C.categories.map((cat,i)=>row(cat.replace('Personal & local services','Personal / local'),D.places.filter(p=>p.category===cat&&C.isOpen(p,state.day,state.minute)).length,D.places.filter(p=>p.category===cat).length,C.colors[i])).join('');
  const before=D.places.filter(p=>(state.category==='all'||p.category===state.category)&&C.isOpen(p,eveningDay(),1080)),now=openPlaces();
  $('summaryNote').textContent=light?'1–5 ordinal ratings. No observation is rated 4. Pole records: 42 LED, 58 unspecified.':state.compare?`${before.length} open at ${SHORT[eveningDay()]} 18:00. Dashed coral rings show places open then and closed at ${SHORT[state.day]} ${clock(state.minute)}.`:state.heat?'Heat: open-place concentration, fixed 90 m kernel and shared scale.':'Filled points: scheduled open. Hollow points: scheduled closed. Bars show open / category total.';
  $('editOverlayTime').textContent=`Business overlay: ${DAYS[state.day]} ${clock(state.minute)} · change time in Business Activity`;
  $('street').setAttribute('aria-pressed',state.street);$('theme').setAttribute('aria-pressed',state.manualTheme!==null);$('theme').textContent=state.manualTheme==='day'?'Day view':state.manualTheme==='night'?'Night view':'Auto light';$('theme').title='Cycle automatic, day and night display. Automatic light is a visual time cue, not a lighting measurement.';
  for(const b of $('days').children)b.setAttribute('aria-pressed',Number(b.dataset.day)===state.day);
  for(const b of $('cats').children)b.setAttribute('aria-pressed',b.dataset.cat===state.category);
  for(const b of $('ratings').children)b.setAttribute('aria-pressed',b.dataset.rating===String(state.rating));
  $('time').value=state.minute;
  if(selected)showDetail(selected,false);
  if(browseOpen||$('search').value)search();
  histogram();scheduleDraw();
  window.__atlasState={...state,open:now.length,total:71,ratedBuildings:21,poles:100,nightAmount:targetDarkness};
 }
 function histogram(){
  const rect=hist.getBoundingClientRect();if(!rect.width)return;
  hist.width=Math.round(rect.width*dpr);hist.height=39*dpr;hc.setTransform(dpr,0,0,dpr,0,0);hc.clearRect(0,0,rect.width,39);
  const subset=D.places.filter(p=>state.category==='all'||p.category===state.category),counts=Array.from({length:96},(_,i)=>subset.filter(p=>C.isOpen(p,state.day,i*15)).length),max=Math.max(1,...counts),bw=rect.width/96;
  counts.forEach((n,i)=>{hc.fillStyle=i*15<=state.minute?'#F06545':palette('#AAB7A8','#59716F');const h=n/max*35;hc.fillRect(i*bw,39-h,Math.max(1,bw-.8),h);});
 }
 function detailPair(k,v){return `<dt>${escape(k)}</dt><dd>${escape(v??'Not recorded')}</dd>`;}
 function showDetail(p,reveal=true){
  selected=p;let body=`<p class="eyebrow">${p.kind==='place'?'BUSINESS ACTIVITY':p.kind==='building'?'FIELD OBSERVATION':'LIGHT INVENTORY'}</p><h2>${escape(p.name)}</h2>`;
  if(p.kind==='place'){
   const open=C.isOpen(p,state.day,state.minute);body+=`<p class="muted">${escape(p.category)}<br>${escape(p.address)}</p><p class="status">${open?'Scheduled open':'Scheduled closed'} · ${SHORT[state.day]} ${clock(state.minute)}</p>`;
   body+=`<dl>${detailPair('Nearest mapped pole',`${Math.round(p.near.meters)} m, straight line`)}${detailPair('Pole bulb record',p.near.pole?.bulb)}</dl><p class="hours">${escape(p.hours).replaceAll(';','\n')}</p><p class="small evidence-note">Pole distance does not establish light coverage. Opening hours do not measure footfall.</p>`;
  }else if(p.kind==='building'){
   body+=`<p class="status">Observed brightness: ${p.rating} / 5</p><dl>${detailPair('Recorded use',p.use)}${detailPair('Building ID',p.building_id)}${detailPair('Measurement','Ordinal field rating')}${detailPair('Survey date','Not supplied')}</dl><p class="small evidence-note">Higher ratings indicate brighter observations. No lux values or continuous nighttime measurements are available.</p>`;
  }else{
   body+=`<dl>${detailPair('Recorded bulb',p.bulb)}${detailPair('Owner',p.owner)}${detailPair('Fixture code',p.fixture_code)}${detailPair('Height (source units)',p.height_recorded??'Not recorded')}${detailPair('Inventory status',p.inventory_status)}${detailPair('Light-record date',p.record_date?.slice(0,10)||'Not recorded')}</dl><p class="small evidence-note">A fixture record is not confirmation that a light is operating. UNKNOWN describes missing bulb information.</p>`;
  }
  $('detailBody').innerHTML=body;if(reveal)$('detail').hidden=false;scheduleDraw();
 }
 function selectRecord(id){const p=records.get(id);if(!p)return;showDetail(p);$('results').hidden=true;browseOpen=false;const targetScreen=[W<640?W*.39:W*.48,H*.48];view.x=p.xy[0]-(targetScreen[0]-W/2)/view.scale;view.y=p.xy[1]+(targetScreen[1]-H/2)/view.scale;scheduleDraw();}
 function search(){
  const q=$('search').value.trim().toLowerCase();let list=state.mode==='business'?visiblePlaces():[...(state.buildings?visibleBuildings():[]),...(state.poles?visiblePoles():[])];
  if(q)list=list.filter(p=>`${p.name} ${p.address||''} ${p.category||''} ${p.use||''} ${p.id}`.toLowerCase().includes(q));
  $('results').hidden=!q&&!browseOpen;
  $('results').innerHTML=list.length?list.map(p=>`<button data-record="${escape(p.id)}">${escape(p.name)}<small>${escape(p.kind==='place'?p.category:p.kind==='building'?`Brightness ${p.rating} · ${p.use}`:p.bulb+' · '+p.owner)}</small></button>`).join(''):'<p class="small" style="padding:10px">No matching records in this view.</p>';
 }
 function stop(){if(playing){clearInterval(playing);playing=null;}$('play').textContent='▶';$('play').setAttribute('aria-label','Play through time');}
 function tab(mode){stop();state.mode=mode;selected=null;$('detail').hidden=true;$('search').value='';browseOpen=false;$('results').hidden=true;update();}
 function notify(s){$('toast').textContent=s;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,6500);}
 for(let i=0;i<7;i++){const b=document.createElement('button');b.textContent=SHORT[i];b.dataset.day=i;b.onclick=()=>{state.day=i;update();};$('days').appendChild(b);}
 for(const [i,cat] of ['all',...C.categories].entries()){const b=document.createElement('button');b.dataset.cat=cat;const labels={'Food & dining':'Food','Cafes & bakeries':'Cafes','Bars & nightlife':'Nightlife','Daily retail':'Daily retail','Specialty retail':'Specialty retail','Personal & local services':'Services','Fitness & recreation':'Fitness'};b.innerHTML=cat==='all'?'All types':`<i class="swatch" style="background:${C.colors[i-1]}"></i>${escape(labels[cat])}`;b.onclick=()=>{state.category=cat;update();};$('cats').appendChild(b);}
 for(const r of ['all',1,2,3,4,5]){const b=document.createElement('button');b.dataset.rating=r;b.innerHTML=r==='all'?'All ratings':`<i class="swatch" style="background:${RATE[r]}"></i>${r}${r===1?' · dimmer':r===5?' · brighter':r===4?' · no sample':''}`;b.onclick=()=>{state.rating=r;update();};$('ratings').appendChild(b);}
 $('businessTab').onclick=()=>tab('business');$('lightTab').onclick=()=>tab('light');$('editOverlayTime').onclick=()=>tab('business');
 for(const key of ['onlyOpen','heat','crossLight','crossBusiness','compare','buildings','poles'])$(key).onchange=e=>{state[key]=e.target.checked;update();};
 $('bulb').onchange=e=>{state.bulb=e.target.value;update();};$('time').oninput=e=>{state.minute=Number(e.target.value);update();};
 $('play').onclick=()=>{if(playing){stop();return;}if(matchMedia('(prefers-reduced-motion: reduce)').matches){notify('Playback advances in 15-minute steps. Press pause at any time.');}$('play').textContent='Ⅱ';$('play').setAttribute('aria-label','Pause time playback');playing=setInterval(()=>{state.minute+=15;if(state.minute>=1440){state.minute=0;state.day=(state.day+1)%7;}update();},450);};
 document.querySelectorAll('[data-moment]').forEach(b=>b.onclick=()=>{stop();const moments=[[5,1080],[5,1260],[6,0],[6,120]];[state.day,state.minute]=moments[Number(b.dataset.moment)];update();});
 $('street').onclick=()=>{state.street=!state.street;update();};$('theme').onclick=()=>{state.manualTheme=state.manualTheme===null?'day':state.manualTheme==='day'?'night':null;update();};$('reset').onclick=fit;
 function zoom(factor,x=W/2,y=H/2){const before=world(x,y);view.scale=Math.max(.13,Math.min(8,view.scale*factor));const after=world(x,y);view.x+=before[0]-after[0];view.y+=before[1]-after[1];scheduleDraw();}
 $('zoomIn').onclick=()=>zoom(1.4);$('zoomOut').onclick=()=>zoom(1/1.4);
 canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(Math.exp(-e.deltaY*.0015),e.clientX,e.clientY);},{passive:false});
 canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};canvas.setPointerCapture(e.pointerId);canvas.classList.add('dragging');});
 canvas.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>4)drag.moved=true;view.x-=dx/view.scale;view.y+=dy/view.scale;drag.x=e.clientX;drag.y=e.clientY;scheduleDraw();});
 canvas.addEventListener('pointerup',e=>{if(drag&&!drag.moved){const hit=[...hits].reverse().find(h=>Math.hypot(e.clientX-h.x,e.clientY-h.y)<h.r);if(hit)showDetail(hit.p);else{const p=world(e.clientX,e.clientY),building=buildingHits.find(b=>b.rings.some(r=>C.inRing(p,r)));if(building)showDetail(building);else{$('detail').hidden=true;selected=null;scheduleDraw();}}}drag=null;canvas.classList.remove('dragging');});
 canvas.addEventListener('pointercancel',()=>{drag=null;canvas.classList.remove('dragging');});
 canvas.addEventListener('keydown',e=>{const steps={ArrowLeft:[-60,0],ArrowRight:[60,0],ArrowUp:[0,60],ArrowDown:[0,-60]};if(steps[e.key]){e.preventDefault();view.x+=steps[e.key][0]/view.scale;view.y+=steps[e.key][1]/view.scale;scheduleDraw();}if(e.key==='+')zoom(1.4);if(e.key==='-')zoom(1/1.4);});
 $('closeDetail').onclick=()=>{$('detail').hidden=true;selected=null;scheduleDraw();};$('search').oninput=search;$('browse').onclick=()=>{browseOpen=!browseOpen;search();};
 $('results').onclick=e=>{const button=e.target.closest('button[data-record]');if(button)selectRecord(button.dataset.record);};
 $('methods').onclick=()=>{$('methodDialog').showModal();};$('closeMethods').onclick=()=>{$('methodDialog').close();};
 $('methodDialog').addEventListener('click',e=>{if(e.target===$('methodDialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
 $('export').onclick=()=>{
  let rows;if(state.mode==='business')rows=[['name','category','address','longitude','latitude','calendar_day','local_time','scheduled_open','nearest_mapped_pole_m'],...visiblePlaces().map(p=>[p.name,p.category,p.address,p.lon,p.lat,DAYS[state.day],clock(state.minute),C.isOpen(p,state.day,state.minute),Math.round(p.near.meters)])];
  else rows=[['kind','id','name','longitude','latitude','brightness_rating_1_5','recorded_use','recorded_bulb','owner'],...(state.buildings?visibleBuildings():[]).map(p=>['building',p.id,p.name,p.lon,p.lat,p.rating,p.use,'','']),...(state.poles?visiblePoles():[]).map(p=>['pole',p.id,p.name,p.lon,p.lat,'','',p.bulb,p.owner])];
  const url=URL.createObjectURL(new Blob(['\uFEFF'+C.csv(rows)],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`spring-garden-${state.mode}-${SHORT[state.day]}-${clock(state.minute).replace(':','')}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify(`Exported ${rows.length-1} filtered records.`);
 };
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('detail').hidden=true;$('results').hidden=true;selected=null;browseOpen=false;scheduleDraw();}});
 window.addEventListener('resize',resize);
 window.addEventListener('pagehide',stop);
 resize();update();
})();
