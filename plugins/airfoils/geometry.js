'use strict';
(() => {
  const CAD=typeof module==='undefined'?G:require('../../geometry.js');
  const {fitClosedCubics}=typeof module==='undefined'?Importing:require('../../importing.js');
  const profiles = ['2412','2415','0012','0015','0018','0006','0009','0010','0020','1408','1412','2408','2409','2410','2418','4412','4415','4409','6409','6412'];
  const presets = {
    trainer: {root:'2412',tip:'2412',span:1200,rootChord:240,tipChord:165,sweep:35,twist:-2,count:8},
    glider: {root:'4412',tip:'4409',span:1600,rootChord:210,tipChord:115,sweep:42,twist:-2,count:10},
    aerobatic: {root:'0015',tip:'0012',span:1100,rootChord:235,tipChord:155,sweep:32,twist:0,count:8}
  };

  function points(code) {
    if (!/^\d{4}$/.test(code) || Number(code.slice(2)) < 1 || Number(code.slice(2)) > 40 ||
        ((code[0] === '0') !== (code[1] === '0'))) throw new Error('badProfile');
    const m = Number(code[0])/100, p = Number(code[1])/10, t = Number(code.slice(2))/100;
    const upper = [], lower = [];
    for (let i=0;i<=96;i++) {
      const x = (1-Math.cos(Math.PI*i/96))/2;
      const k = x < p ? p : 1-p;
      const y = m ? m*(x < p ? 2*p*x-x*x : 1-2*p+2*p*x-x*x)/(k*k) : 0;
      const slope = m ? 2*m*(p-x)/(k*k) : 0;
      const angle = Math.atan(slope);
      // Closed trailing edge for a fabrication contour.
      const h = i===96 ? 0 : 5*t*(.2969*Math.sqrt(x)-.1260*x-.3516*x*x+.2843*x**3-.1036*x**4);
      upper.push([x-h*Math.sin(angle),y+h*Math.cos(angle)]);
      lower.push([x+h*Math.sin(angle),y-h*Math.cos(angle)]);
    }
    return upper.concat(lower.slice(1,-1).reverse());
  }

  const lerp = (a,b,t) => a+(b-a)*t;
  const poly = (p,closed,vectorGroup) => ({type:'poly',p,closed,vectorGroup});
  function contains(polyline, point, clearance=0) {
    const [x,y] = point;
    let inside = false;
    for(let i=0,j=polyline.length-1;i<polyline.length;j=i++) {
      const [ax,ay]=polyline[j], [bx,by]=polyline[i];
      if ((ay>y)!==(by>y) && x<(bx-ax)*(y-ay)/(by-ay)+ax) inside=!inside;
      if (clearance>0) {
        const dx=bx-ax, dy=by-ay;
        const u=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy || 1)));
        if (Math.hypot(x-ax-u*dx,y-ay-u*dy)<clearance) return false;
      }
    }
    return inside;
  }

  // Intersect the chord-normal hinge with the fitted cubic skin of the rib.
  function ribHinge(path, datum, chord) {
    const samples=[];
    const along=p=>CAD.dot(CAD.sub(p,datum),chord);
    for(const {p} of path.segments) {
      const at=t=>{
        const u=1-t;
        return [0,1].map(i=>u**3*p[0][i]+3*u*u*t*p[1][i]+3*u*t*t*p[2][i]+t**3*p[3][i]);
      };
      let low=0,left=along(p[0]);
      for(let n=1;n<=16;n++) {
        const high=n/16,right=along(at(high));
        if(left<=0&&right>0||left>0&&right<=0) {
          let a=low,b=high;
          for(let step=0;step<24;step++) {
            const mid=(a+b)/2;
            if((along(at(mid))>0)===(left>0)) a=mid;else b=mid;
          }
          samples.push(at((a+b)/2));
        }
        low=high;left=right;
      }
    }
    if(samples.length<2) throw new Error('badValues');
    samples.sort((a,b)=>CAD.cross(chord,CAD.sub(a,b)));
    return [samples[0],samples.at(-1)];
  }

  function build(config, spars) {
    const {root,tip,span,rootChord,tipChord,sweep,twist,count,gap,clearance,mode}=config;
    const single = mode==='single';
    if (![rootChord,gap,clearance].every(Number.isFinite) || rootChord<=0 || gap<0 || clearance<0 ||
        (!single && (![span,tipChord,sweep,twist,count].every(Number.isFinite) ||
        span<=0 || tipChord<=0 || !Number.isInteger(count) || count<2 || count>100))) throw new Error('badValues');
    const control=single?null:config.control;
    if(control&&(![control.start,control.end,control.hinge].every(Number.isFinite)||
      control.start<0||control.end>100||control.start>=control.end||control.hinge<50||control.hinge>95)) {
      throw new Error('badValues');
    }
    const a=points(root), b=single?a:points(tip);
    const ribs=[], plan=[], invalid=[], rootHoles=[];
    const slots=spars.map((spar,index)=>({...spar,index:index+1})).filter(spar=>spar.shape!=='off');
    if (slots.some(({shape,width,height,start,end,offset})=>
      ![width,start,offset].every(Number.isFinite) || width<=0 || start<0 || start>100 ||
      (!single && (!Number.isFinite(end) || end<0 || end>100)) ||
      (shape==='rectangle' && (!Number.isFinite(height) || height<=0)))) throw new Error('badValues');

    function station(t,x,y) {
      const chord=single?rootChord:lerp(rootChord,tipChord,t);
      const angle=single?0:twist*t*Math.PI/180;
      const u=(x-.25)*chord, v=y*chord;
      return [(single?0:sweep*t)+chord*.25+u*Math.cos(angle)-v*Math.sin(angle),
        u*Math.sin(angle)+v*Math.cos(angle)];
    }



    let bottom;
    const guides=slots.map(spar=>[station(0,spar.start/100,spar.offset/rootChord),
      single?null:station(1,spar.end/100,spar.offset/tipChord)]);
    for (let i=0;i<(single?1:count);i++) {
      const t=single?0:i/(count-1);
      const outline=a.map(([x,y],j)=>station(t,lerp(x,b[j][0],t),lerp(y,b[j][1],t)));
      const top=Math.max(...outline.map(p=>p[1])), base=Math.min(...outline.map(p=>p[1]));
      const row=i===0?0:top-bottom+gap;
      bottom=base-row;
      const shift=station(t,0,0)[0];
      const group='rib-'+(i+1);
      const shifted=([x,y])=>[x-shift,y-row];
      const tolerance=Math.min(.04,(single?rootChord:lerp(rootChord,tipChord,t))/3000);
      const rib={...fitClosedCubics(outline.map(shifted),96,tolerance),vectorGroup:group};
      ribs.push(rib);
      slots.forEach((spar,j)=>{
        const [p,q]=guides[j];
        const c=single?p:p.map((value,k)=>lerp(value,q[k],t));
        const w=spar.width/2+clearance;
        const h=spar.height/2+clearance;
        let hole;
        if(spar.shape==='round') {
          if(!contains(outline,c,w)) invalid.push([i+1,spar.index]);
          hole={type:'circle',c:shifted(c),r:w,vectorGroup:group};
        } else {
          const corners=[[-w,-h],[w,-h],[w,h],[-w,h]].map(([x,y])=>[c[0]+x,c[1]+y]);
          if(!corners.every(point=>contains(outline,point))) invalid.push([i+1,spar.index]);
          hole=poly(corners.map(shifted),true,group);
        }
        ribs.push(hole);
        if(i===0) rootHoles.push(hole);
      });
      if(control&&t*100>=control.start-1e-9&&t*100<=control.end+1e-9) {
        const datum=shifted(station(t,control.hinge/100,0));
        const chord=CAD.sub(station(t,1,0),station(t,0,0));
        ribs.push({type:'line',p:ribHinge(rib,datum,chord),vectorGroup:group});
      }
      if(!single) plan.push(poly([[station(t,0,0)[0],t*span/2],[station(t,1,0)[0],t*span/2]],false,'wing'));
    }
    if(!single) {
      const first=plan[0].p, last=plan.at(-1).p;
      plan.push(poly([first[0],last[0]],false,'wing'),poly([first[1],last[1]],false,'wing'));
      guides.forEach(([p,q])=>plan.push(poly([[p[0],0],[q[0],span/2]],false,'wing')));
      if(control) {
        const from=control.start/100,to=control.end/100;
        const stations=[from,...Array.from({length:count},(_,i)=>i/(count-1)).filter(t=>t>from&&t<to),to];
        const edge=(t,x)=>[station(t,x,0)[0],t*span/2];
        plan.push(poly([...stations.map(t=>edge(t,control.hinge/100)),
          ...stations.slice().reverse().map(t=>edge(t,1))],true,'wing'));
      }
    }
    return {ribs,plan,invalid,rootHoles,first:ribs.filter(entity=>entity.vectorGroup==="rib-1")};
  }
  const aircraft = {
    trainer:{tailSpan:34,tailChord:55,tailTaper:.78,tailCode:'0009',body:[.78,.12,.15]},
    glider:{tailSpan:29,tailChord:49,tailTaper:.65,tailCode:'0006',body:[.84,.071,.095]},
    aerobatic:{tailSpan:40,tailChord:63,tailTaper:.76,tailCode:'0010',body:[.85,.14,.18]}
  };

  function accessories(config, {preset,tail,tailSpan,tailChord,tailRibs=5,tailHinge=72,body,tailSpars=[],wingHoles=[]}) {
    if(body==='off'&&tail==='off') return {tail:[],body:[],labels:[],fuselageLength:0,fuselageWidth:0};
    if(!Number.isFinite(config.span)||config.span<=0) throw new Error('badValues');
    const model=aircraft[preset]??aircraft.trainer;
    const gap=Math.max(14,config.gap);
    const x=0;
    const span=config.span;
    let [length,width,height]=model.body.map(ratio=>span*ratio);
    const sleek=body==='streamlined';
    if(sleek) {length*=1.1;width*=.76;height*=.78;}
    const y=0;
    let tailEntities=[], tailHoles=[], invalid=[];
    const tailLength=config.rootChord*(tail==='off'?model.tailChord:tailChord)/100;
    if(tail!=='off') {
      if(![tailSpan,tailChord].every(Number.isFinite)||tailSpan<=0||tailChord<=0||
          tailSpan>=100||tailChord>=100) throw new Error('badValues');
      const tipChord=tailLength*model.tailTaper, sweep=tailLength*(1-model.tailTaper)*.7;
      const tailModel=build({...config,mode:'batch',span:span*tailSpan/100,root:model.tailCode,tip:model.tailCode,
        rootChord:tailLength,tipChord,sweep,twist:0,count:tailRibs,gap,control:{start:0,end:100,hinge:tailHinge}},tailSpars);
      const bottom=Math.min(...tailModel.ribs.flatMap(CAD.boundsPoints).map(p=>p[1]));
      const semiSpan=span*tailSpan/200;
      const plan=tailModel.plan.map(entity=>CAD.transform(entity,([u,v])=>[u,v+bottom-semiSpan-gap]));
      tailEntities=[...tailModel.ribs,...plan].map(entity=>({...entity,vectorGroup:'tail-'+entity.vectorGroup}));
      tailHoles=tailModel.rootHoles;
      invalid=tailModel.invalid;
    }
    const bodyEntities=[], labels=[];
    if(body!=='off') {
      // The same longitudinal stations define both silhouettes.
      const nose=sleek?.16:.12, shoulder=sleek?.34:.29, taper=sleek?.61:.53, end=sleek?.05:.095;
      const cubic=p=>({type:'bezier',p});
      function split([a,b,c,d],t) {
        const mix=(p,q)=>p.map((v,i)=>lerp(v,q[i],t));
        const ab=mix(a,b),bc=mix(b,c),cd=mix(c,d);
        const u=mix(ab,bc),v=mix(bc,cd),m=mix(u,v);
        return [[a,ab,u,m],[m,v,cd,d]];
      }
      let rudder, rudderHinge, rearSeam;
      function outline(center,upper,lower,group) {
        const curves=[
          [[0,0],[0,.53],[nose*.45,1],[shoulder,1]],
          [[shoulder,1],[taper,1],[.83,.19],[1,end]],
          [[1,-end],[.83,-.19],[taper,-1],[shoulder,-1]],
          [[shoulder,-1],[nose*.45,-1],[0,-.53],[0,0]],
        ].map(p=>({type:'bezier',p:p.map(([u,v])=>[x+u*length,center+v*(v<0?lower:upper)])}));
        const segments=[...curves.slice(0,2),{type:'line',p:[curves[1].p[3],curves[2].p[0]]},...curves.slice(2)];
        const hull={type:'path',segments,closed:true,vectorGroup:group};
        const bare=CAD.trace(hull,8);
        if(group==='body-side') {
          const [before,remaining]=split(curves[1].p,.43);
          const [base,after]=split(remaining,.94);
          const start=before[3], end=after[0];
          const tangentIn=CAD.sub(start,before[2]), tangentOut=CAD.sub(after[1],end);
          const cap=[length*(sleek?.865:.845),height*(sleek?1.03:1.22)];
          const [,rudderBase]=split(base,sleek?.76:.73);
          const pivot=rudderBase[0];
          const capHandle=length*.016;
          const fixed=cubic([start,CAD.add(start,CAD.mul(tangentIn,.14)),[cap[0]-capHandle,cap[1]],cap]);
          const aft=cubic([cap,[cap[0]+capHandle,cap[1]],[end[0]-length*.008,end[1]+height*.46],end]);
          const fillet=cubic([end,CAD.add(end,CAD.mul(tangentOut,.2)),after[2],after[3]]);
          // Short root blend rejoins the original skin in its own tangent direction.
          const nearEnd=split(aft.p,.89);
          const atBlend=nearEnd[0][3];
          const blend=cubic([atBlend,nearEnd[1][1],CAD.sub(end,CAD.mul(tangentOut,.12)),end]);
          const skin=cubic(nearEnd[0]);
          hull.segments.splice(1,1,cubic(before),fixed,skin,blend,fillet);
          const hinge={type:'line',p:[pivot,cap]};
          rudder={type:'path',segments:[skin,blend,cubic(rudderBase.slice().reverse()),hinge],
            closed:true,vectorGroup:'rudder'};
          rudderHinge={...hinge,vectorGroup:group};
          rearSeam={type:'line',p:[pivot,curves[1].p[3]],vectorGroup:group};
        }
        bodyEntities.push(hull);
        bodyEntities.push({...poly([[x,center],[x+length,center]],false,group),construction:'dashed'});
        return bare;
      }
      const side='body-side';
      const envelope=outline(y,height*.62,height*.38,side);
      bodyEntities.push(rudderHinge,rearSeam);
      const topY=y-height-gap;
      outline(topY,width/2,width/2,'body-top');
      const tailX=length*.94-tailLength;
      const elevator=points(model.tailCode).map(([u,v])=>[tailX+u*tailLength,v*tailLength]);
      const profile=fitClosedCubics(elevator,96,Math.min(.04,tailLength/3000));
      if(CAD.trace(profile,8).some(point=>!contains(envelope,point))) throw new Error('tailOutside');
      bodyEntities.push({...profile,vectorGroup:side});
      for(const [holes,dx] of [[wingHoles,length*.26],[tailHoles,tailX]]) {
        for(const entity of holes) {
          const marker=CAD.transform(entity,([u,v])=>[u+dx,v]);
          if(CAD.trace(marker,8).some(point=>!contains(envelope,point))) throw new Error('bodySparOutside');
          bodyEntities.push({...marker,vectorGroup:side});
        }
      }
      const frontY=topY-width/2-gap-height/2;
      const rudderTop=frontY-height/2-gap;
      const rudderView=CAD.transform(rudder,([u,v])=>[u-length*.43,v-height*(sleek?1.03:1.22)+rudderTop]);
      bodyEntities.push(rudderView);
      labels.push(['sideView',[x+length*.48,height*(sleek?1.12:1.35)]],
        ['topView',[x+length/2,topY+width/2]],['frontView',[x+length/2,frontY+height/2]],['rudder',[x+length/2,rudderTop]]);
      bodyEntities.push({type:'ellipse',c:[x+length/2,frontY],
        r:Math.max(width,height)/2,ry:Math.min(width,height)/2,a:width>=height?0:Math.PI/2,
        t:0,s:Math.PI*2,vectorGroup:'body-front'});
    }
    return {tail:tailEntities,body:bodyEntities,labels,invalid,
      fuselageLength:body==='off'?0:length,fuselageWidth:body==='off'?0:width};
  }

  function arrange(panels,gap) {
    let right=0;
    return panels.flatMap(entities=>{
      if(!entities.length) return [];
      let minX=Infinity,maxX=-Infinity,maxY=-Infinity;
      for(const entity of entities) for(const [x,y] of CAD.boundsPoints(entity)) {
        minX=Math.min(minX,x);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
      }
      const dx=right-minX;
      right+=maxX-minX+gap;
      return entities.map(entity=>CAD.transform(entity,([x,y])=>[x+dx,y-maxY]));
    });
  }

  const geometry={profiles,presets,points,build,aircraft,accessories,arrange};
  if(typeof module!=='undefined') module.exports=geometry;
  else globalThis.VelocivectorAirfoilGeometry=geometry;
})();
