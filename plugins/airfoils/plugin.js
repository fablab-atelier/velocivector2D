'use strict';
VelocivectorPlugins.registerAsync('airfoils',async load=>{
  await Promise.all([load('airfoils/geometry.js'),load('airfoils/messages.js')]);
  const {profiles,presets,build,aircraft,accessories,arrange}=VelocivectorAirfoilGeometry;
  return {
    id:'airfoils',apiVersion:1,messages:VelocivectorAirfoilMessages,
    preferences:[{key:'preset',label:'preset',default:'trainer',options:Object.keys(presets)}],
    about:{version:'0.3.0',description:'description',authors:['Velocivector 2D CAD'],license:'GNU GPL v3'},
    workshops:[{id:'wing',title:'title',mount}]
  };

  function mount(root,api,snapshot) {
    const t=api.t;
    const form=document.createElement('form'), body=document.createElement('div');
    const fields=document.createElement('fieldset'), figure=document.createElement('div');
    const report=document.createElement('div');
    const status=document.createElement('output'), insert=document.createElement('button');
    const viewport=document.createElement('div'), annotations=document.createElement('div');
    const detail=document.createElement('canvas'), notes=document.createElement('ol');
    const toggle=document.createElement('button');
    figure.classList.add('airfoil-preview');
    viewport.className='airfoil-viewport';annotations.className='airfoil-annotations';
    toggle.type='button';toggle.textContent=t('allMeasures');toggle.setAttribute('aria-pressed','false');
    detail.setAttribute('aria-label',t('root'));annotations.append(detail,notes);
    form.className='transmission-form plugin-workspace';
    body.className='transmission-body';figure.className='transmission-preview';report.className='plugin-report';
    status.setAttribute('aria-live','polite');insert.textContent=t('insert');insert.type='submit';
    const inputs={};
    const ranges={
      root:'nacaRange',tip:'nacaRange',span:'> 0 mm',rootChord:'> 0 mm',tipChord:'> 0 mm',
      sweep:'signedLength',twist:'signedAngle',count:'2–100',gap:'≥ 0 mm',clearance:'≥ 0 mm',
      tailRibs:'2–100',tailHinge:'50–95 %',wingHinge:'50–95 %',wingStart:'0–100 %',wingEnd:'0–100 %',wingStartMm:'≥ 0 mm',wingEndMm:'> 0 mm',
      tailSpan:'0 < % < 100',tailChord:'0 < % < 100',start:'0–100 %',end:'0–100 %',
      offset:'signedLength',width:'> 0 mm',height:'> 0 mm'
    };
    function field(key,value,options,container=fields) {
      const label=document.createElement('label'), caption=document.createElement('span');
      const input=document.createElement(options?'select':'input');
      caption.textContent=t(key);
      if(options) for(const option of options) input.add(new Option(t(option),option));
      else if(typeof value==='number') {input.type='number';input.step='any';api.setupNumber(input);}
      else input.setAttribute('list','airfoil-profile-codes');
      input.value=snapshot?.[(container.dataset.prefix??'')+key]??value;
      inputs[(container.dataset.prefix??'')+key]={input,label};
      label.append(caption,input);
      if(ranges[key]) {
        const hint=document.createElement('small');
        hint.className='airfoil-range';
        hint.id='airfoil-range-'+(container.dataset.prefix??'')+key;
        hint.textContent=t(ranges[key]);
        input.setAttribute('aria-describedby',hint.id);
        label.classList.add('airfoil-field');
        label.append(hint);
      }
      container.append(label);
      return input;
    }
    const list=document.createElement('datalist');list.id='airfoil-profile-codes';
    for(const code of profiles) list.append(new Option('NACA '+code,code));
    fields.append(list);
    const defaultPreset=api.toolDefault('preset','trainer');
    const preset=field('preset',defaultPreset,Object.keys(presets));
    const view=field('view','assembly',['assembly','wingOnly','plan','ribs','tail','body','tailAndBody']);
    function group(title,open,parent=fields) {
      const details=document.createElement('details'), summary=document.createElement('summary');
      summary.textContent=title;details.open=open;details.append(summary);parent.append(details);
      return details;
    }
    const bodyFields=group(t('body'),true);
    field('body','streamlined',['off','classic','streamlined'],bodyFields);
    const tailFields=group(t('tail'),true);
    field('tail','matchingTail',['off','matchingTail'],tailFields);
    field('tailSpan',aircraft[defaultPreset]?.tailSpan??aircraft.trainer.tailSpan,null,tailFields);
    field('tailChord',aircraft[defaultPreset]?.tailChord??aircraft.trainer.tailChord,null,tailFields);
    field('tailRibs',5,null,tailFields);field('tailHinge',72,null,tailFields);
    const wingFields=group(t('wing'),true);
    const mode=field('mode','batch',['single','batch'],wingFields);
    for(const [key,value] of Object.entries(presets[defaultPreset]??presets.trainer)) field(key,value,null,wingFields);
    field('gap',12,null,wingFields);field('clearance',.15,null,wingFields);
    const controls=group(t('aileron'),true,wingFields);
    const placement=field('controlPlacement','automatic',['automatic','manualPercent','manualLength'],controls);
    field('wingStartMm',300,null,controls);field('wingEndMm',570,null,controls);
    field('wingStart',50,null,controls);field('wingEnd',95,null,controls);field('wingHinge',72,null,controls);
    const sparRows=[];
    for(let i=0;i<5;i++) {
      const tail=i>=3;
      const section=group(t('spar')+' '+(tail?i-2:i+1),false,tail?tailFields:wingFields);
      section.dataset.prefix=i;
      const shape=field('shape',i===0?'round':'off',['off','round','rectangle'],section);
      field('start',i===0?30:tail&&i===3?30:60,null,section);
      field('end',i===0?30:tail&&i===3?30:60,null,section);
      field('width',i===0?5:tail?2:3,null,section);field('height',tail?2:3,null,section);
      field('offset',i===0?2:0,null,section);
      section.open=shape.value!=='off';
      sparRows.push(section);
    }
    figure.append(toggle,annotations,viewport);body.append(fields,figure);report.append(status,insert);form.append(body,report);root.append(form);
    function value(key) {
      const {input}=inputs[key];
      return 'numericExpression' in input.dataset?input.valueAsNumber
        : input.type==='text'?input.value.replace(/^NACA\s*/i,'').trim():input.value;
    }
    let entities=[], layerNames=[], first=[], config, spars=[];
    let activeKey=null, allMeasures=snapshot?.allMeasures==='true';
    const readFields=()=>Object.fromEntries(Object.entries(inputs).map(([key,{input}])=>[key,input.value]));
    let accepted=readFields();
    function flash(input) {
      input.getAnimations().forEach(animation=>animation.cancel());
      input.animate([{boxShadow:'0 0 0 2px #cf343e'},{boxShadow:'none',offset:.5},{boxShadow:'0 0 0 2px #cf343e'}],
        matchMedia('(prefers-reduced-motion: reduce)').matches?{duration:850,iterations:1}:{duration:360,iterations:3});
    }
    function paintAnnotations() {
      const keys=Object.entries(inputs).filter(([key,{input,label}])=>
        !label.hidden &&
        ('numericExpression' in input.dataset || ['root','tip'].includes(key)))
        .map(([key])=>key);
      const visible=allMeasures?keys:keys.filter(key=>key===activeKey);
      annotations.hidden=!visible.length||!first.length;
      toggle.setAttribute('aria-pressed',String(allMeasures));
      toggle.classList.toggle('active',allMeasures);
      if(annotations.hidden) return;
      detail.width=Math.max(40,annotations.clientWidth);
      detail.height=94;
      const project=api.preview(detail,first);
      const ctx=detail.getContext('2d');
      ctx.strokeStyle=ctx.fillStyle=getComputedStyle(annotations).color;
      ctx.font='12px system-ui';
      const format=new Intl.NumberFormat(api.language(),{maximumFractionDigits:3,useGrouping:false});
      function guide(key,index) {
        if(!project) return;
        const sparIndex=/^[0-2]/.test(key)?Number(key[0]):-1;
        if(sparIndex>=0 && !['start','width','height','offset'].includes(key.slice(1))) return;
        if(sparIndex<0 && key!=='rootChord') return;
        const spar=spars[sparIndex];
        const target=spar?[spar.start*config.rootChord/100,spar.offset]:[config.rootChord/2,0];
        const [x,y]=project(target);
        const lane=allMeasures?(index%4)*7:0;
        if(key==='rootChord') {
          const [left]=project([0,0]),[right]=project([config.rootChord,0]);
          ctx.beginPath();ctx.moveTo(left,79);ctx.lineTo(right,79);ctx.stroke();
          for(const px of [left,right]) {
            ctx.beginPath();ctx.moveTo(px,74);ctx.lineTo(px,84);ctx.stroke();
          }
        } else {
          ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(index%3-1)*14,15+lane);ctx.stroke();
        }
        ctx.fillText(String(index+1),x+(index%3-1)*14+4,key==='rootChord'?92:13+lane);
      }
      notes.replaceChildren(...visible.map((key,index)=>{
        const {input,label}=inputs[key], measure=value(key);
        const entry=document.createElement('li');
        const sparIndex=/^[0-4]/.test(key)?Number(key[0]):-1;
        const name=sparIndex<0?'':(sparIndex>=3?t('tail')+' · ':'')+t('spar')+' '+(sparIndex%3+1)+' · ';
        const number=typeof measure==='number'?(Number.isFinite(measure)?format.format(measure):input.value):'NACA '+measure;
        entry.textContent=name+label.firstChild.textContent+' · '+number;
        guide(key,index);
        return entry;
      }));
    }
    const wingPreview=document.createElement('div');
    wingPreview.className='airfoil-wing-preview';viewport.append(wingPreview);
    const panels=Object.fromEntries(['plan','ribs','tail','body'].map(key=>{
      const wrapper=document.createElement('section'), canvas=document.createElement('canvas');
      const bar=document.createElement('header'), heading=document.createElement('strong');
      const reset=document.createElement('button'), ruler=document.createElement('canvas');
      const total=document.createElement('output');total.className='airfoil-total';total.hidden=true;
      ruler.className='airfoil-ruler';ruler.setAttribute('aria-hidden','true');
      wrapper.className='airfoil-panel';wrapper.hidden=true;
      heading.textContent=t(key);
      reset.type='button';reset.textContent='↺';
      reset.title=t('fitPreview');reset.setAttribute('aria-label',t('fitPreview'));
      bar.append(heading,reset);
      canvas.tabIndex=0;
      canvas.setAttribute('aria-label',t(key)+' · '+t('zoomPreview'));
      canvas.title=t('zoomPreview');wrapper.append(bar,canvas,total,ruler);(key==="plan"||key==="ribs"?wingPreview:viewport).append(wrapper);
      const panel={wrapper,canvas,ruler,total,entities:[],labels:[],zoom:1,offset:[0,0]};
      function zoomAt(factor,x=0,y=0) {
        const next=Math.max(.65,Math.min(24,panel.zoom*factor));
        const ratio=next/panel.zoom;
        panel.offset=[x+(panel.offset[0]-x)*ratio,y+(panel.offset[1]-y)*ratio];
        panel.zoom=next;
        drawPanel(panel);
      }
      reset.onclick=()=>{panel.zoom=1;panel.offset=[0,0];drawPanel(panel);};
      canvas.addEventListener('wheel',event=>{
        event.preventDefault();
        const factor=Math.exp(Math.max(-.6,Math.min(.6,-event.deltaY*(event.deltaMode? .02:.002))));
        zoomAt(factor,event.offsetX-canvas.clientWidth/2,event.offsetY-canvas.clientHeight/2);
      },{passive:false});
      canvas.onkeydown=event=>{
        if(event.key==='0') reset.click();
        else if(['+','=','-'].includes(event.key)) zoomAt(event.key==='-'?1/1.25:1.25);
        else return;
        event.preventDefault();
      };
      let pointer=null;
      canvas.onpointerdown=event=>{
        if(event.button!==0) return;
        canvas.setPointerCapture(event.pointerId);
        pointer=[event.clientX,event.clientY];
      };
      canvas.onpointermove=event=>{
        if(!pointer) return;
        panel.offset[0]+=event.clientX-pointer[0];
        panel.offset[1]+=event.clientY-pointer[1];
        pointer=[event.clientX,event.clientY];
        drawPanel(panel);
      };
      canvas.onlostpointercapture=()=>{pointer=null;};
      return [key,panel];
    }));
    function drawPanel(panel) {
      if(panel.wrapper.hidden) return;
      const {canvas,ruler}=panel;
      const width=Math.max(40,canvas.clientWidth),height=Math.max(40,canvas.clientHeight);
      canvas.width=width;canvas.height=height;
      const project=api.preview(canvas,panel.entities,panel);
      if(!project) return;
      const ctx=canvas.getContext('2d');
      ctx.fillStyle=ctx.strokeStyle=getComputedStyle(figure).color;
      ctx.setLineDash([]);
      ctx.font='11px system-ui';ctx.textAlign='center';
      for(const [key,point] of panel.labels) {
        const [x,y]=project(point);
        ctx.fillText(t(key),x,y-4);
      }
      const units=project([1,0])[0]-project([0,0])[0];
      if(!(units>0)) return;
      const target=Math.min(76,width*.65)/units;
      const decade=10**Math.floor(Math.log10(target));
      const distance=(target/decade>=5?5:target/decade>=2?2:1)*decade;
      const pixels=distance*units, x=10,y=20;
      ruler.width=width;ruler.height=27;
      const scale=ruler.getContext('2d');
      scale.fillStyle=scale.strokeStyle=ctx.strokeStyle;
      scale.beginPath();scale.moveTo(x,y-4);scale.lineTo(x,y+4);
      scale.moveTo(x,y);scale.lineTo(x+pixels,y);scale.moveTo(x+pixels,y-4);scale.lineTo(x+pixels,y+4);
      scale.stroke();
      scale.font='11px system-ui';
      const format=new Intl.NumberFormat(api.language(),{maximumSignificantDigits:3});
      scale.fillText(format.format(distance)+' mm',x,y-7);
    }
    function draw() {
      paintAnnotations();
      Object.values(panels).forEach(drawPanel);
    }
    const observer=new ResizeObserver(draw);observer.observe(figure);
    toggle.onclick=()=>{allMeasures=!allMeasures;draw();};
    form.addEventListener('focusin',event=>{
      const key=Object.keys(inputs).find(key=>inputs[key].input===event.target);
      if(key){activeKey=key;draw();}
    });
    fields.addEventListener('toggle',draw,true);
    function render() {
      const single=mode.value==='single';
      if(single && view.value==='plan') view.value='ribs';
      view.querySelector('[value=plan]').disabled=single;
      for(const key of ['tailSpan','tailChord','tailRibs','tailHinge']) inputs[key].label.hidden=value('tail')==='off';
      controls.hidden=single;
      inputs.controlPlacement.label.hidden=single;
      for(const key of ['wingStart','wingEnd']) inputs[key].label.hidden=single||placement.value!=='manualPercent';
      for(const key of ['wingStartMm','wingEndMm']) inputs[key].label.hidden=single||placement.value!=='manualLength';
      inputs.wingHinge.label.hidden=single||placement.value==='automatic';
      for(const key of ['tip','tipChord','sweep','twist','count','gap']) inputs[key].label.hidden=single;
      const candidateSpars=sparRows.map((_,i)=>{
        const row=Object.fromEntries(['shape','start','end','width','height','offset'].map(key=>[key,value(i+key)]));
        sparRows[i].hidden=i>=3&&value('tail')==='off';
        for(const key of ['start','end','width','height','offset']) {
          inputs[i+key].label.hidden=sparRows[i].hidden||row.shape==='off'||(key==='end'&&single&&i<3)||(key==='height'&&row.shape!=='rectangle');
        }
        inputs[i+'width'].label.firstChild.textContent=t(row.shape==='round'?'diameter':'width');
        return row;
      });
      try {
        const candidate=Object.fromEntries(['mode','root','tip','span','rootChord','tipChord','sweep','twist','count','gap','clearance'].map(key=>[key,value(key)]));
        const semiSpan=candidate.span/2;
        const format=new Intl.NumberFormat(api.language(),{maximumFractionDigits:0});
        const precise=new Intl.NumberFormat(api.language(),{maximumFractionDigits:3});
        if(!single&&Number.isFinite(semiSpan)&&semiSpan>0) {
          for(const key of ['wingStartMm','wingEndMm']) {
            inputs[key].label.lastChild.textContent='0–'+precise.format(semiSpan)+' mm';
          }
        }
        candidate.control=placement.value==='manualLength'
          ?{start:value('wingStartMm')/semiSpan*100,end:value('wingEndMm')/semiSpan*100,hinge:value('wingHinge')}
          :placement.value==='manualPercent'?{start:value('wingStart'),end:value('wingEnd'),hinge:value('wingHinge')}
            :{start:50,end:95,hinge:72};
        const design=build(candidate,candidateSpars.slice(0,3));
        if(design.invalid.length) return t('invalid')+' '+design.invalid.map(pair=>pair.join(' / ')).join(', ');
        const addition=accessories(candidate,{
          preset:preset.value,tail:value('tail'),tailSpan:value('tailSpan'),
          tailChord:value('tailChord'),tailRibs:value('tailRibs'),tailHinge:value('tailHinge'),
          body:value('body'),tailSpars:candidateSpars.slice(3),wingHoles:design.rootHoles
        });
        if(addition.invalid?.length) return t('tail')+' · '+t('invalid')+' '+addition.invalid.map(pair=>pair.join(' / ')).join(', ');
        config=candidate;spars=candidateSpars;first=design.first;
        const items={plan:design.plan,ribs:design.ribs,tail:addition.tail,body:addition.body};
        const visible={
          assembly:['plan','ribs','tail','body'],wingOnly:['plan','ribs'],plan:['plan'],
          ribs:['ribs'],tail:['tail'],body:['body'],tailAndBody:['tail','body']
        }[view.value];
        for(const [key,panel] of Object.entries(panels)) {
          panel.entities=visible.includes(key)?items[key]:[];
          panel.labels=key==='body'?addition.labels:[];
          const total=key==='body'?addition.fuselageLength:key==='plan'?candidate.span+addition.fuselageWidth:0;
          panel.total.hidden=!(total>0);
          if(total>0) panel.total.textContent=t(key==='body'?'totalLength':'totalWingSpan')+' · '+format.format(total)+' mm';
          panel.wrapper.hidden=!panel.entities.length;
        }
        wingPreview.hidden=panels.plan.wrapper.hidden&&panels.ribs.wrapper.hidden;
        const category=entity=>{
          const group=entity.vectorGroup;
          if(group==='wing') return 'layerWingPlan';
          if(group.startsWith('rib-')) return 'layerWingRibs';
          if(group==='tail-wing') return 'layerTailPlan';
          if(group.startsWith('tail-rib-')) return 'layerTailRibs';
          return group==='rudder'?'layerRudder':'layerBody';
        };
        entities=arrange(visible.map(key=>items[key]),Math.max(14,candidate.gap))
          .map(entity=>({...entity,layer:t(category(entity))}));
        layerNames=[...new Set(entities.map(entity=>entity.layer))];
        draw();
        status.textContent=entities.length?t('ready')+' '+(single?1:config.count):t('emptyView');
        insert.disabled=!entities.length;
        return '';
      } catch(error) {
        return t(error.message);
      }
    }
    function commit(input) {
      const key=Object.keys(inputs).find(key=>inputs[key].input===input);
      if(!key) return;
      if(input.value===accepted[key]) {
        if(!insert.disabled) return;
      } else {
        if(input===placement) {
          const half=value('span')/2;
          // Keep the same physical endpoints when switching between the two units.
          if(placement.value==='manualLength') {
            inputs.wingStartMm.input.value=value('wingStart')*half/100;
            inputs.wingEndMm.input.value=value('wingEnd')*half/100;
          } else if(accepted.controlPlacement==='manualLength'&&placement.value==='manualPercent') {
            inputs.wingStart.input.value=value('wingStartMm')/half*100;
            inputs.wingEnd.input.value=value('wingEndMm')/half*100;
          }
        }
        if(input===preset) {
          for(const [field,value] of Object.entries(presets[preset.value])) inputs[field].input.value=value;
          for(const field of ['tailSpan','tailChord']) inputs[field].input.value=aircraft[preset.value][field];
        }
      }
      const error=render();
      if(!error) {
        accepted=readFields();
        return;
      }
      for(const [field,previous] of Object.entries(accepted)) inputs[field].input.value=previous;
      render();
      flash(input);
      status.textContent=t('restored')+' '+error;
    }
    form.addEventListener('input',event=>{
      if(event.target.tagName==='SELECT') return;
      const error=render();
      if(error) {
        insert.disabled=true;
        status.textContent=error;
      }
    });
    form.addEventListener('change',event=>commit(event.target));
    form.addEventListener('focusout',event=>{
      if(event.target.tagName==='INPUT') commit(event.target);
    });
    form.addEventListener('keydown',event=>{
      if(event.key!=='Enter'||event.isComposing||event.target.tagName!=='INPUT') return;
      event.preventDefault();
      commit(event.target);
      event.target.blur();
    },true);
    form.addEventListener('submit',event=>{
      event.preventDefault();
      if(insert.disabled) return;
      try {api.insert({entities,layers:layerNames},{units:'mm'});api.status(t('inserted'));api.close();}
      catch {status.textContent=t('insertError');}
    });
    const initialError=render();
    if(initialError) {insert.disabled=true;status.textContent=initialError;}
    else accepted=readFields();
    return {dispose:()=>observer.disconnect(),snapshot:()=>({...accepted,allMeasures:String(allMeasures)})};
  }
});
