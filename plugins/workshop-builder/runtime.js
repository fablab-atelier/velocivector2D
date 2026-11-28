'use strict';
const VcvWorkshopRuntime=(()=>{
  const M=VcvWorkshopModel;
  const node=(tag,text)=>{const element=document.createElement(tag);if(text!==undefined) element.textContent=text;return element;};
  function button(text,run) {
    const element=node('button',text);element.type='button';element.onclick=run;return element;
  }
  function field(container,label,input) {
    const element=node('label');element.append(node('span',label),input);container.append(element);return input;
  }
  function select(values,chosen) {
    const input=node('select');
    for(const [key,label] of values) input.add(new Option(label,key));
    input.value=chosen;return input;
  }
  function text(value,maxLength=100) {
    const input=node('input');input.type='text';input.value=value;input.maxLength=maxLength;return input;
  }
  function number(api,value) {
    const input=node('input');api.setupNumber(input);input.value=value??'';return input;
  }
  function workspace(container,api) {
    const root=node('div'), body=node('div'), fields=node('fieldset'), figure=node('div'), canvas=node('canvas');
    const report=node('div'), actions=node('div'), status=node('output');
    root.className='transmission-form plugin-workspace vcv-workshop';
    body.className='transmission-body';figure.className='transmission-preview';
    report.className='plugin-report';actions.className='vcv-workshop-actions';
    status.setAttribute('aria-live','polite');canvas.setAttribute('aria-label',api.t('preview'));
    figure.append(canvas);body.append(fields,figure);report.append(status,actions);root.append(body,report);
    container.replaceChildren(root);
    let drawing=null, dimensions=[];
    const repaint=()=>{
      canvas.width=Math.max(40,figure.clientWidth);
      canvas.height=Math.max(40,figure.clientHeight);
      if(drawing&&api.previewDrawing) api.previewDrawing(canvas,drawing,{dimensions});
      else api.preview(canvas,drawing?.entities??[]);
    };
    const resize=new ResizeObserver(repaint);resize.observe(figure);
    return {fields,actions,status,repaint,show:(value,cotes=[])=>{drawing=value;dimensions=cotes;repaint();},dispose:()=>resize.disconnect()};
  }
  async function read(directory,name) {
    return (await (await directory.getFileHandle(name)).getFile()).text();
  }
  async function write(directory,name,content) {
    const file=await directory.getFileHandle(name,{create:true}), stream=await file.createWritable();
    try {await stream.write(content);await stream.close();}
    catch(error) {await stream.abort().catch(()=>{});throw error;}
  }
  const hasText=(source,layer)=>source.texts?.some(text=>text.layer===layer);
  const allowedLayer=(source,layer)=>!layer.raster&&(source.entities.some(e=>e.layer===layer.name)||hasText(source,layer.name));
  const nameId=name=>name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/[^a-z0-9]+/g,'-').replace(/^[^a-z]+|-+$/g,'').slice(0,48);
  const showError=(status,api,error)=>{
    if(error.name!=='AbortError') status.textContent=api.t(error.message).replace('{folder}',api.pluginFolderName());
  };
  const lengthLabel=(api,source,dimension)=>dimension.mode==='angle'?'°':api.t(Formats.units[source.units]);
  function workshopRemoval(view,api,id) {
    const t=api.t, panel=node('fieldset');
    const start=button(t('removeWorkshop'),async()=>{
      start.disabled=true;
      try {
        const parent=await window.showDirectoryPicker({mode:'readwrite'});
        if(!api.isPluginFolder(parent)) throw Error('pickPlugins');
        const folder=await parent.getDirectoryHandle(id);
        await api.checkWorkshopFolder(folder);
        let source;
        try {source=await folder.getFileHandle('source.vcv');}
        catch(error) {if(error.name!=='NotFoundError') throw error;}
        if(!start.isConnected) return;
        const open=button(t('browseWorkshop'),async()=>{
          try {
            await window.showOpenFilePicker({startIn:folder,
              types:[{description:'VCV',accept:{'application/json':['.vcv']}}]});
          } catch(error) {showError(view.status,api,error);}
        });
        const cancel=button(t('cancelRemoval'),()=>{panel.remove();start.disabled=false;start.focus();});
        const confirm=button(t(source?'removeWithSource':'confirmRemoval'),async()=>{
          for(const control of [open,cancel,confirm]) control.disabled=true;
          try {await api.removeWorkshop(parent,folder,source);}
          catch(error) {
            showError(view.status,api,error);
            for(const control of [open,cancel,confirm]) control.disabled=false;
          }
        });
        panel.replaceChildren(node('legend',t('removeWorkshop')),node('p',t(source?'sourceRemovalWarning':'removalWarning')));
        if(source&&typeof window.showOpenFilePicker==='function') panel.append(open);
        if(source) panel.append(button(t('backupSource'),async()=>{
          try {api.download(await source.getFile(),id+'-source.vcv','application/json');}
          catch(error) {showError(view.status,api,error);}
        }));
        panel.append(cancel,confirm);view.fields.prepend(panel);cancel.focus();
      } catch(error) {
        start.disabled=false;
        showError(view.status,api,error);
      }
    });
    if(typeof window.showDirectoryPicker!=='function') {
      start.disabled=true;
      start.title=t('removalUnavailable');
    }
    return start;
  }
  function mountBuilder(root,api,snapshot={},initial=null,back=null) {
    const t=api.t,view=workspace(root,api);
    let source=snapshot.source??initial?.source??api.drawing();
    let existing=snapshot.editingId??initial?.definition.id??null;
    let draft=snapshot.draft??initial?.definition??{name:'',id:'',layers:[],parameters:[]};
    let capture=()=>draft, expanded=new Set(snapshot.expanded??[]);
    const prefix=snapshot.idEdited??Boolean(existing);
    let idEdited=prefix;
    function replaceSource(next) {
      draft=capture();source=next;render();
    }
    function render() {
      const {fields,actions,status}=view;
      fields.replaceChildren();actions.replaceChildren();status.textContent='';
      if(back) fields.append(button(t('back'),back));
      fields.append(button(t('activeDrawing'),()=>replaceSource(api.drawing())),
        button(t('browseDrawing'),async()=>{
          try {const f=await api.openFile('.vcv,.vvec');if(f) replaceSource(api.readDrawing(await f.text()));}
          catch(error) {showError(status,api,error);}
        }),
        button(t('browseRecipe'),async()=>{
          try {const f=await api.openFile('.json');if(!f) return;
            draft=M.recipe(JSON.parse(await f.text()));existing=draft.id;idEdited=true;render();}
          catch(error) {showError(status,api,error);}
        }));
      const name=field(fields,t('name'),text(draft.name)), id=field(fields,t('id'),text(draft.id,48));
      id.readOnly=Boolean(existing);
      id.oninput=()=>{idEdited=true;};
      name.oninput=()=>{if(!idEdited) id.value=nameId(name.value);};
      fields.append(node('h3',t('layers')));
      const layers=new Map();
      for(const layer of source.layers.filter(layer=>allowedLayer(source,layer))) {
        const previous=draft.layers.find(entry=>entry.name===layer.name);
        const role=field(fields,layer.name,select([
          ['object',t('object')],['variant',t('variant')],['off',t('off')]
        ],previous?.role??(layer.visible?'object':'off')));
        let editable=null;
        if(hasText(source,layer.name)) {
          editable=node('input');editable.type='checkbox';editable.checked=previous?.textEditable!==false;
          const label=field(fields,t('textEditable'),editable).parentElement;
          label.classList.add('workshop-layer-text');
          editable.setAttribute('aria-label',layer.name+' · '+t('textEditable'));
        }
        layers.set(layer.name,{role,editable});
      }
      fields.append(node('h3',t('parameters')));
      const parameters=[];
      const drivers=M.dimensionDrivers(source);
      const configured=M.parametersFor(drivers,draft);
      const dimensionBoxes=new Map();
      for(const {key,dimension,rootKey,rootName,formula,followers} of drivers) {
        const saved=configured.find(p=>p.key===key), box=node('details');
        const unit=lengthLabel(api,source,dimension);
        const label=(dimension.dimensionName??t(Formal.dimensionNames[dimension.mode]))+' · '+dimension.value+' '+unit+
          (dimension.layer?' · '+dimension.layer:'')+(dimension.driven?' · '+t('driven'):'');
        box.append(node('summary',label));box.open=expanded.has(key);fields.append(box);
        dimensionBoxes.set(key,{box,dimension});
        box.ontoggle=()=>{if(box.open) expanded.add(key);else expanded.delete(key);update();};
        if(rootKey!==key) {box.append(node('p',t('followsDimension')+' · '+rootName));continue;}
        if(formula) box.append(node('p',t('lockedFormula')+' · '+formula));
        const enabled=node('input');enabled.type='checkbox';enabled.checked=Boolean(saved)||!existing&&followers>0;
        field(box,t('expose'),enabled);
        const caption=field(box,t('label'),text(saved?.label??''));
        const min=field(box,t('min')+' · '+unit,number(api,saved?.min));
        const max=field(box,t('max')+' · '+unit,number(api,saved?.max));
        parameters.push({key,enabled,caption,min,max});
      }
      if(!parameters.length) fields.append(node('p',t('noDimensions')));
      const config=(validate=false)=>{
        const limit=input=>input.value.trim()?input.valueAsNumber:null;
        const settings={version:1,id:id.value.trim(),name:name.value.trim(),
          layers:[...layers].map(([name,{role,editable}])=>({name,role:role.value,
            ...(editable?{textEditable:editable.checked}:{})})),
          parameters:parameters.filter(p=>p.enabled.checked).map(p=>({key:p.key,label:p.caption.value.trim(),
            min:limit(p.min),max:limit(p.max)}))};
        return validate?M.recipe(settings):settings;
      };
      capture=config;
      const update=()=>{
        const active=new Set([...layers].filter(([,fields])=>fields.role.value!=='off').map(([key])=>key));
        for(const {role,editable} of layers.values()) if(editable) editable.disabled=role.value==='off';
        const entities=source.entities.filter(e=>active.has(e.layer)), ids=new Set(entities.map(e=>e.id));
        const texts=(source.texts??[]).filter(t=>active.has(t.layer)&&(t.pathMode!=='linked'||ids.has(t.pathId)));
        const cotes=[...dimensionBoxes.values()].filter(({box,dimension})=>box.open&&
          dimension.refs.every(ref=>ref.kind==='origin'||ids.has(ref.id))).map(({dimension})=>dimension);
        view.show({units:source.units,entities,texts},cotes);
      };
      for(const {role} of layers.values()) role.onchange=update;
      function output() {
        const definition=config(true);
        if(!definition.layers.some(layer=>layer.role!=='off')) throw Error('empty');
        const available=M.dimensions(source);
        for(const parameter of definition.parameters) {
          const d=available.find(entry=>entry.key===parameter.key).dimension;
          if(parameter.min!==null&&d.value<parameter.min||parameter.max!==null&&d.value>parameter.max) throw Error('badValues');
        }
        return {definition,files:M.projectFiles(definition,source)};
      }
      actions.append(button(t('publish'),async()=>{
        try {
          const {definition,files}=output();
          if(typeof window.showDirectoryPicker!=='function') {
            api.download(M.zip(definition.id,files),definition.id+'.zip','application/zip');
            status.textContent=t('zipReady');return;
          }
          const plugins=await window.showDirectoryPicker({mode:'readwrite'});
          if(!api.isPluginFolder(plugins)) throw Error('pickPlugins');
          let folder;
          try {
            folder=await plugins.getDirectoryHandle(definition.id);
            const metadata=M.recipe(JSON.parse(await read(folder,'workshop.json')));
            if(existing!==definition.id||metadata.id!==definition.id) throw Error('exists');
          } catch(error) {
            if(error.name!=='NotFoundError'||folder) throw Error('exists');
            folder=await plugins.getDirectoryHandle(definition.id,{create:true});
          }
          for(const [filename,content] of Object.entries(files)) await write(folder,filename,content);
          existing=definition.id;id.readOnly=true;status.textContent=t('published');
        } catch(error) {showError(status,api,error);}
      }),button(t('zip'),()=>{
        try {const {definition,files}=output();
          api.download(M.zip(definition.id,files),definition.id+'.zip','application/zip');
          status.textContent=t('zipReady');}
        catch(error) {showError(status,api,error);}
      }));
      status.textContent=t('builderHint');
      update();
    }
    render();
    return {dispose:view.dispose,snapshot:()=>({source,draft:capture(),editingId:existing,idEdited,expanded:[...expanded]})};
  }

  function mountGenerated(root,api,definition,embedded,state={}) {
    const t=api.t;
    let mounted, editing=false;
    const source=()=>globalThis.VcvWorkshopSources[definition.id]??embedded;
    const runtime=()=>{
      mounted?.dispose?.();editing=false;
      const current=source(), view=workspace(root,api);
      const available=new Set(current.layers.filter(layer=>allowedLayer(current,layer)).map(layer=>layer.name));
      const roles=definition.layers.filter(layer=>available.has(layer.name));
      const variants=roles.filter(layer=>layer.role==='variant');
      const objects=[];
      for(const layer of roles.filter(layer=>layer.role==='object')) {
        const input=node('input');input.type='checkbox';input.checked=state.objects?.[layer.name]??true;
        field(view.fields,layer.name,input);objects.push([layer.name,input]);
      }
      const variant=variants.length?field(view.fields,t('variant'),select(
        variants.map(layer=>[layer.name,layer.name]),variants.some(l=>l.name===state.variant)?state.variant:variants[0].name)):null;
      const controls=[];
      const drivers=M.dimensionDrivers(current);
      const configured=M.parametersFor(drivers,definition);
      for(const p of configured) {
        const found=drivers.find(entry=>entry.key===p.key);
        if(!found) continue;
        const {dimension,formula,terms}=found;
        const title=(p.label||dimension.dimensionName||t(Formal.dimensionNames[dimension.mode]))+' · '+lengthLabel(api,current,dimension);
        const box=node('div'), inputs=[];
        box.className='workshop-parameter';view.fields.append(box);
        if(formula) {
          box.append(node('strong',title),node('p',formula));
          for(const [index,value] of terms.entries()) {
            const key=M.operandKey(p.key,index), input=number(api,state.values?.[key]??value);
            field(box,t('formulaOperand')+' '+(index+1),input);inputs.push([key,input]);
          }
        } else {
          const input=number(api,state.values?.[p.key]??dimension.value);
          if(p.min!==null) input.min=p.min;
          if(p.max!==null) input.max=p.max;
          field(box,title,input);inputs.push([p.key,input]);
        }
        controls.push({dimension,inputs,box});
      }
      const fontList=node('datalist');fontList.id='vcv-workshop-fonts';
      for(const family of new Set([...(api.fonts?.()??[]),...(current.texts??[]).map(text=>text.family)])) {
        fontList.append(new Option(family,family));
      }
      view.fields.append(fontList);
      const editableLayers=new Set(roles.filter(l=>l.role!=='off'&&l.textEditable!==false).map(l=>l.name));
      const textControls=(current.texts??[]).filter(text=>editableLayers.has(text.layer)).map((sourceText,index)=>{
        const box=node('details'), properties=node('details'), content=node('textarea');
        box.className='workshop-text';
        box.append(node('summary',sourceText.layer+' · '+t('textContent')+' '+(index+1)));
        box.open=true;view.fields.append(box);
        const draft=state.texts?.[sourceText.id]??{};
        content.rows=2;content.maxLength=2000;content.value=draft.content??sourceText.content;
        field(box,t('textContent'),content);
        properties.append(node('summary',t('textSettings')));box.append(properties);
        const family=text(draft.family??sourceText.family,128);
        family.setAttribute('list',fontList.id);field(properties,t('Nom de la police'),family);
        const align=field(properties,t('Alignement'),select(
          [['left',t('Gauche')],['center',t('Centré')],['right',t('Droite')]],draft.align??sourceText.align));
        const modes=[['straight',t('Sans courbe')],['arc',t('Courbe circulaire')]];
        if(sourceText.pathMode==='linked') modes.push(['linked',t('Courbe du dessin')]);
        const pathMode=field(properties,t('Support du texte'),select(modes,draft.pathMode??sourceText.pathMode));
        const fields={content,family,align,pathMode}, curved=[];
        const labels={height:'Hauteur de police (mm)',letter:'Espacement des lettres (mm)',line:'Espacement des lignes (mm)',
          width:'Largeur des lettres (%)',angle:'Rotation du texte (°)',radius:'Rayon de courbe (mm)',
          along:'Décalage le long du tracé (mm)',offset:'Distance à la courbe (mm)',
          reverse:'Inverser le sens de lecture',inside:'Intérieur',upright:'Lettres verticales'};
        for(const key of M.textNumbers) {
          const input=number(api,draft[key]??sourceText[key]);
          if(['height','width','line','radius'].includes(key)) input.min=['height','width'].includes(key)?'.000001':'0';
          fields[key]=field(properties,t(labels[key]),input);
          if(['radius','along','offset'].includes(key)) curved.push(input.parentElement);
        }
        for(const key of M.textFlags) {
          const input=node('input');input.type='checkbox';input.checked=draft[key]??sourceText[key];
          fields[key]=field(properties,t(labels[key]),input);curved.push(input.parentElement);
        }
        return {sourceText,box,fields,curved};
      });
      const readText=({fields},raw=false)=>Object.fromEntries(Object.entries(fields).map(([key,field])=>
        [key,field.type==='checkbox'?field.checked:!raw&&'numericExpression' in field.dataset?
          field.valueAsNumber:key==='family'?field.value.trim():field.value]));
      const requestedFonts=new Set();
      const insert=button(t('insert'),()=>{
        if(!result) return;
        try {api.insertDrawing(result.drawing);api.status(t('inserted'));api.close();}
        catch(error) {showError(view.status,api,error);}
      });
      const capture=()=>({objects:Object.fromEntries(objects.map(([name,input])=>[name,input.checked])),
        variant:variant?.value,values:Object.fromEntries(controls.flatMap(({inputs})=>inputs.map(([key,input])=>[key,input.value]))),
        texts:Object.fromEntries(textControls.map(control=>[control.sourceText.id,readText(control,true)]))});
      let result=null;
      function update() {
        const active=objects.filter(([,input])=>input.checked).map(([name])=>name);
        if(variant?.value) active.push(variant.value);
        const chosen=new Set(active), ids=new Set(current.entities.filter(e=>chosen.has(e.layer)).map(e=>e.id));
        const values=new Map();
        for(const {dimension,inputs,box} of controls) {
          box.hidden=!dimension.refs.every(ref=>ref.kind==='origin'||ids.has(ref.id));
          if(!box.hidden) for(const [key,input] of inputs) values.set(key,input.valueAsNumber);
        }
        const textEdits=new Map();
        for(const control of textControls) {
          const {sourceText,box,fields,curved}=control;
          box.hidden=!chosen.has(sourceText.layer);
          for(const row of curved) row.hidden=fields.pathMode.value==='straight';
          if(!box.hidden) textEdits.set(sourceText.id,readText(control));
        }
        try {
          result=M.build(current,definition,values,active,textEdits);
          view.show(result.drawing);
          for(const {family} of result.drawing.texts) if(!requestedFonts.has(family)) {
            requestedFonts.add(family);api.prepareFont?.(family)?.then(view.repaint);
          }
          const missing=configured.length-controls.length;
          view.status.textContent=t('ready')+' · '+(result.drawing.entities.length+result.drawing.texts.length)+
            (result.skippedTexts?' · '+t('skippedTexts')+' '+result.skippedTexts:'')+
            (result.skipped?' · '+t('skipped')+' '+result.skipped:'')+(missing?' · '+t('missing')+' '+missing:'');
        } catch(error) {result=null;showError(view.status,api,error);}
        insert.disabled=!result;
      }
      view.fields.addEventListener('change',update);
      view.fields.addEventListener('keydown',event=>{
        if(event.key==='Enter'&&event.target.hasAttribute('data-numeric-expression')) event.target.blur();
      });
      view.actions.append(insert,button(t('editRecipe'),()=>{
        state=capture();view.dispose();editing=true;
        mounted=mountBuilder(root,api,{}, {definition,source:current},runtime);
      }),button(t('editSource'),async()=>{
        try {
          if(typeof window.showDirectoryPicker!=='function') {
            api.openDrawing(current,definition.id+'-source');return;
          }
          const folder=await window.showDirectoryPicker({mode:'readwrite'});
          const metadata=M.recipe(JSON.parse(await read(folder,'workshop.json')));
          if(metadata.id!==definition.id) throw Error('wrongFolder');
          const file=await folder.getFileHandle('source.vcv');
          const document=api.readDrawing(await (await file.getFile()).text());
          api.openDrawing(document,definition.id+'-source',file,async raw=>{
            const next=api.readDrawing(raw);
            await write(folder,'source-data.js',M.sourceScript(definition.id,next));
            globalThis.VcvWorkshopSources[definition.id]=next;
          });
        } catch(error) {showError(view.status,api,error);}
      }),workshopRemoval(view,api,definition.id));
      update();
      mounted={dispose:view.dispose,snapshot:capture};
    };
    if(state.designer) {
      const {designer,previous}=state;
      state=previous;editing=true;
      mounted=mountBuilder(root,api,designer,{definition,source:source()},runtime);
    } else runtime();
    return {dispose:()=>mounted?.dispose(),snapshot:()=>editing?{designer:mounted.snapshot(),previous:state}:mounted.snapshot()};
  }
  const manifest=(id,name,mount)=>({id,apiVersion:1,messages:VcvWorkshopMessages,
    about:{version:'0.1.0',description:'description',authors:['Velocivector 2D CAD'],license:'GNU GPL v3'},
    workshops:[{id:'workshop',title:name,mount}]});
  return {
    builderPlugin:()=>manifest('workshop-builder','title',mountBuilder),
    plugin:(definition,source)=>({...manifest(M.recipe(definition).id,definition.name,
      (root,api,state)=>mountGenerated(root,api,definition,source,state)),generatedWorkshop:true})
  };
})();
