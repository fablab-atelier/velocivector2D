'use strict';
const createImporting=(G,Edit,Formal,Formats)=>{
  const importDefaults=Object.freeze({
    lineTolerance:.1,arcTolerance:.15,bezierTolerance:.15,symmetricHandles:true,join:true,deduplicate:true,
    coincident:true,tangent:true,axes:true,junction:true,junctionTolerance:.1,junctionMethod:'contact',
    overlapTolerance:.05,checkOverlaps:true,removeOverlaps:false,oneLayer:false,destination:''
  });
  function fitCircle(points,tolerance,closed) {
    if(points.length<(closed?8:5)||!(tolerance>0)) return null;
    const a=points[0], c=points.at(-1);
    let origin, radius;
    if(closed) {
      const mean=G.mul(points.reduce(G.add,[0,0]),1/points.length);
      let xx=0,xy=0,yy=0,xz=0,yz=0;
      for(const p of points) {
        const [x,y]=G.sub(p,mean), z=x*x+y*y;
        xx+=x*x;xy+=x*y;yy+=y*y;xz+=x*z;yz+=y*z;
      }
      const determinant=xx*yy-xy*xy;
      if(!(determinant>1e-12*xx*yy)) return null;
      origin=G.add(mean,[(yy*xz-xy*yz)/(2*determinant),(xx*yz-xy*xz)/(2*determinant)]);
      radius=points.reduce((sum,p)=>sum+G.dist(p,origin),0)/points.length;
    } else {
      const [dx,dy]=G.sub(c,a), half=G.dist(a,c)/2;
      if(half<=G.eps) return null;
      const middle=G.mid(a,c), normal=[-dy/(2*half),dx/(2*half)];
      let rhs=0, denominator=0;
      for(const p of points) {
        const v=G.sub(p,middle), n=G.dot(v,normal);
        rhs+=n*(G.dot(v,v)-half*half);
        denominator+=2*n*n;
      }
      if(denominator<=G.eps**2) return null;
      const offset=rhs/denominator;
      origin=G.add(middle,G.mul(normal,offset));
      radius=Math.hypot(half,offset);
    }
    if(!(radius>tolerance)||points.some(p=>Math.abs(G.dist(p,origin)-radius)>tolerance)) return null;
    const bearings=points.map(p=>G.angle(origin,p));
    if(closed) bearings.push(bearings[0]);
    const turns=bearings.slice(1).map((t,i)=>G.mod(t-bearings[i]+Math.PI)-Math.PI);
    const sweep=turns.reduce((sum,turn)=>sum+turn,0), sign=Math.sign(sweep);
    if(turns.some(turn=>turn*sign< -1e-8||Math.abs(turn)>Math.PI/3)) return null;
    for(const [i,turn] of turns.entries()) {
      const a=points[i], b=points[(i+1)%points.length];
      for(const fraction of [.25,.5,.75]) {
        const q=G.polar(origin,radius,bearings[i]+turn*fraction);
        if(G.dist(q,G.nearest(a,b,q))>tolerance) return null;
      }
    }
    if(closed) return Math.abs(Math.abs(sweep)-G.tau)<1e-6?{type:'circle',c:origin,r:radius}:null;
    return Math.abs(sweep)>G.eps&&Math.abs(sweep)<G.tau?{type:'arc',c:origin,r:radius,a:bearings[0],s:sweep}:null;
  }

  function fitLine(points,tolerance) {
    const a=points[0], b=points.at(-1), v=G.sub(b,a), length=G.dist(a,b);
    if(length<=G.eps) return null;
    let previous=-Infinity;
    for(const p of points) {
      const t=G.dot(G.sub(p,a),v)/length;
      if(t+tolerance<previous||G.dist(G.nearest(a,b,p),p)>tolerance) return null;
      previous=t;
    }
    return {type:'line',p:[a,b]};
  }

  function withinBezierTolerance(curve,points,parameters,tolerance) {
    for(let i=0;i<points.length;i++) {
      if(G.dist(points[i],G.controls(curve,parameters[i]))>tolerance) return false;
      if(!i) continue;
      const from=parameters[i-1], span=parameters[i]-from;
      for(const fraction of [.25,.5,.75]) {
        const q=G.controls(curve,from+span*fraction);
        if(G.dist(q,G.nearest(points[i-1],points[i],q))>tolerance) return false;
      }
    }
    return true;
  }

  function reparameterize(curve,points,parameters) {
    const [a,b,c,d]=curve.p, u=G.sub(b,a), v=G.sub(c,b), w=G.sub(d,c);
    const next=parameters.slice();
    for(let i=1;i<points.length-1;i++) {
      const t=parameters[i], left=1-t, position=G.controls(curve,t);
      const tangent=G.mul(G.add(G.add(G.mul(u,left*left),G.mul(v,2*left*t)),G.mul(w,t*t)),3);
      const acceleration=G.mul(G.add(G.mul(G.sub(v,u),left),G.mul(G.sub(w,v),t)),6);
      const error=G.sub(position,points[i]), divisor=G.dot(tangent,tangent)+G.dot(error,acceleration);
      if(divisor>G.eps) {
        const candidate=t-G.dot(error,tangent)/divisor;
        next[i]=Math.max((parameters[i-1]+t)/2,Math.min((parameters[i+1]+t)/2,candidate));
      }
    }
    return next;
  }

  function fitBezier(points,tolerance,directions) {
    if(points.length<6||!(tolerance>0)) return null;
    const first=points[0], last=points.at(-1);
    const chord=[0];
    for(let i=1;i<points.length;i++) chord.push(chord.at(-1)+G.dist(points[i-1],points[i]));
    const length=chord.at(-1);
    if(length<=G.eps) return null;
    let parameters=chord.map(s=>s/length);
    function leastSquares() {
      let aa=0,ab=0,bb=0,ak=[0,0],bk=[0,0];
      for(let i=1;i<points.length-1;i++) {
        const t=parameters[i], u=1-t, a=3*u*u*t, b=3*u*t*t;
        const p=G.sub(points[i],G.add(G.mul(first,u*u*u+a),
          G.mul(last,t*t*t+b)));
        aa+=a*a;ab+=a*b;bb+=b*b;
        ak=G.add(ak,G.mul(p,a));bk=G.add(bk,G.mul(p,b));
      }
      const [u,v]=directions, crossTerm=ab*G.dot(u,v), determinant=aa*bb-crossTerm*crossTerm;
      if(!(determinant>1e-12*aa*bb)) return null;
      const a=G.dot(ak,u), b=G.dot(bk,v);
      const left=(a*bb-b*crossTerm)/determinant, right=(b*aa-a*crossTerm)/determinant;
      if(!(left>G.eps&&right>G.eps)) return null;
      return {type:'bezier',p:[first,G.add(first,G.mul(u,left)),G.add(last,G.mul(v,right)),last]};
    }
    for(let attempt=0;attempt<8;attempt++) {
      const curve=leastSquares();
      if(!curve) return null;
      if(withinBezierTolerance(curve,points,parameters,tolerance)) return {curve,parameters};
      parameters=reparameterize(curve,points,parameters);
    }
    return null;
  }

  function sourceTangent(points,index,closed,towardEnd) {
    const last=points.length-1, p=points[index];
    const prev=points[index-1]??(closed?points[last-1]:null);
    const next=points[index+1]??(closed?points[1]:null);
    const unit=v=>G.mul(v,1/Math.hypot(...v));
    const a=prev&&unit(G.sub(p,prev)), b=next&&unit(G.sub(next,p));
    if(a&&b&&G.dot(a,b)>=Math.cos(Math.PI/5)) return unit(G.add(a,b));
    return towardEnd?(b??a):(a??b);
  }
  // Fit a closed outline as editable cubics, retaining the specified hard corner.
  function fitClosedCubics(outline,corner,tolerance) {
    const points=[...outline.slice(corner),...outline.slice(0,corner),outline[corner]];
    const segments=[];
    function subdivide(start,end) {
      const first=points[start], last=points[end];
      const u=sourceTangent(points,start,false,true);
      const v=G.mul(sourceTangent(points,end,false,false),-1);
      const fit=fitBezier(points.slice(start,end+1),tolerance,[u,v]);
      if(fit) segments.push(fit.curve);
      else if(end-start===1) {
        const handle=G.dist(first,last)/3;
        segments.push({type:'bezier',p:[first,G.add(first,G.mul(u,handle)),G.add(last,G.mul(v,handle)),last]});
      } else {
        const mid=Math.floor((start+end)/2);
        subdivide(start,mid);subdivide(mid,end);
      }
    }
    subdivide(0,points.length-1);
    return {type:'path',segments,closed:true};
  }

  function withinRefitTolerance(curve,fit,tolerance) {
    let parameters=fit.parameters;
    for(let attempt=0;attempt<10;attempt++) {
      if(withinBezierTolerance(curve,fit.points,parameters,tolerance)) return true;
      parameters=reparameterize(curve,fit.points,parameters);
    }
    return false;
  }
  function symmetricBezierHandles(parts,closed,accept) {
    const result=parts.slice();
    for(let i=closed?0:1;i<parts.length;i++) {
      const j=(i+parts.length-1)%parts.length, before=result[j], after=result[i];
      if(i===j||before.type!=='bezier'||after.type!=='bezier') continue;
      const p=after.p[0], a=G.sub(p,before.p[2]), b=G.sub(after.p[1],p);
      const lengths=[Math.hypot(...a),Math.hypot(...b)], [left,right]=lengths;
      if(Math.min(...lengths)<=G.eps||Math.abs(left-right)<=G.eps||G.dot(a,b)/(left*right)<1-1e-10) continue;
      const axis=G.mul(a,1/left);
      // Search the overlap of the two tolerance intervals between their original arm lengths.
      const arm=t=>G.mul(axis,left+(right-left)*t);
      const incoming=t=>({...before,p:[before.p[0],before.p[1],G.sub(p,arm(t)),before.p[3]]});
      const outgoing=t=>({...after,p:[p,G.add(p,arm(t)),after.p[2],after.p[3]]});
      let t=.5;
      if(!accept(incoming(t),j)||!accept(outgoing(t),i)) {
        const extent=(candidate,index,from,to)=>{
          if(accept(candidate(to),index)) return to;
          for(let step=0;step<16;step++) {
            const mid=(from+to)/2;
            if(accept(candidate(mid),index)) from=mid;else to=mid;
          }
          return from;
        };
        const max=extent(incoming,j,0,1), min=extent(outgoing,i,1,0);
        if(min>max) continue;
        t=(max+min)/2;
      }
      const l=incoming(t),r=outgoing(t);
      if(accept(l,j)&&accept(r,i)) {result[j]=l;result[i]=r;}

    }
    return result;
  }
  function bezierHandleCounts(entities) {
    const counts={symmetric:0,asymmetric:0};
    for(const entity of entities) for(const knot of G.bezierJunctions(entity)) {
      if(!knot?.incoming||!knot.outgoing) continue;
      const a=G.sub(knot.point,knot.incoming), b=G.sub(knot.outgoing,knot.point);
      const size=Math.max(1,Math.hypot(...a),Math.hypot(...b));
      const symmetric=G.dist(a,b)<=size*1e-7;
      counts[symmetric?'symmetric':'asymmetric']++;
    }
    return counts;
  }

  function recognize(entity,{lineTolerance,arcTolerance,bezierTolerance,symmetricHandles},report) {
    const balance=(parts,closed,accept)=>{
      const old=bezierHandleCounts([{type:'path',segments:parts,closed}]).symmetric;
      const result=symmetricBezierHandles(parts,closed,accept);
      const count=bezierHandleCounts([{type:'path',segments:result,closed}]).symmetric;
      report.symmetrized+=Math.max(0,count-old);
      return result;
    };
    if(entity.type!=='poly') {
      if(!symmetricHandles||entity.type!=='path'||!(bezierTolerance>0)) return entity;
      const segments=balance(entity.segments,entity.closed,(curve,index)=>{
        const source=entity.segments[index];
        const a=G.dist(source.p[1],curve.p[1]), b=G.dist(source.p[2],curve.p[2]);
        // Each inner cubic basis is at most 4/9, and their sum is at most 3/4.
        return Math.min((a+b)*4/9,Math.max(a,b)*.75)<=bezierTolerance;
      });
      return {...entity,segments};
    }
    const p=entity.p.filter((point,i)=>!i||G.dist(point,entity.p[i-1])>G.eps);
    if(entity.closed&&p.length>1&&G.dist(p[0],p.at(-1))<=G.eps) p.pop();
    if(p.length<(entity.closed?3:2)) return entity;
    if(entity.closed) {
      const circle=fitCircle(p,arcTolerance,true);
      if(circle) {report.circles++;return {...circle,layer:entity.layer};}
      p.push(p[0]);
    }
    let parts=[];
    const fits=[];
    for(let i=0;i<p.length-1;) {
      let length=2, shape={type:'line',p:p.slice(i,i+2)};
      const tryFit=(minimum,fit,usable=()=>true)=>{
        if(i+minimum>p.length) return;
        let low=minimum, candidate=fit(p.slice(i,i+low));
        while(!candidate&&low<Math.min(p.length-i,32)) {
          low=Math.min(p.length-i,low*2);
          candidate=fit(p.slice(i,i+low));
        }
        if(!candidate) return;
        let high=Math.min(p.length-i,low*2);
        while(high>low) {
          const next=fit(p.slice(i,i+high));
          if(!next) break;
          candidate=next;low=high;high=Math.min(p.length-i,high*2);
        }
        while(high-low>1) {
          const mid=Math.floor((low+high)/2), next=fit(p.slice(i,i+mid));
          if(next) {low=mid;candidate=next;}else high=mid;
        }
        if(low>length&&usable(candidate)) {shape=candidate;length=low;}
      };
      tryFit(3,points=>fitLine(points,lineTolerance));
      if(arcTolerance>0) tryFit(5,points=>fitCircle(points,arcTolerance,false),arc=>Math.abs(arc.s)>=Math.PI/12);
      if(bezierTolerance>0) {
        const start=sourceTangent(p,i,entity.closed,true);
        tryFit(Math.max(6,length+1),points=>{
          const end=sourceTangent(p,i+points.length-1,entity.closed,false);
          return fitBezier(points,bezierTolerance,[start,G.mul(end,-1)]);
        });
      }
      fits.push(shape.curve?{points:p.slice(i,i+length),parameters:shape.parameters}:null);
      if(shape.curve) report.beziers++;
      else if(shape.type==='arc') report.arcs++;
      else if(length>2) report.lines++;
      parts.push(shape.curve??shape);i+=length-1;
    }
    if(symmetricHandles&&bezierTolerance>0) parts=balance(parts,entity.closed,
      (curve,index)=>withinRefitTolerance(curve,fits[index],bezierTolerance));
    if(parts.length===1&&!entity.closed) return {...parts[0],layer:entity.layer};
    if(parts.every(part=>part.type==='line')) {
      const points=parts.map(part=>part.p[0]);
      if(!entity.closed) points.push(parts.at(-1).p[1]);
      return points.length>=(entity.closed?3:2)?{...entity,p:points}:entity;
    }
    return {type:'path',segments:parts,closed:entity.closed,layer:entity.layer};
  }

  function chainSegments(entities,tolerance,report) {
    const lines=entities.filter(e=>e.type==='line'), others=entities.filter(e=>e.type!=='line');
    const nodes=new Map(), links=[];
    for(const e of lines) {
      const endpoints=e.p.map(p=>{
        const key=e.layer+'\0'+p.map(value=>tolerance?Math.round(value/tolerance):value).join('/');
        if(!nodes.has(key)) nodes.set(key,{p,edges:[]});
        return nodes.get(key);
      });
      if(endpoints[0]===endpoints[1]) {others.push(e);continue;}
      const link={e,endpoints,used:false};
      endpoints.forEach(node=>node.edges.push(link));links.push(link);
    }
    function follow(start,link) {
      if(link.used) return;
      const p=[start.p];
      let node=start;
      while(link&&!link.used) {
        link.used=true;
        node=link.endpoints.find(end=>end!==node);
        p.push(node.p);
        link=node.edges.length===2?node.edges.find(edge=>!edge.used):null;
      }
      if(p.length===2) others.push({type:'line',layer:start.edges[0].e.layer,p});
      else {
        const closed=node===start;
        if(closed) p.pop();
        if(p.length>=3) {
          others.push({type:'poly',layer:start.edges[0].e.layer,p,closed});
          report.chains++;
        }
        else others.push({type:'line',layer:start.edges[0].e.layer,p});
      }
    }
    for(const node of nodes.values()) if(node.edges.length!==2) for(const link of node.edges) follow(node,link);
    for(const link of links) follow(link.endpoints[0],link);
    return others;
  }

  function weight(entities) {
    return entities.reduce((sum,e)=>sum+(e.type==='poly'?e.p.length-(e.closed?0:1):e.type==='path'?weight(e.segments):1),0);
  }
  function recognizeImport(entities,{lineTolerance=.1,arcTolerance=.15,bezierTolerance=.15,join=true,deduplicate=true,symmetricHandles=true}={},progress=()=>{}) {
    const report={lines:0,arcs:0,circles:0,beziers:0,symmetrized:0,chains:0,duplicateLines:0,duplicateCircles:0,invalid:0};
    const seen=new Set();
    const unique=deduplicate?entities.filter(e=>{
      if(e.type!=='line'&&e.type!=='circle') return true;
      const shape=e.type==='line'?e.p.map(p=>p.join('/')).sort():[...e.c,e.r];
      const key=JSON.stringify([e.layer,e.type,shape]);
      if(seen.has(key)) {report[e.type==='line'?'duplicateLines':'duplicateCircles']++;return false;}
      seen.add(key);return true;
    }):entities;
    const source=join?chainSegments(unique,1e-8,report):unique;
    progress('recognition',0,source.length);
    const optimized=source.map((e,i)=>{
      const result=recognize(e,{lineTolerance,arcTolerance,bezierTolerance,symmetricHandles},report);
      if((i+1)%32===0||i+1===source.length) progress('recognition',i+1,source.length);
      return result;
    })
      .filter(e=>{
        const valid=G.serial(e)&&Edit.valid(e);
        if(!valid) report.invalid++;
        return valid;
      });
    return {entities:optimized,report:{...report,handles:bezierHandleCounts(optimized)}};
  }
  function optimize(entities,options) {
    return recognizeImport(entities,options).entities;
  }
  function relations(before,items,constraints,options,origins) {
    let result=options.coincident?Formal.automatic(before,items,constraints,origins):constraints.slice();
    const map=new Map(items.map(e=>[e.id,e])), signatures=new Set(result.map(Formal.signature));
    const add=c=>{
      if(!c||!Formal.satisfied(map,c)) return;
      const name=Formal.signature(c);
      if(!signatures.has(name)) {signatures.add(name);result.push(c);}
    };
    const old=new Set(before.map(e=>e.id)), nodes=new Map();
    for(const e of items) {
      const added=!old.has(e.id);
      if(!added&&!options.tangent) continue;
      for(const [index,part] of Formal.referenceEdges(e).entries()) {
        const ref={id:e.id,kind:'edge',index};
        if(added&&part.type==='line'&&options.axes) for(const [axis,type] of ['vertical','horizontal'].entries()) {
          if(Math.abs(part.p[0][axis]-part.p[1][axis])<=1e-8&&G.dist(...part.p)>G.eps)
            add({type,refs:[ref]});
        }
        if(options.tangent&&['line','arc'].includes(part.type)) for(const p of Edit.ends(part)) {
          const key=e.layer+'\0'+p.map(v=>Math.round(v/1e-7)).join('/');
          const touching=nodes.get(key)??[];
          // A junction with several branches has no unique tangent partner.
          touching.push({ref,part,added});nodes.set(key,touching);
        }
      }
    }
    for(const ends of nodes.values()) if(ends.length===2&&ends.some(end=>end.added)&&ends.some(end=>end.part.type==='arc'))
      add(Formal.make('tangent',ends.map(end=>end.ref),ends.map(end=>map.get(end.ref.id))));
    return result;
  }
  function propose(entities,options,progress=()=>{}) {
    let nextId=1;
    const identify=e=>({...e,id:nextId++});
    const {entities:optimized,report}=recognizeImport(entities,options,progress);
    const cleanup=options.removeOverlaps?removeOverlappingTraces(optimized,options.overlapTolerance,
      (done,total)=>progress('removeOverlaps',done,total)):{entities:optimized,removed:0};
    const recognized=cleanup.entities.map(identify);
    progress('relations');
    const constraints=relations([],recognized,[],options,()=>[]);
    const automatic={coincident:0,tangent:0,horizontal:0,vertical:0};
    for(const constraint of constraints) automatic[constraint.type]++;
    const actionReport={...report,automatic,removedOverlaps:cleanup.removed};
    if(!options.junction) return {entities:recognized,constraints,junctions:0,lost:[],report:actionReport};
    progress('junctions');
    actionReport.beforeJunction=contourCounts(recognized);
    const layers=new Map();
    for(const e of recognized) {
      if(!layers.has(e.layer)) layers.set(e.layer,[]);
      layers.get(e.layer).push(e);
    }
    const pairs=[...layers.values()].flatMap(items=>Edit.closurePairs(items,options.junctionTolerance,options.junctionMethod));
    const closure=pairs.length&&Formal.closeTraces(recognized,recognized,pairs,constraints,identify);
    return closure?{entities:closure.entities,constraints:closure.constraints,junctions:closure.junctions,lost:closure.lost,report:actionReport}:
      {entities:recognized,constraints,junctions:0,lost:[],report:actionReport};
  }
  function contourCounts(entities) {
    const counts=new Map();
    for(const e of entities) {
      if(e.type==='point') continue;
      if(!counts.has(e.layer)) counts.set(e.layer,{open:0,closed:0});
      counts.get(e.layer)[Edit.isClosed(e)?'closed':'open']++;
    }
    return counts;
  }
  function overlappingTraces(entities,tolerance,progress) {
    return scanOverlaps(entities,tolerance,progress,false);
  }
  function removeOverlappingTraces(entities,tolerance,progress) {
    return scanOverlaps(entities,tolerance,progress,true);
  }
  function scanOverlaps(entities,tolerance,progress=()=>{},remove) {
    const angularLimit=Math.sin(Math.PI/60), limit=Math.max(tolerance,G.eps*8);
    const layers=new Map(), results=[];
    const parallel=(u,v)=>Math.abs(G.cross(u,v))<=angularLimit*Math.hypot(...u)*Math.hypot(...v);
    function lines(a,b) {
      const u=G.sub(a.p[1],a.p[0]), v=G.sub(b.p[1],b.p[0]), length=Math.hypot(...u);
      if(length<=G.eps||Math.hypot(...v)<=G.eps||!parallel(u,v)) return [];
      const direction=G.mul(u,1/length);
      const offsets=b.p.map(p=>G.sub(p,a.p[0])).sort((p,q)=>G.dot(p,direction)-G.dot(q,direction));
      const [s,t]=offsets.map(offset=>G.dot(offset,direction)), [d,e]=offsets.map(offset=>G.cross(direction,offset));
      let from=Math.max(0,s), to=Math.min(length,t);
      if(to-from<=G.eps) return [];
      if(Math.abs(e-d)<=G.eps) {
        if(Math.abs(d)>limit) return [];
      } else {
        const clip=[-limit,limit].map(y=>s+(t-s)*(y-d)/(e-d)).sort((x,y)=>x-y);
        from=Math.max(from,clip[0]);to=Math.min(to,clip[1]);
      }
      return to-from>G.eps?[[from/length,to/length]]:[];
    }
    function curves(a,b) {
      const knots=new Set(Array.from({length:25},(_,i)=>i/24));
      for(const end of [0,1]) knots.add(G.traceLocation(a,G.traceAt(b,end)).t);
      const sorted=[...knots].sort((x,y)=>x-y);
      const near=t=>{
        const p=G.traceAt(a,t), {t:at,q}=G.traceLocation(b,p), delta=G.sub(p,q);
        if(Math.hypot(...delta)>limit) return false;
        const u=G.traceDerivative(a,t), v=G.traceDerivative(b,at), length=Math.hypot(...v);
        return length>G.eps&&Math.hypot(...u)>G.eps&&parallel(u,v)&&
          (at>G.eps&&at<1-G.eps||Math.abs(G.dot(delta,v))/length<=G.eps*8);
      };
      const boundary=(inside,outside)=>{
        for(let i=0;i<12;i++) {
          const mid=(inside+outside)/2;
          if(near(mid)) inside=mid;else outside=mid;
        }
        return inside;
      };
      const runs=[];
      for(let i=1;i<sorted.length;i++) {
        const lo=sorted[i-1],hi=sorted[i],mid=(lo+hi)/2;
        if(!near(mid)) continue;
        const from=near(lo)?lo:boundary(mid,lo), to=near(hi)?hi:boundary(mid,hi);
        const last=runs.at(-1);
        if(last&&Math.abs(last.at(-1)-from)<=G.eps) last.push(mid,to);
        else runs.push([from,mid,to]);
      }
      return runs.filter(run=>run.slice(1).reduce((sum,t,i)=>sum+G.dist(G.traceAt(a,run[i]),G.traceAt(a,t)),0)>G.eps*8);
    }
    const compare=(a,b)=>a.type==='line'&&b.type==='line'?lines(a,b):curves(a,b);
    const merged=ranges=>{
      const result=[];
      for(const [from,to] of ranges.sort((a,b)=>a[0]-b[0])) {
        if(to-from<=1e-8) continue;
        const last=result.at(-1);
        if(last&&from<=last[1]+1e-8) last[1]=Math.max(last[1],to);
        else result.push([from<=1e-8?0:from,to>=1-1e-8?1:to]);
      }
      return result;
    };
    const retained=({part,ranges})=>{
      if(!ranges?.length) return [part];
      const kept=[];
      let start=0;
      for(const [from,to] of ranges) {
        if(from-start>1e-8) kept.push(Edit.trimInterval(part,start,from));
        start=to;
      }
      if(1-start>1e-8) kept.push(Edit.trimInterval(part,start,1));
      return kept;
    };
    let total=0;
    for(const entity of entities) {
      if(entity.type==='point') continue;
      const parts=G.strokeParts(entity);
      if(!layers.has(entity.layer)) layers.set(entity.layer,[]);
      for(const [index,part] of (parts.length?parts:[entity]).entries()) {
        const bounds=G.boundsPoints(part);
        const min=[0,1].map(i=>Math.min(...bounds.map(p=>p[i]))), max=[0,1].map(i=>Math.max(...bounds.map(p=>p[i])));
        layers.get(entity.layer).push({part,min,max,entity,index});
        total++;
      }
    }
    let done=0;
    for(const [layer,parts] of layers) {
      parts.sort((a,b)=>a.min[0]-b.min[0]);
      for(let i=0;i<parts.length;i++) {
        if(done%256===0) progress(done,total);
        done++;
        const kept=remove?retained(parts[i]):null;
        if(kept&&!kept.length) continue;
        for(let j=i+1;j<parts.length;j++) {
          const a=parts[i], b=parts[j];
          if(b.min[0]>a.max[0]+limit) break;
          if(b.min[1]>a.max[1]+limit||a.min[1]>b.max[1]+limit) continue;
          if(remove) {
            const ranges=kept.flatMap(part=>compare(b.part,part).map(run=>[run[0],run.at(-1)]));
            if(ranges.length) b.ranges=merged([...(b.ranges??[]),...ranges]);
          } else {
            const traces=compare(a.part,b.part).map(run=>run.map(t=>G.traceAt(a.part,t)));
            if(traces.length) results.push({layer,traces});
          }
        }
      }
    }
    progress(total,total);
    if(!remove) return results;
    const cuts=new Map();
    let removed=0;
    for(const parts of layers.values()) for(const {entity,index,ranges} of parts) if(ranges?.length) {
      if(!cuts.has(entity)) cuts.set(entity,[]);
      for(const [from,to] of ranges) {
        cuts.get(entity).push({index,from,to});
        removed++;
      }
    }
    return {removed,entities:entities.flatMap(entity=>cuts.has(entity)?
      Edit.trimContours(entity,cuts.get(entity)).map(fragment=>({...fragment,layer:entity.layer})):[entity])};
  }
  function placeProposal(proposal,identify,scale,destination=null) {
    const ids=new Map(), layers=new Map();
    const entities=proposal.entities.map(e=>{
      const shape=scale===1?e:G.transform(e,q=>G.mul(q,scale),0,scale);
      const placed=identify({...shape,layer:destination??e.layer});
      ids.set(e.id,placed.id);layers.set(placed.id,placed.layer);
      return placed;
    });
    const constraints=proposal.constraints.map(c=>{
      const refs=c.refs.map(ref=>ref.kind==='origin'?ref:{...ref,id:ids.get(ref.id)});
      if(!Formal.isDimension(c)) return {...c,refs};
      return {...c,refs,layer:destination??c.layer??layers.get(refs[0].id),
        value:c.mode==='angle'?c.value:c.value*scale,offset:G.mul(c.offset,scale)};
    });
    return {entities,constraints};
  }

  const identity=[1,0,0,1,0,0];
  const numbers=/[+-]?(?:\d*\.\d+|\d+\.?\d*)(?:e[+-]?\d+)?/gi;
  const values=text=>(text?.match(numbers)??[]).map(Number);
  const apply=([a,b,c,d,x,y],[u,v])=>[a*u+c*v+x,b*u+d*v+y];
  function multiply(a,b) {
    const [x,y]=apply(a,[b[4],b[5]]);
    const u=apply([...a.slice(0,4),0,0],[b[0],b[1]]);
    const v=apply([...a.slice(0,4),0,0],[b[2],b[3]]);
    return [...u,...v,x,y];
  }
  function transformList(text='') {
    let result=identity;
    for(const [,type,args] of text.matchAll(/([a-z]+)\(([^)]*)\)/gi)) {
      const [a,b=0,...rest]=values(args), angle=a*Math.PI/180, cos=Math.cos(angle), sin=Math.sin(angle);
      let matrix;
      if(type==='matrix'&&rest.length===4) matrix=[a,b,...rest];
      if(type==='translate') matrix=[1,0,0,1,a,b];
      if(type==='scale') matrix=[a,0,0,values(args)[1]??a,0,0];
      if(type==='rotate') {
        const y=rest[0]??0;
        matrix=[cos,sin,-sin,cos,b-b*cos+y*sin,y-b*sin-y*cos];
      }
      if(type==='skewX') matrix=[1,0,Math.tan(angle),1,0,0];
      if(type==='skewY') matrix=[1,Math.tan(angle),0,1,0,0];
      if(matrix?.every(Number.isFinite)) result=multiply(result,matrix);
    }
    return result;
  }
  function svgArc(a,b,rx,ry,degrees,large,sweep) {
    if(G.dist(a,b)<=G.eps) return null;
    rx=Math.abs(rx);ry=Math.abs(ry);
    if(!rx||!ry) return {type:'line',p:[a,b]};
    const rotation=degrees*Math.PI/180, cos=Math.cos(rotation),sin=Math.sin(rotation);
    const [dx,dy]=G.mul(G.sub(a,b),.5);
    const u=dx*cos+dy*sin,v=-dx*sin+dy*cos;
    const factor=Math.max(1,Math.hypot(u/rx,v/ry));
    rx*=factor;ry*=factor;
    const ratio=(u/rx)**2+(v/ry)**2;
    const sign=large===sweep?-1:1, gain=sign*Math.sqrt(Math.max(0,(1-ratio)/ratio));
    const x=gain*rx*v/ry,y=-gain*ry*u/rx;
    const center=G.add(G.mid(a,b),[x*cos-y*sin,x*sin+y*cos]);
    const start=Math.atan2((v-y)/ry,(u-x)/rx), end=Math.atan2((-v-y)/ry,(-u-x)/rx);
    let span=G.mod(end-start);
    if(!sweep) span-=G.tau;
    return {type:'ellipse',c:center,r:rx,ry,a:rotation,t:start,s:span};
  }
  function svgPath(text) {
    const tokens=text.match(/[a-z]|[+-]?(?:\d*\.\d+|\d+\.?\d*)(?:e[+-]?\d+)?/gi)??[];
    const sizes={M:2,L:2,H:1,V:1,C:6,S:4,Q:4,T:2,A:7};
    let i=0, command='', position=[0,0], first=position, parts=[], result=[], control=null, last='';
    const push=(closed=false)=>{
      if(!parts.length) return;
      if(parts.every(part=>part.type==='line')) result.push({type:'poly',
        p:[parts[0].p[0],...parts.slice(0,closed?-1:undefined).map(part=>part.p[1])],closed});
      else result.push(parts.length===1&&!closed?parts[0]:{type:'path',segments:parts,closed});
      parts=[];
    };
    while(i<tokens.length) {
      if(/^[a-z]$/i.test(tokens[i])) command=tokens[i++];
      const type=command.toUpperCase(), relative=command!==type;
      if(type==='Z') {
        if(G.dist(position,first)>G.eps) parts.push({type:'line',p:[position,first]});
        push(true);position=first;command='';last='';continue;
      }
      const count=sizes[type];
      if(!count) throw Error('Commande de tracé SVG incomplète.');
      const args=[];
      for(let position=0;position<count;position++) {
        const token=tokens[i];
        if(type==='A'&&(position===3||position===4)) {
          if(!/^[01]/.test(token??'')) throw Error('Indicateur d’arc SVG invalide.');
          args.push(Number(token[0]));
          if(token.length>1) tokens[i]=token.slice(1);else i++;
        } else {
          if(!token||/^[a-z]$/i.test(token)||!Number.isFinite(Number(token))) throw Error('Coordonnées de tracé SVG invalides.');
          args.push(Number(token));i++;
        }
      }
      const point=(x,y)=>relative?G.add(position,[x,y]):[x,y];
      const previous=position;
      let part;
      if(type==='M') {
        push();position=first=point(...args);command=relative?'l':'L';
      } else if(['L','H','V'].includes(type)) {
        position=type==='L'?point(...args):type==='H'?[args[0]+(relative?position[0]:0),position[1]]:
          [position[0],args[0]+(relative?position[1]:0)];
        part={type:'line',p:[previous,position]};
      } else if(type==='C'||type==='S') {
        const a=type==='C'?point(...args.slice(0,2)):['C','S'].includes(last)?G.sub(G.mul(position,2),control):position;
        const b=point(...args.slice(-4,-2));
        position=point(...args.slice(-2));control=b;
        part={type:'bezier',p:[previous,a,b,position]};
      } else if(type==='Q'||type==='T') {
        const a=type==='Q'?point(...args.slice(0,2)):['Q','T'].includes(last)?G.sub(G.mul(position,2),control):position;
        position=point(...args.slice(-2));control=a;
        part={type:'bezier',p:[previous,G.add(previous,G.mul(G.sub(a,previous),2/3)),
          G.add(position,G.mul(G.sub(a,position),2/3)),position]};
      } else if(type==='A') {
        position=point(...args.slice(-2));part=svgArc(previous,position,...args.slice(0,5));
      }
      if(part&&(part.type!=='line'||G.dist(...part.p)>G.eps)) parts.push(part);
      last=type;
    }
    push();
    return result;
  }
  function svgTransform(e,matrix) {
    const map=p=>apply(matrix,p);
    if(e.type==='path') return {...e,segments:e.segments.map(part=>svgTransform(part,matrix))};
    if(e.p) return {...e,p:e.p.map(map)};
    // An affine transform of an ellipse is still an ellipse. The two transformed radius vectors define its axes.
    const sourceAngle=e.a??0, minor=e.ry??e.r, c=map(e.c);
    const u=G.sub(map(G.polar(e.c,e.r,sourceAngle)),c);
    const v=G.sub(map(G.polar(e.c,minor,sourceAngle+Math.PI/2)),c);
    const xx=u[0]**2+v[0]**2, yy=u[1]**2+v[1]**2, xy=u[0]*u[1]+v[0]*v[1];
    const r=Math.sqrt((xx+yy+Math.hypot(xx-yy,2*xy))/2), ry=Math.abs(G.cross(u,v))/r;
    if(!(r>G.eps&&ry>G.eps)) return null;
    const a=Math.atan2(2*xy,xx-yy)/2, direction=Math.sign(G.cross(u,v));
    if(e.s===undefined) return Math.abs(r-ry)<=1e-9*r?{type:'circle',c,r}:{type:'ellipse',c,r,ry,a};
    const phase=e.t??0, start=G.sub(map(G.controls(e,phase)),c);
    if(Math.abs(r-ry)<=1e-9*r) return {type:'arc',c,r,a:Math.atan2(start[1],start[0]),s:direction*e.s};
    return {type:'ellipse',c,r,ry,a,t:Math.atan2(G.dot(start,G.polar([0,0],1,a+Math.PI/2))/ry,
      G.dot(start,G.polar([0,0],1,a))/r),s:direction*e.s};
  }
  function readSVG(raw,parse=text=>new DOMParser().parseFromString(text,'image/svg+xml')) {
    const xml=parse(raw), root=xml.documentElement;
    if(root?.localName!=='svg'||xml.querySelector('parsererror')) throw Error('Document SVG invalide.');
    const doc=Formats.empty(), skipped=new Map(), sizes={mm:1,cm:10,in:25.4,pt:25.4/72,pc:25.4/6,px:25.4/96};
    const length=(text,fallback)=>{
      const match=text?.trim().match(/^([\d.]+)\s*(mm|cm|in|pt|pc|px)?$/i);
      return match?Number(match[1])*sizes[match[2]?.toLowerCase()??'px']:fallback;
    };
    const view=values(root.getAttribute('viewBox')), pixel=sizes.px;
    const width=length(root.getAttribute('width'),(view[2]||300)*pixel);
    const height=length(root.getAttribute('height'),(view[3]||150)*pixel);
    const sx=view[2]>0?width/view[2]:pixel, sy=view[3]>0?height/view[3]:pixel;
    const alignment=root.getAttribute('preserveAspectRatio')??'xMidYMid meet';
    const uniform=alignment.includes('slice')?Math.max(sx,sy):Math.min(sx,sy);
    const x=alignment.startsWith('none')?sx:uniform,y=alignment.startsWith('none')?sy:uniform;
    const shiftX=(width-(view[2]??width/x)*x)*(alignment.includes('xMax')?1:alignment.includes('xMin')?0:.5);
    const shiftY=(height-(view[3]??height/y)*y)*(alignment.includes('YMax')?1:alignment.includes('YMin')?0:.5);
    const poa=values(root.getAttribute('data-velocivector-poa'));
    const world=poa.length===2&&poa.every(Number.isFinite)?[x,0,0,-y,-poa[0]*x,poa[1]*y]:
      [x,0,0,-y,shiftX-(view[0]??0)*x,height-shiftY+(view[1]??0)*y];
    const ignore=new Set(['defs','metadata','title','desc','namedview','style']);
    const skip=tag=>skipped.set(tag,(skipped.get(tag)??0)+1);
    function walk(element,parent,layer,depth) {
      const tag=element.localName;
      if(ignore.has(tag)) return;
      const attr=id=>element.getAttribute(id), n=(id,fallback=0)=>Number(attr(id)??fallback);
      if(attr('display')==='none'||attr('visibility')==='hidden'||/display\s*:\s*none/i.test(attr('style')??'')) return;
      const matrix=multiply(parent,transformList(attr('transform')??''));
      if(tag==='g'||tag==='svg') {
        const name=attr('inkscape:label')??(depth===1&&tag==='g'?attr('id'):null);
        if(name?.trim()) layer=name.trim().replace(/[\r\n]+/g,' ');
        for(const child of element.children) walk(child,matrix,layer,depth+1);
        return;
      }
      let entities=[];
      try {
        if(tag==='path') entities=svgPath(attr('d')??'');
        else if(tag==='line') entities=[{type:'line',p:[[n('x1'),n('y1')],[n('x2'),n('y2')]]}];
        else if(tag==='polyline'||tag==='polygon') {
          const p=values(attr('points')), points=[];
          for(let i=0;i+1<p.length;i+=2) points.push(p.slice(i,i+2));
          entities=[{type:'poly',p:points,closed:tag==='polygon'}];
        } else if(tag==='rect') {
          const w=n('width'),h=n('height'),a=n('x'),b=n('y');
          const rx=Math.min(w/2,n('rx',n('ry'))),ry=Math.min(h/2,n('ry',n('rx')));
          if(w>0&&h>0) {
            if(rx>0&&ry>0) entities=svgPath(
              'M '+(a+rx)+' '+b+' H '+(a+w-rx)+' A '+rx+' '+ry+' 0 0 1 '+(a+w)+' '+(b+ry)+
              ' V '+(b+h-ry)+' A '+rx+' '+ry+' 0 0 1 '+(a+w-rx)+' '+(b+h)+
              ' H '+(a+rx)+' A '+rx+' '+ry+' 0 0 1 '+a+' '+(b+h-ry)+
              ' V '+(b+ry)+' A '+rx+' '+ry+' 0 0 1 '+(a+rx)+' '+b+' Z');
            else entities=[G.shape('rect',[[a,b],[a+w,b+h]])];
          }
        } else if(tag==='circle'||tag==='ellipse') {
          const r=n('r',n('rx')), ry=n('ry',r);
          if(r>0&&ry>0) entities=[{type:'ellipse',c:[n('cx'),n('cy')],r,ry,a:0}];
        } else {skip(tag);return;}
      } catch {skip(tag);return;}
      const converted=entities.map(e=>svgTransform(e,matrix)).filter(e=>G.serial(e)&&Edit.valid(e));
      if(!converted.length) {skip(tag);return;}
      if(!doc.layers.some(l=>l.name===layer)) doc.layers.push({name:layer,color:'#cbd9eb',visible:true});
      doc.entities.push(...converted.map(e=>({...e,layer})));
    }
    walk(root,world,'0',0);
    return {doc,skipped:[...skipped],unitKnown:true};
  }

  return {importDefaults,optimize,fitClosedCubics,weight,bezierHandleCounts,relations,propose,contourCounts,overlappingTraces,placeProposal,readSVG};
};
const Importing=createImporting(typeof module==='undefined'?G:require('./geometry.js'),typeof module==='undefined'?Edit:require('./editing.js'),
  typeof module==='undefined'?Formal:require('./constraints.js'),typeof module==='undefined'?Formats:require('./formats.js'));
// The launcher opens index.html directly. A Blob worker works without fetching local scripts.
function createImportWorker() {
  const source=`"use strict";
    const G=(${createG})();
    const Edit=(${createEdit})();
    const Formal=(${createFormal})(G,Edit);
    const Formats=(${createFormats})();
    const Importing=(${createImporting})(G,Edit,Formal,Formats);
    self.onmessage=(event)=>{
      const {entities,options,checkOverlaps}=event.data;
      const progress=(phase,done,total)=>self.postMessage({phase,done,total});
      try {
        progress('preparation');
        const proposal=Importing.propose(entities,options,progress);
        const scan=(items,phase)=>{
          progress(phase);
          return Importing.overlappingTraces(items,options.overlapTolerance,(done,total)=>progress(phase,done,total));
        };
        const overlaps=checkOverlaps?{
          source:scan(entities,'sourceOverlaps'),optimized:scan(proposal.entities,'optimizedOverlaps')
        }:null;
        progress('transfer');
        self.postMessage({proposal,overlaps,before:Importing.weight(entities),after:Importing.weight(proposal.entities)});
      } catch(error) {
        self.postMessage({error:error.message});
      }
    };`;
  const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
  try {return new Worker(url);}
  finally {URL.revokeObjectURL(url);}
}
if(typeof module!=='undefined') module.exports=Importing;
