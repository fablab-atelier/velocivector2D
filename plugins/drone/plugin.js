'use strict';
VelocivectorPlugins.registerAsync('drone',async load=>{
  await Promise.all([load('drone/geometry.js'),load('drone/messages.js')]);
  const {sizes,boards,defaults,build}=DroneFrameGeometry;
  return {id:'drone',apiVersion:1,messages:DroneFrameMessages,
    preferences:[{key:'prop',label:'prop',default:'5',options:sizes.map(String)},
      {key:'count',label:'count',default:'4',options:['4','6','8']}],
    about:{version:'0.1.0',description:'description',authors:['Velocivector 2D CAD'],license:'GNU GPL v3'},
    workshops:[{id:'frame',title:'title',mount}]};

  function mount(root,api,snapshot) {
    const t=api.t;
    const form=document.createElement('form'), body=document.createElement('div');
    const fields=document.createElement('fieldset'), figure=document.createElement('div');
    const canvas=document.createElement('canvas'), report=document.createElement('div');
    const status=document.createElement('output'), insert=document.createElement('button');
    form.className='transmission-form plugin-workspace';
    body.className='transmission-body';figure.className='transmission-preview drone-preview';
    report.className='plugin-report';status.setAttribute('aria-live','polite');
    insert.textContent=t('insert');insert.type='submit';
    const inputs={};
    const measure=new Intl.NumberFormat(api.language(),{maximumFractionDigits:1});
    function field(key,start,options,parent=fields,prefix='') {
      const label=document.createElement('label'), caption=document.createElement('span');
      const input=document.createElement(options?'select':'input');
      caption.textContent=t(key);
      const id=prefix+key;
      const stored=snapshot?.[id]??start;
      if(options) {
        for(const [value,title] of options) input.add(new Option(title,value));
        input.value=stored;
      } else if(typeof start==='boolean') {
        input.type='checkbox';input.checked=stored;
      } else {
        api.setupNumber(input);input.value=stored;
      }
      inputs[id]={input,label};label.append(caption,input);parent.append(label);return input;
    }
    function group(key,open=false) {
      const details=document.createElement('details'), summary=document.createElement('summary');
      summary.textContent=t(key);details.open=open;details.append(summary);fields.append(details);
      return details;
    }
    const p=Number(api.toolDefault('prop','5')), n=Number(api.toolDefault('count','4'));
    const preset=defaults(p,n);
    const count=field('count',n,[4,6,8].map(n=>[n,n]));
    const prop=field('prop',p,sizes.map(n=>[n,n+'″   ·   '+measure.format(n*25.4)+' mm']));
    const dimensionHint=document.createElement('small');dimensionHint.className='drone-size-hint';
    fields.append(dimensionHint);
    for(const key of ['hub','core','gap','arm']) field(key,preset[key]);
    const motor=group('motors',true);
    field('screws',4,[2,4].map(n=>[n,n]),motor);
    for(const key of ['motorX','motorY','motorHole']) field(key,preset[key],null,motor);
    const fc=group('flight',true);
    const board=field('board','F405 V4',[['custom',t('custom')],...Object.entries(boards)
      .map(([model,[x,y]])=>[model,'SpeedyBee '+model+' · '+measure.format(x)+' × '+measure.format(y)+' mm'])],fc);
    for(const [i,key] of ['fcX','fcY','fcHole'].entries()) field(key,boards['F405 V4'][i],null,fc);
    const mountKeys=['camera','vtx','receiver'];
    for(const [key,y,dx,dy] of [['camera',-preset.core*.46,19,0],['vtx',0,20,20],['receiver',preset.core*.46,12,0]]) {
      const mount=group(key);
      field('enabled',false,null,mount,key);
      field('panel',key==='camera'?'bottom':'top',[['bottom',t('frame')],['top',t('lid')]],mount,key);
      for(const [id,v] of Object.entries({x:0,y,dx,dy,hole:2.2})) field(id,v,null,mount,key);
    }
    const carbon=group('carbon',true);
    for(const [key,value] of Object.entries({bottom:preset.bottom,top:preset.top,spacer:25,spacerHole:3.2,density:1.55})) {
      field(key,value,null,carbon);
    }
    const views=document.createElement('div');
    views.className='drone-views';
    let view=snapshot?.view??'frame';
    const tabs=new Map(['frame','lid','side'].map(key=>{
      const tab=document.createElement('button');
      tab.type='button';tab.textContent=t(key);
      tab.onclick=()=>{view=key;draw();};
      views.append(tab);return [key,tab];
    }));
    figure.append(views,canvas);body.append(fields,figure);report.append(status,insert);form.append(body,report);root.append(form);
    const value=({input})=>input.type==='checkbox'?input.checked
      :'numericExpression' in input.dataset?input.valueAsNumber:input.value;
    const read=key=>value(inputs[key]);
    let model;
    function draw() {
      for(const [key,tab] of tabs) {
        tab.classList.toggle('active',view===key);tab.setAttribute('aria-pressed',String(view===key));
      }
      canvas.setAttribute('aria-label',t(view));
      canvas.width=Math.max(40,figure.clientWidth);
      canvas.height=Math.max(40,figure.clientHeight-views.offsetHeight);
      if(!model) {api.preview(canvas,[]);return;}
      const disks=model.motors.map(c=>({type:'circle',c,r:model.propRadius}));
      const project=api.preview(canvas,view==='side'?model.side:view==='lid'?model.lid.entities:[...disks,...model.base.entities]);
      if(view==='frame'&&project) {
        const ctx=canvas.getContext('2d');
        const r=project([model.propRadius,0])[0]-project([0,0])[0];
        ctx.save();ctx.globalCompositeOperation='destination-over';ctx.fillStyle='rgba(0,0,0,.30)';
        for(const c of model.motors) {
          ctx.beginPath();ctx.arc(...project(c),r,0,Math.PI*2);ctx.fill();
        }
        ctx.restore();
      }
    }
    const observer=new ResizeObserver(draw);observer.observe(figure);
    function render() {
      inputs.motorY.label.hidden=read('screws')==='2';
      const mounts=mountKeys.map(name=>{
        const enabled=read(name+'enabled');
        const keys=['panel','x','y','dx','dy','hole'];
        for(const key of keys) inputs[name+key].label.hidden=!enabled;
        return {enabled,...Object.fromEntries(keys.map(key=>[key,read(name+key)]))};
      });
      const d=Number(prop.value)*25.4,n=Number(count.value);
      const config=Object.fromEntries(Object.entries(inputs).map(([key,input])=>[key,value(input)]));
      config.count=n;config.prop=Number(prop.value);config.screws=Number(config.screws);
      const min=Math.max((d+config.gap)/(2*Math.sin(Math.PI/n)),config.core+d/2+config.gap);
      dimensionHint.textContent=Number.isFinite(min)?t('minimumHub')+' · '+measure.format(Math.ceil(min))+' mm':'';
      try {
        model=build(config,mounts);
        status.textContent=t('area')+' · '+measure.format(model.net/100)+' cm²  |  '+
          t('mass')+' · '+measure.format(model.mass)+' g  |  '+t('clearance')+' · '+measure.format(model.clearance)+' mm';
      } catch(error) {
        model=null;status.textContent=t(error.message);
      }
      insert.disabled=!model;
      draw();
    }
    for(const control of [count,prop]) control.addEventListener('input',()=>{
      const next=defaults(Number(prop.value),Number(count.value));
      for(const [key,val] of Object.entries(next)) inputs[key].input.value=val;
    });
    board.addEventListener('input',()=>{
      if(!boards[board.value]) return;
      ['fcX','fcY','fcHole'].forEach((key,i)=>{inputs[key].input.value=boards[board.value][i];});
    });
    for(const key of ['fcX','fcY','fcHole']) inputs[key].input.addEventListener('input',()=>{board.value='custom';});
    form.addEventListener('input',render);form.addEventListener('change',render);
    form.onsubmit=event=>{
      event.preventDefault();
      if(!model) return;
      const layers=['frame','lid'].map(t);
      const x=Math.max(...model.base.entities[0].p.map(p=>p[0]))+Math.max(...model.lid.entities[0].p.map(p=>p[0]))+15;
      const entities=[...model.base.entities.map(e=>({...e,layer:layers[0]})),
        ...model.lid.entities.map(e=>({...G.transform(e,([u,v])=>[u+x,v]),layer:layers[1]}))];
      try {api.insert({entities,layers},{units:'mm'});api.status(t('inserted'));api.close();}
      catch {status.textContent=t('insertError');}
    };
    render();
    return {dispose:()=>observer.disconnect(),snapshot:()=>({view,...Object.fromEntries(Object.entries(inputs).map(([key,{input}])=>
      [key,input.type==='checkbox'?input.checked:input.value]))})};
  }
});
