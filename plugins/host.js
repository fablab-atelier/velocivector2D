'use strict';
const VelocivectorPlugins=(()=>{
  const version=1, idPattern=/^[a-z][a-z0-9-]{0,47}$/;
  const registry=new Map();
  const launchOptions=new URLSearchParams(location.search);
  const personalIds=new Set((launchOptions.get('personalPlugins')??'').split(',').filter(id=>idPattern.test(id)));
  const personalRoot=(()=>{
    if(location.protocol!=='file:'||!launchOptions.has('personalRoot')) return null;
    try {
      const url=new URL(launchOptions.get('personalRoot'));
      return url.protocol==='file:'&&!url.host&&/^\/[a-z]:\/.+\/$/i.test(url.pathname)&&!url.search&&!url.hash?url:null;
    } catch {return null;}
  })();
  const personalFolderName=personalRoot?decodeURIComponent(personalRoot.pathname.split('/').at(-2)):'plugins';
  const isPluginFolder=folder=>folder.name.toLowerCase()===personalFolderName.toLowerCase();
  let expectedId=null, workshop=null, pending=null;
  const dialog=$('pluginDialog');
  const settings=new Map(), scripts=new Map();
  function preferences(plugin) {
    if(!settings.has(plugin.id)) {
      let stored;
      try {stored=JSON.parse(localStorage.getItem('velocivector-plugin:'+plugin.id)??'null');} catch {}
      settings.set(plugin.id,{
        language:stored?.language??'auto',
        values:{...(stored?.values??plugin.initialDefaults??{})},
        windows:{...stored?.windows}
      });
      if(!stored&&Object.keys(settings.get(plugin.id).values).length) savePreferences(plugin);
    }
    return settings.get(plugin.id);
  }
  function savePreferences(plugin) {
    try {localStorage.setItem('velocivector-plugin:'+plugin.id,JSON.stringify(preferences(plugin)));} catch {}
  }
  function language(plugin) {
    const code=preferences(plugin).language, available=plugin.messages??{};
    if(Object.hasOwn(available,code)) return code;
    return [I18n.language,'en','fr',...Object.keys(available)].find(key=>Object.hasOwn(available,key))??I18n.language;
  }
  function translate(plugin,key,fallback=key) {
    const messages=plugin.messages;
    return messages?.[language(plugin)]?.[key]??messages?.en?.[key]??messages?.fr?.[key]??I18n.t(fallback);
  }

  function insert(batch,{layer=activeLayer,units='document',offset=[0,0]}={}) {
    const requestedLayers=batch?.layers;
    if((requestedLayers===undefined&&!doc.layers.some(item=>item.name===layer&&item.visible&&!item.raster))||
      !Array.isArray(batch?.entities)||!batch.entities.length||!['document','mm'].includes(units)||
      !Array.isArray(offset)||offset.length!==2||!offset.every(Number.isFinite)) {
      throw Error('Géométrie ou calque invalide.');
    }
    const targets=new Map(), layers=[];
    if(requestedLayers!==undefined) {
      if(!Array.isArray(requestedLayers)||!requestedLayers.length) throw Error('Géométrie ou calque invalide.');
      const used=new Set(doc.layers.map(item=>item.name.toUpperCase()));
      for(const label of requestedLayers) {
        if(typeof label!=='string'||!label.trim()||targets.has(label)) throw Error('Géométrie ou calque invalide.');
        const base=label.trim();
        let name=base;
        for(let suffix=2;used.has(name.toUpperCase());suffix++) name=base+' ('+suffix+')';
        used.add(name.toUpperCase());targets.set(label,name);
        layers.push({name,color:layerSequence[(doc.layers.length+layers.length-1)%layerSequence.length],visible:true});
      }
    }
    const factor=units==='mm'?1/Formats.millimeters[doc.units]:1;
    const ids=new Map(), groups=new Map(), layerById=new Map();
    const added=batch.entities.map(({key,vectorGroup,layer:target,...geometry},index)=>{
      const destination=requestedLayers===undefined?layer:targets.get(target);
      if(!destination) throw Error('Géométrie ou calque invalide.');
      key??=String(index);
      if(typeof key!=='string'||ids.has(key)||!G.serial(geometry)||!Edit.valid(geometry))
        throw Error('Géométrie ou calque invalide.');
      const converted=G.transform(geometry,point=>G.mul(G.add(point,offset),factor),0,factor);
      if(vectorGroup!==undefined&&!groups.has(vectorGroup)) groups.set(vectorGroup,newVectorGroup());
      const entity=identity({...converted,layer:destination,...(groups.has(vectorGroup)?{vectorGroup:groups.get(vectorGroup)}:{})});
      if(!G.serial(entity)||!Edit.valid(entity)) throw Error('Géométrie ou calque invalide.');
      ids.set(key,entity.id);layerById.set(entity.id,destination);
      return entity;
    });
    const relations=(batch.constraints??[]).map(({refs,...data})=>{
      const relation={...data,refs:refs.map(({key,kind,index})=>({id:ids.get(key),kind,index}))};
      if(relation.type==='dimension') {
        relation.layer=layerById.get(relation.refs[0]?.id)??layer;
        relation.offset=G.mul(relation.offset,factor);
        if(relation.mode!=='angle') relation.value*=factor;
      }
      return relation;
    });
    const map=new Map(added.map(entity=>[entity.id,entity]));
    if(!Formal.valid(added,relations)||!relations.every(relation=>Formal.satisfied(map,relation)))
      throw Error('Contraintes de projet invalides.');
    commit(d=>({...d,layers:[...d.layers,...layers],entities:[...d.entities,...added],constraints:[...(d.constraints??[]),...relations]}),false,false,true);
    return added.map(entity=>entity.id);
  }

  function insertDrawing(source) {
    const model=Formats.native(JSON.stringify(source));
    if(!model.entities.length&&!model.texts?.length) throw Error('Géométrie ou calque invalide.');
    const factor=Formats.millimeters[model.units]/Formats.millimeters[doc.units];
    const scale=point=>G.mul(point,factor);
    const names=new Set(doc.layers.map(layer=>layer.name.toUpperCase()));
    const layersByName=new Map(), originNames=new Map(), ids=new Map(), groups=new Map();
    const reserved=new Set(doc.layers.flatMap(layer=>(layer.origins??[]).map(origin=>origin.name)));
    let ordinal=1;
    const layers=model.layers.map(layer=>{
      const base=layer.name.trim();
      let name=base;
      for(let n=2;names.has(name.toUpperCase());n++) name=base+' ('+n+')';
      names.add(name.toUpperCase());layersByName.set(layer.name,name);
      const origins=(layer.origins??[]).map(origin=>{
        while(reserved.has('POT'+ordinal)) ordinal++;
        const next='POT'+ordinal++;
        originNames.set(origin.name,next);reserved.add(next);
        return {name:next,target:scale(origin.target)};
      });
      return {...layer,name,...(origins.length?{origins}:{}),
        ...(layer.activeOrigin?{activeOrigin:originNames.get(layer.activeOrigin)??'POA'}:{})};
    });
    const entities=model.entities.map(entity=>{
      const {id,vectorGroup,...shape}=entity;
      const groupKey=JSON.stringify([entity.layer,vectorGroup]);
      if(vectorGroup!==undefined&&!groups.has(groupKey)) groups.set(groupKey,newVectorGroup());
      const added=identity({...G.transform(shape,scale,0,factor),layer:layersByName.get(entity.layer),
        ...(groups.has(groupKey)?{vectorGroup:groups.get(groupKey)}:{})});
      ids.set(id,added.id);return added;
    });
    const mapped=(model.constraints??[]).map(relation=>{
      const refs=relation.refs.map(ref=>ref.kind==='origin'
        ?{...ref,name:originNames.get(ref.name)??ref.name,target:scale(ref.target)}:{...ref,id:ids.get(ref.id)});
      if(relation.type==='locked') return Formal.make('locked',refs,entities);
      if(relation.origin) return {...relation,refs,origin:originNames.get(relation.origin)??relation.origin,target:scale(relation.target)};
      if(!Formal.isDimension(relation)) return {...relation,refs};
      const next={...relation,refs,layer:layersByName.get(relation.layer)??entities.find(e=>e.id===refs[0]?.id)?.layer,
        offset:scale(relation.offset),value:relation.mode==='angle'?relation.value:relation.value*factor};
      return next;
    });
    const texts=(model.texts??[]).map(text=>identity({...text,p:scale(text.p),layer:layersByName.get(text.layer),
      ...(text.pathMode==='linked'?{pathId:ids.get(text.pathId)}:{})}));
    const constraints=DimensionTable.rebase(mapped,doc,factor);
    const batch=Formats.native(JSON.stringify({...model,units:doc.units,layers,entities,constraints,texts}));
    const map=new Map(batch.entities.map(entity=>[entity.id,entity]));
    if(!batch.constraints.every(c=>Formal.satisfied(map,c))) throw Error('Contraintes de projet invalides.');
    commit(d=>({...d,layers:[...d.layers,...batch.layers],entities:[...d.entities,...batch.entities],
      constraints:[...(d.constraints??[]),...batch.constraints],texts:[...(d.texts??[]),...batch.texts]}),false,false,true);
    return entities.map(entity=>entity.id);
  }

  function preview(canvas,entities,{zoom=1,offset=[0,0],extraBounds=[]}={}) {
    const points=entities.map(entity=>({entity,trace:G.trace(entity,4)}));
    const lo=[Infinity,Infinity],hi=[-Infinity,-Infinity];
    for(const trace of [...points.map(p=>p.trace),extraBounds]) for(const p of trace) for(let i=0;i<2;i++) {
      lo[i]=Math.min(lo[i],p[i]);hi[i]=Math.max(hi[i],p[i]);
    }
    const ctx=canvas.getContext('2d'), w=canvas.width,h=canvas.height;
    ctx.clearRect(0,0,w,h);
    if(!Number.isFinite(lo[0])) return;
    const scale=zoom*Math.min((w-36)/Math.max(1e-9,hi[0]-lo[0]),(h-36)/Math.max(1e-9,hi[1]-lo[1]));
    const center=G.mid(lo,hi);
    const project=([x,y])=>[w/2+offset[0]+(x-center[0])*scale,h/2+offset[1]-(y-center[1])*scale];
    for(const {entity,trace} of points) {
      ctx.beginPath();
      ctx.strokeStyle=entity.construction?'#608bb9':getComputedStyle(dialog).color;
      ctx.setLineDash(entity.construction?[5,4]:[]);
      trace.forEach(([x,y],i)=>ctx[i?'lineTo':'moveTo'](...project([x,y])));
      if(entity.closed) ctx.closePath();
      ctx.stroke();
    }
    return project;
  }

  function previewDrawing(canvas,drawing,{dimensions=[]}={}) {
    const entities=new Map(drawing.entities.map(entity=>[entity.id,entity]));
    const factor=Formats.millimeters[drawing.units];
    const textRuns=(drawing.texts??[]).map(text=>({
      font:TextGeometry.font(text.family),glyphs:TextGeometry.layout(text,entities,cadTextMeasure,factor)
    }));
    const extraBounds=textRuns.flatMap(({glyphs})=>glyphs.flatMap(glyph=>{
      const metrics=glyph.metrics;
      return [-(metrics.actualBoundingBoxLeft??0),metrics.actualBoundingBoxRight??metrics.width].flatMap(x=>
        [-(metrics.actualBoundingBoxAscent??0),metrics.actualBoundingBoxDescent??0].map(y=>TextGeometry.position(glyph,x,y)));
    }));
    for(const c of dimensions) {
      const layout=dimensionLayout(c,entities,p=>p,1);
      if(layout) extraBounds.push(layout.label,...layout.guides.flat(),...(layout.arc??[layout.start,layout.end]));
    }
    const project=preview(canvas,drawing.entities,{extraBounds});
    if(!project) return;
    const scale=project([1,0])[0]-project([0,0])[0], ctx=canvas.getContext('2d');
    ctx.save();
    ctx.fillStyle=getComputedStyle(dialog).color;ctx.textAlign='left';ctx.textBaseline='alphabetic';
    for(const {font,glyphs} of textRuns) {
      ctx.font=font;
      for(const glyph of glyphs) {
        ctx.save();ctx.translate(...project(glyph.q));ctx.rotate(-glyph.angle);
        ctx.scale(glyph.sx*scale,glyph.sy*scale);ctx.fillText(glyph.value,-glyph.half,0);ctx.restore();
      }
    }
    ctx.restore();
    if(!dimensions.length) return;
    const ink=palettes[theme], color=ink.point;
    ctx.save();ctx.font='bold 12px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.strokeStyle=color;ctx.lineWidth=1.3;
    const line=points=>{
      ctx.beginPath();ctx.moveTo(...points[0]);
      for(const point of points.slice(1)) ctx.lineTo(...point);
      ctx.stroke();
    };
    for(const c of dimensions) {
      const layout=dimensionLayout(c,entities,project,scale);
      if(!layout) continue;
      const {start,end,label,guides,arc}=layout;
      for(const guide of guides) line(guide);
      line(arc??[start,end]);
      for(const [p,q] of [[start,arc?.[1]??end],[end,arc?.at(-2)??start]]) {
        const angle=G.angle(p,q);
        if(G.dist(p,q)>G.eps) line([G.polar(p,6,angle-.4),p,G.polar(p,6,angle+.4)]);
      }
      const text=(c.dimensionName?c.dimensionName+' · ':'')+
        dimensionText({...c,dimensionName:undefined},entities,drawing.units);
      const width=ctx.measureText(text).width+8;
      ctx.fillStyle=ink.base;ctx.fillRect(label[0]-width/2,label[1]-9,width,18);
      ctx.fillStyle=color;ctx.fillText(text,...label);
    }
    ctx.restore();
  }

  async function checkWorkshopFolder(plugin,folder) {
    if(folder.name!==plugin.id) throw Error('wrongFolder');
    const file=await folder.getFileHandle('workshop.json');
    const metadata=VcvWorkshopModel.recipe(JSON.parse(await (await file.getFile()).text()));
    if(metadata.id!==plugin.id) throw Error('wrongFolder');
  }

  async function removeWorkshop(plugin,parent,folder,source) {
    if(saving) throw Error('removalBusy');
    if(!isPluginFolder(parent)||
      !await folder.isSameEntry(await parent.getDirectoryHandle(plugin.id))) throw Error('wrongFolder');
    await checkWorkshopFolder(plugin,folder);
    let currentSource;
    try {currentSource=await folder.getFileHandle('source.vcv');}
    catch(error) {if(error.name!=='NotFoundError') throw error;}
    if(Boolean(currentSource)!==Boolean(source)||source&&!await source.isSameEntry(currentSource))
      throw Error('removalChanged');
    const forget=await RecentProjects.prepareForget(folder);
    const removedMessage=translate(plugin,'workshopRemoved');
    const detached=saveHandle&&await folder.resolve(saveHandle);
    if(saving) throw Error('removalBusy');
    saving=true;
    try {await parent.removeEntry(plugin.id,{recursive:true});}
    finally {saving=false;}
    if(detached) {saveHandle=null;linkedSourceSave=null;}
    dialog.close();
    registry.delete(plugin.id);
    settings.delete(plugin.id);
    delete globalThis.VcvWorkshopSources?.[plugin.id];
    try {localStorage.removeItem('velocivector-plugin:'+plugin.id);} catch {}
    for(const path of [...scripts.keys()]) if(path.startsWith(plugin.id+'/')) {
      scripts.delete(path);
      const url=scriptUrl(path);
      for(const script of document.head.querySelectorAll('script[src]')) if(script.src===url) script.remove();
    }
    try {
      const url=new URL(location.href), ids=url.searchParams.get('plugins');
      if(ids!==null) {
        for(const key of ['plugins','personalPlugins']) if(url.searchParams.has(key))
          url.searchParams.set(key,url.searchParams.get(key).split(',').filter(id=>id!==plugin.id).join(','));
        history.replaceState(history.state,'',url);
      }
    } catch {}
    refresh();
    await forget();
    message(removedMessage);
  }

  function context(plugin) {
    return Object.freeze({
      t:key=>translate(plugin,key),
      language:()=>language(plugin),
      drawing:()=>structuredClone(doc),
      selection:()=>structuredClone(selectionRuns(selected())),
      activeLayer:()=>activeLayer,
      units:()=>({code:doc.units,millimeters:Formats.millimeters[doc.units]}),
      insert,preview,insertDrawing,previewDrawing,
      fonts:()=>[...cadFontChoices], prepareFont:prepareCadFont,
      readDrawing:raw=>Formats.native(raw),
      openDrawing:(data,name,handle=null,onSave=null)=>{
        const source=Formats.native(JSON.stringify(data));
        if(!canReplace()) return false;
        dialog.close();
        load(source,name);
        saveHandle=handle;
        linkedSourceSave=handle&&onSave?{handle,write:onSave}:null;
        return true;
      },
      geometry:Object.freeze({trace:G.trace,length:G.traceLength}),
      setupNumber:input=>Numeric.install(input),
      toolDefault:(key,fallback)=>Object.hasOwn(preferences(plugin).values,key)?preferences(plugin).values[key]:fallback,
      close:()=>dialog.close(),
      openFile:accept=>new Promise(resolve=>{
        const input=document.createElement('input');
        input.type='file';input.accept=accept;
        input.onchange=()=>resolve(input.files[0]??null);
        input.oncancel=()=>resolve(null);
        input.click();
      }),
      download:(content,name,mime)=>download(content,name,mime),
      ...(plugin.generatedWorkshop?{
        checkWorkshopFolder:folder=>checkWorkshopFolder(plugin,folder),
        removeWorkshop:(parent,folder,source)=>removeWorkshop(plugin,parent,folder,source)
      }:{}),
      status:text=>message(String(text)),
      isPluginFolder,pluginFolderName:()=>personalFolderName
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
      Object.defineProperty(format,'label',{get:()=>translate(plugin,entry.title)});
      exportFormats['plugin:'+plugin.id+':'+entry.id]=format;
    }
  }

  function workshopWindow(plugin,entry) {
    const titleBar=$('pluginTitleBar'), title=$('pluginTitle'), grip=$('pluginResize');
    const windows=preferences(plugin).windows;
    const stored=windows[entry.id]??{};
    let position=Array.isArray(stored.position)&&stored.position.length===2&&stored.position.every(Number.isFinite)?stored.position:null;
    let size=Array.isArray(stored.size)&&stored.size.length===2&&stored.size.every(value=>Number.isFinite(value)&&value>0)?stored.size:null;
    let drag=null;
    const listeners=new AbortController(), options={signal:listeners.signal};
    const viewport=()=>[document.documentElement.clientWidth,document.documentElement.clientHeight];
    const minimum=[320,200];
    const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
    function apply() {
      const limits=viewport();
      dialog.style.maxHeight=limits[1]+'px';
      if(!position&&!size) return;
      if(size) {
        dialog.style.width=Math.min(size[0],limits[0])+'px';
        dialog.style.height=Math.min(size[1],limits[1])+'px';
      }
      dialog.classList.add('plugin-positioned');
      const {width,height}=dialog.getBoundingClientRect();
      const [x,y]=position??[0,0];
      dialog.style.left=clamp(x,0,Math.max(0,limits[0]-width))+'px';
      dialog.style.top=clamp(y,0,Math.max(0,limits[1]-height))+'px';
    }
    function save() {
      windows[entry.id]={position,size};
      savePreferences(plugin);
    }
    function adjust(rect,dx,dy,resize) {
      const {left,top,width,height}=rect, limits=viewport();
      if(resize) {
        position=[left,top];
        size=[width+dx,height+dy].map((value,i)=>{
          const available=Math.max(1,limits[i]-position[i]);
          return clamp(value,Math.min(minimum[i],available),available);
        });
      } else {
        position=[clamp(left+dx,0,Math.max(0,limits[0]-width)),clamp(top+dy,0,Math.max(0,limits[1]-height))];
      }
      apply();
    }
    for(const [control,resize] of [[titleBar,false],[grip,true]]) {
      control.addEventListener('pointerdown',event=>{
        if(drag||event.button!==0||!resize&&event.target.closest('button, input, select, a')) return;
        drag={id:event.pointerId,x:event.clientX,y:event.clientY,rect:dialog.getBoundingClientRect(),resize,changed:false};
        control.setPointerCapture(event.pointerId);
        event.preventDefault();
      },options);
      control.addEventListener('pointermove',event=>{
        if(drag?.id!==event.pointerId) return;
        const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
        if(!dx&&!dy&&!drag.changed) return;
        drag.changed=true;adjust(drag.rect,dx,dy,drag.resize);
      },options);
      control.addEventListener('lostpointercapture',event=>{
        if(drag?.id!==event.pointerId) return;
        if(drag.changed) save();
        drag=null;
      },options);
      (resize?grip:title).addEventListener('keydown',event=>{
        const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
        if(!delta) return;
        event.preventDefault();
        const step=event.shiftKey?32:8;
        adjust(dialog.getBoundingClientRect(),delta[0]*step,delta[1]*step,resize);save();
      },options);
    }
    const observer=new ResizeObserver(apply);
    observer.observe(dialog);
    window.addEventListener('resize',apply,options);
    apply();
    return ()=>{
      listeners.abort();observer.disconnect();
      dialog.classList.remove('plugin-positioned');
      for(const property of ['width','height','left','top','max-height']) dialog.style.removeProperty(property);
    };
  }

  function mountWorkshop(plugin,entry,api) {
    const tabs=$('pluginTabs'), root=$('pluginContent');
    const content=document.createElement('div'), panel=document.createElement('div');
    content.className='plugin-workshop-surface';
    const caption=(key,fallback)=>translate(plugin,key,fallback);
    let mounted;
    function showWorkshop(state) {
      content.replaceChildren();
      mounted=entry.mount(content,api,state);
    }
    function cleanup() {
      if(typeof mounted==='function') mounted();
      else mounted?.dispose?.();
      mounted=null;
    }
    function heading() {
      const lang=api.language();
      dialog.lang=lang;
      dialog.dir=['fa','ar','he','ur'].includes(lang.split('-')[0])?'rtl':'ltr';
      $('pluginTitle').textContent=api.t(entry.title);
      $('pluginClose').textContent=caption('ui.close','Fermer');
      $('pluginTitleBar').title=caption('ui.move','Déplacer la fenêtre');
      $('pluginTitle').setAttribute('aria-description',$('pluginTitleBar').title);
      const resizeCaption=caption('ui.resize','Redimensionner la fenêtre');
      $('pluginResize').setAttribute('aria-label',resizeCaption);
      $('pluginResize').title=resizeCaption;
    }
    function preferencesPanel() {
      const values=preferences(plugin), locale=document.createElement('select');
      locale.add(new Option(caption('ui.automatic','Automatique'),'auto'));
      for(const code of Object.keys(plugin.messages??{})) {
        const option=new Option(new Intl.DisplayNames([code],{type:'language'}).of(code),code);
        option.lang=code;locale.add(option);
      }
      locale.value=[...locale.options].some(option=>option.value===values.language)?values.language:'auto';
      const auto=()=>{
        const snapshot=mounted?.snapshot?.();
        cleanup();heading();showWorkshop(snapshot);
        refresh();show('preferences');
      };
      locale.onchange=()=>{values.language=locale.value;savePreferences(plugin);auto();};
      const addField=(label,field)=>{
        const row=document.createElement('label');row.append(document.createTextNode(label),field);panel.append(row);
      };
      addField(caption('ui.language','Langue'),locale);
      for(const spec of plugin.preferences??[]) {
        const field=document.createElement(spec.options?'select':'input');
        if(spec.options) for(const option of spec.options) field.add(new Option(api.t(String(option)),option));
        else if(typeof spec.default==='boolean') field.type='checkbox';
        else if(typeof spec.default==='number') {
          field.type='number';field.step='any';
          if(spec.min!==undefined) field.min=spec.min;
          if(spec.max!==undefined) field.max=spec.max;
          Numeric.install(field);
        }
        const value=api.toolDefault(spec.key,spec.default);
        if(field.type==='checkbox') field.checked=value;else field.value=value;
        field.onchange=()=>{
          const next=field.type==='checkbox'?field.checked:
            typeof spec.default==='number'&&!spec.options?field.valueAsNumber:field.value;
          if(!field.checkValidity()||typeof next==='number'&&!Number.isFinite(next)) return;
          values.values[spec.key]=next;savePreferences(plugin);
        };
        const label=[spec.prefix,spec.label].filter(Boolean).map(api.t).join(' · ');
        addField(label,field);
      }
      const reset=document.createElement('button'), hint=document.createElement('p');
      reset.type='button';reset.textContent=caption('ui.reset','Par défaut');
      reset.onclick=()=>{values.values={};values.language='auto';savePreferences(plugin);auto();};
      hint.textContent=caption('ui.next','Options par défaut des outils');
      panel.append(hint,reset);
    }
    function aboutPanel() {
      const {version,description,authors,license}=plugin.about??{};
      for(const value of [version,description&&api.t(description),authors?.join(', '),license].filter(Boolean)) {
        const paragraph=document.createElement('p');paragraph.textContent=value;panel.append(paragraph);
      }
    }
    function show(page) {
      content.hidden=page!=='workshop';panel.hidden=page==='workshop';
      panel.replaceChildren();
      const sections=[['workshop','ui.workshop',entry.title],['preferences','ui.preferences','Préférences'],
        ['about','ui.about','À propos']];
      tabs.replaceChildren(...sections.map(([id,key,fallback])=>{
        const button=document.createElement('button');button.type='button';
        button.textContent=id==='workshop'?caption(key,api.t(fallback)):caption(key,fallback);
        button.setAttribute('aria-pressed',String(id===page));button.onclick=()=>show(id);return button;
      }));
      if(page==='preferences') preferencesPanel();
      if(page==='about') aboutPanel();
    }
    root.replaceChildren(content,panel);
    heading();showWorkshop();show('workshop');
    const closeWindow=workshopWindow(plugin,entry);
    return ()=>{closeWindow();cleanup();};
  }

  function scriptUrl(path) {
    const id=path.split('/')[0];
    return personalRoot&&personalIds.has(id)?new URL(path,personalRoot).href:new URL('plugins/'+path,document.baseURI).href;
  }
  function localScript(path) {
    if(!/^(?:[a-z0-9-]+\/)*[a-z0-9-]+\.js$/.test(path)) return Promise.reject(Error('Invalid extension asset.'));
    if(!scripts.has(path)) scripts.set(path,new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src=scriptUrl(path);script.onload=resolve;script.onerror=reject;
      document.head.append(script);
    }));
    return scripts.get(path);
  }
  function registerAsync(id,factory) {
    if(id!==expectedId||pending||typeof factory!=='function') throw Error('Invalid extension factory.');
    pending=Promise.resolve().then(()=>factory(localScript)).then(plugin=>register(plugin));
  }

  function refresh() {
    const menu=$('pluginsMenu'), buttons=[], builder=[];
    for(const {plugin,entries} of registry.values()) for(const {entry,method} of entries) {
      if(method==='write') continue;
      const api=context(plugin), button=document.createElement('button');
      button.type='button';button.textContent=api.t(entry.title);
      menuAction(button,async()=>{
        try {
          if(method==='mount') {
            dialog.showModal();
            workshop=mountWorkshop(plugin,entry,api);
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
      (plugin.id==='workshop-builder'?builder:buttons).push(button);
    }
    if(builder.length&&buttons.length) buttons.push(document.createElement('hr'));
    menu.replaceChildren(...buttons,...builder);
  }

  dialog.setAttribute('aria-labelledby','pluginTitle');
  dialog.addEventListener('close',()=>{
    if(typeof workshop==='function') workshop();
    workshop=null;
    $('pluginTabs').replaceChildren();
    $('pluginContent').replaceChildren();
  });
  const requested=launchOptions.get('plugins');
  async function start() {
    for(const id of new Set((requested??'transmissions,pulleys,airfoils,drone,workshop-builder').split(',').filter(id=>idPattern.test(id)))) {
      expectedId=id;
      pending=null;
      try {await localScript(id+'/plugin.js');await pending;}
      catch(error) {console.warn('Velocivector extension failed:',id,error);}
      if(!registry.has(id)) console.warn('Velocivector extension failed:',id);
    }
    expectedId=null;
    refresh();
  }
  return Object.freeze({version,register,registerAsync,refresh,start});
})();
VelocivectorPlugins.start();
