'use strict';
const createFormats=()=>{
  const geometry = typeof module==='undefined' ? G : require('./geometry.js');
  const editing = typeof module==='undefined' ? Edit : require('./editing.js');
  const formal = typeof module==='undefined' ? Formal : require('./constraints.js');
  const units = ['Sans unité','pouce','pied','mile','mm','cm','m','km','micropouce','mil','yard','ångström','nm','µm','dm','dam','hm','gigamètre','UA','année-lumière','parsec','pied US','pouce US','yard US','mile US'];
  const millimeters = [1,25.4,304.8,1609344,1,10,1000,1e6,.0000254,.0254,914.4,1e-7,1e-6,.001,100,1e4,1e5,1e12,149597870700000,9.4607304725808e18,3.085677581491367e19,1200000/3937,100000/3937,3600000/3937,6336000000/3937];
  const empty = () => ({version:1,units:4,layers:[{name:'0',color:'#000000',visible:true}],entities:[]});
  function rasterMime(bytes) {
    const text=(start,count)=>String.fromCharCode(...bytes.subarray(start,start+count));
    if(text(0,8)==='\x89PNG\r\n\x1a\n') return 'image/png';
    if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255) return 'image/jpeg';
    if(text(0,6)==='GIF87a'||text(0,6)==='GIF89a') return 'image/gif';
    if(text(0,4)==='RIFF'&&text(8,4)==='WEBP') return 'image/webp';
    if(bytes.length>=16&&text(4,4)==='ftyp') {
      const boxSize=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(0);
      for(let offset=8;offset+4<=Math.min(boxSize,bytes.length);offset+=4) {
        if(offset!==12&&['avif','avis'].includes(text(offset,4))) return 'image/avif';
      }
    }
    return null;
  }
  function rasterHeader(source) {
    const match=typeof source==='string'&&/^data:(image\/(?:png|jpeg|gif|webp|avif));base64,/.exec(source);
    if(!match) return null;
    const encoded=source.slice(match[0].length);
    if(encoded.length<16||encoded.length%4!==0||/[^A-Za-z0-9+/=]/.test(encoded)) return null;
    const padding=encoded.indexOf('=');
    if(padding!==-1&&(padding<encoded.length-2||!/^[=]{1,2}$/.test(encoded.slice(padding)))) return null;
    try {
      const bytes=Uint8Array.from(atob(encoded.slice(0,344)),char=>char.charCodeAt(0));
      return rasterMime(bytes)===match[1]?bytes:null;
    } catch {return null;}
  }
  function pngSize(source) {
    const bytes=rasterHeader(source);
    if(!bytes||rasterMime(bytes)!=='image/png'||bytes.length<24||
      String.fromCharCode(...bytes.subarray(8,16))!=='\x00\x00\x00\x0dIHDR') return null;
    const view=new DataView(bytes.buffer);
    const size=[view.getUint32(16),view.getUint32(20)];
    return size.every(value=>value>0&&value<=0x7fffffff)?size:null;
  }
  const rasterSource=image=>image.source??image.png;
  function validRasterPlacement(image) {
    return Number.isInteger(image.width)&&image.width>0&&Number.isInteger(image.height)&&image.height>0&&
      Array.isArray(image.center)&&image.center.length===2&&image.center.every(value=>Number.isFinite(value)&&Math.abs(value)<=1e12)&&
      Number.isFinite(image.angle)&&Math.abs(image.angle)<=360&&
      Number.isFinite(image.scale)&&image.scale>0&&Number.isFinite(image.pixelSize)&&image.pixelSize>0&&
      Math.max(image.width,image.height)*image.pixelSize*image.scale<=1e12&&
      [image.activeOpacity,image.inactiveOpacity].every(value=>Number.isFinite(value)&&value>=0&&value<=100);
  }
  function rasterContains(image,point) {
    const local=geometry.sub(point,image.center);
    const angle=-image.angle*Math.PI/180;
    const x=local[0]*Math.cos(angle)-local[1]*Math.sin(angle);
    const y=local[0]*Math.sin(angle)+local[1]*Math.cos(angle);
    const unit=image.pixelSize*image.scale;
    return Math.abs(x)<=image.width*unit/2&&Math.abs(y)<=image.height*unit/2;
  }
  function transformRaster(image,pivot,factor=1,degrees=0) {
    const offset=geometry.mul(geometry.sub(image.center,pivot),factor);
    const radians=degrees*Math.PI/180, cos=Math.cos(radians), sin=Math.sin(radians);
    const center=geometry.add(pivot,[offset[0]*cos-offset[1]*sin,offset[0]*sin+offset[1]*cos]);
    return {...image,center,scale:image.scale*factor,angle:(image.angle+degrees)%360};
  }
  function native(raw) {
    return validateNative(JSON.parse(raw.replace(/^\uFEFF/,'')));
  }

  function validateNative(doc) {
    if(doc?.version!==1 || !Number.isInteger(doc.units) || !units[doc.units] || !Array.isArray(doc.layers) || !Array.isArray(doc.entities)) throw Error('Format de projet incompatible.');
    const names=new Set(), imageLayers=new Set(), originNames=new Set();
    for(const l of doc.layers) {
      if(!l || typeof l.name!=='string' || !l.name.trim() || /[\r\n]/.test(l.name) || names.has(l.name) || !/^#[\da-f]{6}$/i.test(l.color) || typeof l.visible!=='boolean') throw Error('Calque invalide.');
      names.add(l.name);
      if(l.raster!==undefined) {
        const image=l.raster, size=image&&image.source===undefined?pngSize(image.png):null;
        const validSource=image&&(image.source===undefined?
          size?.[0]===image.width&&size?.[1]===image.height:Boolean(rasterHeader(image.source)));
        if(!validSource||!validRasterPlacement(image)||l.origins?.length||l.activeOrigin&&l.activeOrigin!=='POA')
          throw Error('Calque d’image matricielle invalide.');
        imageLayers.add(l.name);
      }
      if(l.constructionVisible!==undefined&&typeof l.constructionVisible!=='boolean') throw Error('Visibilité des traits de construction invalide.');
      if(l.origins!==undefined&&!Array.isArray(l.origins)) throw Error('Origines de travail invalides.');
      for(const origin of l.origins??[]) {
        if(!origin||typeof origin.name!=='string'||!/^POT[1-9]\d*$/.test(origin.name)||
          !Number.isSafeInteger(Number(origin.name.slice(3)))||originNames.has(origin.name)||
          !Array.isArray(origin.target)||origin.target.length!==2||
          !origin.target.every(v=>Number.isFinite(v)&&Math.abs(v)<=1e12)) throw Error('Origine de travail invalide.');
        originNames.add(origin.name);
      }
      if(l.activeOrigin!==undefined&&l.activeOrigin!=='POA'&&!(l.origins??[]).some(o=>o.name===l.activeOrigin))
        throw Error('Origine de travail active invalide.');
    }
    if(names.size===imageLayers.size || doc.entities.some(e=>!geometry.serial(e) || !editing.valid(e) || (!names.has(e.layer)||imageLayers.has(e.layer)))) throw Error('Géométrie ou calque invalide.');
    if(doc.texts!==undefined) {
      const ids=new Set();
      if(!Array.isArray(doc.texts)||doc.texts.some(text=>{
        if(!text||!Number.isSafeInteger(text.id)||text.id<1||ids.has(text.id)||!names.has(text.layer)||imageLayers.has(text.layer)) return true;
        ids.add(text.id);
        return typeof text.content!=='string'||!text.content.trim()||text.content.length>2000||
          typeof text.family!=='string'||!text.family.trim()||text.family.length>128||
          !Array.isArray(text.p)||text.p.length!==2||!text.p.every(v=>Number.isFinite(v)&&Math.abs(v)<=1e12)||
          !['left','center','right'].includes(text.align)||!['straight','arc','linked'].includes(text.pathMode)||
          !['height','width','angle','letter','line','radius','along','offset','fraction'].every(key=>Number.isFinite(text[key])&&Math.abs(text[key])<=1e12)||
          text.height<=0||text.width<=0||text.line<0||text.radius<0||text.fraction<0||text.fraction>1||
          typeof text.reverse!=='boolean'||typeof text.inside!=='boolean'||typeof text.upright!=='boolean'||
          text.pathMode==='linked'&&(!Number.isSafeInteger(text.pathId)||text.pathId<1);
      })) throw Error('Texte du projet invalide.');
    }
    if(Array.isArray(doc.constraints)) {
      const items=new Map(doc.entities.map(entity=>[entity.id,entity]));
      // Older files can contain a redundant coincidence left by joining a contour.
      doc.constraints=doc.constraints.filter(c=>{
        const refs=c?.refs;
        if(c?.type!=='coincident'||c.origin!==undefined||!Array.isArray(refs)||refs.length!==2) return true;
        const [first,second]=refs;
        if(![first,second].every(ref=>ref?.kind==='point'&&Number.isSafeInteger(ref.id)&&Number.isInteger(ref.index)&&ref.index>=0)||
          !formal.sameRef(first,second)) return true;
        return !Array.isArray(formal.resolve(items,first));
      });
    }
    if(doc.constraints!==undefined&&(!formal.valid(doc.entities,doc.constraints)||
      doc.constraints.some(c=>formal.isDimension(c)&&c.layer!==undefined&&!names.has(c.layer)))) throw Error('Contraintes de projet invalides.');
    const entities=new Map(doc.entities.map(e=>[e.id,e]));
    const originsByLayer=new Map(doc.layers.map(l=>[l.name,l.origins??[]]));
    for(const c of doc.constraints??[]) if(c.type==='coincident'&&c.origin) {
      const target=c.origin==='POA'?[0,0]:originsByLayer.get(entities.get(c.refs[0].id)?.layer)?.find(o=>o.name===c.origin)?.target;
      if(!target||geometry.dist(target,c.target)>geometry.eps) throw Error('Coïncidence d’origine invalide.');
    }
    for(const c of doc.constraints??[]) if(formal.isDimension(c)) for(const ref of c.refs) {
      if(ref.kind!=='origin') continue;
      const target=ref.name==='POA'?[0,0]:originsByLayer.get(c.layer)?.find(o=>o.name===ref.name)?.target;
      if(!target||geometry.dist(target,ref.target)>geometry.eps) throw Error('Cote d’origine invalide.');
    }
    return doc;
  }

  const aci = ['#cbd9eb','#ff5050','#ffff00','#40e176','#00ffff','#638cff','#ff00ff','#ffffff','#808080','#c0c0c0'];
  function dxfBytes(text) {
    const upper=new TextDecoder('windows-1252').decode(Uint8Array.from({length:128},(_,i)=>i+128));
    const lookup=new Map([...upper].map((char,index)=>[char,index+128]));
    const bytes=[];
    for(const char of text.split('')) {
      const code=char.charCodeAt(0);
      if(code<128) bytes.push(code);
      else if(lookup.has(char)) bytes.push(lookup.get(char));
      else for(const c of '\\U+'+code.toString(16).toUpperCase().padStart(4,'0')) bytes.push(c.charCodeAt(0));
    }
    return Uint8Array.from(bytes);
  }
  function decodeDXF(buffer) {
    const windows=new TextDecoder('windows-1252').decode(buffer);
    if(/\$DWGCODEPAGE\s+3\s+ANSI_1252\b/i.test(windows)&&!/\$ACADVER\s+1\s+AC10(?:2[1-9]|[3-9]\d)\b/i.test(windows))
      return windows;
    try {return new TextDecoder('utf-8',{fatal:true}).decode(buffer);}
    catch {return windows;}
  }
  function read(raw) {
    const lines=raw.replace(/^\uFEFF/,'').replace(/\r/g,'').split('\n');
    while(lines.length%2 && lines.at(-1)==='') lines.pop();
    if(lines.length%2 || lines.length<4) throw Error('Paires DXF incomplètes.');
    const pairs=[];
    for(let i=0;i<lines.length;i+=2) {
      if(!/^\d+$/.test(lines[i].trim())) throw Error('DXF texte invalide ou fichier binaire.');
      pairs.push([Number(lines[i]),lines[i+1].trim()]);
    }
    const doc=empty(), skipped=new Map();
    let section='', sawEntities=false, eof=false, sequence=null, unitKnown=false, sampledSplines=0;
    for(let i=0;i<pairs.length;) {
      const [code,value]=pairs[i++];
      if(code===9 && section==='HEADER' && value==='$INSUNITS') {
        const unit=Number(pairs[i]?.[1]);
        if(pairs[i]?.[0]===70 && unit>0 && units[unit]) {doc.units=unit;unitKnown=true;}
      }
      if(code!==0) continue;
      if(value==='SECTION') {
        if(pairs[i]?.[0]!==2 || section) throw Error('Section DXF invalide.');
        section=pairs[i++][1]; sawEntities ||= section==='ENTITIES'; continue;
      }
      if(value==='ENDSEC') { section=''; sequence=null; continue; }
      if(value==='EOF') { eof=true; break; }
      if(section!=='TABLES' && section!=='ENTITIES') continue;
      const fields=[];
      while(i<pairs.length && pairs[i][0]!==0) fields.push(pairs[i++]);
      const get=k=>fields.find(p=>p[0]===k)?.[1]?.replace(/\\U\+([\dA-F]{4})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)));
      const n=k=>Number(get(k) || NaN), pt=(x,y)=>[n(x),n(y)];
      if(section==='TABLES') {
        if(value==='LAYER' && get(2)) {
          const color=n(420);
          const entry={name:get(2),color:Number.isInteger(color) && color>=0 && color<=0xffffff?'#'+color.toString(16).padStart(6,'0'):aci[Math.abs(n(62))]||aci[0],visible:!(n(62)<0 || (n(70)&1))};
          const index=doc.layers.findIndex(l=>l.name===entry.name);
          if(index<0) doc.layers.push(entry); else doc.layers[index]=entry;
        }
        continue;
      }
      const layer=get(8)||'0';
      let e;
      const rad=Math.PI/180;
      const planar=fields.every(([k,v])=>![30,31,32,33,38,39,210,220,230].includes(k) || Number(v)===(k===230?1:0));
      if(planar) switch(value) {
        case 'LINE': e={type:'line',p:[pt(10,20),pt(11,21)]}; break;
        case 'CIRCLE': e={type:'circle',c:pt(10,20),r:n(40)}; break;
        case 'ARC': e={type:'arc',c:pt(10,20),r:n(40),a:n(50)*rad,s:geometry.mod((n(51)-n(50))*rad)}; break;
        case 'ELLIPSE': {
          const start=Number.isFinite(n(41))?n(41):0, end=Number.isFinite(n(42))?n(42):geometry.tau;
          const r=Math.hypot(...pt(11,21)), full=Math.abs(end-start-geometry.tau)<1e-8;
          e={type:'ellipse',c:pt(10,20),r,ry:r*n(40),a:Math.atan2(n(21),n(11)),
            ...(full?{}:{t:geometry.mod(start),s:geometry.mod(end-start)})};
          break;
        }
        case 'LWPOLYLINE': {
          const vertices=[];
          for(const [k,v] of fields) {
            if(k===10) vertices.push({p:[Number(v),NaN],bulge:0});
            if(k===20 && vertices.length) vertices.at(-1).p[1]=Number(v);
            if(k===42 && vertices.length) vertices.at(-1).bulge=Number(v);
          }
          e=polyline(vertices,Boolean(n(70)&1)); break;
        }
        case 'POLYLINE': sequence={layer,flags:n(70)||0,vertices:[],valid:true}; continue;
        case 'VERTEX':
          if(sequence) {sequence.vertices.push({p:pt(10,20),bulge:get(42)===undefined?0:n(42)});continue;}
          break;
        case 'SEQEND':
          if(sequence) {
            if(sequence.valid && !(sequence.flags&~129)) e=polyline(sequence.vertices,Boolean(sequence.flags&1));
            if(e) e.layer=sequence.layer;
            sequence=null;
          }
          break;
        case 'SPLINE': e=readSpline(fields,n(71),n(70)||0,.01/millimeters[doc.units]); break;
      }
      if(value==='VERTEX' && sequence) {sequence.valid=false;continue;}
      if(value==='POLYLINE') sequence=null;
      if(value==='SEQEND') sequence=null;
      const entities=Array.isArray(e)?e:[e];
      if(entities.length&&entities.every(entity=>geometry.serial(entity))) {
        if(value==='SPLINE'&&Array.isArray(e)) sampledSplines++;
        for(const entity of entities) {
          entity.layer??=layer;
          if(!doc.layers.some(l=>l.name===entity.layer)) doc.layers.push({name:entity.layer,color:aci[0],visible:true});
          doc.entities.push(entity);
        }
      } else skipped.set(value,(skipped.get(value)||0)+1);
    }
    if(!eof || !sawEntities || section) throw Error('Sections ou fin de fichier DXF manquantes.');
    return {doc,skipped:[...skipped],unitKnown,sampledSplines};
  }

  function readSpline(fields,degree,flags,tolerance) {
    const values=code=>fields.filter(([key])=>key===code).map(([,value])=>Number(value));
    const xs=values(10), ys=values(20), knots=values(40), weights=values(41);
    const count=xs.length;
    if(!Number.isInteger(degree)||degree<1||degree>=count||xs.length!==ys.length||
      knots.length!==count+degree+1||!knots.every((k,i)=>Number.isFinite(k)&&(!i||k>=knots[i-1]))||
      !(knots[count]>knots[degree])||
      ![...xs,...ys].every(Number.isFinite)||
      weights.length&&(weights.length!==count||!weights.every(w=>Number.isFinite(w)&&w>0))) return null;
    const points=xs.map((x,i)=>[x,ys[i]]);
    if(degree===3&&count===4&&!(flags&3)&&weights.every(w=>w===weights[0])&&
      knots.slice(0,4).every(k=>k===knots[0])&&knots.slice(4).every(k=>k===knots[4])) {
      return {type:'bezier',p:points};
    }
    const controls=points.map(([x,y],i)=>{
      const w=weights[i]??1;return [x*w,y*w,w];
    });
    function evaluate(span,t) {
      // De Boor in homogeneous coordinates preserves the original knot vector and weights.
      const work=controls.slice(span-degree,span+1);
      for(let level=1;level<=degree;level++) for(let j=degree;j>=level;j--) {
        const i=span-degree+j, width=knots[i+degree-level+1]-knots[i];
        const factor=width>0?(t-knots[i])/width:0;
        work[j]=work[j-1].map((value,k)=>value+(work[j][k]-value)*factor);
      }
      const [x,y,w]=work[degree];
      return [x/w,y/w];
    }
    const runs=[];
    let output=[], samples=0;
    function subdivide(span,a,b,p,q,depth) {
      const mid=(a+b)/2, middle=evaluate(span,mid);
      const check=[evaluate(span,(a+mid)/2),middle,evaluate(span,(mid+b)/2)];
      if(check.every(r=>geometry.dist(r,geometry.nearest(p,q,r))<=tolerance)) {
        if(++samples>250_000) return false;
        if(geometry.dist(output.at(-1),q)>geometry.eps) output.push(q);
        return true;
      }
      if(depth>=18||mid===a||mid===b) return false;
      return subdivide(span,a,mid,p,middle,depth+1)&&subdivide(span,mid,b,middle,q,depth+1);
    }
    for(let i=degree;i<count;i++) {
      const a=knots[i], b=knots[i+1];
      if(a===b) continue;
      const p=evaluate(i,a), q=evaluate(i,b);
      if(!output.length||geometry.dist(output.at(-1),p)>geometry.eps*8) {
        if(output.length) runs.push(output);
        output=[p];
      }
      if(!subdivide(i,a,b,p,q,0)) return null;
    }
    if(output.length) runs.push(output);
    return runs.filter(p=>p.length>=2).map(p=>{
      const closed=runs.length===1&&p.length>3&&
        geometry.dist(p[0],p.at(-1))<=Math.max(geometry.eps*8,tolerance*1e-3);
      return {type:'poly',p:closed?p.slice(0,-1):p,closed};
    });
  }

  function polyline(vertices,closed) {
    const p=vertices.map(v=>v.p);
    if(p.length<(closed?3:2) && !(closed && p.length===2 && vertices.some(v=>v.bulge))) return null;
    if(!vertices.some(v=>v.bulge!==0)) return {type:'poly',p,closed};
    const segments=[];
    for(let i=0;i<p.length-(closed?0:1);i++) {
      const a=p[i], b=p[(i+1)%p.length], bulge=vertices[i].bulge;
      const m=geometry.mid(a,b), v=geometry.sub(b,a);
      if(!Number.isFinite(bulge)) return null;
      if(bulge===0) segments.push({type:'line',p:[a,b]});
      else {
        const curve=geometry.arc(a,geometry.add(m,geometry.mul([v[1],-v[0]],bulge/2)),b);
        if(!curve) return null;
        segments.push(curve);
      }
    }
    return {type:'path',segments,closed};
  }

  function exportStrokes(entity,includeConstruction) {
    if(!entity.constructionParts) return includeConstruction||!entity.construction?[entity]:[];
    const runs=[];
    for(const [index,part] of geometry.strokeParts(entity).entries()) {
      const style=geometry.constructionAt(entity,index), last=runs.at(-1);
      if(last&&last.style===style) last.parts.push(part);
      else runs.push({style,parts:[part]});
    }
    if(entity.closed&&runs.length>1&&runs[0].style===runs.at(-1).style) runs[0].parts.unshift(...runs.pop().parts);
    return runs.filter(run=>includeConstruction||!run.style).map(({style,parts})=>{
      const stroke=parts.length===1?parts[0]:{type:'path',segments:parts,closed:entity.closed===true&&runs.length===1};
      return geometry.withConstruction({...stroke,layer:entity.layer},style);
    });
  }
  function exportSubset(doc,{layerNames,selectedIds,selectedSegments=new Map()}={}) {
    const entities=doc.entities.flatMap(entity=>{
      if(entity.type==='point'||layerNames&&!layerNames.has(entity.layer)||selectedIds&&!selectedIds.has(entity.id)) return [];
      const indices=selectedIds&&selectedSegments.get(entity.id);
      if(!indices) return [entity];
      const omitted=new Set(geometry.strokeParts(entity).flatMap((_,index)=>indices.has(index)?[]:[index]));
      return editing.removeSegments(entity,omitted).map(part=>({...part,layer:entity.layer}));
    });
    const used=selectedIds?new Set(entities.map(entity=>entity.layer)):layerNames;
    const layers=doc.layers.filter(layer=>!layer.raster&&(!used||used.has(layer.name)));
    return {units:doc.units,layers,entities};
  }
  function hasExportGeometry(doc,includeConstruction) {
    return doc.entities.some(e=>e.type!=='point'&&(includeConstruction||geometry.hasRegularStroke(e)));
  }

  function write(doc,version=false,{includeConstruction=false}={}) {
    const legacy=version===true||version==='r12', r14=version==='r14';
    if((legacy||r14)&&doc.units!==4) {
      const scale=millimeters[doc.units];
      doc={...doc,units:4,entities:doc.entities.map(e=>geometry.transform(e,p=>geometry.mul(p,scale),0,scale))};
    }
    const rows=[];
    const pair=(...p)=>rows.push(...p);
    const p=(code,[x,y])=>pair(code,x,code+10,y,code+20,0);
    let nextHandle=16;
    const handle=()=> (nextHandle++).toString(16).toUpperCase();
    const table=(name,count)=>{
      const id=handle();
      pair(0,'TABLE',2,name);
      if(!legacy) pair(5,id,330,'0',100,'AcDbSymbolTable');
      pair(70,count);
      return id;
    };
    const record=(name,owner,subclass,id=handle())=>{
      pair(0,name);
      if(!legacy) pair(5,id,330,owner,100,'AcDbSymbolTableRecord',100,subclass);
    };
    const rad=180/Math.PI;
    const vectorLayers=doc.layers.filter(layer=>!layer.raster);
    const layerList=vectorLayers.some(l=>l.name==='0')?vectorLayers:[{name:'0',color:'#000000',visible:true},...vectorLayers];
    const layers=new Map(layerList.map((l,i)=>[l.name,legacy?(l.name==='0'?'0':'CALQUE_'+i):l.name.replace(/[<>/\\":;?*|=,]/g,'_')]));
    const used=new Set();
    for(const [name,value] of layers) {
      let unique=value;
      for(let i=2;used.has(unique.toUpperCase());i++) unique=value+'_'+i;
      used.add(unique.toUpperCase());layers.set(name,unique);
    }
    pair(0,'SECTION',2,'HEADER',9,'$ACADVER',1,legacy?'AC1009':r14?'AC1014':'AC1015');
    pair(9,'$INSBASE');p(10,[0,0]);
    let seed;
    if(!legacy) {
      pair(9,'$DWGCODEPAGE',3,'ANSI_1252');
      if(r14) pair(9,'$MEASUREMENT',70,1);
      else pair(9,'$INSUNITS',70,doc.units);
      pair(9,'$HANDSEED',5);
      seed=rows.length;pair(null);
    }
    const constructionTypes={dashed:'VCV_TIRETS',dotted:'VCV_POINTS',dashDot:'VCV_TIRET_POINT'};
    const strokes=doc.entities.flatMap(e=>e.type==='point'?[]:exportStrokes(e,includeConstruction));
    const constructions=new Set(strokes.map(e=>e.construction).filter(Boolean));
    pair(0,'ENDSEC',0,'SECTION',2,'TABLES');
    const linetypes=legacy?['CONTINUOUS']:['BYBLOCK','BYLAYER','CONTINUOUS'];
    const ltypeTable=table('LTYPE',linetypes.length+constructions.size);
    for(const name of linetypes) {
      record('LTYPE',ltypeTable,'AcDbLinetypeTableRecord');
      pair(2,name,70,0,3,name==='CONTINUOUS'?'Solid line':'',72,65,73,0,40,0);
    }
    for(const style of constructions) {
      const {label,pattern}=geometry.constructionStyles[style];
      const lengths=pattern.map((n,i)=>(i%2?-n:n)/millimeters[doc.units]);
      record('LTYPE',ltypeTable,'AcDbLinetypeTableRecord');
      pair(2,constructionTypes[style],70,0,3,label,72,65,73,lengths.length,
        40,lengths.reduce((sum,n)=>sum+Math.abs(n),0));
      for(const n of lengths) {pair(49,n);if(!legacy) pair(74,0);}
    }
    pair(0,'ENDTAB');
    const layerTable=table('LAYER',layerList.length);
    for(const l of layerList) {
      const rgb=parseInt(l.color.slice(1),16);
      const color=aci.slice(1).map((hex,i)=>{
        const code=parseInt(hex.slice(1),16);
        return [i+1,[0,8,16].reduce((sum,shift)=>sum+(((rgb>>shift)&255)-((code>>shift)&255))**2,0)];
      }).sort((a,b)=>a[1]-b[1])[0][0];
      record('LAYER',layerTable,'AcDbLayerTableRecord');
      const index=rgb===0?7:color;
      pair(2,layers.get(l.name),70,0,62,l.visible?index:-index,6,'CONTINUOUS');
    }
    pair(0,'ENDTAB');
    let modelSpace;
    if(!legacy) {
      const id=table('BLOCK_RECORD',2);
      const spaces=[['*Model_Space',handle()],['*Paper_Space',handle()]];
      modelSpace=spaces[0][1];
      for(const [name,owner] of spaces) {
        record('BLOCK_RECORD',id,'AcDbBlockTableRecord',owner);
        pair(2,name);
      }
      pair(0,'ENDTAB',0,'ENDSEC',0,'SECTION',2,'BLOCKS');
      for(const [name,owner] of spaces) {
        begin('BLOCK','0','AcDbBlockBegin',null,owner);
        pair(2,name,70,0);p(10,[0,0]);pair(3,name,1,'');
        begin('ENDBLK','0','AcDbBlockEnd',null,owner);
      }
    }
    pair(0,'ENDSEC',0,'SECTION',2,'ENTITIES');
    function begin(type,layer,subclass,style,owner=modelSpace) {
      pair(0,type);
      if(!legacy) pair(5,handle(),330,owner,100,'AcDbEntity');
      pair(8,layer);
      if(style) pair(6,constructionTypes[style]);
      if(!legacy) pair(100,subclass);
    }
    const curvePolyline=(points,closed,layer,bulges=[],style)=>{
      if(legacy) {
        begin('POLYLINE',layer,undefined,style);pair(66,1);p(10,[0,0]);pair(70,closed?1:0);
        points.forEach((v,i)=>{begin('VERTEX',layer);p(10,v);if(bulges[i]) pair(42,bulges[i]);});
        begin('SEQEND',layer);
      } else {
        begin('LWPOLYLINE',layer,'AcDbPolyline',style);pair(90,points.length,70,closed?1:0);
        points.forEach(([x,y],i)=>{pair(10,x,20,y);if(bulges[i])pair(42,bulges[i]);});
      }
    };
    const needsSeparateCurves=e=>e.type==='path'&&e.segments.some(part=>part.type==='bezier'||part.type==='ellipse');
    const entities=legacy?strokes:strokes.flatMap(e=>{
      const parts=e.type==='spline'?geometry.splineSpans(e):needsSeparateCurves(e)?e.segments:null;
      return parts?parts.map(part=>({...part,layer:e.layer,construction:e.construction})):[e];
    });
    for(const e of entities) {
      const l=layers.get(e.layer), style=e.construction;
      if(e.type==='line') {begin('LINE',l,'AcDbLine',style);p(10,e.p[0]);p(11,e.p[1]);}
      if(e.type==='circle' || e.type==='arc') {
        begin(e.type.toUpperCase(),l,'AcDbCircle',style);p(10,e.c);pair(40,e.r);
        if(e.type==='arc') {
          if(!legacy) pair(100,'AcDbArc');
          const end=e.a+e.s;
          pair(50,geometry.mod(e.s>0?e.a:end)*rad,51,geometry.mod(e.s>0?end:e.a)*rad);
        }
      }
      if(e.type==='poly') curvePolyline(e.p,e.closed,l,[],style);
      if(e.type==='path') {
        if(needsSeparateCurves(e)) {
          const points=geometry.trace(e,Math.max(1,Formats.millimeters[doc.units]*10));
          curvePolyline(e.closed?points.slice(0,-1):points,e.closed,l,[],style);
          continue;
        }
        const p=[],b=[];
        for(const s of e.segments) {
          p.push(s.type==='line'?s.p[0]:geometry.polar(s.c,s.r,s.a));
          b.push(s.type==='arc'?Math.tan(s.s/4):0);
        }
        const last=e.segments.at(-1);
        if(!e.closed) p.push(last.type==='line'?last.p[1]:geometry.polar(last.c,last.r,last.a+last.s));
        curvePolyline(p,e.closed,l,b,style);
      }
      if(e.type==='ellipse' || e.type==='bezier' || e.type==='spline') {
        if(legacy) {
          const points=geometry.trace(e,Math.max(1,Formats.millimeters[doc.units]*10));
          const closed=e.type==='ellipse'&&e.s===undefined||e.closed===true;
          curvePolyline(closed?points.slice(0,-1):points,closed,l,[],style);
        } else if(e.type==='ellipse') {
          const swap=e.ry>e.r, a=e.a+(swap?Math.PI/2:0);
          begin('ELLIPSE',l,'AcDbEllipse',style);p(10,e.c);p(11,geometry.polar([0,0],Math.max(e.r,e.ry),a));
          const start=(e.t??0)-(swap?Math.PI/2:0),s=e.s??geometry.tau;
          pair(40,Math.min(e.r,e.ry)/Math.max(e.r,e.ry),41,e.s===undefined?0:geometry.mod(s>0?start:start+s),
            42,e.s===undefined?geometry.tau:geometry.mod(s>0?start+s:start));
        } else {
          begin('SPLINE',l,'AcDbSpline',style);pair(210,0,220,0,230,1,70,8,71,3,72,8,73,4,74,0);
          for(const k of [0,0,0,0,1,1,1,1]) pair(40,k);
          for(const v of e.p) p(10,v);
        }
      }
    }
    pair(0,'ENDSEC',0,'EOF');
    if(!legacy) rows[seed]=handle();
    return rows.join('\r\n')+'\r\n';
  }
  function writeSVG(doc,{includeConstruction=false}={}) {
    const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'})[c]);
    const strokes=doc.entities.flatMap(e=>e.type==='point'?[]:exportStrokes(e,includeConstruction));
    const mm=millimeters[doc.units], lineWidth=.15/mm, margin=lineWidth/2;
    let minX=0,minY=0,maxX=0,maxY=0;
    for(const stroke of strokes) for(const [x,y] of geometry.boundsPoints(stroke)) {
      minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
    }
    // Write directly in page coordinates for importers with limited transform support.
    const left=minX<0?minX-margin:0, bottom=minY<0?minY-margin:0;
    const right=maxX+margin, top=maxY+margin;
    const width=Math.max(lineWidth,right-left), height=Math.max(lineWidth,top-bottom);
    const page=([x,y])=>[x-left,top-y];
    const point=p=>page(p).join(' ');
    const curve=e=>{
      if(e.type==='line') return 'L '+point(e.p[1]);
      if(e.type==='bezier') return 'C '+e.p.slice(1).map(point).join(' ');
      const ellipse=e.type==='ellipse', sweep=e.s, direction=sweep<0?1:0;
      const command=(end,large)=>'A '+e.r+' '+(ellipse?e.ry:e.r)+' '+(ellipse?-e.a*180/Math.PI:0)+' '+large+' '+direction+' '+point(end);
      if(Math.abs(sweep)>=geometry.tau-geometry.eps) return command(geometry.traceAt(e,.5),0)+' '+command(geometry.traceAt(e,1),0);
      return command(geometry.traceAt(e,1),Math.abs(sweep)>Math.PI?1:0);
    };
    const element=e=>{
      if(e.type==='circle') {
        const [x,y]=page(e.c);
        return '<circle cx="'+x+'" cy="'+y+'" r="'+e.r+'"/>';
      }
      if(e.type==='ellipse'&&e.s===undefined) e={...e,t:0,s:geometry.tau,closed:true};
      const parts=['line','arc','bezier','ellipse'].includes(e.type)?[e]:geometry.strokeParts(e);
      if(!parts.length) return '';
      return '<path d="M '+point(editing.ends(parts[0])[0])+' '+parts.map(curve).join(' ')+(e.closed?' Z':'')+'"/>';
    };
    const vectorLayers=doc.layers.filter(layer=>!layer.raster);
    const groups=new Map(vectorLayers.map(l=>[l.name,[]]));
    for(const stroke of strokes) {
      const path=element(stroke);
      const pattern=geometry.constructionStyles[stroke.construction]?.pattern;
      groups.get(stroke.layer)?.push(pattern?'<g stroke-dasharray="'+pattern.map(n=>n/mm).join(' ')+'">'+path+'</g>':path);
    }
    const physical=n=>n*mm+'mm';
    const layers=vectorLayers.map((l,i)=>'<g id="layer'+i+'" inkscape:groupmode="layer" inkscape:label="'+escape(l.name)+
      '" stroke="'+escape(l.color)+'"'+(l.visible?'':' display="none"')+'>'+groups.get(l.name).join('')+'</g>');
    return '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"'+
      ' width="'+physical(width)+'" height="'+physical(height)+'" viewBox="'+[0,0,width,height].join(' ')+
      '" data-velocivector-poa="'+point([0,0])+'">\n'+
      '<g fill="none" stroke-width="'+lineWidth+'">\n'+layers.join('\n')+'\n</g>\n</svg>\n';
  }
  return {units,millimeters,empty,native,validateNative,pngSize,rasterMime,rasterSource,validRasterPlacement,rasterContains,transformRaster,read,write,dxfBytes,decodeDXF,writeSVG,exportSubset,hasExportGeometry};
};
const Formats=createFormats();
if(typeof module!=='undefined') module.exports=Formats;

