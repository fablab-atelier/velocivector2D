'use strict';
const createFormal=(G,Edit)=>{


  const names={horizontal:'Horizontale',vertical:'Verticale',coincident:'Coïncidente',parallel:'Parallèle',collinear:'Colinéaire',radial:'Radiale',midpoint:'Milieu',
    perpendicular:'Perpendiculaire',cornerAngle:'Angle du polygone',equal:'Égale',tangent:'Tangente',symmetry:'Symétrie',locked:'Verrouillée'};
  const count={horizontal:1,vertical:1,coincident:2,parallel:2,collinear:2,radial:2,midpoint:2,perpendicular:2,cornerAngle:2,equal:2,tangent:2,symmetry:3,locked:1};
  const dimensionNames={aligned:'Longueur',width:'Distance horizontale',height:'Distance verticale',diameter:'Diamètre',radius:'Rayon',
    angle:'Angle',parallelDistance:'Écart entre segments parallèles',pointDistance:'Distance du point au segment'};
  const isDimension=c=>c?.type==='dimension';
  const isDriving=c=>!isDimension(c)||c.driven!==true;
  const tolerance=1e-7;
  const key=ref=>ref.kind==='origin'?'origin/'+ref.name:[ref.id,ref.kind,ref.index].join('/');
  const sameRef=(a,b)=>key(a)===key(b);

  function vertices(e) {
    if(e.type==='bezier') return [e.p[0],e.p[3]];
    if(e.p) return e.p;
    if(e.type==='ellipse'&&e.s!==undefined) return Edit.ends(e);
    if(e.type==='circle'||e.type==='ellipse') return [e.c];
    if(e.type==='arc') return [...Edit.ends(e),e.c];
    if(e.type==='path') {
      const points=e.segments.map(s=>Edit.ends(s)[0]);
      if(!e.closed) points.push(Edit.ends(e.segments.at(-1))[1]);
      return points;
    }
    return [];
  }

  function theoreticalReferences(e,base=vertices(e)) {
    const first=e.type==='arc'||e.type==='ellipse'&&e.s!==undefined?2:
      e.type==='circle'||e.type==='ellipse'?0:base.length;
    return G.theoreticalPoints(e).map((entry,i)=>({...entry,index:first+i}));
  }

  function referencePoints(e) {
    const base=vertices(e);
    const points=base.slice();
    for(const {index,q} of theoreticalReferences(e,base)) points[index]=q;
    return points;
  }

  function referenceEdges(e) {
    if(e.type==='circle'||e.type==='ellipse') return [e];
    if(e.type==='spline') return G.splineSpans(e);
    return Edit.edges(e);
  }
  const part=(e,index)=>referenceEdges(e)[index];

  const midpointIndex=1_000_000;
  const midpointRef=edge=>({id:edge.id,kind:'point',index:midpointIndex+edge.index});
  const isMidpointRef=ref=>ref.kind==='point'&&ref.index>=midpointIndex;
  const hasMidpoint=segment=>Boolean(segment&&(['line','arc','bezier'].includes(segment.type)||
    segment.type==='ellipse'&&segment.s!==undefined));
  function* originPoints(entity) {
    for(const [index,p] of referencePoints(entity).entries()) {
      if(p) yield {p,ref:{id:entity.id,kind:'point',index}};
    }
    for(const [index,segment] of referenceEdges(entity).entries()) {
      if(hasMidpoint(segment)) yield {p:G.traceAt(segment,.5),ref:midpointRef({id:entity.id,index})};
    }
  }
  function resolve(entities,ref) {
    if(ref.kind==='origin') return ref.target;
    const e=entities.get(ref.id);
    if(!e) return null;
    if(isMidpointRef(ref)) {
      const segment=part(e,ref.index-midpointIndex);
      return hasMidpoint(segment)?G.traceAt(segment,.5):null;
    }
    if(ref.kind==='point') {
      const base=vertices(e);
      return base[ref.index]??theoreticalReferences(e,base).find(entry=>entry.index===ref.index)?.q;
    }
    return ref.kind==='edge'?part(e,ref.index):null;
  }
  const line=e=>e?.type==='line';
  const round=e=>e?.type==='circle'||e?.type==='arc';
  const tangentSpan=e=>line(e)||e?.type==='arc'||e?.type==='bezier'||e?.type==='ellipse'&&e.s!==undefined;
  const point=Array.isArray;
  const trace=value=>value&&['line','circle','arc','bezier','ellipse'].includes(value.type);
  const isPointOnTrace=c=>c.type==='coincident'&&c.refs.some(r=>r.kind==='edge');
  function radialReference(entities,ref) {
    if(ref.kind==='edge') return ref;
    if(ref.kind!=='point') return null;
    const entity=entities.get(ref.id);
    if(!entity) return null;
    const center=theoreticalReferences(entity).find(entry=>entry.index===ref.index);
    const index=center?.part??0;
    return center&&round(center.part===undefined?entity:part(entity,index))?{id:ref.id,kind:'edge',index}:null;
  }
  function accepts(type,index,value,first) {
    if(type==='radial') return (line(value)||round(value))&&(!index||line(value)!==line(first));
    if(type==='locked') return point(value)||line(value)||round(value)||value?.type==='ellipse'||value?.type==='bezier';
    if(type==='coincident') return point(value)||trace(value)&&(index===0||point(first));
    if(type==='midpoint') return line(value)||point(value)&&(index===0||line(first));
    if(type==='symmetry') return index===0?line(value):point(value);
    if(type==='tangent') return (tangentSpan(value)||round(value)) && !(line(first)&&line(value));
    if(type==='equal') return (line(value)||round(value)) && (!first||line(first)===line(value));
    return line(value);
  }
  function size(e) {return line(e)?G.dist(...e.p):e.r;}
  function displacePoint(p,axis) {
    const [a,b]=axis.p, v=G.sub(b,a), length=Math.hypot(...v);
    return length>G.eps?G.mul([-v[1],v[0]],G.cross(v,G.sub(p,a))/(length*length)):null;
  }
  function lockedValues(value) {
    if(point(value)) return value;
    if(value.p) return value.p.flat();
    return [...value.c,value.r,...(value.type==='arc'?[value.a,value.s]:value.type==='ellipse'?[value.ry,value.a]:[])];
  }
  function coincidenceProjection(support,position) {
    if(line(support)) {
      const [a,b]=support.p, direction=G.sub(b,a), square=G.dot(direction,direction);
      return square>0?G.add(a,G.mul(direction,G.dot(G.sub(position,a),direction)/square)):null;
    }
    if(support.type==='arc') {
      const delta=G.sub(position,support.c), distance=Math.hypot(...delta);
      return distance>0?G.add(support.c,G.mul(delta,support.r/distance)):G.polar(support.c,support.r,support.a);
    }
    return G.nearestOnTrace(support,position);
  }
  function residual(entities,c) {
    if(isDimension(c)) {
      if(c.mode==='parallelDistance'||c.mode==='pointDistance') {
        const geometry=dimensionGeometry(entities,c);
        if(!geometry) return null;
        const distance=signedDistance(geometry.axis,geometry.point);
        if(distance===null) return null;
        const value=c.projectionSign?c.projectionSign*distance:Math.abs(distance);
        const error=[value-c.value];
        if(geometry.parallel) {
          const u=lineVector(geometry.axis),v=lineVector(geometry.parallel);
          error.push(G.cross(u,v)/Math.max(G.eps,Math.min(Math.hypot(...u),Math.hypot(...v))));
        }
        return error;
      }
      if(c.projectionSign) {
        const points=dimensionGeometry(entities,c);
        const axis=c.mode==='width'?0:1;
        return points?[c.projectionSign*(points[1][axis]-points[0][axis])-c.value]:null;
      }
      const value=dimensionValue(entities,c);
      return value===null?null:[value-c.value];
    }
    const values=c.refs.map(r=>resolve(entities,r));
    if(c.type==='dimensionBearing') {
      const direction=bearingVector(values[0]);
      return direction?[G.cross(c.target,direction),Math.min(0,G.dot(c.target,direction))]:null;
    }
    if(values.some((v,i)=>!accepts(c.type,i,v,i?values[0]:null))) return null;
    const [a,b,d]=values;
    switch(c.type) {
      case 'horizontal': return [a.p[1][1]-a.p[0][1]];
      case 'vertical': return [a.p[1][0]-a.p[0][0]];
      case 'coincident': {
        if(c.origin||point(a)&&point(b)) return G.sub(a,c.origin?c.target:b);
        const position=point(a)?a:b, support=point(a)?b:a;
        const nearest=coincidenceProjection(support,position);
        return nearest?G.sub(position,nearest):null;
      }
      case 'midpoint': return G.sub(line(a)?G.mid(...a.p):a,line(b)?G.mid(...b.p):b);
      case 'parallel': {
        const u=G.sub(a.p[1],a.p[0]), v=G.sub(b.p[1],b.p[0]);
        return [G.cross(u,v)/Math.max(G.eps,Math.min(size(a),size(b)))];
      }
      case 'radial': {
        const distance=line(a)?signedDistance(a,b.c):signedDistance(b,a.c);
        return distance===null?null:[distance];
      }
      case 'collinear': {
        const distances=b.p.map(p=>signedDistance(a,p));
        return distances.every(Number.isFinite)?distances:null;
      }
      case 'perpendicular': {
        const u=lineVector(a), v=lineVector(b);
        return [G.dot(u,v)/Math.max(G.eps,Math.min(size(a),size(b)))];
      }
      case 'cornerAngle': {
        const u=lineVector(a), v=lineVector(b);
        const turn=Math.atan2(G.cross(u,v),G.dot(u,v));
        return [Math.atan2(Math.sin(turn-c.value),Math.cos(turn-c.value))*Math.min(size(a),size(b))];
      }
      case 'equal': return [size(a)-size(b)];
      case 'tangent': {
        if([a,b].some(part=>!line(part)&&!round(part))) {
          if(!c.contact||![a,b].every(tangentSpan)) return null;
          const [i,j]=c.contact, p=Edit.ends(a)[i], q=Edit.ends(b)[j];
          const u=G.traceDerivative(a,i), v=G.traceDerivative(b,j);
          const lu=Math.hypot(...u), lv=Math.hypot(...v);
          return Math.min(lu,lv)>G.eps?[...G.sub(p,q),G.cross(u,v)/Math.max(lu,lv)]:null;
        }
        if(line(a)||line(b)) {
          const axis=line(a)?a:b, circle=line(a)?b:a;
          const u=lineVector(axis), length=Math.hypot(...u);
          if(length<=G.eps) return null;
          if(c.contact) {
            const [first,second]=c.contact;
            const p=Edit.ends(a)[first], q=Edit.ends(b)[second];
            const end=line(a)?q:p;
            return [...G.sub(p,q),G.dot(u,G.sub(end,circle.c))/length];
          }
          const normal=displacePoint(circle.c,axis);
          if(!normal) return null;
          const along=G.dot(G.sub(circle.c,axis.p[0]),u)/length;
          const error=[Math.hypot(...normal)-circle.r,along-Math.max(0,Math.min(length,along))];
          if(circle.type==='arc') {
            const contact=G.sub(circle.c,normal), sweep=Math.abs(circle.s);
            const t=G.mod(Math.sign(circle.s)*(G.angle(circle.c,contact)-circle.a));
            error.push(t<=sweep?0:(t-sweep<G.tau-t?t-sweep:t-G.tau)*circle.r);
          }
          return error;
        }
        if(c.contact) {
          const [first,second]=c.contact, p=Edit.ends(a)[first],q=Edit.ends(b)[second];
          return [...G.sub(p,q),G.cross(G.sub(p,a.c),G.sub(q,b.c))/Math.max(a.r,b.r)];
        }
        return [G.dist(a.c,b.c)-(c.internal?Math.abs(a.r-b.r):a.r+b.r)];
      }
      case 'symmetry': {
        const normal=displacePoint(b,a);
        return normal?G.sub(G.sub(b,G.mul(normal,2)),d):null;
      }
      case 'locked': {
        const actual=lockedValues(a);
        return actual.length===c.target.length?actual.map((n,i)=>n-c.target[i]):null;
      }
      default: return null;
    }
  }
  const lineVector=e=>G.sub(e.p[1],e.p[0]);
  function bearingVector(edge) {
    if(!edge||edge.type==='circle') return null;
    if(edge.type==='ellipse'&&edge.s===undefined) return G.polar([0,0],edge.r,edge.a);
    const [start,end]=Edit.ends(edge), direction=G.sub(end,start);
    return Math.hypot(...direction)>G.eps?direction:null;
  }
  function signedDistance(axis,p) {
    const v=lineVector(axis), length=Math.hypot(...v);
    return length<=G.eps?null:G.cross(v,G.sub(p,axis.p[0]))/length;
  }
  function segmentPairMode(first,second) {
    const a=lineVector(first), b=lineVector(second);
    const scale=Math.hypot(...a)*Math.hypot(...b);
    return scale<=G.eps**2?null:Math.abs(G.cross(a,b))<=scale*1e-6?'parallelDistance':'angle';
  }
  function angleLayout(geometry,rays) {
    const [first,second]=geometry.lines;
    const a=lineVector(first),b=lineVector(second),denom=G.cross(a,b);
    if(Math.abs(denom)<=G.eps*Math.hypot(...a)*Math.hypot(...b)) return null;
    const t=G.cross(G.sub(second.p[0],first.p[0]),b)/denom;
    const center=G.add(first.p[0],G.mul(a,t));
    const u=G.mul(a,rays[0]),v=G.mul(b,rays[1]);
    return {center,start:Math.atan2(u[1],u[0]),sweep:Math.atan2(G.cross(u,v),G.dot(u,v))};
  }
  function angleRays(geometry,position) {
    let best=null;
    for(const a of [1,-1]) for(const b of [1,-1]) {
      const rays=[a,b], layout=angleLayout(geometry,rays);
      if(!layout) return [1,1];
      const pointing=G.angle(layout.center,position);
      const delta=G.mod(Math.sign(layout.sweep)*(pointing-layout.start));
      const inside=delta<=Math.abs(layout.sweep)+1e-10;
      const score=inside?Math.abs(delta-Math.abs(layout.sweep)/2):
        G.tau+Math.min(delta-Math.abs(layout.sweep),G.tau-delta);
      if(!best||score<best.score) best={rays,score};
    }
    return best.rays;
  }
  function dimensionGeometry(entities,c) {
    const values=c.refs.map(r=>resolve(entities,r));
    if(c.mode==='diameter'||c.mode==='radius') return values.length===1&&round(values[0])?values[0]:null;
    if(c.mode==='angle'||c.mode==='parallelDistance') {
      if(values.length!==2||!values.every(line)) return null;
      return c.mode==='angle'?{lines:values}:{axis:values[0],point:G.mid(...values[1].p),parallel:values[1]};
    }
    if(c.mode==='pointDistance') {
      if(values.length!==2) return null;
      const axis=values.find(line),p=values.find(point);
      return axis&&p?{axis,point:p}:null;
    }
    if(!['aligned','width','height'].includes(c.mode)) return null;
    if(values.length===1 && line(values[0])) return values[0].p;
    return values.length===2&&values.every(point)?values:null;
  }
  function dimensionValue(entities,c) {
    const geometry=dimensionGeometry(entities,c);
    if(!geometry) return null;
    if(c.mode==='angle') {
      const [a,b]=geometry.lines.map((e,i)=>G.mul(lineVector(e),c.rays[i]));
      return Math.atan2(Math.abs(G.cross(a,b)),G.dot(a,b))*180/Math.PI;
    }
    if(c.mode==='parallelDistance'||c.mode==='pointDistance') {
      const distance=signedDistance(geometry.axis,geometry.point);
      return distance===null?null:Math.abs(distance);
    }
    if(!Array.isArray(geometry)) return geometry.r*(c.mode==='diameter'?2:1);
    const [a,b]=geometry;
    if(c.mode==='aligned') return G.dist(a,b);
    return Math.abs(b[c.mode==='width'?0:1]-a[c.mode==='width'?0:1]);
  }
  function linearDimensionMode(a,b,position,scale) {
    const dx=Math.abs(b[0]-a[0]),dy=Math.abs(b[1]-a[1]);
    const threshold=18/scale;
    if(G.dist(position,G.nearest(a,b,position))<=threshold) return 'aligned';
    if(dx<=G.eps) return 'height';
    if(dy<=G.eps) return 'width';
    const [x,y]=position;
    const side=Math.max(Math.min(a[0],b[0])-x,x-Math.max(a[0],b[0]),0);
    const above=Math.max(Math.min(a[1],b[1])-y,y-Math.max(a[1],b[1]),0);
    if(side||above) return above>=side?'width':'height';
    const middle=G.mid(a,b);
    return Math.abs(y-middle[1])>=Math.abs(x-middle[0])?'width':'height';
  }
  function make(type,refs,items) {
    if(count[type]!==refs.length||new Set(refs.map(key)).size!==refs.length) return null;
    const entities=new Map(items.map(e=>[e.id,e]));
    if(type==='radial') {
      refs=refs.map(ref=>radialReference(entities,ref));
      if(refs.some(ref=>!ref)) return null;
      if(round(resolve(entities,refs[0]))) refs.reverse();
    }
    const values=refs.map(r=>resolve(entities,r));
    if(type==='coincident'&&refs.some(r=>r.kind==='origin')) {
      const origin=refs.find(r=>r.kind==='origin'), vertex=refs.find(r=>r.kind==='point');
      if(!vertex||!point(resolve(entities,vertex))) return null;
      return {type,refs:[vertex],origin:origin.name,target:origin.target};
    }
    if(values.some((v,i)=>!accepts(type,i,v,i?values[0]:null))) return null;
    const c={type,refs};
    if(type==='locked') c.target=lockedValues(values[0]);
    if(type==='tangent'&&values.every(tangentSpan)) {
      const [a,b]=values.map(Edit.ends);
      const first=a.findIndex(p=>b.some(q=>G.dist(p,q)<=tolerance));
      if(first>=0) c.contact=[first,b.findIndex(q=>G.dist(a[first],q)<=tolerance)];
    }
    if(type==='tangent'&&values.some(v=>!line(v)&&!round(v))&&!c.contact) return null;
    if(type==='tangent'&&values.every(round)) {
      const [a,b]=values, distance=G.dist(a.c,b.c);
      c.internal=Math.abs(distance-Math.abs(a.r-b.r))<Math.abs(distance-a.r-b.r);
    }
    return c;
  }
  function satisfied(entities,c) {
    const error=residual(entities,c);
    return Boolean(error)&&(c.driven||error.every(n=>Number.isFinite(n)&&Math.abs(n)<=tolerance*2)&&touches(entities,c));
  }
  function equalSelection(entities,refs) {
    const leaders=new Map(), seen=new Set(), constraints=[];
    for(const ref of refs) {
      const value=resolve(entities,ref), id=key(ref);
      if(seen.has(id)||!accepts('equal',0,value)) continue;
      seen.add(id);
      const group=line(value)?'length':'radius';
      if(leaders.has(group)) constraints.push({type:'equal',refs:[leaders.get(group),ref]});
      else leaders.set(group,ref);
    }
    return constraints;
  }
  function signature(c) {
    const refs=c.refs.map(key);
    if(isDimension(c)) return c.type+'/'+c.mode+'/'+refs.sort().join('|')+(c.mode==='angle'?'/'+c.rays[0]*c.rays[1]:'');
    if(c.type==='coincident'&&c.origin) return c.type+'/'+refs[0]+'/'+c.origin;
    return c.type+'/'+(c.type==='symmetry'?[refs[0],...refs.slice(1).sort()]:refs.sort()).join('|');
  }
  function slotConstraints(entity,parts=G.slotParts(entity),includeArcEquality=true) {
    if(!parts) return [];
    const edge=index=>({id:entity.id,kind:'edge',index});
    const equal={type:'equal',refs:parts.lines.map(edge)};
    const tangent=parts.lines.flatMap(index=>[3,1].map(offset=>({
      type:'tangent',refs:[edge(index),edge((index+offset)%4)]
    })));
    const arcs=parts.lines.map(index=>edge((index+1)%4));
    return includeArcEquality?[equal,...tangent,{type:'equal',refs:arcs}]:[equal,...tangent];
  }
  function slotCenterline(entity,id,style) {
    const centers=theoreticalReferences(entity).filter(ref=>ref.part!==undefined);
    if(centers.length!==2) return null;
    const line=G.withConstruction({id,layer:entity.layer,type:'line',p:centers.map(ref=>ref.q)},style);
    const constraints=centers.map(({index},end)=>({type:'coincident',refs:[
      {id:entity.id,kind:'point',index},{id,kind:'point',index:end}
    ]}));
    return {line,constraints};
  }
  function protectedSlot(entity,constraints) {
    if(entity?.profile!=='slot') return null;
    const parts=G.slotParts(entity);
    if(!parts) return null;
    const existing=new Set(constraints.filter(c=>c.refs.some(ref=>ref.id===entity.id)).map(signature));
    return slotConstraints(entity,parts,false).every(c=>existing.has(signature(c)))?parts:null;
  }
  function shapeConstraints(entity,tool) {
    if(tool==='slot'||entity.profile==='slot') return slotConstraints(entity);
    if(entity.type!=='poly'||!entity.closed||!['rect','rectCorners','polygon'].includes(tool)) return [];
    const n=entity.p.length;
    const edge=index=>({id:entity.id,kind:'edge',index});
    const pair=(type,i,j)=>({type,refs:[edge(i),edge(j)]});
    if(tool==='rect'||tool==='rectCorners') {
      const corners=[0,1,2].map(i=>pair('perpendicular',i,i+1));
      if(tool==='rectCorners') {
        // Opposite horizontal sides start at vertices 0 and 2. World Y increases upward.
        const top=entity.p[0][1]>entity.p[2][1]?0:2;
        corners.push({type:'horizontal',refs:[edge(top)]});
      }
      return corners;
    }
    const parts=Edit.edges(entity), result=[];
    for(let i=0;i<n;i++) {
      const j=(i+1)%n, a=lineVector(parts[i]), b=lineVector(parts[j]);
      result.push({...pair('cornerAngle',i,j),value:Math.atan2(G.cross(a,b),G.dot(a,b))});
      if(i>0) result.push(pair('equal',0,i));
    }
    return result;
  }
  function valid(items,constraints) {
    if(!Array.isArray(constraints)) return false;
    const entities=new Map(items.map(e=>[e.id,e]));
    if(entities.size!==items.length||items.some(e=>!Number.isSafeInteger(e.id)||e.id<1)) return false;
    const refsValid=c=>Array.isArray(c.refs)&&c.refs.every(r=>r&&(r.kind==='origin'?
      isDimension(c)&&r.id===undefined&&typeof r.name==='string'&&/^(POA|POT[1-9]\d*)$/.test(r.name)&&
      Array.isArray(r.target)&&r.target.length===2&&r.target.every(Number.isFinite):
      Number.isSafeInteger(r.id)&&Number.isInteger(r.index)&&r.index>=0&&['point','edge'].includes(r.kind)));
    return constraints.every(c=>c&&refsValid(c)&&
      new Set(c.refs.map(key)).size===c.refs.length&&
      (isDimension(c)?Object.hasOwn(dimensionNames,c.mode)&&Number.isFinite(c.value)&&c.value>=0&&
        (c.mode!=='angle'||c.value>0&&c.value<180&&Array.isArray(c.rays)&&c.rays.length===2&&c.rays.every(r=>r===1||r===-1))&&
        (c.driven===undefined||typeof c.driven==='boolean')&&
        (c.expression===undefined||typeof c.expression==='string'&&c.expression.length>0&&c.expression.length<=512)&&
        Array.isArray(c.offset)&&c.offset.length===2&&c.offset.every(Number.isFinite):
        Object.hasOwn(count,c.type)&&(c.type==='coincident'&&c.origin?
          c.refs.length===1&&c.refs[0].kind==='point'&&typeof c.origin==='string'&&Array.isArray(c.target)&&
            c.target.length===2&&c.target.every(Number.isFinite):c.refs.length===count[c.type])&&
        (c.type!=='locked'||Array.isArray(c.target)&&c.target.every(Number.isFinite))&&
        (c.type!=='cornerAngle'||Number.isFinite(c.value)&&Math.abs(c.value)>0&&Math.abs(c.value)<Math.PI)&&
        (c.contact===undefined||c.type==='tangent'&&Array.isArray(c.contact)&&c.contact.length===2&&
          c.contact.every(index=>index===0||index===1)))&&residual(entities,c)!==null);
  }
  function pointChanged(entity,index,p) {
    const original=vertices(entity)[index];
    if(!original) return null;
    if(entity.p) {
      const points=entity.p.slice();
      points[entity.type==='bezier'&&index===1?3:index]=p;
      return {...entity,p:points};
    }
    if(entity.c && entity.type!=='arc'&&!(entity.type==='ellipse'&&entity.s!==undefined)) return {...entity,c:p};
    return Edit.changedVertices([entity],[[original,p]])?.get(entity.id)??null;
  }
  function coordinates(entity,slot) {
    if(slot) {
      const frame=G.slotFrame(entity,slot);
      return Object.entries(frame).map(([key,value])=>({
        value,set:(e,n)=>G.withSlotFrame(e,slot,{...G.slotFrame(e,slot),[key]:n})
      }));
    }
    const result=[];
    const points=vertices(entity);
    for(const [i,p] of (entity.type==='arc'?points.slice(0,2):points).entries()) for(let j=0;j<2;j++) result.push({
      value:p[j],set:(e,n)=>{
        const next=vertices(e)[i].slice();next[j]=n;
        return pointChanged(e,i,next);
      }
    });
    if(entity.type==='circle'||entity.type==='ellipse') {
      result.push({value:entity.r,set:(e,r)=>r>G.eps?{...e,r}:null});
      if(entity.type==='ellipse') {
        result.push({value:entity.ry,set:(e,ry)=>ry>G.eps?{...e,ry}:null},
          {value:entity.a,set:(e,a)=>({...e,a})});
      }
    }
    if(entity.type==='bezier') for(const i of [1,2]) for(let j=0;j<2;j++) result.push({
      value:entity.p[i][j],set:(e,n)=>{
        const p=e.p.map(v=>v.slice());p[i][j]=n;return {...e,p};
      }
    });
    const parts=entity.type==='path'?entity.segments:[entity];
    for(const [index,part] of parts.entries()) if(part.type==='arc') {
      const bulge=Math.tan(part.s/4);
      result.push({value:bulge,set:(e,n)=>{
        if(n*bulge<=0) return null;
        const current=e.type==='path'?e.segments[index]:e;
        const [a,b]=Edit.ends(current), [dx,dy]=G.sub(b,a);
        const arc=G.arc(a,G.add(G.mid(a,b),G.mul([dy,-dx],n/2)),b);
        if(!arc) return null;
        if(e.type!=='path') return {...e,...arc};
        const segments=e.segments.slice();
        segments[index]={...current,...arc};
        return {...e,segments};
      }});
    }
    return result;
  }
  function validGeometry(e) {
    if(!G.serial(e)) return false;
    return Edit.edges(e).every(s=>!line(s)||size(s)>G.eps);
  }
  function touches(entities,c) {
    if(c.type!=='tangent') return true;
    const [a,b]=c.refs.map(r=>resolve(entities,r));
    if(c.contact) return true;
    const onArc=(arc,p)=>{
      if(arc.type!=='arc') return true;
      if(Edit.ends(arc).some(end=>G.dist(end,p)<=tolerance*4)) return true;
      return G.mod(Math.sign(arc.s)*(G.angle(arc.c,p)-arc.a))<=Math.abs(arc.s)+1e-8;
    };
    if(line(a)||line(b)) {
      const axis=line(a)?a:b, curve=line(a)?b:a;
      const normal=displacePoint(curve.c,axis);
      if(!normal) return false;
      const p=G.sub(curve.c,normal);
      return G.dist(p,G.nearest(...axis.p,p))<=tolerance*4&&onArc(curve,p);
    }
    const distance=G.dist(a.c,b.c);
    if(distance<=tolerance) return false;
    const direction=G.mul(G.sub(b.c,a.c),1/distance);
    const p=G.add(a.c,G.mul(direction,c.internal&&a.r<b.r?-a.r:a.r));
    return onArc(a,p)&&onArc(b,p);
  }
  function solvePositiveSystem(matrix,rhs) {
    const n=rhs.length;
    // Cholesky factorization of the damped normal matrix.
    for(let i=0;i<n;i++) for(let j=0;j<=i;j++) {
      let value=matrix[i][j];
      for(let k=0;k<j;k++) value-=matrix[i][k]*matrix[j][k];
      if(i===j&&!(value>0)) return null;
      matrix[i][j]=i===j?Math.sqrt(value):value/matrix[j][j];
    }
    const result=rhs.slice();
    for(let i=0;i<n;i++) {
      for(let j=0;j<i;j++) result[i]-=matrix[i][j]*result[j];
      result[i]/=matrix[i][i];
    }
    for(let i=n-1;i>=0;i--) {
      for(let j=i+1;j<n;j++) result[i]-=matrix[j][i]*result[j];
      result[i]/=matrix[i][i];
    }
    return result;
  }

  function solveSparseNormal(rows,diagonal,rhs,damping) {
    const n=rhs.length;
    const regularizer=diagonal.map(value=>damping*Math.max(1,value));
    const dot=(a,b)=>a.reduce((sum,value,i)=>sum+value*b[i],0);
    const multiply=vector=>{
      const result=regularizer.map((value,i)=>value*vector[i]);
      for(const row of rows) {
        const product=row.reduce((sum,[i,value])=>sum+value*vector[i],0);
        for(const [i,value] of row) result[i]+=value*product;
      }
      return result;
    };
    const result=new Float64Array(n), residual=rhs.slice();
    const precondition=()=>residual.map((value,i)=>value/(diagonal[i]+regularizer[i]));
    let direction=precondition(), norm=dot(residual,direction);
    const threshold=norm*1e-18;
    // Preconditioned conjugate gradients avoid a dense matrix for long chains.
    for(let i=0;i<Math.min(n*2,600)&&norm>threshold;i++) {
      const product=multiply(direction), curvature=dot(direction,product);
      if(!(curvature>0)) break;
      const step=norm/curvature;
      for(let j=0;j<n;j++) {
        result[j]+=step*direction[j];
        residual[j]-=step*product[j];
      }
      const next=precondition(), newNorm=dot(residual,next), ratio=newNorm/norm;
      direction=next.map((value,j)=>value+ratio*direction[j]);
      norm=newNorm;
    }
    return result;
  }

  function solveTogether(items,start,constraints,fixed,slots,epsilon,maxPasses,expired) {
    let entities=new Map(start), damping=1e-5;
    const dependencies=new Map();
    for(const [index,c] of constraints.entries()) {
      for(const id of new Set(c.refs.map(ref=>ref.id))) if(!fixed.has(id)) {
        if(!dependencies.has(id)) dependencies.set(id,[]);
        dependencies.get(id).push(index);
      }
    }
    const ids=new Set(dependencies.keys());
    const evaluate=map=>constraints.map(c=>residual(map,c));
    const finite=errors=>errors.every(row=>row&&row.every(Number.isFinite));
    const energy=errors=>errors.reduce((total,row)=>total+row.reduce((sum,n)=>sum+n*n,0),0);
    const winding=new Map(items.filter(e=>ids.has(e.id)&&e.closed).map(e=>[e.id,contourWinding(e)]));
    for(let pass=0;pass<=maxPasses;pass++) {
      if(expired()) return null;
      const errors=evaluate(entities);
      if(!finite(errors)) return null;
      if(errors.every(row=>row.every(error=>Math.abs(error)<=epsilon))&&constraints.every(c=>touches(entities,c))) {
        return items.map(e=>entities.get(e.id));
      }
      if(pass===maxPasses) break;
      const variables=[];
      const indices=new Map();
      for(const id of ids) {
        const own=coordinates(entities.get(id),slots.get(id));
        indices.set(id,own.map((variable,i)=>variables.length+i));
        variables.push(...own.map(variable=>({id,...variable})));
      }
      const n=variables.length;
      if(!n) return null;
      const rows=errors.map(error=>error.map(()=>[]));
      for(const [i,variable] of variables.entries()) {
        if(expired()) return null;
        const {id,value,set}=variable, original=entities.get(id);
        const step=Math.max(1e-5,Math.abs(value)*1e-8);
        const forward=set(original,value+step);
        const trial=forward??set(original,value-step);
        if(!trial) continue;
        const signedStep=forward?step:-step;
        entities.set(id,trial);
        for(const j of dependencies.get(id)) {
          const altered=residual(entities,constraints[j]);
          if(!altered) continue;
          for(let k=0;k<altered.length;k++) {
            const derivative=(altered[k]-errors[j][k])/signedStep;
            if(Number.isFinite(derivative)&&Math.abs(derivative)>1e-10) rows[j][k].push([i,derivative]);
          }
        }
        entities.set(id,original);
      }
      const dense=n<=96, normal=dense?Array.from({length:n},()=>new Float64Array(n)):null;
      const rhs=new Float64Array(n), diagonal=new Float64Array(n);
      for(const [j,group] of rows.entries()) for(const [k,row] of group.entries()) {
        for(const [i,a] of row) {
          rhs[i]-=a*errors[j][k];
          diagonal[i]+=a*a;
          if(dense) for(const [l,b] of row) if(l<i) normal[i][l]+=a*b;
        }
      }
      const flatRows=dense?null:rows.flat();
      const previous=energy(errors);
      let improved=false;
      for(let attempt=0;attempt<9;attempt++,damping*=10) {
        const delta=dense?solvePositiveSystem(normal.map((row,i)=>{
          const copy=row.slice();
          copy[i]=diagonal[i]+damping*Math.max(1,diagonal[i]);
          return copy;
        }),rhs):solveSparseNormal(flatRows,diagonal,rhs,damping);
        if(!delta) continue;
        const candidate=new Map(entities);
        let valid=true;
        for(const [id,columns] of indices) {
          let entity=entities.get(id);
          for(const i of columns) {
            const variable=variables[i];
            if(delta[i]!==0) entity=variable.set(entity,variable.value+delta[i]);
            if(!entity) break;
          }
          const orientation=winding.get(id);
          if(!entity||!validGeometry(entity)||orientation&&contourWinding(entity)!==orientation) {valid=false;break;}
          candidate.set(id,entity);
        }
        if(!valid) continue;
        const next=evaluate(candidate);
        if(finite(next)&&energy(next)<previous) {
          entities=candidate;
          damping=Math.max(1e-12,damping/4);
          improved=true;
          break;
        }
      }
      if(!improved) break;
    }
    return null;
  }

  function solve(items,constraints,anchored=new Set(),{deadline=Infinity,maxPasses=100,epsilon=tolerance,coupled=deadline===Infinity}={}) {
    constraints=constraints.filter(isDriving);
    if(!constraints.length) return items;
    const expired=deadline===Infinity?()=>false:()=>performance.now()>=deadline;
    if(expired()) return null;
    const entities=new Map(items.map(e=>[e.id,e]));
    const slots=new Map();
    for(const id of new Set(constraints.flatMap(c=>c.refs.map(r=>r.id)))) {
      const entity=entities.get(id);
      const slot=entity&&protectedSlot(entity,constraints);
      if(slot) slots.set(id,slot);
    }
    constraints=constraints.map(c=>{
      if(!isDimension(c)) return c;
      if(c.mode==='pointDistance'||c.mode==='parallelDistance') {
        const geometry=dimensionGeometry(entities,c);
        return geometry?{...c,projectionSign:Math.sign(signedDistance(geometry.axis,geometry.point))||1}:c;
      }
      if(c.mode!=='width'&&c.mode!=='height') return c;
      const points=dimensionGeometry(entities,c);
      if(!points) return c;
      const axis=c.mode==='width'?0:1;
      return {...c,projectionSign:Math.sign(points[1][axis]-points[0][axis])||1};
    });
    const fixed=new Set([...anchored,undefined]); // An origin has coordinates but no movable entity.
    for(const c of constraints) if(c.type==='locked'&&c.refs[0].kind==='edge'&&
      entities.get(c.refs[0].id)?.type!=='poly'&&entities.get(c.refs[0].id)?.type!=='path') fixed.add(c.refs[0].id);
    if(constraints.length===1&&isPointOnTrace(constraints[0])) {
      const relation=constraints[0], edge=relation.refs.find(ref=>ref.kind==='edge');
      const vertex=relation.refs.find(ref=>ref.kind==='point');
      const support=resolve(entities,edge);
      if((line(support)||support?.type==='arc')&&vertex&&fixed.has(edge.id)&&!fixed.has(vertex.id)) {
        const position=resolve(entities,vertex);
        const entity=entities.get(vertex.id), slot=slots.get(vertex.id);
        if(position&&!slot) {
          const nearest=coincidenceProjection(support,position);
          if(nearest) {
            if(G.dist(position,nearest)<=epsilon) return items;
            const adjusted=pointChanged(entity,vertex.index,nearest);
            if(adjusted&&validGeometry(adjusted)) {
              entities.set(entity.id,adjusted);
              if(satisfied(entities,relation)) return items.map(e=>entities.get(e.id));
              entities.set(entity.id,entity);
            }
          }
        }
      }
    }
    const magnitude=v=>Math.max(...v.map(Math.abs));
    for(const c of constraints) if(c.refs.every(ref=>fixed.has(ref.id))) {
      const error=residual(entities,c);
      if(!error||magnitude(error)>epsilon||!touches(entities,c)) return null;
    }
    for(let pass=0;pass<maxPasses;pass++) {
      if(pass===8&&coupled) {
        const coupled=solveTogether(items,entities,constraints,fixed,slots,epsilon,Math.min(30,maxPasses-pass),expired);
        if(coupled) return coupled;
      }
      let complete=true;
      for(const c of constraints) {
        if(expired()) return null;
        const initial=residual(entities,c);
        if(!initial) return null;
        if(magnitude(initial)<=epsilon) continue;
        complete=false;
        for(let row=0;row<initial.length;row++) {
          const error=residual(entities,c)?.[row];
          if(!Number.isFinite(error)) return null;
          if(Math.abs(error)<=epsilon) continue;
          const gradient=[];
          for(const id of new Set(c.refs.map(ref=>ref.id))) {
            if(fixed.has(id)) continue;
            const entity=entities.get(id);
            for(const variable of coordinates(entity,slots.get(id))) {
              if(expired()) return null;
              const h=Math.max(1e-5,Math.abs(variable.value)*1e-8);
              const trial=variable.set(entity,variable.value+h);
              if(!trial) continue;
              entities.set(id,trial);
              const altered=residual(entities,c)?.[row];
              entities.set(id,entity);
              const derivative=(altered-error)/h;
              if(Number.isFinite(derivative)&&Math.abs(derivative)>1e-8) gradient.push({id,variable,derivative});
            }
          }
          const norm=gradient.reduce((sum,v)=>sum+v.derivative**2,0);
          if(norm<=1e-12) continue;
          const originals=new Map(gradient.map(({id})=>[id,entities.get(id)]));
          for(const {id,variable,derivative} of gradient) {
            if(expired()) return null;
            const next=variable.set(entities.get(id),variable.value-error*derivative/norm);
            if(!next||!validGeometry(next)) {
              for(const [key,original] of originals) entities.set(key,original);
              break;
            }
            entities.set(id,next);
          }
        }
      }
      if(complete) return constraints.every(c=>touches(entities,c))?items.map(e=>entities.get(e.id)):null;
    }
    return !expired()&&constraints.every(c=>!expired()&&residual(entities,c)?.every(error=>Math.abs(error)<=epsilon)&&touches(entities,c))?
      items.map(e=>entities.get(e.id)):null;
  }

  function solveDimension(items,constraints,dimension,anchored=new Set(),options) {
    const involved=new Set(constraints.flatMap(c=>c.refs.map(ref=>ref.id)));
    const turn=dimension.mode==='angle'?dimension.refs[1]?.id:undefined;
    const bearings=[];
    for(const item of items) {
      if(!involved.has(item.id)||item.id===turn) continue;
      const edges=referenceEdges(item);
      const requested=dimension.refs.find(ref=>ref.id===item.id&&ref.kind==='edge'&&bearingVector(edges[ref.index]));
      const index=requested?.index??edges.findIndex(bearingVector);
      if(index>=0) {
        const direction=bearingVector(edges[index]);
        bearings.push({type:'dimensionBearing',refs:[{id:item.id,kind:'edge',index}],
          target:G.mul(direction,1/Math.hypot(...direction))});
      }
    }
    const dimensionIds=new Set(dimension.refs.map(ref=>ref.id));
    const neighbors=bearings.filter(c=>!dimensionIds.has(c.refs[0].id));
    const attempt=fixed=>{
      if(bearings.length) {
        const preferred=solve(items,[...constraints,...bearings],fixed,options);
        if(preferred) return preferred;
      }
      if(neighbors.length&&neighbors.length<bearings.length) {
        const partial=solve(items,[...constraints,...neighbors],fixed,options);
        if(partial) return partial;
      }
      return solve(items,constraints,fixed,options);
    };
    return attempt(anchored)??(anchored.size?attempt(new Set()):null);
  }

  function solveArcEndpoint(items,constraints,entity,index,target,options={}) {
    const candidate=G.arcMovedEnd(entity,index,target);
    if(!candidate) return null;
    const group=connected(constraints,[entity.id]);
    if(!group.length) return items.map(e=>e.id===entity.id?candidate:e);
    const wanted={type:'locked',refs:[{id:entity.id,kind:'point',index}],target};
    const opposite=make('locked',[{id:entity.id,kind:'point',index:1-index}],items);
    const radius={type:'dimension',mode:'radius',refs:[{id:entity.id,kind:'edge',index:0}],value:entity.r};
    const withArc=arc=>items.map(e=>e.id===entity.id?arc:e);
    const hasCenterRelation=group.some(c=>c.refs.some(r=>r.id===entity.id&&r.kind==='point'&&r.index===2));
    const onCircle=hasCenterRelation?G.arcWithCenterEnd(entity,index,target):null;
    const requested=withArc(candidate);
    const oppositePoint=opposite.target, vector=G.sub(target,oppositePoint), chord=Math.hypot(...vector);
    const limited=chord>entity.r*2?G.arcMovedEnd(entity,index,G.add(oppositePoint,G.mul(vector,entity.r*2/chord))):null;
    const valid=solution=>{
      if(!solution||!preservesContourOrientation(items,solution,group)) return false;
      const arc=solution.find(e=>e.id===entity.id);
      return arc&&Math.sign(arc.s)===Math.sign(entity.s)&&Math.abs(arc.s-entity.s)<=Math.PI+G.eps;
    };
    const anchoredAttempt=[requested,[...group,wanted,opposite,radius],new Set([entity.id])];
    const attempts=[
      anchoredAttempt,
      ...(onCircle?[[withArc(onCircle),group,new Set([entity.id])]]:[]),
      [requested,[...group,wanted,opposite,radius],new Set()],
      [requested,[...group,wanted,opposite],new Set([entity.id])],
      ...(limited?[[withArc(limited),group,new Set([entity.id])]]:[]),
      [requested,[...group,opposite,radius],new Set()],
      [requested,[...group,radius],new Set()],
      [requested,group,new Set()]
    ];
    for(const [seed,relations,fixed] of attempts) {
      if(options.deadline!==undefined&&performance.now()>=options.deadline) break;
      const result=solve(seed,relations,fixed,options);
      if(valid(result)) return result;
    }
    return null;
  }

  function automatic(before,items,constraints,origins=()=>[]) {
    const old=new Map(before.map(e=>[e.id,e]));
    const output=[...constraints], seen=new Set(output.map(signature));
    const nodes=[];
    const originsByLayer=new Map();
    for(const e of items) {
      const previous=old.get(e.id), previousPoints=previous&&previous!==e?vertices(previous):[];
      for(const [index,p] of vertices(e).entries()) {
        const prior=previousPoints[index];
        nodes.push({p,ref:{id:e.id,kind:'point',index},changed:previous!==e&&(!prior||G.dist(prior,p)>G.eps)});
      }
      if(previous===e) continue;
      if(!originsByLayer.has(e.layer)) originsByLayer.set(e.layer,origins(e.layer));
      const targets=originsByLayer.get(e.layer);
      if(!targets.length) continue;
      const matched=new Set();
      for(const {p,ref} of originPoints(e)) for(const {name,target} of targets) {
        if(matched.has(name)||G.dist(p,target)>tolerance) continue;
        matched.add(name);
        const prior=previous&&resolve(old,ref);
        if(prior&&G.dist(prior,p)<=G.eps) continue;
        const c={type:'coincident',refs:[ref],origin:name,target}, id=signature(c);
        if(!seen.has(id)) {seen.add(id);output.push(c);}
      }
    }
    const buckets=new Map();
    for(const node of nodes) {
      const [x,y]=node.p.map(n=>Math.floor(n/tolerance));
      if(!buckets.has(x+'/'+y)) buckets.set(x+'/'+y,[]);
      buckets.get(x+'/'+y).push(node);
    }
    for(const node of nodes) if(node.changed) {
      const [x,y]=node.p.map(n=>Math.floor(n/tolerance));
      for(let i=-1;i<=1;i++) for(let j=-1;j<=1;j++) for(const other of buckets.get((x+i)+'/'+(y+j))??[]) {
        if(node.ref.id===other.ref.id||G.dist(node.p,other.p)>tolerance) continue;
        const c={type:'coincident',refs:[node.ref,other.ref]}, id=signature(c);
        if(!seen.has(id)) {seen.add(id);output.push(c);}
      }
    }
    return output;
  }

  function movementRelations(before,items,constraints,visible=()=>true,visibleEdge=()=>true) {
    const old=new Map(before.map(e=>[e.id,e])), current=new Map(items.map(e=>[e.id,e]));
    const output=[...constraints], seen=new Set(output.map(signature));
    const add=c=>{
      const id=signature(c);
      if(!seen.has(id)&&satisfied(current,c)) {seen.add(id);output.push(c);}
    };
    if(!items.some(e=>visible(e)&&old.get(e.id)!==e)) return output;
    const buckets=new Map(), nodes=[];
    const cell=p=>p.map(value=>Math.floor(value/tolerance));
    function node(p,ref,kind,changed,layer) {
      const key=cell(p).join('/');
      if(!buckets.has(key)) buckets.set(key,[]);
      const entry={p,ref,kind,changed,layer};
      buckets.get(key).push(entry);
      nodes.push(entry);
    }
    for(const e of items) if(visible(e)) {
      const previous=old.get(e.id), changed=previous!==e;
      const oldPoints=changed&&previous?vertices(previous):[];
      for(const [index,p] of vertices(e).entries()) {
        const prior=oldPoints[index];
        node(p,{id:e.id,kind:'point',index},'point',changed&&(!prior||G.dist(p,prior)>G.eps),e.layer);
      }
      const priorEdges=changed&&previous?referenceEdges(previous):[];
      for(const [index,edge] of referenceEdges(e).entries()) if(edge.type==='line'&&visibleEdge(e,index)) {
        const ref={id:e.id,kind:'edge',index}, previousEdge=priorEdges[index];
        const moving=changed&&(!line(previousEdge)||edge.p.some((p,i)=>G.dist(p,previousEdge.p[i])>G.eps));
        const direction=lineVector(edge);
        const oldDirection=line(previousEdge)?lineVector(previousEdge):null;
        for(const [axis,type] of ['vertical','horizontal'].entries()) {
          if(moving&&Math.abs(direction[axis])<=tolerance&&(!oldDirection||Math.abs(oldDirection[axis])>tolerance))
            add({type,refs:[ref]});
        }
        node(G.mid(...edge.p),ref,'midpoint',moving,e.layer);
        for(const p of edge.p) node(p,ref,'end',moving,e.layer);
      }
    }
    for(const a of nodes) if(a.changed) {
      const [x,y]=cell(a.p);
      for(let i=-1;i<=1;i++) for(let j=-1;j<=1;j++) for(const b of buckets.get((x+i)+'/'+(y+j))??[]) {
        if(a.layer!==b.layer||sameRef(a.ref,b.ref)||G.dist(a.p,b.p)>tolerance) continue;
        if(a.ref.id!==b.ref.id&&(
          a.kind==='midpoint'&&b.kind!=='end'||b.kind==='midpoint'&&a.kind!=='end')) {
          const c={type:'midpoint',refs:[a.ref,b.ref]};
          if(!satisfied(old,c)) add(c);
        }
        if(a.kind!=='point'&&b.kind!=='point') {
          const c={type:'perpendicular',refs:[a.ref,b.ref]};
          const prior=c.refs.map(ref=>resolve(old,ref));
          if(!prior.every(line)||!satisfied(old,c)||
            !((a.kind==='midpoint'?[G.mid(...prior[0].p)]:prior[0].p).some(p=>
              (b.kind==='midpoint'?[G.mid(...prior[1].p)]:prior[1].p).some(q=>G.dist(p,q)<=tolerance)))) add(c);
        }
      }
    }
    return output;
  }

  function connected(constraints,ids) {
    const byEntity=new Map();
    for(const c of constraints) if(isDriving(c)) for(const id of new Set(c.refs.map(r=>r.id))) {
      if(id===undefined) continue;
      if(!byEntity.has(id)) byEntity.set(id,[]);
      byEntity.get(id).push(c);
    }
    const pending=[...new Set(ids)], found=new Set(pending), result=new Set();
    for(let i=0;i<pending.length;i++) {
      for(const c of byEntity.get(pending[i])??[]) if(!result.has(c)) {
        result.add(c);
        for(const {id} of c.refs) if(!found.has(id)) {found.add(id);pending.push(id);}
      }
    }
    return constraints.filter(c=>result.has(c));
  }
  function dimensionCanDrive(items,constraints,dimension) {
    if(dimension.refs.every(r=>r.kind==='origin')) return false;
    const existing=connected(constraints,dimension.refs.map(r=>r.id));
    if(!existing.length) return true;
    if(existing.some(c=>isDimension(c)&&signature(c)===signature(dimension))) return false;
    const ids=new Set([...existing,dimension].flatMap(c=>c.refs.map(r=>r.id)));
    const group=items.filter(e=>ids.has(e.id));
    const step=Math.max(1e-4,dimension.value*.001);
    const targets=[dimension.value+step,dimension.value-step].filter(value=>dimension.mode==='angle'?value>0&&value<180:value>=0);
    return targets.some(value=>solve(group,[...existing,{...dimension,value}])!==null);
  }
  function contourWinding(entity) {
    if(!entity?.closed) return 0;
    let points=vertices(entity);
    if(points.length<3) points=G.trace(entity);
    const first=points[0];
    if(!first) return 0;
    const vectors=points.map(p=>G.sub(p,first));
    const extent=vectors.reduce((m,p)=>Math.max(m,Math.abs(p[0]),Math.abs(p[1])),0);
    if(extent<=G.eps) return 0;
    const area=vectors.slice(1).reduce((sum,p,i)=>sum+G.cross(vectors[i],p),0)/(extent*extent);
    return Math.abs(area)>1e-12?Math.sign(area):0;
  }
  function contactDirection(items,relation) {
    const directions=relation.refs.map((ref,i)=>{
      const part=resolve(items,ref);
      if(!part) return null;
      const vector=G.traceDerivative(part,relation.contact[i]), length=Math.hypot(...vector);
      return length>G.eps?G.mul(vector,1/length):null;
    });
    return directions.every(Boolean)?G.dot(...directions):null;
  }

  function preservesContourOrientation(before,after,constraints) {
    const constrained=new Set(constraints.flatMap(c=>c.refs.map(r=>r.id)));
    const old=new Map(before.filter(e=>constrained.has(e.id)).map(e=>[e.id,e]));
    const next=new Map(after.filter(e=>constrained.has(e.id)).map(e=>[e.id,e]));
    for(const relation of constraints) {
      if(relation.type!=='tangent'||!relation.contact||
        relation.refs.every(ref=>old.get(ref.id)===next.get(ref.id))) continue;
      const original=contactDirection(old,relation);
      if(original===null||Math.abs(original)<.95) continue;
      const proposed=contactDirection(next,relation);
      if(proposed===null||original*proposed<=0) return false;
    }
    const originals=new Map(before.filter(e=>e.closed&&constrained.has(e.id)).map(e=>[e.id,e]));
    for(const e of after) {
      const original=originals.get(e.id);
      if(!original||original===e) continue;
      const winding=contourWinding(original);
      if(winding&&contourWinding(e)!==winding) return false;
    }
    return true;
  }
  function mapReference(old,current,ids,ref) {
    if(!ids.has(ref.id)) return ref;
    const near=(a,b)=>G.dist(a,b)<=tolerance;
      const value=resolve(old,ref);
      if(!value) return null;
      const targets=[ids.get(ref.id)].flat();
      let mapped=null;
      for(const id of targets) {
        const entity=current.get(id);
        if(!entity) continue;
        const isTheoretical=ref.kind==='point'&&theoreticalReferences(old.get(ref.id)).some(p=>p.index===ref.index);
        const sourceSegment=isMidpointRef(ref)?part(old.get(ref.id),ref.index-midpointIndex):null;
        const midpointEdge=sourceSegment?referenceEdges(entity).findIndex(p=>{
          if(p.type!==sourceSegment.type||!near(G.traceAt(p,.5),value)) return false;
          const [a,b]=Edit.ends(p), [u,v]=Edit.ends(sourceSegment);
          return near(a,u)&&near(b,v)||near(a,v)&&near(b,u);
        }): -1;
        const index=isMidpointRef(ref)?(midpointEdge<0?-1:midpointIndex+midpointEdge):ref.kind==='point'?(isTheoretical?
          theoreticalReferences(entity).find(p=>near(p.q,value))?.index??-1:
          vertices(entity).findIndex(p=>near(p,value))):
          entity.type==='ellipse'&&entity.s===undefined&&value.type==='ellipse'&&value.s===undefined&&near(entity.c,value.c)&&
            Math.abs(entity.r-value.r)<=tolerance&&Math.abs(entity.ry-value.ry)<=tolerance?0:
          round(entity)&&round(value)&&entity.type===value.type&&near(entity.c,value.c)&&Math.abs(entity.r-value.r)<=tolerance?0:
          referenceEdges(entity).findIndex(p=>p.type===value.type&&(
            near(Edit.ends(p)[0],Edit.ends(value)[0])&&near(Edit.ends(p)[1],Edit.ends(value)[1])||
            near(Edit.ends(p)[1],Edit.ends(value)[0])&&near(Edit.ends(p)[0],Edit.ends(value)[1])));
        if(index>=0) {mapped={...ref,id,index};break;}
      }
      return mapped;
  }
  function solveResize(items,constraints,targets) {
    const original=new Map(items.map(e=>[e.id,e]));
    const preserves=solved=>solved&&preservesContourOrientation(items,solved,constraints)&&
      solved.every(validGeometry);
    const tangentChain=constraints.filter(c=>c.type==='tangent'&&c.contact).length>=2;
    const options=tangentChain?{deadline:performance.now()+5500,coupled:true}:undefined;
    const solveStep=(seed,relations,dimensions)=>{
      if(dimensions.length!==1) return solve(seed,relations,new Set(),options);
      const [dimension]=dimensions;
      const anchored=new Set(dimension.mode==='pointDistance'?dimension.refs.filter(r=>r.kind==='edge').map(r=>r.id):
        dimension.refs.slice(0,-1).map(r=>r.id).filter(id=>id!==dimension.refs.at(-1).id));
      return solveDimension(seed,relations,dimension,anchored,options);
    };
    const startValues=targets.map(c=>dimensionValue(original,c)??c.value);
    const change=Math.max(...targets.map((c,i)=>Math.abs(c.value-startValues[i])/Math.max(1,Math.abs(startValues[i]))));
    if(!tangentChain||change<=.35) {
      const direct=solveStep(items,constraints,targets);
      if(preserves(direct)) return direct;
      if(!tangentChain) return null;
    }
    const indices=new Map(targets.map((target,i)=>[target,i]));
    const initialStep=1/Math.max(2,Math.min(12,Math.ceil(change/.2)));
    let step=initialStep, progress=0, result=items;
    for(let attempt=0;attempt<24&&performance.now()<options.deadline;attempt++) {
      const fraction=Math.min(1,progress+step);
      const stage=targets.map((c,i)=>fraction===1?c:{...c,value:startValues[i]+(c.value-startValues[i])*fraction});
      const relations=constraints.map(c=>indices.has(c)?stage[indices.get(c)]:c);
      const solved=solveStep(result,relations,stage);
      if(!preserves(solved)||!preservesContourOrientation(result,solved,relations)) {
        step/=2;
        if(step<initialStep/16) return null;
        continue;
      }
      if(fraction===1) return solved;
      result=solved;progress=fraction;
      step=Math.min(initialStep,step*1.5);
    }
    return null;
  }
  function remapReference(before,after,ids,ref) {
    return mapReference(new Map(before.map(e=>[e.id,e])),new Map(after.map(e=>[e.id,e])),ids,ref);
  }
  function remap(before,after,constraints,ids) {
    const old=before instanceof Map?before:new Map(before.map(e=>[e.id,e]));
    const current=after instanceof Map?after:new Map(after.map(e=>[e.id,e]));
    const near=(a,b)=>G.dist(a,b)<=tolerance;
    const result=[];
    for(const c of constraints) {
      const refs=[];
      for(const ref of c.refs) {
        const mapped=mapReference(old,current,ids,ref);
        if(!mapped) return null;
        refs.push(mapped);
      }
      if(c.type==='coincident'&&!c.origin&&sameRef(...refs)) continue;
      if(c.type==='locked'&&ids.has(c.refs[0].id)) result.push({...c,refs,target:lockedValues(resolve(current,refs[0]))});
      else if(c.contact) {
        const contact=c.contact.map((index,i)=>{
          const p=Edit.ends(resolve(old,c.refs[i]))[index];
          return Edit.ends(resolve(current,refs[i])).findIndex(q=>near(p,q));
        });
        if(contact.includes(-1)) return null;
        result.push({...c,refs,contact});
      }
      else if(isDimension(c)&&c.mode==='angle') {
        const rays=c.rays.map((ray,i)=>G.dot(lineVector(resolve(old,c.refs[i])),lineVector(resolve(current,refs[i])))<0?-ray:ray);
        result.push({...c,refs,rays});
      } else result.push({...c,refs});
    }
    return result;
  }
  function closeTraces(before,items,pairs,previousConstraints,identify) {
    const {entities:joined,adjusted,remap:mergedIds,closed,attachments,junctions}=Edit.closeConnections(items,pairs,identify);
    if(!mergedIds.size&&!closed.size&&!attachments.length) return null;
    const ids=new Set(items.map(e=>e.id));
    const byId=new Map(adjusted.map(e=>[e.id,e]));
    const base=before.map(e=>byId.get(e.id)??e).concat(attachments.map(({connector})=>connector));
    const replacements=new Map(joined.map(e=>[e.id,e]));
    const entities=before.flatMap(e=>ids.has(e.id)?replacements.has(e.id)?[replacements.get(e.id)]:[]:[e])
      .concat(joined.filter(e=>!ids.has(e.id)));
    if(joined.some(e=>!G.serial(e))) throw Error('La fermeture produirait une géométrie invalide.');
    const adjustedById=new Map(base.map(e=>[e.id,e]));
    const after=new Map(entities.map(e=>[e.id,e])), lost=[], constraints=[];
    const affected=new Set(before.filter(e=>after.get(e.id)!==e).map(e=>e.id));
    for(const c of previousConstraints) {
      if(!c.refs.some(ref=>affected.has(ref.id))) {constraints.push(c);continue;}
      const mapped=c.refs.some(ref=>closed.has(ref.id))||!satisfied(adjustedById,c)?null:
        remap(base,entities,[c],mergedIds);
      if(mapped&&mapped.every(relation=>satisfied(after,relation))) constraints.push(...mapped);
      else lost.push(c);
    }
    for(const {connector,refs} of attachments) {
      if(connector.type!=='arc') continue;
      const arc=remapReference(base,entities,mergedIds,{id:connector.id,kind:'edge',index:0});
      const supports=refs.map(ref=>remapReference(base,entities,mergedIds,ref));
      const tangencies=arc&&supports.every(Boolean)?supports.map(ref=>make('tangent',[ref,arc],entities)):null;
      if(!tangencies?.every(c=>c?.contact&&satisfied(after,c))) {
        throw Error('La fermeture tangente ne peut pas être validée pour cette sélection.');
      }
      constraints.push(...tangencies,{type:'dimension',mode:'radius',refs:[arc],value:connector.r,
        offset:G.sub(G.traceAt(connector,.5),connector.c),layer:connector.layer});
    }
    return {entities,joined,constraints,lost,junctions};
  }
  return {closeTraces,names,count,dimensionNames,isDimension,isDriving,dimensionGeometry,dimensionValue,dimensionCanDrive,linearDimensionMode,
    segmentPairMode,angleLayout,angleRays,key,sameRef,vertices,referencePoints,theoreticalReferences,midpointRef,isMidpointRef,hasMidpoint,originPoints,part,referenceEdges,resolve,accepts,radialReference,isPointOnTrace,coincidenceProjection,make,equalSelection,satisfied,signature,shapeConstraints,slotConstraints,slotCenterline,protectedSlot,valid,solve,solveDimension,solveResize,solveArcEndpoint,automatic,movementRelations,connected,preservesContourOrientation,remap,remapReference};
};
const Formal=createFormal(typeof module==='undefined'?G:require('./geometry.js'),typeof module==='undefined'?Edit:require('./editing.js'));
if(typeof module!=='undefined') module.exports=Formal;


