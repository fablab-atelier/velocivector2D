'use strict';
const createG=()=>{
  const tau = 2 * Math.PI;
  const add = (a,b) => [a[0]+b[0], a[1]+b[1]];
  const sub = (a,b) => [a[0]-b[0], a[1]-b[1]];
  const mul = (a,k) => [a[0]*k,a[1]*k];
  const dot = (a,b) => a[0]*b[0]+a[1]*b[1];
  const cross = (a,b) => a[0]*b[1]-a[1]*b[0];
  const dist = (a,b) => Math.hypot(...sub(a,b));
  const angle = (a,b) => Math.atan2(b[1]-a[1],b[0]-a[0]);
  const mod = a => ((a % tau) + tau) % tau;
  const polar = (a,r,t) => add(a,[r*Math.cos(t),r*Math.sin(t)]);
  const mid = (a,b) => mul(add(a,b),0.5);
  const eps = 1e-9;
  const maxSplineRatio=5;

  function arc(a,b,c) {
    const u = sub(b,a), v = sub(c,a), d = 2*cross(u,v);
    if (Math.abs(d) <= eps*dist(a,b)*dist(a,c)) return null;
    const center = add(a,[(dot(u,u)*v[1]-dot(v,v)*u[1])/d,(u[0]*dot(v,v)-v[0]*dot(u,u))/d]);
    const start = angle(center,a), end = mod(angle(center,c)-start);
    return {type:'arc', c:center, r:dist(a,center), a:start, s:mod(angle(center,b)-start)<=end ? end : end-tau};
  }
  function arcMovedEnd(entity,index,target) {
    const ends=[polar(entity.c,entity.r,entity.a),polar(entity.c,entity.r,entity.a+entity.s)];
    ends[index]=target;
    const chord=sub(ends[1],ends[0]), length=Math.hypot(...chord);
    if(length<=eps) return null;
    const radius=Math.max(entity.r,length/2);
    const height=Math.sqrt(Math.max(0,radius*radius-length*length/4));
    const side=Math.sign(entity.s)*(Math.abs(entity.s)>Math.PI?-1:1);
    const center=add(mid(...ends),mul([-chord[1],chord[0]],side*height/length));
    return arcWithCenterEnd(entity,index,target,center,radius,ends);
  }
  function arcWithCenterEnd(entity,index,target,center=entity.c,radius=entity.r,
    ends=[polar(entity.c,entity.r,entity.a),polar(entity.c,entity.r,entity.a+entity.s)]) {
    const angles=ends.map((p,i)=>angle(center,i===index?target:p));
    const sign=Math.sign(entity.s), sweep=sign*mod(sign*(angles[1]-angles[0]));
    return Math.abs(sweep)>eps?{...entity,c:center,r:radius,a:angles[0],s:sweep}:null;
  }
  function tangentArc(previous,end) {
    const start=previous.type==='line'?previous.p[1]:polar(previous.c,previous.r,previous.a+previous.s);
    const heading=previous.type==='line'?angle(...previous.p):previous.a+previous.s+Math.sign(previous.s)*Math.PI/2;
    const delta=sub(end,start), length=Math.hypot(...delta), normal=[-Math.sin(heading),Math.cos(heading)];
    const rise=dot(delta,normal);
    if(length<=eps||Math.abs(rise)<=eps*length) return null;
    const offset=dot(delta,delta)/(2*rise), center=add(start,mul(normal,offset));
    const a=angle(center,start), sign=Math.sign(offset), s=sign*mod(sign*(angle(center,end)-a));
    const arc={type:'arc',c:center,r:Math.abs(offset),a,s};
    return Math.abs(s)>eps&&serial(arc)?arc:null;
  }
  function tangentLineEnd(arc,start,end) {
    const heading=arc.a+arc.s+Math.sign(arc.s)*Math.PI/2;
    const direction=polar([0,0],1,heading), delta=sub(end,start);
    const length=Math.hypot(...delta);
    const deviation=Math.atan2(Math.abs(cross(direction,delta)),dot(direction,delta));
    return length>eps&&deviation<Math.PI/60-Number.EPSILON*4?add(start,mul(direction,length)):null;
  }
  function collinearLineEnd(previous,start,end) {
    const axis=sub(previous.p[1],previous.p[0]), length=Math.hypot(...axis), delta=sub(end,start);
    if(length<=eps||Math.hypot(...delta)<=eps) return null;
    const direction=mul(axis,1/length);
    const deviation=Math.atan2(Math.abs(cross(direction,delta)),dot(direction,delta));
    return deviation<Math.PI/60-Number.EPSILON*4?add(start,mul(direction,Math.hypot(...delta))):null;
  }
  function arcProgress(center,start,end,previous) {
    const radius=dist(center,start);
    if(radius<=eps||dist(center,end)<=eps) return previous??null;
    const initial=angle(center,start), bearing=angle(center,end);
    const old=previous&&dist(center,previous.center)<=eps&&dist(start,previous.start)<=eps?previous:null;
    const delta=mod(bearing-(old?.bearing??initial)+Math.PI)-Math.PI;
    const sweep=((old?.sweep??0)+delta)%tau;
    return {center,start,bearing,sweep};
  }
  function arcFromCenter(center,start,end,previous) {
    const updated=arcProgress(center,start,end,previous), radius=dist(center,start);
    if(!updated||radius<=eps||Math.abs(updated.sweep)<=eps||dist(center,end)<=eps) return null;
    return {type:'arc',c:center,r:radius,a:angle(center,start),s:updated.sweep};
  }

  function shape(tool, p, sides, overall = false) {
    const [a,b,c,d] = p;
    if (!a || !b || dist(a,b)<=eps) return null;
    const length = dist(a,b), t = angle(a,b);
    switch(tool) {
      case 'line': return {type:'line', p:[a,b]};
      case 'rect': return Math.min(Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1]))>eps ? {type:'poly',p:[a,[b[0],a[1]],b,[a[0],b[1]]],closed:true} : null;
      case 'rectCenter': {
        const [dx,dy]=sub(b,a);
        if(Math.min(Math.abs(dx),Math.abs(dy))<=eps) return null;
        const opposite=sub(a,[dx,dy]);
        return {type:'poly',p:[opposite,[b[0],opposite[1]],b,[opposite[0],b[1]]],closed:true};
      }
      case 'circle': return {type:'circle',c:a,r:length};
      case 'arc': return c && arc(a,b,c);
      case 'polygon': return {type:'poly',closed:true,p:Array.from({length:sides},(_,i)=>polar(a,length,t+i*tau/sides))};
      case 'ellipse': {
        const ry = c && Math.abs(cross(sub(b,a),sub(c,a)))/length;
        return ry>eps ? {type:'ellipse',c:a,r:length,ry,a:t} : null;
      }
      case 'slot': {
        const r = c && Math.abs(cross(sub(b,a),sub(c,a)))/length;
        if (!(r>eps) || (overall && 2*r>=length)) return null;
        const start = overall ? polar(a,r,t) : a, end = overall ? polar(b,r,t+Math.PI) : b;
        return {type:'path',closed:true,profile:'slot',segments:[
          {type:'line',p:[polar(start,r,t-Math.PI/2),polar(end,r,t-Math.PI/2)]},
          {type:'arc',c:end,r,a:t-Math.PI/2,s:Math.PI},
          {type:'line',p:[polar(end,r,t+Math.PI/2),polar(start,r,t+Math.PI/2)]},
          {type:'arc',c:start,r,a:t+Math.PI/2,s:Math.PI}
        ]};
      }
      case 'bezier': return d && {type:'bezier',p:[a,b,c,d]};
      default: return null;
    }
  }

  const slotArcEnds=e=>[polar(e.c,e.r,e.a),polar(e.c,e.r,e.a+e.s)];
  function slotParts(e) {
    if(e.type!=='path'||!e.closed||e.segments.length!==4) return null;
    const lines=[],arcs=[];
    for(const [i,part] of e.segments.entries()) {
      if(part.type==='line') lines.push(i);
      else if(part.type==='arc'&&Math.abs(Math.abs(part.s)-Math.PI)<=1e-8) arcs.push(i);
      else return null;
    }
    if(lines.length!==2||arcs.length!==2||lines[1]-lines[0]!==2) return null;
    const [a,b]=arcs.map(i=>e.segments[i]);
    const length=dist(a.c,b.c), tolerance=1e-8*Math.max(1,length,a.r,b.r);
    if(length<=eps||Math.abs(a.r-b.r)>tolerance) return null;
    for(const i of lines) {
      const line=e.segments[i], back=e.segments[(i+3)%4], front=e.segments[(i+1)%4];
      const [start,end]=line.p;
      const vector=sub(end,start);
      if(Math.abs(Math.hypot(...vector)-length)>tolerance ||
        dist(start,slotArcEnds(back)[1])>tolerance||dist(end,slotArcEnds(front)[0])>tolerance||
        Math.abs(dot(vector,sub(start,back.c)))>tolerance*length||
        Math.abs(dot(vector,sub(end,front.c)))>tolerance*length) return null;
    }
    return {lines,arcs};
  }
  function slotFrame(e,parts) {
    const [a,b]=parts.arcs.map(i=>e.segments[i]);
    const [x,y]=mid(a.c,b.c);
    return {x,y,angle:angle(a.c,b.c),length:dist(a.c,b.c),radius:(a.r+b.r)/2};
  }
  function withSlotFrame(e,parts,frame) {
    const {x,y,angle:heading,length,radius}=frame;
    if(length<=eps||radius<=eps||!Object.values(frame).every(Number.isFinite)) return null;
    const source=slotFrame(e,parts), center=[x,y];
    const segments=e.segments.slice();
    for(const [end,index] of parts.arcs.entries()) {
      const old=segments[index];
      const normal=Math.sin(old.a-source.angle)<0?-Math.PI/2:Math.PI/2;
      segments[index]={...old,r:radius,c:polar(center,end?length/2:-length/2,heading),
        a:mod(heading+normal),s:Math.sign(old.s)*Math.PI};
    }
    for(const index of parts.lines) {
      const before=segments[(index+3)%4], after=segments[(index+1)%4];
      segments[index]={...segments[index],p:[slotArcEnds(before)[1],slotArcEnds(after)[0]]};
    }
    const next={...e,segments};
    return serial(next)?next:null;
  }
  function stretchSlot(e,parts,point,delta) {
    const end=parts.arcs.findIndex(i=>slotArcEnds(e.segments[i]).some(p=>dist(point,p)<=eps));
    if(end===-1) return null;
    const arc=e.segments[parts.arcs[end]], frame=slotFrame(e,parts);
    const outward=polar([0,0],end?1:-1,frame.angle), radial=mul(sub(point,arc.c),1/arc.r);
    const along=dot(delta,outward);
    const shift=mul(outward,along/2);
    return withSlotFrame(e,parts,{...frame,x:frame.x+shift[0],y:frame.y+shift[1],
      length:frame.length+along,radius:frame.radius+dot(delta,radial)});
  }

  function controls(e,t) {
    if (e.type==='bezier') {
      const u = 1-t;
      return add(add(mul(e.p[0],u**3),mul(e.p[1],3*u*u*t)),add(mul(e.p[2],3*u*t*t),mul(e.p[3],t**3)));
    }
    if (e.type==='ellipse') {
      const a = e.a;
      return add(e.c,add([e.r*Math.cos(t)*Math.cos(a),e.r*Math.cos(t)*Math.sin(a)],[-e.ry*Math.sin(t)*Math.sin(a),e.ry*Math.sin(t)*Math.cos(a)]));
    }
    return polar(e.c,e.r,t);
  }

  function splineHandle({p,closed,tension=1,handles},i) {
    const count=p.length, point=p[i];
    const before=i>0||closed?sub(point,p[(i+count-1)%count]):null;
    const after=i<count-1||closed?sub(p[(i+1)%count],point):null;
    const vectors=[before,after].filter(Boolean);
    const lengths=vectors.map(v=>Math.hypot(...v));
    const reference=Math.min(...lengths)/3;
    const units=vectors.map((v,j)=>mul(v,1/lengths[j]));
    const tangent=mul(units.reduce(add,[0,0]),1/units.length);
    const turn=Math.hypot(...tangent);
    const direction=turn>eps?mul(tangent,1/turn):units[0];
    const stored=handles?.[i];
    const ratio=typeof stored==='number'?stored:turn*tension;
    const setting=typeof stored==='object'?{...stored,splitAngles:stored.splitAngles??(stored.inAngle!==stored.outAngle)}:{
      split:false,splitAngles:false,inRatio:ratio,outRatio:ratio,inAngle:0,outAngle:0
    };
    const heading=Math.atan2(direction[1],direction[0]);
    const arms=[
      polar([0,0],reference*setting.inRatio,heading+Math.PI+setting.inAngle),
      polar([0,0],reference*setting.outRatio,heading+setting.outAngle)
    ];
    return {heading,reference,setting,arms,ratio:setting.outRatio,length:reference*setting.outRatio};
  }

  function bezierJunctions(entity) {
    const parts=entity.type==='bezier'?[entity]:entity.type==='path'?entity.segments:null;
    if(!parts) return [];
    const end=(part,last)=>part.p?part.p[last?part.p.length-1:0]:
      controls(part,(part.type==='arc'?part.a:part.t)+(last?part.s:0));
    return Array.from({length:parts.length+(entity.closed?0:1)},(_,index)=>{
      const before=index>0?index-1:entity.closed?parts.length-1:null;
      const after=index<parts.length?index:null;
      if(parts[before]?.type!=='bezier'&&parts[after]?.type!=='bezier') return null;
      const point=after===null?end(parts[before],true):end(parts[after],false);
      const incoming=parts[before]?.type==='bezier'?parts[before].p[2]:null;
      const outgoing=parts[after]?.type==='bezier'?parts[after].p[1]:null;
      const neighbor=[before===null?null:end(parts[before],false),after===null?null:end(parts[after],true)];
      return {index,point,incoming,outgoing,before,after,neighbor};
    });
  }

  function bezierKnot(entity,index) {
    const knot=bezierJunctions(entity)[index];
    if(!knot) return null;
    const {point,neighbor,incoming,outgoing}=knot;
    const directions=[neighbor[0]&&sub(point,neighbor[0]),neighbor[1]&&sub(neighbor[1],point)]
      .filter(v=>v&&Math.hypot(...v)>eps);
    const lengths=directions.map(v=>Math.hypot(...v));
    const reference=lengths.length?Math.min(...lengths)/3:1;
    const mean=directions.reduce((sum,v,i)=>add(sum,mul(v,1/lengths[i])),[0,0]);
    const heading=Math.atan2(mean[1],mean[0]);
    const arms=[incoming&&sub(incoming,point),outgoing&&sub(outgoing,point)];
    const ratios=arms.map(v=>v&&Math.hypot(...v)/reference);
    const angles=arms.map((v,i)=>v&&mod(Math.atan2(v[1],v[0])-heading-(i===0?Math.PI:0)+Math.PI)-Math.PI);
    const mode=entity.bezierKnotModes?.[index];
    const split=mode?.split??(ratios.every(r=>r!==null)&&Math.abs(ratios[0]-ratios[1])>1e-7);
    const splitAngles=mode?.splitAngles??(angles.every(a=>a!==null)&&Math.abs(mod(angles[0]-angles[1]+Math.PI)-Math.PI)>1e-7);
    return {...knot,heading,reference,arms,setting:{split,splitAngles,
      inRatio:ratios[0]??ratios[1],outRatio:ratios[1]??ratios[0],
      inAngle:angles[0]??angles[1],outAngle:angles[1]??angles[0]}};
  }

  function withBezierKnot(entity,index,setting,tension=1.38) {
    const handle=bezierKnot(entity,index);
    if(!handle) return entity;
    const {heading,reference,point,before,after}=handle;
    const value=setting??{split:false,splitAngles:false,inRatio:tension,outRatio:tension,inAngle:0,outAngle:0};
    const parts=entity.type==='bezier'?[entity]:entity.segments.slice();
    const edits=[[before,2,value.inRatio,heading+Math.PI+value.inAngle],[after,1,value.outRatio,heading+value.outAngle]];
    for(const [part,control,ratio,bearing] of edits) if(parts[part]?.type==='bezier') {
      const p=parts[part].p.slice();p[control]=polar(point,reference*ratio,bearing);
      parts[part]={...parts[part],p};
    }
    const result=entity.type==='bezier'?{...parts[0]}:{...entity,segments:parts};
    const modes={...entity.bezierKnotModes};
    if(setting) modes[index]={split:setting.split,splitAngles:setting.splitAngles};
    else delete modes[index];
    if(Object.keys(modes).length) result.bezierKnotModes=modes;else delete result.bezierKnotModes;
    return result;
  }

  function splineSpans(e) {
    const {p,closed}=e, count=p.length;
    const tangents=p.map((_,i)=>splineHandle(e,i).arms);
    return p.slice(0,closed?count:-1).map((start,i)=>{
      const j=(i+1)%count, end=p[j];
      return {type:'bezier',p:[start,add(start,tangents[i][1]),add(end,tangents[j][0]),end]};
    });
  }

  function trace(e, zoom=1) {
    if (e.type==='point') return e.p;
    if (e.type==='spline') return splineSpans(e).flatMap((s,i)=>trace(s,zoom).slice(i?1:0));
    if (e.type==='path') return e.segments.flatMap((s,i)=>trace(s,zoom).slice(i?1:0));
    if (e.type==='poly') return e.closed ? [...e.p,e.p[0]] : e.p;
    if (e.type==='line') return e.p;
    if (e.type==='bezier') {
      const length = dist(e.p[0],e.p[1])+dist(e.p[1],e.p[2])+dist(e.p[2],e.p[3]);
      const n = Math.min(512,Math.max(16,Math.ceil(Math.sqrt(length*zoom)*2)));
      return Array.from({length:n+1},(_,i)=>controls(e,i/n));
    }
    const a=e.type==='arc'?e.a:e.t??0, s=e.s??(e.reversed?-tau:tau);
    const n = Math.min(2048,Math.max(8,Math.ceil(Math.abs(s)*Math.sqrt(Math.max(e.r,e.ry||0)*zoom))));
    return Array.from({length:n+1},(_,i)=>controls(e,a+s*i/n));
  }

  function traceLength(e) {
    if(e.type==='arc'||e.type==='circle') return e.r*Math.abs(e.s??tau);
    if(e.type==='path'||e.type==='spline')
      return (e.type==='path'?e.segments:splineSpans(e)).reduce((sum,part)=>sum+traceLength(part),0);
    const extent=e.r??(e.type==='bezier'?e.p.slice(1).reduce((sum,p,i)=>sum+dist(p,e.p[i]),0):1);
    const samples=trace(e,4096/Math.max(eps,extent));
    return samples.slice(1).reduce((sum,p,i)=>sum+dist(p,samples[i]),0);
  }

  function boundsPoints(e) {
    if(e.type==='path'||e.type==='spline') return (e.type==='path'?e.segments:splineSpans(e)).flatMap(boundsPoints);
    if(e.type==='bezier') {
      const points=[e.p[0],e.p[3]];
      for(let i=0;i<2;i++) {
        const [a,b,c,d]=e.p.map(p=>p[i]);
        const u=-a+3*b-3*c+d,v=2*(a-2*b+c),w=b-a, discriminant=v*v-4*u*w;
        const roots=Math.abs(u)<=eps?(Math.abs(v)<=eps?[]:[-w/v]):
          discriminant<0?[]:[(-v-Math.sqrt(discriminant))/(2*u),(-v+Math.sqrt(discriminant))/(2*u)];
        for(const t of roots) if(t>0&&t<1) points.push(controls(e,t));
      }
      return points;
    }
    if(e.p) return e.p;
    const heading=e.type==='ellipse'?e.a:0, ry=e.ry??e.r;
    const x=Math.atan2(-ry*Math.sin(heading),e.r*Math.cos(heading));
    const y=Math.atan2(ry*Math.cos(heading),e.r*Math.sin(heading));
    const extrema=[x,x+Math.PI,y,y+Math.PI];
    if(e.s===undefined) return extrema.map(t=>controls(e,t));
    const start=e.type==='arc'?e.a:e.t;
    return [start,start+e.s,...extrema.filter(t=>mod(Math.sign(e.s)*(t-start))<=Math.abs(e.s))].map(t=>controls(e,t));
  }

  function closedCenter(e) {
    const slot=slotParts(e);
    if(slot) return mid(...slot.arcs.map(i=>e.segments[i].c));
    const points=e.type==='poly'?e.p:trace(e,1);
    const origin=points[0], vectors=points.map(p=>sub(p,origin));
    let area=0, moment=[0,0];
    for(const [i,p] of vectors.entries()) {
      const q=vectors[(i+1)%vectors.length], weight=cross(p,q);
      area+=weight;moment=add(moment,mul(add(p,q),weight));
    }
    return Math.abs(area)>eps*eps?add(origin,mul(moment,1/(3*area))):
      mul(points.reduce(add,[0,0]),1/points.length);
  }
  function theoreticalPoints(e) {
    if(['circle','arc','ellipse'].includes(e.type)) return [{q:e.c}];
    const points=[];
    if(e.type==='path') for(const [part,segment] of e.segments.entries()) if(segment.c) points.push({q:segment.c,part});
    if(e.closed&&['poly','path','spline'].includes(e.type)) points.push({q:closedCenter(e)});
    return points;
  }
  function snapFeatures(e) {
    const feature=(kind,points)=>points.map(q=>({q,kind}));
    if (e.type==='point') return feature('point',e.p);
    if (e.type==='spline') return [...feature('point',e.p),...feature('center',theoreticalPoints(e).map(p=>p.q))];
    if (e.type==='path') return [...e.segments.flatMap(snapFeatures),
      ...(e.closed?feature('center',[closedCenter(e)]):[])];
    if (e.type==='line' || e.type==='poly') {
      const p = e.p;
      const edges = p.slice(1).map((q,i)=>mid(p[i],q));
      if (e.closed) edges.push(mid(p.at(-1),p[0]));
      return [...feature('point',p),...feature('midpoint',edges),
        ...(e.closed?feature('center',[closedCenter(e)]):[])];
    }
    if (e.type==='bezier') return [...feature('point',[e.p[0],e.p[3]]),...feature('midpoint',[controls(e,.5)])];
    const q = [0,Math.PI/2,Math.PI,3*Math.PI/2];
    if (e.s!==undefined) {
      const start=e.type==='arc'?e.a:e.t;
      const inside = t => mod(Math.sign(e.s)*(t-start))<=Math.abs(e.s);
      return [...feature('center',[e.c]),...feature('point',[controls(e,start),controls(e,start+e.s)]),
        ...feature('midpoint',[controls(e,start+e.s/2)]),...feature('quadrant',q.filter(inside).map(t=>controls(e,t)))];
    }
    return [...feature('center',[e.c]),...feature('quadrant',q.map(t=>controls(e,t)))];
  }

  function nearest(a,b,p) {
    const v = sub(b,a), square = dot(v,v);
    return square ? add(a,mul(v,Math.min(1,Math.max(0,dot(sub(p,a),v)/square)))) : a;
  }

  function traceLocation(e,p) {
    if(e.type==='line') {
      const [a,b]=e.p,v=sub(b,a), square=dot(v,v);
      const t=square?Math.min(1,Math.max(0,dot(sub(p,a),v)/square)):0;
      return {t,q:add(a,mul(v,t))};
    }
    if(e.type==='circle'||e.type==='arc') {
      const bearing=angle(e.c,p);
      const start=e.a??0, span=e.s??(e.reversed?-tau:tau), progress=mod(Math.sign(span)*(bearing-start));
      if(progress<=Math.abs(span)) return {t:progress/Math.abs(span),q:polar(e.c,e.r,bearing)};
      const a=controls(e,start), b=controls(e,start+span);
      return dist(a,p)<=dist(b,p)?{t:0,q:a}:{t:1,q:b};
    }
    if(e.type!=='ellipse'&&e.type!=='bezier') return null;
    const first=e.type==='bezier'?0:e.t??0;
    const sweep=e.type==='bezier'?1:e.s??(e.reversed?-tau:tau);
    const value=t=>controls(e,first+sweep*t);
    // Minimize squared distance along the parameter, including the two ends of a partial curve.
    const error=t=>{const delta=sub(value(t),p);return dot(delta,delta);};
    const divisions=24, phi=(Math.sqrt(5)-1)/2;
    const samples=Array.from({length:divisions+1},(_,i)=>error(i/divisions));
    let best=samples[0]<=samples[divisions]?0:1, distance=error(best);
    for(let i=0;i<=divisions;i++) {
      if(samples[i]>(samples[i-1]??Infinity)||samples[i]>(samples[i+1]??Infinity)) continue;
      let left=Math.max(0,i-1)/divisions, right=Math.min(divisions,i+1)/divisions;
      let a=right-phi*(right-left), b=left+phi*(right-left), da=error(a), db=error(b);
      for(let step=0;step<48;step++) {
        if(da<=db) {
          right=b;b=a;db=da;a=right-phi*(right-left);da=error(a);
        } else {
          left=a;a=b;da=db;b=left+phi*(right-left);db=error(b);
        }
      }
      if(Math.min(da,db)<distance) {
        best=da<=db?a:b;
        distance=Math.min(da,db);
      }
    }
    return {t:best,q:value(best)};
  }

  const nearestOnTrace=(e,p)=>traceLocation(e,p)?.q;
  function traceAt(e,t) {
    if(e.type==='line') return add(e.p[0],mul(sub(e.p[1],e.p[0]),t));
    if(e.type==='bezier') return controls(e,t);
    const start=e.type==='arc'?e.a:e.t??0;
    return controls(e,start+(e.s??(e.reversed?-tau:tau))*t);
  }
  function traceDerivative(e,t) {
    if(e.type==='line') return sub(e.p[1],e.p[0]);
    if(e.type==='bezier') {
      const [a,b,c,d]=e.p, u=1-t;
      return add(add(mul(sub(b,a),3*u*u),mul(sub(c,b),6*u*t)),mul(sub(d,c),3*t*t));
    }
    const sweep=e.s??(e.reversed?-tau:tau);
    const angle=(e.type==='arc'?e.a:e.t??0)+t*sweep;
    const heading=e.type==='ellipse'?e.a:0;
    const x=-e.r*Math.sin(angle), y=(e.ry??e.r)*Math.cos(angle);
    return mul([x*Math.cos(heading)-y*Math.sin(heading),x*Math.sin(heading)+y*Math.cos(heading)],sweep);
  }

  function intersection(a,b,c,d) {
    const u=sub(b,a), v=sub(d,c), delta=sub(c,a);
    const denominator=cross(u,v);
    if(Math.abs(denominator)<=eps*Math.hypot(...u)*Math.hypot(...v)) return null;
    const t=cross(delta,v)/denominator, s=cross(delta,u)/denominator;
    return t>=0 && t<=1 && s>=0 && s<=1 ? add(a,mul(u,t)) : null;
  }

  function transform(e,p,rotation=0,factor=1,mirror=false) {
    if(e.type==='path') return {...e,segments:e.segments.map(s=>transform(s,p,rotation,factor,mirror))};
    if(e.type==='spline' && mirror && e.handles) return {...e,p:e.p.map(p),
      handles:Object.fromEntries(Object.entries(e.handles).map(([i,v])=>[i,typeof v==='number'?v:
        {...v,inAngle:-v.inAngle,outAngle:-v.outAngle}]))};
    if(e.p) return {...e,p:e.p.map(p)};
    return {...e,c:p(e.c),r:e.r*factor,
      ...(e.ry===undefined?{}:{ry:e.ry*factor}),
      ...(e.a===undefined?{}:{a:rotation+(mirror?-e.a:e.a)}),
      ...(e.t===undefined?{}:{t:mirror?-e.t:e.t}),
      ...(e.s===undefined?{}:{s:mirror?-e.s:e.s}),
      ...(mirror&&e.s===undefined?{reversed:!e.reversed}:{})};
  }

  function scaleAxes(e,map,sx,sy) {
    if(sx===sy) return transform(e,map,0,sx);
    if(e.type==='path'||e.type==='spline') {
      const source=e.type==='spline'?splineSpans(e):e.segments;
      const {p,profile,tension,handles,...rest}=e;
      return {...rest,type:'path',segments:source.map(s=>scaleAxes(s,map,sx,sy))};
    }
    if(e.p) return {...e,p:e.p.map(map)};
    const heading=e.type==='ellipse'?e.a:0, minor=e.ry??e.r;
    const a=[sx*e.r*Math.cos(heading),sy*e.r*Math.sin(heading)];
    const b=[-sx*minor*Math.sin(heading),sy*minor*Math.cos(heading)];
    const xx=a[0]**2+b[0]**2, yy=a[1]**2+b[1]**2, xy=a[0]*a[1]+b[0]*b[1];
    const direction=Math.atan2(2*xy,xx-yy)/2;
    const r=Math.sqrt((xx+yy+Math.hypot(xx-yy,2*xy))/2);
    const ry=Math.abs(cross(a,b))/r;
    const u=polar([0,0],1,direction), v=[-u[1],u[0]];
    const phase=Math.atan2(dot(a,v)/ry,dot(a,u)/r);
    return {...e,type:'ellipse',c:map(e.c),r,ry,a:direction,
      ...(e.s===undefined?{}:{t:mod(phase+(e.type==='arc'?e.a:e.t)),s:e.s})};
  }

  const constructionStyles={
    dashed:{label:'Tirets',pattern:[7,4]},
    dotted:{label:'Points',pattern:[1,4]},
    dashDot:{label:'Tiret-point',pattern:[8,3,1,3]}
  };
  const isConstructionStyle=style=>typeof style==='string'&&Object.hasOwn(constructionStyles,style);
  function constructionAt(e,index) {
    return (index===undefined?e.construction:e.constructionParts?.[index]??e.construction)||null;
  }
  function strokeParts(e) {
    if(e.type==='path') return e.segments;
    if(e.type==='spline') return splineSpans(e);
    if(e.type==='poly') return e.p.slice(0,e.closed?e.p.length:-1).map((p,i)=>({type:'line',p:[p,e.p[(i+1)%e.p.length]]}));
    return [];
  }
  function hasRegularStroke(e) {
    if(!e.constructionParts) return !e.construction;
    return strokeParts(e).some((_,i)=>!constructionAt(e,i));
  }
  function withConstruction(e,style,index) {
    const result={...e};
    if(index===undefined) {
      delete result.constructionParts;
      if(style) result.construction=style;else delete result.construction;
      return result;
    }
    const parts={...e.constructionParts};
    if((style||null)===(e.construction??null)) delete parts[index];
    else parts[index]=style||false;
    if(Object.keys(parts).length) result.constructionParts=parts;else delete result.constructionParts;
    return result;
  }
  function reverse(e) {
    const reversed=reverseGeometry(e);
    if(e.bezierKnotModes) {
      const n=e.type==='path'?e.segments.length:1;
      reversed.bezierKnotModes=Object.fromEntries(Object.entries(e.bezierKnotModes)
        .map(([i,mode])=>[e.closed?(n-Number(i))%n:n-Number(i),mode]));
    }
    if(!e.constructionParts) return reversed;
    const count=strokeParts(e).length;
    const last=e.closed&&['poly','spline'].includes(e.type)?count-2:count-1;
    return {...reversed,constructionParts:Object.fromEntries(Object.entries(e.constructionParts).
      map(([index,style])=>[(last-Number(index)+count)%count,style]))};
  }

  function reverseGeometry(e) {
    if(e.type==='path') return {...e,segments:e.segments.slice().reverse().map(reverse)};
    if(e.type==='arc') return {...e,a:e.a+e.s,s:-e.s};
    if(e.type==='ellipse'&&e.s!==undefined) return {...e,t:mod(e.t+e.s),s:-e.s};
    if(e.type==='ellipse'||e.type==='circle') return {...e,reversed:!e.reversed};
    if(e.type==='spline' && e.handles) return {...e,p:e.p.slice().reverse(),
      handles:Object.fromEntries(Object.entries(e.handles).map(([i,v])=>[e.p.length-1-Number(i),typeof v==='number'?v:
        {...v,inRatio:v.outRatio,outRatio:v.inRatio,inAngle:v.outAngle,outAngle:v.inAngle}]))};
    if(e.p) return {...e,p:e.p.slice().reverse()};
    return e;
  }

  function serial(e) {
    const finite = n => typeof n==='number' && Number.isFinite(n) && Math.abs(n)<=1e12;
    const point = p => Array.isArray(p) && p.length===2 && p.every(finite);
    const ratio=v=>finite(v)&&v>=0&&v<=maxSplineRatio;
    const handle=v=>ratio(v)||v&&typeof v.split==='boolean'&&ratio(v.inRatio)&&ratio(v.outRatio)&&
      [v.inAngle,v.outAngle].every(a=>finite(a)&&Math.abs(a)<=Math.PI)&&
      (v.split||v.inRatio===v.outRatio)&&
      (v.splitAngles===undefined?v.split||v.inAngle===v.outAngle:
        typeof v.splitAngles==='boolean'&&(v.splitAngles||v.inAngle===v.outAngle));
    if (!e || typeof e!=='object') return false;
    if(e.construction!==undefined&&!isConstructionStyle(e.construction)) return false;
    if(e.constructionParts!==undefined) {
      const parts=e.constructionParts;
      if(!parts||typeof parts!=='object'||Array.isArray(parts)||!['poly','path','spline'].includes(e.type)) return false;
      const count=e.type==='path'?e.segments?.length:e.p?.length-(e.closed?0:1);
      if(!Object.entries(parts).every(([i,style])=>/^(0|[1-9]\d*)$/.test(i)&&Number(i)<count&&
        (style===false||isConstructionStyle(style)))) return false;
    }
    switch(e.type) {
      case 'point': return Array.isArray(e.p) && e.p.length===1 && point(e.p[0]);
      case 'spline':
        return typeof e.closed==='boolean' && Array.isArray(e.p) && e.p.length>=(e.closed?3:2) && e.p.every(point) &&
          e.p.slice(1).every((p,i)=>dist(e.p[i],p)>eps) && (!e.closed||dist(e.p[0],e.p.at(-1))>eps) &&
          (e.tension===undefined||ratio(e.tension)) &&
          (e.handles===undefined||e.handles&&typeof e.handles==='object'&&!Array.isArray(e.handles) &&
            Object.entries(e.handles).every(([i,v])=>/^(0|[1-9]\d*)$/.test(i)&&Number(i)<e.p.length&&handle(v)));
      case 'line': case 'poly': case 'bezier':
        return Array.isArray(e.p) && e.p.every(point) && (e.type==='poly' ? e.p.length>=(e.closed?3:2) : e.p.length===(e.type==='line'?2:4));
      case 'circle': case 'ellipse': case 'arc':
        return point(e.c) && finite(e.r) && e.r>0 && (e.type==='circle' || finite(e.a)) &&
          (e.type!=='ellipse' || finite(e.ry) && e.ry>0 && (e.s===undefined||finite(e.t)&&finite(e.s)&&Math.abs(e.s)>0&&Math.abs(e.s)<=tau)) &&
          (e.type!=='arc' || finite(e.s) && Math.abs(e.s)>0 && Math.abs(e.s)<=tau);
      case 'path': return Array.isArray(e.segments) && e.segments.length>0 && e.segments.every(s=>s &&
        (['line','arc','bezier'].includes(s.type)||s.type==='ellipse'&&s.s!==undefined)&&serial(s));
      default: return false;
    }
  }

  return {constructionStyles,constructionAt,hasRegularStroke,withConstruction,strokeParts,tau,eps,maxSplineRatio,add,sub,mul,dot,cross,dist,angle,mod,polar,mid,arc,arcMovedEnd,arcWithCenterEnd,tangentArc,tangentLineEnd,collinearLineEnd,arcProgress,arcFromCenter,shape,controls,slotParts,slotFrame,withSlotFrame,stretchSlot,bezierJunctions,bezierKnot,withBezierKnot,splineHandle,splineSpans,trace,traceLength,boundsPoints,theoreticalPoints,snapFeatures,nearest,nearestOnTrace,traceLocation,traceAt,traceDerivative,intersection,transform,scaleAxes,reverse,serial};
};
const G=createG();
if(typeof module!=='undefined') module.exports=G;
