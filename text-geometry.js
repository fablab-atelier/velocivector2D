'use strict';
const TextGeometry=(G=>{
  const em=384;
  const generic=new Set(['serif','sans-serif','monospace','cursive','fantasy','system-ui']);
  const fonts=['Arial','Calibri','Cambria','Georgia','Segoe UI','Times New Roman','Verdana','Courier New',
    'system-ui','sans-serif','serif','monospace','cursive'];
  const font=family=>em+'px '+(generic.has(family)?family:JSON.stringify(family));
  const clusters=text=>typeof Intl.Segmenter==='function'?
    [...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].map(item=>item.segment):Array.from(text);

  function wordRange(text,index) {
    if(index<0||index>=text.length) return null;
    if(typeof Intl.Segmenter==='function') {
      const part=new Intl.Segmenter(undefined,{granularity:'word'}).segment(text).containing(index);
      return part?.isWordLike?[part.index,part.index+part.segment.length]:null;
    }
    for(const match of text.matchAll(/[\p{L}\p{M}\p{N}_]+(?:[’'][\p{L}\p{M}\p{N}_]+)*/gu)) {
      if(index>=match.index&&index<match.index+match[0].length) return [match.index,match.index+match[0].length];
    }
    return null;
  }

  function course(entity,radius,scale) {
    if(!entity) return null;
    const round=['circle','arc'].includes(entity.type), original=entity;
    if(round&&radius>0) entity={...entity,r:radius};
    if(round) {
      const start=entity.type==='arc'?entity.a:0, sweep=entity.s??(entity.reversed?-G.tau:G.tau);
      const length=entity.r*Math.abs(sweep), closed=Math.abs(sweep)>=G.tau-G.eps;
      return {length,closed,
        at(distance) {
          const a=start+distance/entity.r*Math.sign(sweep), outward=[Math.cos(a),Math.sin(a)];
          return {q:G.add(entity.c,G.mul(outward,entity.r)),angle:a+Math.sign(sweep)*Math.PI/2,outward};
        },
        pick(q) {
          const offset=G.mod((G.angle(original.c,q)-start)*Math.sign(sweep)), fraction=offset/Math.abs(sweep);
          if(fraction<=1) return fraction;
          return G.dist(q,G.polar(original.c,original.r,start))<=G.dist(q,G.polar(original.c,original.r,start+sweep))?0:1;
        }
      };
    }
    const points=G.trace(entity,Math.max(scale,32));
    if(points.length<2) return null;
    const closed=Boolean(entity.closed)||G.dist(points[0],points.at(-1))<=G.eps;
    if(closed&&G.dist(points[0],points.at(-1))>G.eps) points.push(points[0]);
    const parts=[];let length=0,area=0;
    for(let i=1;i<points.length;i++) {
      const a=points[i-1],b=points[i],size=G.dist(a,b);
      if(size<=G.eps) continue;
      parts.push({a,b,size,start:length});length+=size;area+=G.cross(a,b);
    }
    if(!length) return null;
    return {length,closed,
      at(distance) {
        let low=0,high=parts.length-1;
        while(low<high) {
          const mid=(low+high)>>1;
          if(parts[mid].start+parts[mid].size<distance) low=mid+1;else high=mid;
        }
        const {a,b,size,start}=parts[low], angle=G.angle(a,b);
        const direction=closed&&area>0?-1:1;
        return {q:G.add(a,G.mul(G.sub(b,a),(distance-start)/size)),angle,
          outward:[-Math.sin(angle)*direction,Math.cos(angle)*direction]};
      },
      pick(q) {
        let nearest=Infinity,result=0;
        for(const {a,b,start} of parts) {
          const p=G.nearest(a,b,q), gap=G.dist(p,q);
          if(gap<nearest) {nearest=gap;result=(start+G.dist(a,p))/length;}
        }
        return result;
      }
    };
  }

  function layout(text,entities,context,mm,carets) {
    context.save();context.font=font(text.family);
    const height=text.height/mm, cap=context.measureText('H').actualBoundingBoxAscent||em*.7;
    const sy=height/cap,sx=sy*text.width/100, theta=text.angle*Math.PI/180, radius=text.radius/mm;
    let path=text.pathMode==='linked'?course(entities.get(text.pathId),radius,height*16):null;
    if(text.pathMode==='arc'&&radius>0) {
      const center=G.sub(text.p,G.polar([0,0],radius,theta+Math.PI/2));
      path=course({type:'circle',c:center,r:radius,reversed:true},0,1);
    }
    const origin=path?(text.pathMode==='arc'?G.mod(-theta-Math.PI/2)/G.tau:text.fraction)*path.length:0;
    const placement=(midpoint,y)=>{
      let q, angle=theta;
      if(path) {
        const direction=text.reverse?-1:1;
        let distance=origin+direction*(midpoint+text.along/mm);
        if(path.closed) distance=((distance%path.length)+path.length)%path.length;
        if(distance>=0&&distance<=path.length) {
          const location=path.at(distance);
          const offset=(text.offset/mm+y)*(text.inside?-1:1);
          q=G.add(location.q,G.mul(location.outward,offset));
          angle=text.upright?0:location.angle+(text.reverse?Math.PI:0)+(text.pathMode==='arc'?0:theta);
        }
      } else {
        const c=Math.cos(theta),s=Math.sin(theta);
        q=G.add(text.p,[midpoint*c-y*s,midpoint*s+y*c]);
      }
      return {q,angle};
    };
    const addCaret=(index,x,y)=>{
      if(!carets) return;
      const {q,angle}=placement(x,y);
      if(q) carets.push({index,q,angle,height});
    };
    const chars=[];
    let lineIndex=0;
    for(const [row,line] of text.content.split('\n').entries()) {
      const glyphs=clusters(line).map(value=>({value,metrics:context.measureText(value)}));
      const tracking=text.letter/mm, advance=({metrics})=>metrics.width*sx;
      const width=glyphs.reduce((sum,glyph)=>sum+advance(glyph),0)+Math.max(0,glyphs.length-1)*tracking;
      let x=text.align==='center'?-width/2:text.align==='right'?-width:0;
      const y=-row*(height+text.line/mm);
      let index=lineIndex;
      for(const {value,metrics} of glyphs) {
        const size=metrics.width*sx, midpoint=x+size/2;
        addCaret(index,x-(index===lineIndex?0:tracking/2),y);
        const {q,angle}=placement(midpoint,y);
        if(q&&!/^\s*$/u.test(value)) chars.push({value,index,metrics,q,angle,sx,sy,half:metrics.width/2});
        x+=size+tracking;index+=value.length;
      }
      addCaret(index,x-(glyphs.length?tracking:0),y);
      lineIndex+=line.length+1;
    }
    context.restore();
    return chars;
  }

  function position(glyph,x,y) {
    const dx=(x-glyph.half)*glyph.sx,dy=-y*glyph.sy;
    const c=Math.cos(glyph.angle),s=Math.sin(glyph.angle);
    return G.add(glyph.q,[dx*c-dy*s,dx*s+dy*c]);
  }

  function contours(mask,width,height) {
    const edges=new Map(), stride=width+1;
    const edge=(x,y,u,v)=>{
      const a=y*stride+x,b=v*stride+u;
      if(!edges.has(a)) edges.set(a,[]);
      edges.get(a).push(b);
    };
    for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
      const i=y*width+x;
      if(!mask[i]) continue;
      if(!y||!mask[i-width]) edge(x,y,x+1,y);
      if(x===width-1||!mask[i+1]) edge(x+1,y,x+1,y+1);
      if(y===height-1||!mask[i+width]) edge(x+1,y+1,x,y+1);
      if(!x||!mask[i-1]) edge(x,y+1,x,y);
    }
    const rings=[];
    while(edges.size) {
      const first=edges.keys().next().value, ring=[];
      let from=first,previous=null;
      do {
        ring.push([from%stride,Math.floor(from/stride)]);
        const next=edges.get(from);
        if(!next?.length) break;
        let index=0;
        if(previous!==null&&next.length>1) {
          const x=from%stride-previous%stride,y=Math.floor(from/stride)-Math.floor(previous/stride);
          const score=to=>x*(Math.floor(to/stride)-Math.floor(from/stride))-y*(to%stride-from%stride);
          if(score(next[1])>score(next[0])) index=1;
        }
        const [to]=next.splice(index,1);
        if(!next.length) edges.delete(from);
        previous=from;from=to;
      } while(from!==first);
      // Remove runs on the same grid line before reducing small raster steps.
      const corners=ring.filter((p,i)=>{
        const a=ring[(i+ring.length-1)%ring.length],b=ring[(i+1)%ring.length];
        return G.cross(G.sub(p,a),G.sub(b,p))!==0;
      });
      if(from===first&&corners.length>=3) rings.push(corners);
    }
    return rings;
  }

  function simplify(points,tolerance) {
    if(points.length<=3) return points;
    const first=points[0];
    let split=1;
    for(let i=2;i<points.length;i++) if(G.dist(points[i],first)>G.dist(points[split],first)) split=i;
    const chain=list=>{
      const keep=new Set([0,list.length-1]),pending=[[0,list.length-1]];
      while(pending.length) {
        const [a,b]=pending.pop();
        let furthest=tolerance,index=-1;
        for(let i=a+1;i<b;i++) {
          const gap=G.dist(list[i],G.nearest(list[a],list[b],list[i]));
          if(gap>furthest) {furthest=gap;index=i;}
        }
        if(index>=0) {keep.add(index);pending.push([a,index],[index,b]);}
      }
      return list.filter((_,i)=>keep.has(i));
    };
    const reduced=chain(points.slice(0,split+1)).slice(0,-1).concat(chain([...points.slice(split),first]).slice(0,-1));
    return reduced.length>=3?reduced:points;
  }

  function vectorize(text,entities,measure,canvas,mm) {
    const result=[], context=canvas.getContext('2d',{willReadFrequently:true}), cache=new Map();
    const family=font(text.family);
    for(const glyph of layout(text,entities,measure,mm)) {
      if(!cache.has(glyph.value)) {
        const m=glyph.metrics, left=Math.floor(-m.actualBoundingBoxLeft)-2, top=Math.floor(-m.actualBoundingBoxAscent)-2;
        canvas.width=Math.max(1,Math.ceil(m.actualBoundingBoxRight)-left+2);
        canvas.height=Math.max(1,Math.ceil(m.actualBoundingBoxDescent)-top+2);
        context.font=family;context.textAlign='left';context.textBaseline='alphabetic';context.fillStyle='#000';
        context.fillText(glyph.value,-left,-top);
        const data=context.getImageData(0,0,canvas.width,canvas.height).data;
        const mask=Uint8Array.from({length:canvas.width*canvas.height},(_,i)=>data[i*4+3]>=128?1:0);
        cache.set(glyph.value,contours(mask,canvas.width,canvas.height).map(ring=>
          simplify(ring,.7).map(([x,y])=>[x+left,y+top])));
      }
      for(const ring of cache.get(glyph.value)) {
        const p=ring.map(([x,y])=>position(glyph,x,y));
        const shape={type:'poly',p,closed:true,layer:text.layer};
        if(G.serial(shape)) result.push(shape);
      }
    }
    return result;
  }

  return {fonts,font,wordRange,course,layout,position,contours,vectorize};
})(typeof module==='undefined'?G:require('./geometry.js'));
if(typeof module!=='undefined') module.exports=TextGeometry;
