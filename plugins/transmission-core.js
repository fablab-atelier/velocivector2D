'use strict';
(()=>{
  const tau=2*Math.PI, rad=Math.PI/180;
  const polar=(c,r,a)=>[c[0]+r*Math.cos(a),c[1]+r*Math.sin(a)];
  const loop=p=>({type:'poly',p,closed:true});
  const involute=t=>t-Math.atan(t);
  const diameter=(teeth,module)=>teeth*module;
  const pitchPulley=(teeth,pitch)=>teeth*pitch/Math.PI;

  function gear(c,z,m,angle,phase,internal=false) {
    const r=diameter(z,m)/2, base=r*Math.cos(angle);
    const root=r+(internal?1.25:-1.25)*m, tip=r+(internal?-1:1)*m;
    const low=Math.min(root,tip), high=Math.max(root,tip);
    const inv=radius=>involute(Math.sqrt(Math.max(0,(radius/base)**2-1)));
    const direction=internal?-1:1;
    const half=radius=>Math.PI/(2*z)+direction*(inv(r)-inv(radius));
    const start=Math.max(low,Math.min(base,high)), pitch=tau/z, points=[];
    if(half(tip)<=0||half(root)>=pitch/2) throw Error('geometry');
    for(let tooth=0;tooth<z;tooth++) {
      const a=phase+tooth*pitch;
      const flank=Array.from({length:7},(_,i)=>start+(high-start)*i/6);
      if(start>low+1e-9) flank.unshift(low);
      const towardTip=internal?flank.toReversed():flank;
      for(const radius of towardTip) points.push(polar(c,radius,a-half(radius)));
      for(let i=1;i<4;i++) points.push(polar(c,tip,a+half(tip)*(2*i/4-1)));
      for(const radius of towardTip.toReversed()) points.push(polar(c,radius,a+half(radius)));
      for(let i=1;i<4;i++) points.push(polar(c,root,a+half(root)+(pitch-2*half(root))*i/4));
    }
    return loop(points);
  }

  function rack(count,m,angle) {
    const pitch=Math.PI*m, h=pitch/4, tangent=Math.tan(angle), bottom=-1.25*m;
    const left=-count*pitch/2, right=-left, points=[[left,-3*m]];
    if(h-m*tangent<=0||h-bottom*tangent>=pitch/2) throw Error('geometry');
    for(let i=0;i<count;i++) {
      const x=left+(i+.5)*pitch;
      points.push([x-h+bottom*tangent,bottom],[x-h+m*tangent,m],[x+h-m*tangent,m],[x+h-bottom*tangent,bottom]);
    }
    return {outline:loop([...points,[right,-3*m]]),line:{type:'line',p:[[left,0],[right,0]],construction:'dashed'}};
  }

  function pulley(c,z,pitch,profile) {
    // Layout approximation. The commercial groove is specific to the manufacturer.
    const r=pitchPulley(z,pitch)/2, step=tau/z, points=[];
    for(let j=0;j<z;j++) for(let i=0;i<20;i++) {
      const fraction=i/20, distance=Math.min(fraction,1-fraction);
      const relief=/^(T|XL)/.test(profile??'')?.27*pitch*Math.max(0,Math.min(1,(.32-distance)/.17)):
        distance<.32?.27*pitch*(1+Math.cos(Math.PI*distance/.32))/2:0;
      points.push(polar(c,r-.13*pitch-relief,(j+fraction)*step));
    }
    return loop(points);
  }

  function belt(r1,r2,d) {
    if(d<=r1+r2) throw Error('spacing');
    const a=Math.acos((r1-r2)/d), o=[0,0], c=[d,0];
    const top1=polar(o,r1,a), top2=polar(c,r2,a);
    const bot1=polar(o,r1,-a), bot2=polar(c,r2,-a);
    return {type:'path',closed:true,construction:'dashed',segments:[
      {type:'line',p:[top1,top2]}, {type:'arc',c,r:r2,a,s:-2*a},
      {type:'line',p:[bot2,bot1]}, {type:'arc',c:o,r:r1,a:-a,s:-tau+2*a}
    ]};
  }

  function beltLengthAt(r1,r2,d) {
    const delta=r1-r2;
    return 2*Math.sqrt(d*d-delta*delta)+Math.PI*(r1+r2)+2*delta*Math.asin(delta/d);
  }
  function nearestPitchLength(length,pitch) {
    if(!Number.isFinite(length)||length<0||!Number.isFinite(pitch)||pitch<=0) return length;
    const pitches=length/pitch, lower=Math.floor(pitches);
    const tieTolerance=Number.EPSILON*Math.max(1,pitches)*4;
    const count=pitches-lower>.5+tieTolerance?lower+1:lower;
    return Number((count*pitch).toFixed(8));
  }
  function centerDistance(r1,r2,length) {
    let lo=r1+r2, hi=length/2;
    if(!Number.isFinite(length)||length<=beltLengthAt(r1,r2,lo)) throw Error('spacing');
    for(let i=0;i<56;i++) {
      const middle=(lo+hi)/2;
      if(beltLengthAt(r1,r2,middle)<length) lo=middle;else hi=middle;
    }
    return (lo+hi)/2;
  }
  function build({mode,teeth,module:m,pressure,pitch,distance,length,planets,profile}) {
    const limits={gear:[1,1],internal:[2,2],rack:[1,2],series:[2,8],branch:[3,3],planetary:[2,2],belt:[1,2]};
    const pulleyMode=mode==='belt';
    if(!Object.hasOwn(limits,mode)||!Array.isArray(teeth)||teeth.length<limits[mode][0]||teeth.length>limits[mode][1]||
      !teeth.every(z=>Number.isInteger(z)&&z>=1&&z<=240)) throw Error('teethError');
    if(pulleyMode) {
      if(![2,2.5,3,5,5.08].includes(pitch)||teeth.some(z=>z<10)) throw Error('geometry');
      if(teeth.length===2&&length!==undefined) {
        if(length>100000||!Number.isFinite(length)||Math.abs(length/pitch-Math.round(length/pitch))>1e-8) throw Error('pitchLengthError');
        distance=centerDistance(...teeth.map(z=>pitchPulley(z,pitch)/2),length);
      }
      if(teeth.length===2&&(!Number.isFinite(distance)||distance<=0||distance>100000)) throw Error('geometry');
    } else if(!Number.isFinite(m)||m<.05||m>100||![14.5,20,25].includes(pressure)||mode!=='rack'&&teeth.some(z=>z<8)) {
      throw Error('geometry');
    }
    const entities=[],constraints=[],diameters=[], angle=pressure*rad, centers=[], notes=[];
    const ref=(key,kind,index=0)=>({key,kind,index});
    function add(c,z,phase=0,inside=false) {
      if(!pulleyMode&&z<8) throw Error('geometry');
      const d=pulleyMode?pitchPulley(z,pitch):diameter(z,m), r=d/2, key='profile'+centers.length;
      const outline=pulleyMode?pulley(c,z,pitch,profile):gear(c,z,m,angle,phase,inside);
      entities.push({...outline,key,vectorGroup:key});
      if(inside) entities.push({type:'circle',c,r:r+3*m,vectorGroup:key});
      const primitive=key+'-pitch';
      entities.push({type:'circle',c,r,key:primitive,construction:'dashed',vectorGroup:key});
      constraints.push(
        {type:'dimension',mode:'diameter',refs:[ref(primitive,'edge')],value:d,offset:[r*.92,r*.92]},
        {type:'coincident',refs:[ref(key,'point',outline.p.length),ref(primitive,'point')]});
      centers.push(c);diameters.push(d);
      if(mode!=='belt'&&!inside&&z<Math.ceil(2/Math.sin(angle)**2)) notes.push('undercut');
    }
    function mesh(z1,z2,phase,axis) {
      return axis+Math.PI+(z1*(axis-phase)-Math.PI)/z2;
    }
    let beltLength=0, ratio=null;
    if(mode==='rack') {
      const {outline,line}=rack(teeth[0],m,angle);
      entities.push({...outline,vectorGroup:'rack'},{...line,key:'pitch',vectorGroup:'rack'});
      constraints.push({type:'horizontal',refs:[ref('pitch','edge')]});
      if(teeth.length===2) add([0,diameter(teeth[1],m)/2],teeth[1],-Math.PI/2+(teeth[0]%2?Math.PI/teeth[1]:0));
    } else if(mode==='gear') {
      add([0,0],teeth[0]);
    } else if(mode==='internal') {
      const [pinion,ring]=teeth;
      if(ring-pinion<10) throw Error('spacing');
      add([0,0],ring,Math.PI/ring,true);
      add([(ring-pinion)*m/2,0],pinion);
      ratio=pinion/ring;
    } else if(mode==='planetary') {
      const [sun,planet]=teeth, ring=sun+2*planet, orbit=(sun+planet)*m/2;
      if(!Number.isInteger(planets)||planets<2||planets>8||ring>240||(sun+ring)%planets||
        (planet+2)*m>=2*orbit*Math.sin(Math.PI/planets)) throw Error('planetError');
      add([0,0],sun);
      const firstPhase=mesh(sun,planet,0,0);
      const ringPhase=(Math.PI-planet*firstPhase)/ring;
      add([0,0],ring,ringPhase,true);
      for(let i=0;i<planets;i++) {
        const axis=tau*i/planets;
        add(polar([0,0],orbit,axis),planet,mesh(sun,planet,0,axis));
      }
      ratio=sun/(sun+ring);
    } else if(mode==='belt') {
      add([0,0],teeth[0]);notes.push('approximate');
      if(teeth.length===2) {
        const [a,b]=teeth.map(z=>pitchPulley(z,pitch)/2);
        const route=belt(a,b,distance);
        add([distance,0],teeth[1]);entities.push({...route,vectorGroup:'belt'});
        constraints.push({type:'dimension',mode:'aligned',refs:[
          ref('profile0-pitch','point'),ref('profile1-pitch','point')],
          value:distance,offset:[0,-Math.max(a,b)*1.5],driven:true});
        beltLength=route.segments.reduce((total,segment)=>total+(segment.type==='line'?
          Math.hypot(segment.p[1][0]-segment.p[0][0],segment.p[1][1]-segment.p[0][1]):segment.r*Math.abs(segment.s)),0);
        ratio=teeth[0]/teeth[1];
      }
    } else {
      let phase=0, center=[0,0];
      add(center,teeth[0],phase);
      for(let i=1;i<teeth.length;i++) {
        const from=mode==='branch'?0:i-1, axis=mode==='branch'?(i===1?1:-1)*Math.PI/3:0;
        const step=(teeth[from]+teeth[i])*m/2;
        center=polar(centers[from],step,axis);
        if(mode==='branch'&&i===2&&Math.hypot(center[0]-centers[1][0],center[1]-centers[1][1])<=(teeth[1]+teeth[2]+4)*m/2)
          throw Error('spacing');
        phase=mesh(teeth[from],teeth[i],mode==='branch'?0:phase,axis);
        add(center,teeth[i],phase);
      }
      ratio=mode==='branch'?teeth.slice(1).map(z=>-teeth[0]/z):((-1)**(teeth.length-1))*teeth[0]/teeth.at(-1);
    }
    return {entities,constraints,diameters,ratio,beltLength,distance,notes:[...new Set(notes)]};
  }

  if(typeof module!=='undefined') {module.exports={build,diameter,pitchPulley,nearestPitchLength};return;}
  const gearModes=['gear','internal','rack','series','branch','planetary'];
  const profiles={'GT2 2M':2,'GT2 3M':3,'HTD 3M':3,'HTD 5M':5,'T2.5':2.5,'T5':5,'XL':5.08};
  const toothDefaults={gear:'24',internal:'20 60',rack:'12',series:'20 30 40',branch:'30 20 20',planetary:'24 18',belt:'20 40'};
  const defaults={
    transmissionMode:['mode','gear',gearModes],
    transmissionModule:['module',2,{min:.05,max:100}],
    transmissionPressure:['pressure','20',[20,14.5,25]],
    transmissionPlanets:['planets',3,{min:2,max:8}],
    transmissionProfile:['pitch','GT2 2M',Object.keys(profiles)],
    transmissionBeltLength:['beltLength',180,{min:0,max:100000}],
    ...Object.fromEntries(Object.entries(toothDefaults).map(([mode,value])=>['transmissionTeeth-'+mode,[mode,value,null]]))
  };
  function mount(root,api,pulleys,state) {
    const t=api.t;
    const form=document.createElement('form'), fields=document.createElement('fieldset');
    const body=document.createElement('div'), figure=document.createElement('div'), report=document.createElement('div');
    const canvas=document.createElement('canvas'), readout=document.createElement('output'), notice=document.createElement('p');
    form.className='transmission-form plugin-workspace';
    body.className='transmission-body';figure.className='transmission-preview';report.className='plugin-report';
    canvas.width=720;canvas.height=490;
    canvas.setAttribute('aria-label',t('preview'));notice.setAttribute('role','status');
    const params={};
    function field(id,input) {
      const label=document.createElement('label'), caption=document.createElement('span');
      caption.textContent=t(id)+(id==='beltLength'?' (mm)':'');label.append(caption,input);fields.append(label);
      params[id]={label,input};return input;
    }
    function select(id,list) {
      return field(id,list.reduce((control,value)=>{
        control.add(new Option(Number.isFinite(value)?String(value):t(value),value));return control;
      },document.createElement('select')));
    }
    function input(id,value,type='number') {
      const control=document.createElement('input');
      control.type=type;control.value=value;
      if(type==='number') {control.step='any';api.setupNumber(control);}
      return field(id,control);
    }
    const preferred=key=>api.toolDefault(key,defaults[key][1]);
    const mode=select('mode',pulleys?['belt']:gearModes);
    if(!pulleys) mode.value=preferred('transmissionMode');
    params.mode.label.hidden=pulleys;
    input('teeth',preferred('transmissionTeeth-'+mode.value),'text');
    const module=input('module',preferred('transmissionModule'));
    const modules=document.createElement('datalist'); modules.id='transmissionModules';
    for(const value of [.5,.8,1,1.25,1.5,2,2.5,3,4,5,6,8,10]) modules.append(new Option('',value));
    module.setAttribute('list',modules.id);fields.append(modules);
    select('pressure',[20,14.5,25]).value=preferred('transmissionPressure');
    select('pitch',Object.keys(profiles)).value=preferred('transmissionProfile');
    input('beltLength',preferred('transmissionBeltLength'));input('planets',preferred('transmissionPlanets'));
    const tip=document.createElement('p'), insert=document.createElement('button');
    insert.type='submit';insert.textContent=t('insert');fields.append(tip,insert);
    figure.append(canvas);body.append(fields,figure);
    report.append(readout,notice);form.append(body,report);root.append(form);
    for(const [id,value] of Object.entries(state??{})) if(params[id]) params[id].input.value=value;
    const formatter=new Intl.NumberFormat(api.language(),{maximumFractionDigits:3});
    let design=null;
    const beltLengthField=params.beltLength.input;
    function roundBeltLength() {
      if(!pulleys||params.teeth.input.value.trim().split(/[\s,;]+/).length!==2) return;
      const length=beltLengthField.valueAsNumber;
      if(!Number.isFinite(length)) return;
      const rounded=nearestPitchLength(length,profiles[params.pitch.input.value]);
      if(Math.abs(rounded-length)<=1e-8) return;
      beltLengthField.value=rounded;
      beltLengthField.classList.remove('belt-length-adjusted');
      void beltLengthField.offsetWidth;
      beltLengthField.classList.add('belt-length-adjusted');
    }
    function confirmBeltLength() {
      roundBeltLength();
      render();
    }
    function render() {
      const kind=mode.value, value=id=>params[id].input.value, number=id=>params[id].input.valueAsNumber;
      const teeth=value('teeth').trim().split(/[\s,;]+/).map(Number), pitch=profiles[value('pitch')];
      for(const id of ['module','pressure','pitch','beltLength','planets']) {
        params[id].label.hidden=id==='planets'?kind!=='planetary':(id==='beltLength'?kind!=='belt'||teeth.length!==2:id==='pitch'?kind!=='belt':kind==='belt');
      }
      tip.textContent=kind==='belt'?(teeth.length===2?t('beltLength')+' → '+t('distance'):''):t(kind+'Hint');
      try {
        const result=build({mode:kind,teeth,
          module:number('module'),pressure:Number(value('pressure')),pitch,
          length:number('beltLength'),planets:number('planets'),profile:value('pitch')});
        design=result;
        api.preview(canvas,result.entities);
        const stats=[];
        if(result.diameters.length) stats.push(t('diameters')+' · '+result.diameters.map(formatter.format).join(' / ')+' mm');
        if(result.ratio!==null) stats.push(t(kind==='planetary'?'carrierRatio':'ratio')+' · '+[result.ratio].flat().map(formatter.format).join(' / '));
        if(result.beltLength) stats.push(t('distance')+' · '+formatter.format(result.distance)+' mm',t('beltLength')+' · '+formatter.format(result.beltLength)+' mm · '+formatter.format(result.beltLength/pitch)+' '+t('toothPitches'));
        readout.textContent=stats.join('  ·  ');
        notice.textContent=result.notes.map(t).join(' ');insert.disabled=false;
      } catch(error) {
        design=null;api.preview(canvas,[]);readout.textContent='';
        notice.textContent=t(error.message);insert.disabled=true;
      }
    }
    mode.oninput=()=>{params.teeth.input.value=preferred('transmissionTeeth-'+mode.value);};
    beltLengthField.onchange=confirmBeltLength;
    beltLengthField.onkeydown=event=>{
      if(event.key!=='Enter'||event.isComposing) return;
      event.preventDefault();
      confirmBeltLength();
    };
    beltLengthField.onanimationend=()=>beltLengthField.classList.remove('belt-length-adjusted');
    params.pitch.input.onchange=confirmBeltLength;
    form.oninput=render;
    form.onsubmit=event=>{
      event.preventDefault();
      if(!design) return;
      try {api.insert(design,{units:'mm'});api.status(t('inserted'));api.close();}
      catch(error) {notice.textContent=t(error.message);}
    };
    confirmBeltLength();
    return {snapshot:()=>Object.fromEntries(Object.entries(params).map(([id,{input}])=>[id,input.value]))};
  }
  function manifest(pulleys,messages) {
    const id=pulleys?'pulleys':'transmissions';
    const keys=pulleys?['transmissionTeeth-belt','transmissionProfile','transmissionBeltLength']:
      ['transmissionMode','transmissionModule','transmissionPressure','transmissionPlanets',
        ...gearModes.map(mode=>'transmissionTeeth-'+mode)];
    let previous={};
    try {previous=JSON.parse(localStorage.getItem('velocivector-tool-defaults')??'{}')??{};} catch {}
    return {
      id,apiVersion:1,messages,
      initialDefaults:Object.fromEntries(keys.filter(key=>Object.hasOwn(previous,key)).map(key=>[key,previous[key]])),
      preferences:keys.map(key=>{
        const [label,value,options]=defaults[key];
        return {key,label,default:value,...(key.startsWith('transmissionTeeth-')?{prefix:'teeth'}:{}),
          ...(Array.isArray(options)?{options}:options??{})};
      }),
      about:{version:'0.1.0',description:pulleys?'about.belt':'about.gears',authors:['Velocivector 2D CAD'],license:'GNU GPL v3'},
      workshops:[{id:pulleys?'belt-drive':'gears',title:pulleys?'beltTitle':'gearTitle',
        mount:(root,api,state)=>mount(root,api,pulleys,state)}]
    };
  }
  globalThis.TransmissionWorkshop=Object.freeze({manifest});
})();
