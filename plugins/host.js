'use strict';
const VelocivectorPlugins=(()=>{
  const version=1, idPattern=/^[a-z][a-z0-9-]{0,47}$/;
  const registry=new Map();
  let expectedId=null, workshop=null;
  const dialog=$('pluginDialog');
  const translate=(messages,key)=>messages?.[I18n.language]?.[key]??messages?.en?.[key]??messages?.fr?.[key]??I18n.t(key);

  function insert(batch,{layer=activeLayer,units='document',offset=[0,0]}={}) {
    if(!doc.layers.some(item=>item.name===layer&&item.visible&&!item.raster)||
      !Array.isArray(batch?.entities)||!batch.entities.length||!['document','mm'].includes(units)||
      !Array.isArray(offset)||offset.length!==2||!offset.every(Number.isFinite)) {
      throw Error('Géométrie ou calque invalide.');
    }
    const factor=units==='mm'?1/Formats.millimeters[doc.units]:1;
    const ids=new Map();
    const added=batch.entities.map(({key,...geometry},index)=>{
      key??=String(index);
      if(typeof key!=='string'||ids.has(key)||!G.serial(geometry)||!Edit.valid(geometry))
        throw Error('Géométrie ou calque invalide.');
      const converted=G.transform(geometry,point=>G.mul(G.add(point,offset),factor),0,factor);
      const entity=identity({...converted,layer});
      if(!G.serial(entity)||!Edit.valid(entity)) throw Error('Géométrie ou calque invalide.');
      ids.set(key,entity.id);
      return entity;
    });
    const relations=(batch.constraints??[]).map(({refs,...data})=>{
      const relation={...data,refs:refs.map(({key,kind,index})=>({id:ids.get(key),kind,index}))};
      if(relation.type==='dimension') {
        relation.layer=layer;
        relation.offset=G.mul(relation.offset,factor);
        if(relation.mode!=='angle') relation.value*=factor;
      }
      return relation;
    });
    const map=new Map(added.map(entity=>[entity.id,entity]));
    if(!Formal.valid(added,relations)||!relations.every(relation=>Formal.satisfied(map,relation)))
      throw Error('Contraintes de projet invalides.');
    commit(d=>({...d,entities:[...d.entities,...added],constraints:[...(d.constraints??[]),...relations]}),false,false,true);
    return added.map(entity=>entity.id);
  }

  function preview(canvas,entities) {
    const points=entities.map(entity=>({entity,trace:G.trace(entity,4)}));
    const lo=[Infinity,Infinity],hi=[-Infinity,-Infinity];
    for(const {trace} of points) for(const p of trace) for(let i=0;i<2;i++) {
      lo[i]=Math.min(lo[i],p[i]);hi[i]=Math.max(hi[i],p[i]);
    }
    const ctx=canvas.getContext('2d'), w=canvas.width,h=canvas.height;
    ctx.clearRect(0,0,w,h);
    if(!Number.isFinite(lo[0])) return;
    const scale=Math.min((w-36)/Math.max(1e-9,hi[0]-lo[0]),(h-36)/Math.max(1e-9,hi[1]-lo[1]));
    const center=G.mid(lo,hi);
    for(const {entity,trace} of points) {
      ctx.beginPath();
      ctx.strokeStyle=entity.construction?'#608bb9':getComputedStyle(dialog).color;
      ctx.setLineDash(entity.construction?[5,4]:[]);
      trace.forEach(([x,y],i)=>ctx[i?'lineTo':'moveTo'](w/2+(x-center[0])*scale,h/2-(y-center[1])*scale));
      if(entity.closed) ctx.closePath();
      ctx.stroke();
    }
  }

  function context(plugin) {
    return Object.freeze({
      t:key=>translate(plugin.messages,key),
      drawing:()=>structuredClone(doc),
      selection:()=>structuredClone(selectionRuns(selected())),
      activeLayer:()=>activeLayer,
      units:()=>({code:doc.units,millimeters:Formats.millimeters[doc.units]}),
      insert,preview,
      geometry:Object.freeze({trace:G.trace,length:G.traceLength}),
      setupNumber:input=>Numeric.install(input),
      close:()=>dialog.close(),
      openFile:accept=>new Promise(resolve=>{
        const input=document.createElement('input');
        input.type='file';input.accept=accept;
        input.onchange=()=>resolve(input.files[0]??null);
        input.oncancel=()=>resolve(null);
        input.click();
      }),
      download:(content,name,mime)=>download(content,name,mime),
      status:text=>message(String(text))
    });
  }

  function register(plugin) {
    if(plugin?.id!==expectedId||plugin.apiVersion!==version||registry.has(plugin.id))
      throw Error('Invalid extension ID or API version.');
    const entries=[];
    for(const [item,method] of [['workshops','mount'],['commands','run'],['importers','read'],['exporters','write'],['postprocessors','write']]) {
      for(const entry of plugin[item]??[]) {
        if(!idPattern.test(entry.id)||typeof entry.title!=='string'||typeof entry[method]!=='function'||
          entries.some(other=>other.entry.id===entry.id)) throw Error('Invalid or duplicate extension entry.');
        if(method==='write'&&(!/^\.[a-z0-9]{1,12}$/.test(entry.extension)||!entry.mime))
          throw Error('Invalid export format.');
        entries.push({entry,item,method});
      }
    }
    registry.set(plugin.id,{plugin,entries});
    for(const {entry,method} of entries) if(method==='write') {
      const format={extension:entry.extension,mime:entry.mime,write:(drawing,options)=>
        entry.write(structuredClone(drawing),{...options},context(plugin))};
      Object.defineProperty(format,'label',{get:()=>translate(plugin.messages,entry.title)});
      exportFormats['plugin:'+plugin.id+':'+entry.id]=format;
    }
  }

  function refresh() {
    const menu=$('pluginsMenu'), buttons=[];
    for(const {plugin,entries} of registry.values()) for(const {entry,method} of entries) {
      if(method==='write') continue;
      const api=context(plugin), button=document.createElement('button');
      button.type='button';button.textContent=api.t(entry.title);
      menuAction(button,async()=>{
        try {
          if(method==='mount') {
            $('pluginTitle').textContent=api.t(entry.title);
            $('pluginContent').replaceChildren();
            dialog.showModal();
            workshop=entry.mount($('pluginContent'),api);
          } else if(method==='read') {
            const layer=activeLayer, file=await api.openFile(entry.accept??'');
            if(file) {
              const result=await entry.read(file,api);
              if(result) api.insert(result,{layer,units:result.units??'document'});
            }
          } else await entry.run(api);
        } catch(error) {
          if(dialog.open) dialog.close();
          message(api.t(error.message));
        }
      });
      buttons.push(button);
    }
    menu.replaceChildren(...buttons);
  }

  dialog.setAttribute('aria-labelledby','pluginTitle');
  dialog.addEventListener('close',()=>{
    if(typeof workshop==='function') workshop();
    workshop=null;
    $('pluginContent').replaceChildren();
  });
  const requested=new URLSearchParams(location.search).get('plugins');
  async function start() {
    for(const id of new Set((requested??'transmissions').split(',').filter(id=>idPattern.test(id)))) {
      expectedId=id;
      await new Promise(resolve=>{
        const script=document.createElement('script');
        script.src='plugins/'+id+'/plugin.js';
        script.onload=script.onerror=resolve;
        document.head.append(script);
      });
      if(!registry.has(id)) console.warn('Velocivector extension failed:',id);
    }
    expectedId=null;
    refresh();
  }
  return Object.freeze({version,register,refresh,start});
})();
VelocivectorPlugins.start();
