'use strict';
(() => {
  const F=typeof module==='undefined'?Formal:require('../../constraints.js');
  const table=typeof module==='undefined'?DimensionTable:require('../../dimension-table.js');
  const numeric=typeof module==='undefined'?Numeric:require('../../numeric.js');
  const idPattern=/^[a-z][a-z0-9-]{0,47}$/;
  const reserved=new Set(['workshop-builder','airfoils','drone','pulleys','transmissions']);
  const dimensions=source=>{
    const occurrences=new Map();
    return (source.constraints??[]).flatMap((dimension,index)=>{
      if(!F.isDimension(dimension)) return [];
      const signature=F.signature(dimension);
      const n=occurrences.get(signature)??0;
      occurrences.set(signature,n+1);
      return [{key:signature+'#'+n,dimension,index}];
    });
  };
  const nameOf=entry=>entry.dimension.dimensionName??entry.key;
  function dimensionDrivers(source) {
    const entries=dimensions(source);
    const names=new Map(entries.map(entry=>[nameOf(entry).toUpperCase(),entry]));
    const roots=new Map();
    function resolve(entry,seen=new Set()) {
      if(roots.has(entry)) return roots.get(entry);
      if(seen.has(entry)) return entry;
      seen.add(entry);
      const expression=!entry.dimension.driven&&entry.dimension.expression?.trim();
      const next=expression&&/^[A-Za-z_][A-Za-z_0-9]*$/.test(expression)?names.get(expression.toUpperCase()):null;
      const root=next?resolve(next,seen):entry;
      roots.set(entry,root);
      return root;
    }
    const followers=new Map();
    for(const entry of entries) {
      const root=resolve(entry);
      if(root!==entry) followers.set(root,(followers.get(root)??0)+1);
    }
    return entries.map(entry=>{
      const root=roots.get(entry), expression=!entry.dimension.driven?entry.dimension.expression?.trim():'';
      const formula=root===entry&&expression&&!numeric.isLiteral(expression)?expression:'';
      return {...entry,rootKey:root.key,rootName:nameOf(root),formula,terms:formula?numeric.literalTerms(formula):[],
        sources:formula?[...new Set(numeric.references(formula).map(ref=>names.get(ref.toUpperCase())).filter(Boolean)
          .map(source=>roots.get(source).key).filter(key=>key!==entry.key))]:[],
        followers:followers.get(entry)??0};
    });
  }
  const operandKey=(key,index)=>key+'@'+index;
  function parametersFor(drivers,definition) {
    const entries=new Map(drivers.map(driver=>[driver.key,driver]));
    const result=new Map();
    for(const parameter of definition.parameters) {
      const driver=entries.get(parameter.key);
      if(!driver||driver.rootKey===parameter.key) result.set(parameter.key,parameter);
    }
    for(const parameter of definition.parameters) {
      const driver=entries.get(parameter.key);
      if(driver&&!result.has(driver.rootKey)) result.set(driver.rootKey,{...parameter,key:driver.rootKey});
    }
    for(const [key] of result) {
      const driver=entries.get(key);
      if(driver?.formula&&!driver.terms.length) for(const source of driver.sources) {
        if(!result.has(source)) result.set(source,{key:source,label:'',min:null,max:null});
      }
    }
    return [...result.values()];
  }
  function recipe(raw) {
    if(raw?.version!==1||typeof raw.id!=='string'||!idPattern.test(raw.id)||reserved.has(raw.id)||
      typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>100||
      !Array.isArray(raw.layers)||!Array.isArray(raw.parameters)||
      !raw.layers.every(x=>typeof x?.name==='string'&&['object','variant','off'].includes(x.role)&&
        (x.textEditable===undefined||typeof x.textEditable==='boolean'))||
      !raw.parameters.every(p=>typeof p?.key==='string'&&typeof p.label==='string'&&p.label.length<=100&&
        [p.min,p.max].every(v=>v===null||Number.isFinite(v))&&(p.min===null||p.max===null||p.min<=p.max))||
      new Set(raw.layers.map(x=>x.name)).size!==raw.layers.length||
      new Set(raw.parameters.map(x=>x.key)).size!==raw.parameters.length) throw Error('invalidRecipe');
    return raw;
  }
  const textNumbers=['height','letter','line','width','angle','radius','along','offset'];
  const textFlags=['reverse','inside','upright'];
  function editText(text,changes) {
    if(!changes) return text;
    const keys=['content','family','align','pathMode',...textNumbers,...textFlags];
    const next={...text};
    for(const key of keys) if(Object.hasOwn(changes,key)) next[key]=changes[key];
    if(typeof next.content!=='string'||!next.content.trim()||next.content.length>2000||
      typeof next.family!=='string'||!next.family.trim()||next.family.length>128||
      !['left','center','right'].includes(next.align)||!['straight','arc','linked'].includes(next.pathMode)||
      next.pathMode==='linked'&&text.pathMode!=='linked'||
      textNumbers.some(key=>!Number.isFinite(next[key])||Math.abs(next[key])>1e12)||
      textFlags.some(key=>typeof next[key]!=='boolean')||next.height<=0||next.width<=0||
      next.line<0||next.radius<0||next.pathMode==='arc'&&next.radius<=0) throw Error('badValues');
    return next;
  }
  function build(source,definition,values,activeLayers,textEdits=new Map()) {
    if(!source.entities.every(e=>Number.isSafeInteger(e.id))) {
      source={...source,entities:source.entities.map((entity,i)=>({...entity,id:i+1}))};
    }
    source=table.assign(source);
    const chosen=new Set(activeLayers);
    const layers=source.layers.filter(l=>chosen.has(l.name)&&!l.raster).map(l=>({...l,visible:true}));
    const items=source.entities.filter(e=>layers.some(l=>l.name===e.layer));
    const ids=new Set(items.map(e=>e.id));
    const drivers=dimensionDrivers(source);
    const catalogue=new Map(drivers.map(item=>[item.index,item]));
    const params=new Map(parametersFor(drivers,definition).map(p=>[p.key,p]));
    const constraints=[], changed=[];
    let skipped=0;
    for(const [index,relation] of (source.constraints??[]).entries()) {
      if(!relation.refs.some(ref=>ids.has(ref.id))) continue;
      if(!relation.refs.every(ref=>ref.kind==='origin'||ids.has(ref.id))||
        F.isDimension(relation)&&relation.layer&&!chosen.has(relation.layer)&&relation.refs.some(r=>r.kind==='origin')) {skipped++;continue;}
      const driver=catalogue.get(index), p=params.get(driver?.key);
      const nextValue=p&&!driver.formula?values.get(p.key):undefined;
      let next=relation;
      if(nextValue!==undefined) {
        if(!Number.isFinite(nextValue)||nextValue<0||(relation.mode==='angle'&&!(nextValue>0&&nextValue<180))||
          p.min!==null&&nextValue<p.min||p.max!==null&&nextValue>p.max) throw Error('badValues');
        if(Math.abs(nextValue-relation.value)>1e-10) {
          next={...relation,value:nextValue,driven:false};
          delete next.expression;
          changed.push(next.dimensionId);
        }
      }
      if(p&&driver.formula&&driver.terms.length) {
        const terms=driver.terms.map((term,i)=>values.get(operandKey(p.key,i))??term);
        if(terms.some(term=>!Number.isFinite(term))) throw Error('badValues');
        if(terms.some((term,i)=>term!==driver.terms[i])) {
          next={...relation,expression:numeric.replaceTerms(driver.formula,terms)};
          if(next.expression.length>512) throw Error('badValues');
          changed.push(next.dimensionId);
        }
      }
      constraints.push(next);
    }
    const editable=new Set(definition.layers.filter(l=>l.role!=='off'&&l.textEditable!==false).map(l=>l.name));
    const candidates=(source.texts??[]).filter(t=>chosen.has(t.layer)).map(t=>
      editText(t,editable.has(t.layer)?textEdits.get(t.id):undefined));
    const texts=candidates.filter(t=>t.pathMode!=='linked'||ids.has(t.pathId));
    if(!items.length&&!texts.length) throw Error('empty');
    const drawing={version:source.version,units:source.units,layers,entities:items,constraints,texts,nextDimensionNumber:source.nextDimensionNumber};

    try {
      const solved=table.reconcile(table.restoreMissing(source,drawing),changed);
      const map=new Map(solved.entities.map(e=>[e.id,e]));
      if(solved.constraints.some(c=>!F.satisfied(map,c))) throw Error('unsolved');
      const solvedDimensions=new Map(solved.constraints.filter(F.isDimension).map(c=>[c.dimensionId,c]));
      for(const {key,dimension} of drivers) {
        const parameter=params.get(key);
        if(!parameter) continue;
        const adjusted=solvedDimensions.get(dimension.dimensionId);
        if(adjusted&&(parameter.min!==null&&adjusted.value<parameter.min||parameter.max!==null&&adjusted.value>parameter.max))
          throw Error('badValues');
      }
      return {drawing:solved,skipped,skippedTexts:candidates.length-texts.length};
    }
    catch(error) {throw Error(error.message==='badValues'?'badValues':'unsolved');}
  }
  const sourceScript=(id,{history,...source})=>'globalThis.VcvWorkshopSources??=Object.create(null);\n'+
    'globalThis.VcvWorkshopSources['+JSON.stringify(id)+']='+JSON.stringify(source)+';\n';
  function projectFiles(definition,source) {
    source=table.assign(source);
    const id=definition.id;
    return {
      'source.vcv':JSON.stringify({...source,dimensionTableCsv:table.csv(source)},null,2),
      'source-data.js':sourceScript(id,source),
      'workshop.json':JSON.stringify(definition,null,2),
      'plugin.js':"'use strict';\nVelocivectorPlugins.registerAsync("+JSON.stringify(id)+",async load=>{\n"+
        "  await Promise.all([load('workshop-builder/model.js'),load('workshop-builder/messages.js'),load('workshop-builder/runtime.js'),load("+
        JSON.stringify(id+'/source-data.js')+")]);\n  return VcvWorkshopRuntime.plugin("+
        JSON.stringify(definition)+",globalThis.VcvWorkshopSources["+JSON.stringify(id)+"]);\n});\n"
    };
  }
  function zip(id,files) {
    const encoder=new TextEncoder(), local=[], directory=[];
    let offset=0, directorySize=0;
    for(const [key,content] of Object.entries(files)) {
      const name=encoder.encode(id+'/'+key), data=encoder.encode(content);
      let crc=0xffffffff;
      for(const byte of data) {
        crc^=byte;
        for(let i=0;i<8;i++) crc=(crc>>>1)^((crc&1)?0xedb88320:0);
      }
      crc=(crc^0xffffffff)>>>0;
      const record=(signature,size)=>{
        const bytes=new Uint8Array(size+name.length), view=new DataView(bytes.buffer);
        view.setUint32(0,signature,true);bytes.set(name,size);return {bytes,view};
      };
      const header=record(0x04034b50,30), central=record(0x02014b50,46);
      for(const [entry,shift] of [[header,0],[central,2]]) {
        const v=entry.view;
        v.setUint16(4+shift,20,true);v.setUint16(6+shift,0x800,true);
        v.setUint32(14+shift,crc,true);v.setUint32(18+shift,data.length,true);
        v.setUint32(22+shift,data.length,true);v.setUint16(26+shift,name.length,true);
      }
      central.view.setUint32(42,offset,true);
      offset+=header.bytes.length+data.length;directorySize+=central.bytes.length;
      local.push(header.bytes,data);directory.push(central.bytes);
    }
    const end=new DataView(new ArrayBuffer(22));
    end.setUint32(0,0x06054b50,true);
    end.setUint16(8,directory.length,true);end.setUint16(10,directory.length,true);
    end.setUint32(12,directorySize,true);end.setUint32(16,offset,true);
    return new Blob([...local,...directory,end.buffer],{type:'application/zip'});
  }
  const model={recipe,dimensions,build,sourceScript,projectFiles,zip,textNumbers,textFlags,dimensionDrivers,parametersFor,operandKey};
  if(typeof module!=='undefined') module.exports=model;
  else globalThis.VcvWorkshopModel=model;
})();
