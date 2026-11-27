'use strict';
(() => {
  const sizes=[4,5,6,8,10,12];
  const boards={
    'F405 V4': [30.5,30.5,4],
    'F405 Mini': [20,20,3.5],
    'F745 AIO': [25.5,25.5,3]
  };
  const poly=(p,vectorGroup)=>({type:'poly',p,closed:true,vectorGroup});
  const rect=(x,y,w,h,group)=>poly([[x,y],[x+w,y],[x+w,y+h],[x,y+h]],group);
  const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  const area=p=>Math.abs(p.reduce((sum,[x,y],i)=>{
    const [u,v]=p[(i+1)%p.length];return sum+x*v-y*u;
  },0))/2;
  const finite=(...values)=>values.every(Number.isFinite);
  const positive=(...values)=>finite(...values)&&values.every(x=>x>0);
  function fits(outline,hole) {
    const [x,y]=hole.c;
    let inside=false;
    for(let i=0;i<outline.length;i++) {
      const [a,b]=outline[i], [c,d]=outline[(i+1)%outline.length];
      if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a) inside=!inside;
      const u=Math.max(0,Math.min(1,((x-a)*(c-a)+(y-b)*(d-b))/((c-a)**2+(d-b)**2)));
      if(Math.hypot(x-a-(c-a)*u,y-b-(d-b)*u)<hole.r+.5) return false;
    }
    return inside;
  }
  function defaults(prop,count) {
    const d=prop*25.4;
    const gap=Math.ceil(d*.08);
    const core=Math.max(45,Math.ceil(d*.3));
    const motorPitch=prop===4?12:prop<=6?16:19;
    const hub=Math.ceil(Math.max((d+gap)/(2*Math.sin(Math.PI/count)),core+d/2+gap)*1.05);
    return {hub,core,gap,arm:Math.max(23,motorPitch+9),motorX:motorPitch,motorY:motorPitch,
      motorHole:prop===4?2.2:3.2,bottom:prop<=5?3:prop<=8?4:5,top:prop<=6?2:2.5};
  }
  function build(c,mounts=[]) {
    const {count,prop,hub,core,gap,arm,motorX,motorY,motorHole,screws,
      fcX,fcY,fcHole,bottom,top,spacer,spacerHole,density}=c;
    if(![4,6,8].includes(count)||!sizes.includes(prop)||![2,4].includes(screws)||
      !positive(hub,core,arm,motorX,motorHole,fcX,fcY,fcHole,bottom,top,spacer,spacerHole,density)||
      (screws===4&&!positive(motorY))||!finite(gap)||gap<0) throw Error('badValues');
    const propRadius=prop*25.4/2;
    const step=Math.PI*2/count;
    const clearance=2*hub*Math.sin(step/2)-2*propRadius;
    if(clearance+1e-8<gap||hub-propRadius<core+gap) throw Error('propConflict');
    const half=arm/2;
    if(half>=core*Math.tan(step/2)||half<Math.max(motorX/2+(motorHole/2)+.5,screws===4?motorY/2+motorHole/2+.5:0)) throw Error('armConflict');
    const nose=hub+Math.max(half,motorX/2+motorHole/2+2);
    const outline=[], motors=[], motorHoles=[];
    for(let i=0;i<count;i++) {
      const angle=step*(i+.5)+Math.PI/2;
      const x=Math.cos(angle),y=Math.sin(angle);
      const at=(r,s)=>[r*x-s*y,r*y+s*x];
      motors.push(at(hub,0));
      outline.push(at(core,-half),at(nose,-half),at(nose,half),at(core,half));
      const positions=screws===2?[[-motorX/2,0],[motorX/2,0]]:
        [-motorX/2,motorX/2].flatMap(u=>[-motorY/2,motorY/2].map(v=>[u,v]));
      for(const [u,v] of positions) motorHoles.push({c:at(hub+u,v),r:motorHole/2});
    }
    const plateHalf=core*.68;
    const topOutline=[[-plateHalf*.74,-plateHalf],[plateHalf*.74,-plateHalf],[plateHalf,-plateHalf*.74],
      [plateHalf,plateHalf*.74],[plateHalf*.74,plateHalf],[-plateHalf*.74,plateHalf],
      [-plateHalf,plateHalf*.74],[-plateHalf,-plateHalf*.74]];
    const drill=(x,y,dx,dy,d)=>[-dx/2,dx/2].flatMap(u=>
      (dy===0?[0]:[-dy/2,dy/2]).map(v=>({c:[x+u,y+v],r:d/2})));
    const spacerPitch=plateHalf*1.24;
    const spacerHoles=drill(0,0,spacerPitch,spacerPitch,spacerHole);
    const bottomHoles=[...motorHoles,...spacerHoles,...drill(0,0,fcX,fcY,fcHole)];
    for(const {enabled,x,y,dx,dy,hole,panel} of mounts) {
      if(!enabled) continue;
      if(!finite(x,y,dy)||dy<0||!positive(dx,hole)||!['top','bottom'].includes(panel)) throw Error('badValues');
      if(panel==='bottom') bottomHoles.push(...drill(x,y,dx,dy,hole));
    }
    const topHoles=[...spacerHoles,...mounts.filter(m=>m.enabled&&m.panel==='top')
      .flatMap(m=>drill(m.x,m.y,m.dx,m.dy,m.hole))];
    function plate(outline,holes,group) {
      holes.forEach((hole,i)=>{
        if(!fits(outline,hole)||holes.slice(0,i).some(other=>distance(hole.c,other.c)<hole.r+other.r+.25)) throw Error('holeConflict');
      });
      const net=area(outline)-holes.reduce((sum,hole)=>sum+Math.PI*hole.r**2,0);
      return {net,entities:[poly(outline,group),...holes.map(hole=>({...hole,type:'circle',vectorGroup:group}))]};
    }
    const base=plate(outline,bottomHoles,'frame'), lid=plate(topOutline,topHoles,'lid');
    const sideWidth=Math.max(...outline.map(p=>p[1]))-Math.min(...outline.map(p=>p[1]));
    const side=[rect(-sideWidth/2,0,sideWidth,bottom),rect(-plateHalf,bottom+spacer,plateHalf*2,top),
      ...[-spacerPitch/2,spacerPitch/2].map(y=>rect(y-spacerHole,bottom,spacerHole*2,spacer))];
    return {base,lid,side,motors,propRadius,clearance,net:base.net+lid.net,
      mass:(base.net*bottom+lid.net*top)*density/1000};
  }
  const model={sizes,boards,defaults,build};
  if(typeof module!=='undefined') module.exports=model;
  else globalThis.DroneFrameGeometry=model;
})();
