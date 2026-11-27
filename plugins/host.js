'use strict';
const VelocivectorPlugins=(()=>{
  const version=1, idPattern=/^[a-z][a-z0-9-]{0,47}$/;
  const registry=new Map();
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

  function preview(canvas,entities,{zoom=1,offset=[0,0]}={}) {
    const points=entities.map(entity=>({entity,trace:G.trace(entity,4)}));
    const lo=[Infinity,Infinity],hi=[-Infinity,-Infinity];
    for(const {trace} of points) for(const p of trace) for(let i=0;i<2;i++) {
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

  function context(plugin) {
    return Object.freeze({
      t:key=>translate(plugin,key),
      language:()=>language(plugin),
      drawing:()=>structuredClone(doc),
      selection:()=>structuredClone(selectionRuns(selected())),
      activeLayer:()=>activeLayer,
      units:()=>({code:doc.units,millimeters:Formats.millimeters[doc.units]}),
      insert,preview,
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

  function localScript(path) {
    if(!/^(?:[a-z0-9-]+\/)*[a-z0-9-]+\.js$/.test(path)) return Promise.reject(Error('Invalid extension asset.'));
    if(!scripts.has(path)) scripts.set(path,new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='plugins/'+path;script.onload=resolve;script.onerror=reject;
      document.head.append(script);
    }));
    return scripts.get(path);
  }
  function registerAsync(id,factory) {
    if(id!==expectedId||pending||typeof factory!=='function') throw Error('Invalid extension factory.');
    pending=Promise.resolve().then(()=>factory(localScript)).then(plugin=>register(plugin));
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
      buttons.push(button);
    }
    menu.replaceChildren(...buttons);
  }

  dialog.setAttribute('aria-labelledby','pluginTitle');
  dialog.addEventListener('close',()=>{
    if(typeof workshop==='function') workshop();
    workshop=null;
    $('pluginTabs').replaceChildren();
    $('pluginContent').replaceChildren();
  });
  const requested=new URLSearchParams(location.search).get('plugins');
  async function start() {
    for(const id of new Set((requested??'transmissions,pulleys,airfoils,drone').split(',').filter(id=>idPattern.test(id)))) {
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
