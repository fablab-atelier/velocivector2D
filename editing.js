'use strict';
const createEdit=()=>{
  const g=typeof module==='undefined'?G:require('./geometry.js');
  const angles=[0,90,15,22.5,30,45,60];
  const divisions=[2,3,4,6,8,12,24];
  const orientations=division=>Array.from({length:division},(_,i)=>i*(360/division));
  const degrees=value=>typeof value==='number'?value:value?.degrees;
  const bearing=part=>{
    const angle=g.mod(g.angle(...part.p))*180/Math.PI;
    return angle>360-1e-9?0:angle;
  };
  const axis=degrees=>g.polar([0,0],1,degrees*Math.PI/180);
  const same=(a,b)=>g.dist(a,b)<=g.eps;
  const ends=e=>e.p?[e.p[0],e.p.at(-1)]:e.type==='ellipse'?[g.controls(e,e.t),g.controls(e,e.t+e.s)]:
    [g.polar(e.c,e.r,e.a),g.polar(e.c,e.r,e.a+e.s)];

  function edges(e) {
    if(['line','arc','bezier'].includes(e.type)||e.type==='ellipse'&&e.s!==undefined) return [e];
    if(e.type==='path') return e.segments;
    if(e.type!=='poly') return [];
    return e.p.slice(0,e.closed?e.p.length:-1).map((a,i)=>({type:'line',p:[a,e.p[(i+1)%e.p.length]]}));
  }

  function filletLines(first,second,radius,allowExactTrim=false) {
    if(first.part.type!=='line'||second.part.type!=='line'||!(radius>g.eps)) return null;
    const vertex=first.part.p[first.end], other=second.part.p[second.end];
    if(g.dist(vertex,other)>g.eps*8) return null;
    const vectors=[first,second].map(({part,end})=>g.sub(part.p[1-end],vertex));
    const lengths=vectors.map(vector=>Math.hypot(...vector));
    if(lengths.some(length=>length<=g.eps)) return null;
    const [u,v]=vectors.map((vector,i)=>g.mul(vector,1/lengths[i]));
    const angle=Math.atan2(Math.abs(g.cross(u,v)),g.dot(u,v)), half=angle/2;
    if(angle<=1e-8||Math.PI-angle<=1e-8) return null;
    const setback=radius/Math.tan(half);
    const limit=g.eps*8;
    if(lengths.some(length=>allowExactTrim?setback>length+limit:setback>=length-limit)) return null;
    const [a,b]=[u,v].map(direction=>g.add(vertex,g.mul(direction,setback)));
    const bisector=g.add(u,v);
    const center=g.add(vertex,g.mul(bisector,radius/(Math.hypot(...bisector)*Math.sin(half))));
    const start=g.angle(center,a), sweep=Math.atan2(g.cross(g.sub(a,center),g.sub(b,center)),g.dot(g.sub(a,center),g.sub(b,center)));
    const arc={type:'arc',c:center,r:radius,a:start,s:sweep};
    const lines=[first,second].map(({part,end},i)=>lengths[i]-setback<=limit?null:
      {...part,p:part.p.map((p,index)=>index===end?[a,b][i]:p)});
    return {arc,lines,points:[a,b]};
  }

  function contour(e) {
    if(e.closed) return null;
    const parts=e.type==='spline'?g.splineSpans(e):edges(e);
    return parts.length?{parts,points:[ends(parts[0])[0],ends(parts.at(-1))[1]]}:null;
  }
  function isClosed(entity) {
    return entity.closed===true||entity.type==='circle'||entity.type==='ellipse'&&entity.s===undefined||
      ['arc','ellipse'].includes(entity.type)&&Math.abs(entity.s)>=g.tau-g.eps;
  }
  function closurePairs(entities,maximum,method='contact') {
    const endpoints=entities.filter(e=>!isClosed(e)).flatMap(entity=>{
      const trace=contour(entity);
      return (trace?.points??[]).map((q,end)=>{
        const index=end?trace.parts.length-1:0;
        return {entity,q,end,index,part:trace.parts[index]};
      });
    });
    const step=maximum+g.eps, bucket=q=>q.map(v=>Math.floor(v/step));
    const grid=new Map();
    for(const endpoint of endpoints) {
      const key=bucket(endpoint.q).join(',');
      if(!grid.has(key)) grid.set(key,[]);
      grid.get(key).push(endpoint);
    }
    function nearby(q) {
      const [x,y]=bucket(q), result=[];
      for(let dx=-1;dx<=1;dx++) for(let dy=-1;dy<=1;dy++) result.push(...grid.get((x+dx)+','+(y+dy))??[]);
      return result;
    }
    const pairs=[];
    const seen=new Set();
    for(const a of endpoints) {
      seen.add(a);
      for(const b of nearby(a.q)) {
        if(a===b||!seen.has(b)||a.entity.layer!==b.entity.layer||a.entity.vectorGroup!==b.entity.vectorGroup) continue;
        if(a.entity===b.entity&&a.entity.type==='line') continue;
        const gap=g.dist(a.q,b.q);
        if(gap<=maximum+g.eps) pairs.push({a,b,gap,target:g.mid(a.q,b.q)});
      }
    }
    pairs.sort((a,b)=>a.gap-b.gap);
    const used=new Set(), result=[];
    for(const pair of pairs) {
      if(used.has(pair.a)||used.has(pair.b)) continue;
      const proposal=closureJunction(pair,maximum,method);
      if(!proposal) continue;
      const junctions=proposal.connector?ends(proposal.connector):[proposal.target];
      if(junctions.some(q=>nearby(q).some(c=>c!==pair.a&&c!==pair.b&&c.entity.layer===pair.a.entity.layer&&same(c.q,q)))) continue;
      used.add(pair.a);used.add(pair.b);result.push(proposal);
    }
    return result;
  }
  function section(part,from,to) {
    if(to-from<=g.eps) return null;
    if(from===0&&to===1) return part;
    const p=g.traceAt(part,from), q=g.traceAt(part,to);
    if(part.type==='line') return g.dist(p,q)>g.eps?{...part,p:[p,q]}:null;
    if(part.type==='bezier') {
      const scale=(to-from)/3;
      return {...part,p:[p,g.add(p,g.mul(g.traceDerivative(part,from),scale)),
        g.sub(q,g.mul(g.traceDerivative(part,to),scale)),q]};
    }
    const key=part.type==='arc'?'a':'t', s=part.s*(to-from);
    if(Math.abs(s)>g.tau+g.eps||Math.abs(s)<=g.eps) return null;
    return {...part,[key]:part[key]+part.s*from,s:Math.sign(s)*Math.min(g.tau,Math.abs(s))};
  }
  function closureJunction(pair,maximum,method) {
    const {a,b}=pair;
    const start=[a.end,b.end];
    if(method==='segment'||pair.gap<=g.eps&&method==='contact')
      return {...pair,parameters:start,connector:pair.gap>g.eps?{type:'line',p:[a.q,b.q]}:null};
    if(method==='contact'&&a.entity===b.entity&&a.index===b.index&&
      ['arc','ellipse'].includes(a.part.type)&&Math.abs(a.part.s)>Math.PI) {
      // Complete a nearly full turn without altering its center or axes.
      const extension=(g.tau/Math.abs(a.part.s)-1)/2;
      const parameters=start.map(t=>t+(t?extension:-extension));
      return {...pair,parameters,target:g.traceAt(a.part,parameters[0])};
    }
    const endpoints=[a,b], speeds=endpoints.map(({part,end})=>Math.hypot(...g.traceDerivative(part,end)));
    if(speeds.some(speed=>speed<=g.eps)) return null;
    const limits=endpoints.map(({end},i)=>{
      const span=4*maximum/speeds[i]+1e-9;
      return [Math.max(end-span,end?g.eps:-Infinity),Math.min(end+span,end?Infinity:1-g.eps)];
    });
    const bound=(t,i)=>Math.max(limits[i][0],Math.min(limits[i][1],t));
    const evaluate=t=>endpoints.map(({part},i)=>g.traceAt(part,t[i]));
    const fits=(t,points)=>points.every((p,i)=>g.dist(p,endpoints[i].q)<=maximum+g.eps&&
      section(endpoints[i].part,endpoints[i].end?0:t[i],endpoints[i].end?t[i]:1));
    if(method==='contact'&&a.part.type==='line'&&b.part.type==='line') {
      const u=g.traceDerivative(a.part,a.end), v=g.traceDerivative(b.part,b.end);
      const delta=g.sub(b.q,a.q), cross=g.cross(u,v);
      if(Math.abs(cross)<=g.eps*speeds[0]*speeds[1]) {
        if(Math.abs(g.cross(delta,u))/speeds[0]>g.eps) return null;
        const t=start.map((value,i)=>value+g.dot(g.sub(pair.target,endpoints[i].q),i?v:u)/speeds[i]**2);
        return fits(t,evaluate(t))?{...pair,parameters:t}:null;
      }
      const t=[a.end+g.cross(delta,v)/cross,b.end+g.cross(delta,u)/cross], points=evaluate(t);
      return fits(t,points)&&same(...points)?{...pair,parameters:t,target:g.mid(...points)}:null;
    }
    if(method==='contact'&&a.part.type==='arc'&&b.part.type==='arc'&&
      same(a.part.c,b.part.c)&&Math.abs(a.part.r-b.part.r)<=g.eps&&!same(a.part.c,pair.target)) {
      const bearing=g.angle(a.part.c,pair.target);
      const t=endpoints.map(({part,end})=>{
        const delta=g.mod(bearing-part.a-part.s*end+Math.PI)-Math.PI;
        return end+delta/part.s;
      });
      const points=evaluate(t);
      if(fits(t,points)&&same(...points)) return {...pair,parameters:t,target:g.mid(...points)};
    }
    const unit=v=>g.mul(v,1/Math.hypot(...v));
    const fillet=(t,points)=>{
      const [u,v]=endpoints.map(({part,end},i)=>unit(g.mul(g.traceDerivative(part,t[i]),(i===0?end:!end)?1:-1)));
      const normals=[-u[1],u[0]], difference=g.sub(normals,[-v[1],v[0]]);
      return {normals,difference,chord:g.sub(points[1],points[0])};
    };
    const error=t=>{
      const points=evaluate(t), {chord,difference}=fillet(t,points);
      return g.cross(chord,difference);
    };
    const inset=start.map((t,i)=>bound(t+(t?-1:1)*maximum*.35/speeds[i],i));
    const seeds=[start,[inset[0],start[1]],[start[0],inset[1]],inset];
    let best=null, cost=Infinity;
    for(const seed of seeds) {
      let t=seed;
      for(let i=0;i<36;i++) {
        const points=evaluate(t);
        if(method==='contact') {
          const gap=g.sub(points[1],points[0]);
          if(same(...points)) {
            if(fits(t,points)) {
              const travel=points.reduce((sum,p,j)=>sum+g.dist(p,endpoints[j].q),0);
              if(travel<cost) {cost=travel;best={...pair,parameters:t,target:g.mid(...points)};}
            }
            break;
          }
          const [u,v]=endpoints.map(({part},j)=>g.traceDerivative(part,t[j]));
          const det=g.cross(u,v);
          if(Math.abs(det)<=1e-12*Math.hypot(...u)*Math.hypot(...v)) break;
          t=[bound(t[0]+g.cross(gap,v)/det,0),bound(t[1]+g.cross(gap,u)/det,1)];
        } else {
          const {normals,difference,chord}=fillet(t,points), squared=g.dot(difference,difference);
          const residual=g.cross(chord,difference);
          if(Math.abs(residual)<=g.eps*.1&&squared>1e-12&&Math.hypot(...chord)>g.eps) {
            const radius=g.dot(chord,difference)/squared, center=g.add(points[0],g.mul(normals,radius));
            const first=g.angle(center,points[0]), last=g.angle(center,points[1]), sign=Math.sign(radius);
            const sweep=sign*g.mod(sign*(last-first));
            const connector={type:'arc',c:center,r:Math.abs(radius),a:first,s:sweep};
            if(fits(t,points)&&g.serial(connector)&&Math.abs(sweep)<=Math.PI+g.eps&&same(ends(connector)[1],points[1])) {
              const travel=points.reduce((sum,p,j)=>sum+g.dist(p,endpoints[j].q),0);
              if(travel<cost) {cost=travel;best={...pair,parameters:t,connector,target:g.traceAt(connector,.5)};}
            }
            break;
          }
          const gradient=t.map((value,j)=>{
            const next=t.slice(), h=1e-6;
            next[j]+=h;
            return (error(next)-residual)/(h*speeds[j]);
          });
          const norm=g.dot(gradient,gradient);
          if(!(norm>1e-18)) break;
          t=t.map((value,j)=>bound(value-residual*gradient[j]/(norm*speeds[j]),j));
        }
      }
    }
    return best;
  }
  function closeConnections(entities,pairs,identify) {
    const ranges=new Map(), modified=new Set(), closed=new Set(), connectors=[], attachments=[];
    let junctions=0;
    for(const {a,b,parameters,connector} of pairs) {
      const pending=new Map();
      for(const [i,end] of [a,b].entries()) {
        const key=end.entity.id+'/'+end.index;
        const range=(pending.get(key)?.range??ranges.get(key)?.range??[0,1]).slice();
        range[end.end]=parameters[i];
        pending.set(key,{end,range});
      }
      if([...pending.values()].some(({end,range})=>!section(end.part,...range))) continue;
      junctions++;
      for(const [key,range] of pending) ranges.set(key,range);
      modified.add(a.entity.id);modified.add(b.entity.id);
      if(connector) {
        const styled=g.withConstruction(connector,g.constructionAt(a.entity,a.index)===g.constructionAt(b.entity,b.index)?
          g.constructionAt(a.entity,a.index):null);
        const entity=identify({...styled,layer:a.entity.layer,
          ...(a.entity.vectorGroup?{vectorGroup:a.entity.vectorGroup}:{})});
        connectors.push(entity);
        attachments.push({connector:entity,refs:[a,b].map(end=>({id:end.entity.id,kind:'edge',index:end.index}))});
      }
    }
    const adjusted=entities.map(entity=>{
      if(!modified.has(entity.id)) return entity;
      const parts=contour(entity).parts;
      const updated=parts.map((part,index)=>{
        const range=ranges.get(entity.id+'/'+index)?.range;
        return range?section(part,...range):part;
      });
      if(updated.every((part,index)=>part===parts[index])) return entity;
      if(entity.type==='poly') return {...entity,p:[ends(updated[0])[0],...updated.map(part=>ends(part)[1])]};
      if(entity.type==='path') return {...entity,segments:updated};
      if(entity.type==='spline') {
        const {p,tension,handles,...rest}=entity;
        return {...rest,type:'path',segments:updated};
      }
      if(isClosed(updated[0])) {
        const {s,t,...rest}=updated[0];
        if(entity.type==='arc') delete rest.a;
        closed.add(entity.id);
        return {...rest,type:entity.type==='arc'?'circle':'ellipse'};
      }
      return updated[0];
    }).concat(connectors);
    const joined=joinContours(adjusted,[...modified].filter(id=>!closed.has(id)));
    return {...joined,adjusted,closed,attachments,junctions};
  }

  function joinContours(entities,changed) {
    const active=new Map(entities.map(e=>[e.id,e]));
    const remap=new Map();
    const cache=new WeakMap();
    function view(e) {
      if(!cache.has(e)) cache.set(e,contour(e));
      return cache.get(e);
    }
    function candidates(entity,point) {
      const matches=[];
      for(const other of active.values()) {
        if(other===entity||other.layer!==entity.layer||other.vectorGroup!==entity.vectorGroup) continue;
        const info=view(other);
        if(!info) continue;
        info.points.forEach((p,end)=>{if(same(p,point)) matches.push({other,end,p});});
      }
      return matches;
    }
    function merged(entity,first,second,closed) {
      const segments=[], constructionParts={};
      for(const source of [first,second].filter(Boolean)) {
        const parts=view(source).parts;
        for(const [i,{type,p,c,r,ry,a,t,s}] of parts.entries()) {
          const style=g.constructionAt(source,i);
          if(style) constructionParts[segments.length]=style;
          segments.push(type==='ellipse'?{type,c,r,ry,a,t,s}:type==='arc'?{type,c,r,a,s}:{type,p});
        }
      }
      const result={type:'path',id:entity.id,layer:entity.layer,segments,closed};
      if(entity.vectorGroup) result.vectorGroup=entity.vectorGroup;
      if(Object.keys(constructionParts).length) result.constructionParts=constructionParts;
      return result;
    }
    for(const id of changed) {
      let entity=active.get(id), info=entity&&view(entity);
      while(info) {
        if(same(...info.points) && info.parts.some(part=>part.type!=='line'||info.parts.length>1)) {
          active.set(id,merged(entity,entity,null,true));
          remap.set(id,id);
          break;
        }
        const link=info.points.map((point,end)=>({end,matches:candidates(entity,point)}))
          .find(({matches})=>matches.length===1 && candidates(matches[0].other,matches[0].p).length===1);
        if(!link) break;
        const [{other,end}]=link.matches;
        const first=link.end===1?entity:g.reverse(entity), second=end===0?other:g.reverse(other);
        entity=merged(entity,first,second,false);
        active.set(id,entity);
        active.delete(other.id);
        remap.set(id,id);
        remap.set(other.id,id);
        for(const [original,current] of remap) if(current===other.id) remap.set(original,id);
        info=view(entity);
      }
    }
    return {entities:[...active.values()],remap};
  }

  function removeSegments(entity,removed) {
    const parts=g.strokeParts(entity);
    const removedIndex=parts.findIndex((_,i)=>removed.has(i));
    if(removedIndex<0) return [entity];
    const first=entity.closed?removedIndex+1:0;
    const runs=[];
    let run=null;
    for(let offset=0;offset<parts.length;offset++) {
      const index=(first+offset)%parts.length;
      if(removed.has(index)) {run=null;continue;}
      if(!run) {run=[];runs.push(run);}
      run.push(index);
    }
    return runs.map(indices=>{
      const segments=indices.map(i=>parts[i]);
      let result=segments.length===1?{...segments[0]}:
        entity.type==='poly'?{type:'poly',closed:false,p:[segments[0].p[0],...segments.map(s=>s.p[1])]}:
          {type:'path',closed:false,segments};
      for(const [index,original] of indices.entries()) {
        const style=g.constructionAt(entity,original);
        if(style) result=g.withConstruction(result,style,segments.length===1?undefined:index);
      }
      return result;
    });
  }
  function crossingParts(entity,lo,hi,scale,showConstruction=true) {
    const parts=g.strokeParts(entity);
    const inside=p=>p.every((v,i)=>v>=lo[i]&&v<=hi[i]);
    const crosses=(p,q)=>{
      if(inside(p)||inside(q)) return true;
      for(let i=0;i<2;i++) for(const edge of [lo[i],hi[i]]) {
        const t=(edge-p[i])/(q[i]-p[i]), value=p[1-i]+t*(q[1-i]-p[1-i]);
        if(t>=0&&t<=1&&value>=lo[1-i]&&value<=hi[1-i]) return true;
      }
      return false;
    };
    return (parts.length?parts:[entity]).flatMap((part,index)=>{
      if(!showConstruction&&g.constructionAt(entity,index)) return [];
      const trace=g.trace(part,scale);
      return (trace.length===1?inside(trace[0]):trace.slice(1).some((p,i)=>crosses(trace[i],p)))?[index]:[];
    });
  }
  function selectedRuns(entity,indices) {
    if(!indices) return [entity];
    const omitted=new Set(g.strokeParts(entity).flatMap((_,index)=>indices.has(index)?[]:[index]));
    return removeSegments(entity,omitted).map(part=>({...part,id:entity.id,layer:entity.layer}));
  }
  function transformParts(entity,indices,mapPart) {
    const parts=g.strokeParts(entity);
    const mapped=new Map([...indices].map(i=>[i,mapPart(parts[i])]));
    if([...mapped.values()].some(part=>!part)) return null;
    const moves=[...mapped].flatMap(([i,part])=>ends(parts[i]).map((p,j)=>[p,ends(part)[j]]));
    let source=entity;
    if(entity.type==='spline') {
      const {p,tension,handles,...rest}=entity;
      source={...rest,type:'path',segments:parts};
    }
    const changed=changedVertices([source],moves);
    if(!changed) return null;
    const result=changed.get(source.id)??source;
    if(result.type!=='path') return result;
    return {...result,segments:result.segments.map((part,i)=>mapped.get(i)??part)};
  }

  function splitStroke(part,t) {
    const q=g.traceAt(part,t);
    if(part.type==='line') return [{...part,p:[part.p[0],q]},{...part,p:[q,part.p[1]]}];
    if(part.type==='bezier') {
      const lerp=(a,b)=>g.add(a,g.mul(g.sub(b,a),t));
      const [a,b,c,d]=part.p, u=lerp(a,b),v=lerp(b,c),w=lerp(c,d);
      return [{...part,p:[a,u,lerp(u,v),q]},{...part,p:[q,lerp(v,w),w,d]}];
    }
    const key=part.type==='arc'||part.type==='circle'?'a':'t';
    const start=part[key]??0, sweep=part.s??(part.reversed?-g.tau:g.tau), type=part.type==='circle'?'arc':part.type;
    return [{...part,type,[key]:start,s:sweep*t},{...part,type,[key]:start+sweep*t,s:sweep*(1-t)}];
  }
  function trimInterval(part,from,to) {
    if(from===0&&to===1) return part;
    const full=part.s===undefined&&['circle','ellipse'].includes(part.type);
    if(full) {
      const sweep=part.reversed?-g.tau:g.tau, key=part.type==='circle'?'a':'t';
      return {...part,type:part.type==='circle'?'arc':part.type,[key]:(part[key]??0)+sweep*from,s:sweep*(to-from)};
    }
    const left=to<1?splitStroke(part,to)[0]:part;
    return from>0?splitStroke(left,from/to)[1]:left;
  }

  function trimContours(entity,cuts) {
    const parts=g.strokeParts(entity), standalone=!parts.length;
    if(standalone) parts.push(entity);
    const cyclic=standalone&&parts[0].s===undefined&&['circle','ellipse'].includes(parts[0].type);
    const ranges=new Map();
    for(const {index,from,to} of cuts) {
      if(to-from<=1e-8) continue;
      if(!ranges.has(index)) ranges.set(index,[]);
      const intervals=ranges.get(index);
      if(cyclic&&to-from>=1-1e-8) intervals.push([0,1]);
      else if(cyclic&&from<0) intervals.push([0,to],[from+1,1]);
      else if(cyclic&&to>1) intervals.push([from,1],[0,to-1]);
      else intervals.push([from,to]);
    }
    const runs=[];
    let run=null, starts=false, endsAtSeam=false;
    for(const [index,part] of parts.entries()) {
      const intervals=(ranges.get(index)??[]).sort((a,b)=>a[0]-b[0]);
      let cursor=0;
      const keep=(from,to)=>{
        if(to-from<=1e-8) return;
        if(!run) {run=[];runs.push(run);}
        run.push({part:trimInterval(part,from,to),style:g.constructionAt(entity,standalone?undefined:index),from,to});
        if(index===0&&from===0) starts=true;
        if(index===parts.length-1&&to===1) endsAtSeam=true;
      };
      for(const [from,to] of intervals) {
        keep(cursor,from);
        cursor=Math.max(cursor,to);
        run=null;
      }
      keep(cursor,1);
    }
    if((entity.closed||cyclic)&&starts&&endsAtSeam&&runs.length>1) {
      const last=runs.pop();
      if(cyclic) {
        const first=runs[0][0], tail=last[0];
        runs[0]=[{...tail,part:trimInterval(parts[0],tail.from,1+first.to)}];
      } else runs[0].unshift(...last);
    }
    return runs.map(run=>{
      let result=run.length===1?{...run[0].part}:{type:'path',segments:run.map(e=>e.part),closed:false};
      run.forEach(({style},i)=>{
        if(style) result=g.withConstruction(result,style,result.type==='path'?i:undefined);
      });
      return result;
    });
  }

  function trimBounds(position,intersections,cyclic) {
    const stops=[...new Set(intersections)].sort((a,b)=>a-b);
    if(cyclic&&!stops.length) return [0,1];
    const before=stops.findLast(t=>t<=position), after=stops.find(t=>t>position);
    return [before??(cyclic?stops.at(-1)-1:0),after??(cyclic?stops[0]+1:1)];
  }
  function trimAlong(parts,index,t,closed,stops,visible) {
    const count=parts.length;
    const at=i=>((i%count)+count)%count;
    function limit(direction) {
      let last={position:index+t};
      for(let step=0;step<=count;step++) {
        const i=index+direction*step, part=at(i);
        if((!closed&&(i<0||i>=count))||!visible(part)) break;
        const cursor=step?(direction<0?1:0):t;
        const candidates=stops(part);
        const stop=direction<0?candidates.findLast(item=>item.t<=cursor):
          candidates.find(item=>step?item.t>=cursor:item.t>cursor);
        if(stop) return {position:i+stop.t,ref:stop.ref};
        last={position:i+(direction<0?0:1)};
      }
      return last;
    }
    let lo=limit(-1), hi=limit(1);
    if(closed&&hi.position-lo.position>count) {
      lo={position:0};hi={position:count};
    }
    const cuts=[];
    for(let i=Math.floor(lo.position);i<hi.position;i++) {
      const from=Math.max(0,lo.position-i), to=Math.min(1,hi.position-i);
      if(to-from>1e-8) cuts.push({index:at(i),from,to,part:parts[at(i)]});
    }
    const bounds=cuts.length?[{q:g.traceAt(cuts[0].part,cuts[0].from),ref:lo.ref},
      {q:g.traceAt(cuts.at(-1).part,cuts.at(-1).to),ref:hi.ref}]:[];
    return {cuts,bounds};
  }

  function endpointContacts(a,b,tolerance) {
    const project=(point,part)=>{
      const location=g.traceLocation(part,point);
      return location&&g.dist(location.q,point)<=tolerance+g.eps?location:null;
    };
    return [
      ...ends(b).map(point=>project(point,a)?.t),
      ...ends(a).map((point,index)=>project(point,b)?index:undefined)
    ].filter(t=>t!==undefined);
  }

  function crossingNear(a,b,p,tolerance) {
    if(a.type==='line'&&b.type==='line') {
      const q=g.intersection(...a.p,...b.p);
      return q&&g.dist(q,p)<=tolerance?g.traceLocation(a,q):null;
    }
    let s=g.traceLocation(a,p)?.t,t=g.traceLocation(b,p)?.t;
    if(s===undefined||t===undefined) return null;
    const limit=x=>Math.max(0,Math.min(1,x));
    const derivative=(part,x)=>{
      const lo=limit(x-1e-5),hi=limit(x+1e-5);
      return g.mul(g.sub(g.traceAt(part,hi),g.traceAt(part,lo)),1/(hi-lo));
    };
    for(let i=0;i<16;i++) {
      const u=g.traceAt(a,s),v=g.traceAt(b,t), gap=g.sub(v,u);
      if(Math.hypot(...gap)<=Math.min(tolerance,1e-7)) return g.dist(p,u)<=tolerance?{t:s,q:u}:null;
      const da=derivative(a,s), db=derivative(b,t), determinant=g.cross(da,db);
      if(Math.abs(determinant)<=1e-10*Math.hypot(...da)*Math.hypot(...db)) return null;
      const ds=g.cross(gap,db)/determinant, dt=g.cross(gap,da)/determinant;
      s=limit(s+ds);t=limit(t+dt);
    }
    return null;
  }

  function curveIntersections(a,b) {
    const box=part=>{
      const p=g.boundsPoints(part);
      return [0,1].map(i=>[Math.min(...p.map(q=>q[i])),Math.max(...p.map(q=>q[i]))]);
    };
    const first=box(a),second=box(b);
    if(first.some(([low,high],i)=>high<second[i][0]-g.eps||low>second[i][1]+g.eps)) return [];
    if(a.type==='line'&&b.type==='line') {
      const point=g.intersection(...a.p,...b.p);
      return point?[g.traceLocation(a,point).t]:[];
    }
    const round=e=>e.type==='arc'||e.type==='circle';
    const pairs=a.type==='line'&&round(b)?[a,b]:b.type==='line'&&round(a)?[b,a]:null;
    if(pairs) {
      const [line,circle]=pairs, [start,end]=line.p, v=g.sub(end,start), delta=g.sub(start,circle.c);
      const u=g.dot(v,v), half=g.dot(v,delta), discriminant=half*half-u*(g.dot(delta,delta)-circle.r**2);
      if(u<=g.eps**2||discriminant<0) return [];
      const root=Math.sqrt(discriminant);
      return [...new Set([(-half-root)/u,(-half+root)/u])].filter(t=>t>=0&&t<=1)
        .map(t=>g.traceAt(line,t)).filter(p=>g.dist(p,g.nearestOnTrace(circle,p))<=1e-7)
        .map(p=>g.traceLocation(a,p).t);
    }
    const sampled=part=>{
      const count=part.type==='line'?1:96;
      return Array.from({length:count+1},(_,i)=>g.traceAt(part,i/count));
    };
    const p=sampled(a),q=sampled(b), found=[];
    for(let i=1;i<p.length;i++) for(let j=1;j<q.length;j++) {
      const cross=g.intersection(p[i-1],p[i],q[j-1],q[j]);
      if(!cross) continue;
      const allowance=Math.max(g.dist(p[i-1],p[i]),g.dist(q[j-1],q[j]),1e-6);
      const hit=crossingNear(a,b,cross,allowance);
      if(hit&&!found.some(t=>Math.abs(t-hit.t)<=1e-7)) found.push(hit.t);
    }
    return found;
  }

  function offsetTrace(entity,distance,side,precision=.02) {
    if(!(distance>0)||!Number.isFinite(distance)) return null;
    const inward=side==='inside';
    if(entity.type==='circle'||entity.type==='arc') {
      const radius=entity.r+(inward?-distance:distance);
      return radius>g.eps?{type:entity.type,c:entity.c,r:radius,
        ...(entity.type==='arc'?{a:entity.a,s:entity.s}:entity.reversed?{reversed:true}:{})}:null;
    }
    const closed=entity.closed===true||entity.type==='ellipse'&&entity.s===undefined;
    const trace=entity.type==='line'||entity.type==='poly'?entity.p:g.trace(entity,Math.max(1,1/precision));
    const points=trace.filter((p,i)=>!i||g.dist(p,trace[i-1])>g.eps);
    if(closed&&same(points[0],points.at(-1))) points.pop();
    if(points.length<(closed?3:2)) return null;
    const vectors=points.map(p=>g.sub(p,points[0]));
    const winding=closed?Math.sign(vectors.reduce((sum,p,i)=>sum+g.cross(p,vectors[(i+1)%vectors.length]),0)):1;
    if(!winding) return null;
    const shift=(inward?distance:-distance)*winding;
    const edges=points.slice(0,closed?points.length:-1).map((a,i)=>{
      const b=points[(i+1)%points.length], v=g.sub(b,a), length=Math.hypot(...v);
      const normal=g.mul([-v[1],v[0]],shift/length);
      return {a:g.add(a,normal),b:g.add(b,normal),v};
    });
    const convex=closed&&edges.every((e,i)=>g.cross(e.v,edges[(i+1)%edges.length].v)*winding>=-g.eps);
    const result=[];
    for(let i=0;i<points.length;i++) {
      if(!closed&&i===0) {result.push(edges[0].a);continue;}
      if(!closed&&i===points.length-1) {result.push(edges.at(-1).b);continue;}
      const prev=edges[(i-1+edges.length)%edges.length], next=edges[i];
      const denominator=g.cross(prev.v,next.v);
      const corner=Math.abs(denominator)>g.eps*Math.hypot(...prev.v)*Math.hypot(...next.v)?
        g.add(prev.a,g.mul(prev.v,g.cross(g.sub(next.a,prev.a),next.v)/denominator)):g.mid(prev.b,next.a);
      result.push(corner);
    }
    if(convex&&inward&&edges.some((edge,i)=>g.dot(edge.v,g.sub(result[(i+1)%result.length],result[i]))<=g.eps)) return null;
    if(closed) {
      const relative=result.map(p=>g.sub(p,result[0]));
      const area=relative.reduce((sum,p,i)=>sum+g.cross(p,relative[(i+1)%relative.length]),0);
      if(Math.sign(area)!==winding) return null;
    }
    if(!convex) {
      const count=result.length-(closed?0:1);
      for(let i=0;i<count;i++) for(let j=i+2;j<count;j++) {
        if(closed&&i===0&&j===count-1) continue;
        if(g.intersection(result[i],result[(i+1)%result.length],result[j],result[(j+1)%result.length])) return null;
      }
    }
    if(result.length===2) return {type:'line',p:result};
    return {type:'poly',p:result,closed};
  }

  function valid(e) {
    if(e.angles===undefined) return true;
    if(!e.angles||typeof e.angles!=='object'||Array.isArray(e.angles)) return false;
    const parts=edges(e);
    return Object.entries(e.angles).every(([i,a])=>{
      const supported=typeof a==='number'?angles.includes(a):divisions.includes(a?.division)&&orientations(a.division).includes(a.degrees);
      if(!/^(0|[1-9]\d*)$/.test(i)||parts[i]?.type!=='line'||!supported) return false;
      const [p,q]=parts[i].p, v=g.sub(q,p), length=Math.hypot(...v);
      return length>g.eps && Math.abs(g.cross(v,axis(degrees(a))))<=length*1e-8;
    });
  }

  function changedVertices(entities,moves) {
    const locate=p=>moves.findIndex(([from])=>same(from,p));
    const map=p=>moves[locate(p)]?.[1]??p;
    const result=new Map();
    for(const e of entities) {
      const parts=edges(e);
      if(!parts.length) continue;
      let changed=false;
      const next=parts.map(part=>{
        const [a,b]=ends(part), p=map(a), q=map(b);
        if(p===a && q===b) return part;
        changed=true;
        if(same(p,q) && part.type!=='bezier') return null;
        if(part.type==='line') return {...part,p:[p,q]};
        if(part.type==='bezier') return {...part,p:[p,g.add(part.p[1],g.sub(p,a)),g.add(part.p[2],g.sub(q,b)),q]};
        if(locate(a)>=0 && locate(a)===locate(b)) return null;
        const da=g.sub(p,a), db=g.sub(q,b);
        if(same(da,db)) return {...part,c:g.add(part.c,da)};
        if(part.type==='ellipse') {
          const factor=g.dist(p,q)/g.dist(a,b), rotation=g.angle(p,q)-g.angle(a,b);
          const cos=Math.cos(rotation),sin=Math.sin(rotation);
          const map=point=>{
            const [x,y]=g.sub(point,a);
            return g.add(p,g.mul([x*cos-y*sin,x*sin+y*cos],factor));
          };
          return g.transform(part,map,rotation,factor);
        }
        const [dx,dy]=g.sub(q,p);
        return g.arc(p,g.add(g.mid(p,q),g.mul([dy,-dx],Math.tan(part.s/4)/2)),q);
      });
      if(!changed) continue;
      if(next.some(p=>!p)) return null;
      const entity=e.type==='poly'?{...e,p:e.p.map(map)}:e.type==='path'?{...e,segments:next}:{...e,...next[0]};
      if(!g.serial(entity)||!valid(entity)) return null;
      result.set(e.id,entity);
    }
    return result;
  }

  function translationVertices(entities,entity,index,formalEdges=[]) {
    const points=[...ends(edges(entity)[index])];
    const formals=new Map();
    for(const ref of formalEdges) {
      if(!formals.has(ref.id)) formals.set(ref.id,new Set());
      formals.get(ref.id).add(ref.index);
    }
    if(!formals.get(entity.id)?.has(index)) return points;
    const remaining=new Set();
    for(const object of entities) if(formals.has(object.id)) {
      const parts=edges(object);
      for(const i of formals.get(object.id)) remaining.add(ends(parts[i]));
    }
    for(let i=0;i<points.length;i++) {
      for(const vertices of remaining) {
        if(!vertices.some(p=>same(p,points[i]))) continue;
        remaining.delete(vertices);
        for(const p of vertices) if(!points.some(q=>same(p,q))) points.push(p);
      }
    }
    return points;
  }

  function drag(entities,points,delta,matchEndpoint=false) {
    let shift=delta;
    if(points.length===1 && !matchEndpoint) {
      const [point]=points;
      const pivots=entities.flatMap(e=>edges(e).flatMap(part=>{
        const [a,b]=ends(part);
        if(same(point,a)) return [{pivot:b,part}];
        if(same(point,b)) return [{pivot:a,part}];
        return [];
      }));
      if(pivots.length===1 && pivots[0].part.type!=='line') {
        const {pivot}=pivots[0], candidate=g.add(point,delta);
        if(same(candidate,pivot)) return null;
        shift=g.sub(g.polar(pivot,g.dist(pivot,point),g.angle(pivot,candidate)),point);
      }
    }
    if(Math.hypot(...shift)<=g.eps) return new Map();
    return changedVertices(entities,points.map(p=>[p,g.add(p,shift)]));
  }

  return {bearing,edges,ends,filletLines,contour,isClosed,closurePairs,closeConnections,joinContours,removeSegments,crossingParts,selectedRuns,transformParts,trimContours,trimBounds,trimAlong,trimInterval,curveIntersections,endpointContacts,offsetTrace,valid,translationVertices,changedVertices,drag};
};
const Edit=createEdit();
if(typeof module!=='undefined') module.exports=Edit;
