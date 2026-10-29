(function (g) {
  'use strict';
  const R = 6378137;
  const categories = ['Food & dining','Cafes & bakeries','Bars & nightlife','Daily retail','Specialty retail','Personal & local services','Fitness & recreation'];
  const colors = ['#F06545','#FA8755','#91A8AF','#9FAB8F','#B0AF96','#A0AAAA','#D4C3AF'];
  function project(lon, lat) { return [R*lon*Math.PI/180, R*Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))]; }
  function unproject(x,y) { return [x/R*180/Math.PI,(2*Math.atan(Math.exp(y/R))-Math.PI/2)*180/Math.PI]; }
  function isOpen(p, day, minute) { const t=day*1440+minute;return p.intervals.some(([s,e])=>[-10080,0,10080].some(shift=>s<=t+shift&&t+shift<e)); }
  function distance(a,b) { const r=Math.PI/180,dy=(b.lat-a.lat)*r,dx=(b.lon-a.lon)*r;const q=Math.sin(dy/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dx/2)**2;return 6371008.8*2*Math.atan2(Math.sqrt(q),Math.sqrt(1-q)); }
  function nearestPole(p,poles) { return poles.reduce((best,q)=>{const meters=distance(p,q);return meters<best.meters?{pole:q,meters}:best;},{pole:null,meters:Infinity}); }
  function inRing(point,ring) { let result=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const[a,b]=ring[i],[c,d]=ring[j];if((b>point[1])!==(d>point[1])&&point[0]<(c-a)*(point[1]-b)/(d-b)+a)result=!result;}return result; }
  function csv(rows) { return rows.map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n'); }
  function nightAmount(minute) {
    const m=((minute%1440)+1440)%1440;
    const smooth=x=>x*x*(3-2*x);
    if(m<300||m>=1320)return 1;
    if(m<480)return 1-smooth((m-300)/180);
    if(m<1020)return 0;
    return smooth((m-1020)/300);
  }
  function mixColor(day,night,amount) {
    const a=Math.max(0,Math.min(1,amount));
    return '#'+[1,3,5].map(i=>Math.round(parseInt(day.slice(i,i+2),16)*(1-a)+parseInt(night.slice(i,i+2),16)*a).toString(16).padStart(2,'0')).join('');
  }
  g.AtlasCore={project,unproject,isOpen,distance,nearestPole,inRing,csv,categories,colors,nightAmount,mixColor};
})(globalThis);
