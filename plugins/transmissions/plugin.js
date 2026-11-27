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

  function pulley(c,z,pitch) {
    // Layout approximation. The commercial groove is specific to the manufacturer.
    const r=pitchPulley(z,pitch)/2, step=tau/z, points=[];
    for(let j=0;j<z;j++) for(let i=0;i<20;i++) {
      const fraction=i/20, distance=Math.min(fraction,1-fraction);
      const relief=distance<.32?.27*pitch*(1+Math.cos(Math.PI*distance/.32))/2:0;
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

  function build({mode,teeth,module:m,pressure,pitch,distance,planets}) {
    const limits={gear:[1,1],internal:[2,2],rack:[1,2],series:[2,8],branch:[3,3],planetary:[2,2],belt:[1,2]};
    const pulleyMode=mode==='belt';
    if(!Object.hasOwn(limits,mode)||!Array.isArray(teeth)||teeth.length<limits[mode][0]||teeth.length>limits[mode][1]||
      !teeth.every(z=>Number.isInteger(z)&&z>=1&&z<=240)) throw Error('teethError');
    if(pulleyMode) {
      if(![2,3].includes(pitch)||teeth.length===2&&(!Number.isFinite(distance)||distance<=0||distance>100000)||teeth.some(z=>z<10))
        throw Error('geometry');
    } else if(!Number.isFinite(m)||m<.05||m>100||![14.5,20,25].includes(pressure)||mode!=='rack'&&teeth.some(z=>z<8)) {
      throw Error('geometry');
    }
    const entities=[],constraints=[],diameters=[], angle=pressure*rad, centers=[], notes=[];
    const ref=(key,kind,index=0)=>({key,kind,index});
    function add(c,z,phase=0,inside=false) {
      if(!pulleyMode&&z<8) throw Error('geometry');
      const d=pulleyMode?pitchPulley(z,pitch):diameter(z,m), r=d/2, key='profile'+centers.length;
      const outline=pulleyMode?pulley(c,z,pitch):gear(c,z,m,angle,phase,inside);
      entities.push({...outline,key});
      if(inside) entities.push({type:'circle',c,r:r+3*m});
      const primitive=key+'-pitch';
      entities.push({type:'circle',c,r,key:primitive,construction:'dashed'});
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
      entities.push(outline,{...line,key:'pitch'});
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
        add([distance,0],teeth[1]);entities.push(route);
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
    return {entities,constraints,diameters,ratio,beltLength,notes:[...new Set(notes)]};
  }

  if(typeof module!=='undefined') {module.exports={build,diameter,pitchPulley};return;}
  function mount(root,api) {
    const t=api.t;
    const form=document.createElement('form'), fields=document.createElement('fieldset'), figure=document.createElement('section');
    const canvas=document.createElement('canvas'), readout=document.createElement('output'), notice=document.createElement('p');
    form.className='transmission-form'; canvas.width=720;canvas.height=490;
    canvas.setAttribute('aria-label',t('preview'));notice.setAttribute('role','status');
    const params={};
    function field(id,input) {
      const label=document.createElement('label'), caption=document.createElement('span');
      caption.textContent=t(id);label.append(caption,input);fields.append(label);
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
    const mode=select('mode',['gear','internal','rack','series','branch','planetary','belt']);
    input('teeth','24','text');
    const module=input('module',2);
    const modules=document.createElement('datalist'); modules.id='transmissionModules';
    for(const value of [.5,.8,1,1.25,1.5,2,2.5,3,4,5,6,8,10]) modules.append(new Option('',value));
    module.setAttribute('list',modules.id);fields.append(modules);
    select('pressure',[20,14.5,25]);select('pitch',[2,3]);input('distance',55);input('planets',3);
    const tip=document.createElement('p'), insert=document.createElement('button');
    insert.type='submit';insert.textContent=t('insert');fields.append(tip,insert);
    figure.append(canvas,readout,notice);form.append(fields,figure);root.append(form);
    const defaults={gear:'24',internal:'20 60',rack:'12',series:'20 30 40',branch:'30 20 20',planetary:'24 18',belt:'20 40'};
    const formatter=new Intl.NumberFormat(document.documentElement.lang,{maximumFractionDigits:3});
    let design=null;
    function render() {
      const kind=mode.value, value=id=>params[id].input.value, number=id=>params[id].input.valueAsNumber;
      for(const id of ['module','pressure','pitch','distance','planets']) {
        params[id].label.hidden=id==='planets'?kind!=='planetary':(['pitch','distance'].includes(id)?kind!=='belt':kind==='belt');
      }
      tip.textContent=t(kind+'Hint');
      try {
        const result=build({mode:kind,teeth:value('teeth').trim().split(/[\s,;]+/).map(Number),
          module:number('module'),pressure:Number(value('pressure')),pitch:Number(value('pitch')),
          distance:number('distance'),planets:number('planets')});
        design=result;
        api.preview(canvas,result.entities);
        const stats=[];
        if(result.diameters.length) stats.push(t('diameters')+' · '+result.diameters.map(formatter.format).join(' / ')+' mm');
        if(result.ratio!==null) stats.push(t(kind==='planetary'?'carrierRatio':'ratio')+' · '+[result.ratio].flat().map(formatter.format).join(' / '));
        if(result.beltLength) stats.push(t('beltLength')+' · '+formatter.format(result.beltLength)+' mm · '+formatter.format(result.beltLength/Number(value('pitch')))+' '+t('toothPitches'));
        readout.textContent=stats.join('  ·  ');
        notice.textContent=result.notes.map(t).join(' ');insert.disabled=false;
      } catch(error) {
        design=null;api.preview(canvas,[]);readout.textContent='';
        notice.textContent=t(error.message);insert.disabled=true;
      }
    }
    mode.oninput=()=>{params.teeth.input.value=defaults[mode.value];};
    form.oninput=render;
    form.onsubmit=event=>{
      event.preventDefault();
      if(!design) return;
      try {api.insert(design,{units:'mm'});api.status(t('inserted'));api.close();}
      catch(error) {notice.textContent=t(error.message);}
    };
    render();
  }
  const languages=["fr","en","es","de","ja","pt","ru","it","nl","pl","tr","id","zh","fa","cs"];
  const translations=[
    ["title","Atelier de transmissions","Transmission workshop","Taller de transmisiones","Getriebewerkstatt","伝動機構ワークショップ","Oficina de transmissões","Мастерская передач","Officina trasmissioni","Transmissiewerkplaats","Warsztat przekładni","Aktarma atölyesi","Ruang transmisi","传动设计工作区","کارگاه انتقال نیرو","Dílna převodů"],
    ["mode","Architecture","Layout","Arquitectura","Anordnung","構成","Arquitetura","Компоновка","Configurazione","Configuratie","Układ","Düzen","Susunan","布局","چیدمان","Uspořádání"],
    ["gear","Pignon extérieur","External gear","Engranaje exterior","Außenzahnrad","外歯車","Engrenagem externa","Наружное колесо","Ingranaggio esterno","Uitwendig tandwiel","Koło zewnętrzne","Dış dişli","Roda gigi luar","外齿轮","چرخ‌دندهٔ خارجی","Vnější ozubené kolo"],
    ["internal","Pignon et couronne intérieure","Pinion and internal ring","Piñón y corona interna","Ritzel und Hohlrad","ピニオンと内歯車","Pinhão e coroa interna","Шестерня и внутренний венец","Pignone e corona interna","Rondsel en binnenkrans","Zębnik i wieniec wewnętrzny","Pinyon ve iç dişli","Pinion dan cincin internal","小齿轮与内齿圈","پینیون و چرخ‌دندهٔ داخلی","Pastorek a vnitřní věnec"],
    ["rack","Crémaillère","Rack","Cremallera","Zahnstange","ラック","Cremalheira","Зубчатая рейка","Cremagliera","Tandlat","Listwa zębata","Kremayer","Rak gigi","齿条","شانه‌دنده","Ozubený hřeben"],
    ["series","Train en série","Series gear train","Tren en serie","Reihengetriebe","直列歯車列","Trem em série","Последовательная передача","Treno in serie","Tandwieltrein in serie","Szereg kół zębatych","Seri dişli treni","Rangkaian roda gigi seri","串联齿轮组","قطار دندهٔ سری","Sériové soukolí"],
    ["branch","Dérivation à deux sorties","Two-output branch","Derivación de dos salidas","Verzweigung mit zwei Abtrieben","二出力分岐","Derivação com duas saídas","Разветвление на два выхода","Diramazione a due uscite","Vertakking met twee uitgangen","Rozgałęzienie na dwa wyjścia","İki çıkışlı dal","Cabang dua keluaran","双输出分支","انشعاب دوخروجی","Větev se dvěma výstupy"],
    ["planetary","Train planétaire","Planetary gear train","Tren planetario","Planetengetriebe","遊星歯車機構","Trem planetário","Планетарная передача","Treno planetario","Planeetwielstelsel","Przekładnia planetarna","Planet dişli treni","Rangkaian planet","行星齿轮组","مجموعهٔ دندهٔ سیاره‌ای","Planetové soukolí"],
    ["belt","Poulies et courroie GT2","GT2 pulleys and belt","Poleas y correa GT2","GT2-Riemenscheiben und Riemen","GT2 プーリーとベルト","Polias e correia GT2","Шкивы и ремень GT2","Pulegge e cinghia GT2","GT2-poelies en riem","Koła pasowe i pasek GT2","GT2 kasnak ve kayış","Puli dan sabuk GT2","GT2 带轮与同步带","پولی و تسمهٔ GT2","Řemenice a řemen GT2"],
    ["teeth","Nombres de dents","Tooth counts","Números de dientes","Zähnezahlen","歯数","Números de dentes","Число зубьев","Numeri di denti","Tandtallen","Liczby zębów","Diş sayıları","Jumlah gigi","齿数","تعداد دندانه‌ها","Počty zubů"],
    ["module","Module (mm)","Module (mm)","Módulo (mm)","Modul (mm)","モジュール (mm)","Módulo (mm)","Модуль (мм)","Modulo (mm)","Module (mm)","Moduł (mm)","Modül (mm)","Modul (mm)","模数（mm）","مدول (میلی‌متر)","Modul (mm)"],
    ["pressure","Angle de pression (°)","Pressure angle (°)","Ángulo de presión (°)","Eingriffswinkel (°)","圧力角 (°)","Ângulo de pressão (°)","Угол зацепления (°)","Angolo di pressione (°)","Drukhoek (°)","Kąt przyporu (°)","Basınç açısı (°)","Sudut tekan (°)","压力角（°）","زاویهٔ فشار (°)","Úhel záběru (°)"],
    ["pitch","Pas GT2 (mm)","GT2 pitch (mm)","Paso GT2 (mm)","GT2-Teilung (mm)","GT2 ピッチ (mm)","Passo GT2 (mm)","Шаг GT2 (мм)","Passo GT2 (mm)","GT2-steek (mm)","Podziałka GT2 (mm)","GT2 adımı (mm)","Pitch GT2 (mm)","GT2 节距（mm）","گام GT2 (میلی‌متر)","Rozteč GT2 (mm)"],
    ["distance","Entraxe (mm)","Center distance (mm)","Distancia entre ejes (mm)","Achsabstand (mm)","軸間距離 (mm)","Distância entre centros (mm)","Межосевое расстояние (мм)","Interasse (mm)","Hartafstand (mm)","Rozstaw osi (mm)","Eksen mesafesi (mm)","Jarak sumbu (mm)","中心距（mm）","فاصلهٔ محورها (میلی‌متر)","Osová vzdálenost (mm)"],
    ["planets","Nombre de satellites","Planet count","Número de satélites","Anzahl Planeten","遊星歯車数","Número de planetas","Число сателлитов","Numero di satelliti","Aantal planeten","Liczba satelitów","Planet sayısı","Jumlah planet","行星轮数量","تعداد دنده‌های سیاره‌ای","Počet satelitů"],
    ["preview","Aperçu de la transmission","Transmission preview","Vista previa de la transmisión","Getriebevorschau","伝動機構のプレビュー","Prévia da transmissão","Предпросмотр передачи","Anteprima trasmissione","Transmissievoorbeeld","Podgląd przekładni","Aktarma önizlemesi","Pratinjau transmisi","传动预览","پیش‌نمایش انتقال","Náhled převodu"],
    ["insert","Insérer dans le calque actif","Insert into active layer","Insertar en la capa activa","In aktive Ebene einfügen","現在のレイヤーに挿入","Inserir na camada ativa","Вставить в активный слой","Inserisci nel livello attivo","In actieve laag invoegen","Wstaw do aktywnej warstwy","Etkin katmana ekle","Sisipkan ke lapisan aktif","插入当前图层","درج در لایهٔ فعال","Vložit do aktivní vrstvy"],
    ["inserted","Transmission insérée.","Transmission inserted.","Transmisión insertada.","Getriebe eingefügt.","伝動機構を挿入しました。","Transmissão inserida.","Передача вставлена.","Trasmissione inserita.","Transmissie ingevoegd.","Wstawiono przekładnię.","Aktarma eklendi.","Transmisi disisipkan.","已插入传动机构。","مجموعه درج شد.","Převod vložen."],
    ["diameters","Diamètres primitifs","Pitch diameters","Diámetros primitivos","Teilkreisdurchmesser","ピッチ円直径","Diâmetros primitivos","Делительные диаметры","Diametri primitivi","Steekdiameters","Średnice podziałowe","Bölüm dairesi çapları","Diameter pitch","节圆直径","قطرهای گام","Roztečné průměry"],
    ["ratio","Vitesse sortie / entrée","Output / input speed","Velocidad salida / entrada","Drehzahl Abtrieb / Antrieb","出力／入力回転速度","Velocidade saída / entrada","Скорость выхода / входа","Velocità uscita / ingresso","Toerental uitgang / ingang","Prędkość wyjścia / wejścia","Çıkış / giriş hızı","Kecepatan keluaran / masukan","输出／输入转速","سرعت خروجی / ورودی","Otáčky výstup / vstup"],
    ["carrierRatio","Vitesse porte-satellites / soleil, couronne fixe","Carrier / sun speed, fixed ring","Velocidad portasatélites / solar, corona fija","Drehzahl Träger / Sonne bei festem Hohlrad","リング固定時のキャリア／太陽歯車速度","Velocidade do porta-satélites / solar, coroa fixa","Скорость водила / солнца при неподвижном венце","Velocità portasatelliti / solare, corona fissa","Toerental planeetdrager / zon bij vaste krans","Prędkość jarzma / słońca przy stałym wieńcu","Sabit çemberde taşıyıcı / güneş hızı","Kecepatan pembawa / matahari, cincin tetap","齿圈固定时行星架／太阳轮转速","سرعت حامل / خورشیدی با حلقهٔ ثابت","Otáčky unašeč / slunce s pevným věncem"],
    ["beltLength","Longueur primitive de courroie","Belt pitch length","Longitud primitiva de la correa","Riemenwirklänge","ベルトピッチ長","Comprimento primitivo da correia","Делительная длина ремня","Lunghezza primitiva della cinghia","Steeklengte van de riem","Długość podziałowa paska","Kayış bölüm uzunluğu","Panjang pitch sabuk","同步带节线长","طول گام تسمه","Roztečná délka řemenu"],
    ["toothPitches","pas","pitches","pasos","Teilungen","ピッチ","passos","шагов","passi","steken","podziałek","adım","pitch","个节距","گام","roztečí"],
    ["gearHint","Saisissez le nombre de dents du pignon.","Enter the gear tooth count.","Escribe el número de dientes.","Zähnezahl eingeben.","歯数を入力します。","Informe o número de dentes.","Введите число зубьев.","Inserisci il numero di denti.","Voer het aantal tanden in.","Wpisz liczbę zębów.","Diş sayısını girin.","Masukkan jumlah gigi.","输入齿轮齿数。","تعداد دندانه‌ها را وارد کنید.","Zadejte počet zubů."],
    ["internalHint","Saisissez les dents du pignon puis de la couronne, séparées par un espace.","Enter the pinion and ring tooth counts, separated by a space.","Indica los dientes del piñón y de la corona, separados por un espacio.","Zähnezahlen von Ritzel und Hohlrad durch Leerzeichen trennen.","ピニオンと内歯車の歯数を空白で区切って入力します。","Informe os dentes do pinhão e da coroa, separados por espaço.","Введите числа зубьев шестерни и венца через пробел.","Inserisci i denti di pignone e corona separati da uno spazio.","Voer de tandtallen van rondsel en krans in, gescheiden door een spatie.","Wpisz liczby zębów zębnika i wieńca, oddzielone spacją.","Pinyon ve çember diş sayılarını boşlukla ayırın.","Masukkan jumlah gigi pinion dan cincin, dipisahkan spasi.","输入小齿轮和内齿圈的齿数，用空格分隔。","تعداد دندانهٔ پینیون و حلقه را با فاصله وارد کنید.","Zadejte počty zubů pastorku a věnce oddělené mezerou."],
    ["rackHint","Saisissez le nombre de dents de la crémaillère. Le deuxième nombre, facultatif, définit les dents du pignon.","Enter the rack tooth count. A second count adds a pinion.","Indica los dientes de la cremallera. Un segundo número añade un piñón.","Zähnezahl der Zahnstange eingeben. Eine zweite Zahl fügt ein Ritzel hinzu.","ラックの歯数を入力します。 二つ目の歯数を入力するとピニオンを追加します。","Informe os dentes da cremalheira. Um segundo valor adiciona um pinhão.","Введите число зубьев рейки. Второе число добавляет шестерню.","Inserisci i denti della cremagliera. Un secondo numero aggiunge un pignone.","Voer het tandtal van de tandlat in. Een tweede waarde voegt een rondsel toe.","Wpisz liczbę zębów listwy. Druga liczba dodaje zębnik.","Kremayer diş sayısını girin. İkinci sayı bir pinyon ekler.","Masukkan jumlah gigi rak. Nilai kedua menambahkan pinion.","输入齿条齿数。 可输入第二个齿数以添加小齿轮。","تعداد دندانهٔ شانه را وارد کنید. عدد دوم یک پینیون اضافه می‌کند.","Zadejte počet zubů hřebene. Druhý počet přidá pastorek."],
    ["seriesHint","Saisissez 2 à 8 nombres de dents, du pignon d’entrée à la sortie.","Enter 2 to 8 tooth counts, from input to output.","Indica entre 2 y 8 números de dientes, de la entrada a la salida.","2 bis 8 Zähnezahlen vom Antrieb zum Abtrieb eingeben.","入力側から出力側まで、2～8個の歯数を入力します。","Informe de 2 a 8 números de dentes, da entrada à saída.","Введите от 2 до 8 чисел зубьев, от входа к выходу.","Inserisci da 2 a 8 numeri di denti, dall’ingresso all’uscita.","Voer 2 tot 8 tandtallen in, van ingang naar uitgang.","Wpisz od 2 do 8 liczb zębów, od wejścia do wyjścia.","Girişten çıkışa 2–8 diş sayısı girin.","Masukkan 2 hingga 8 jumlah gigi, dari masukan ke keluaran.","按输入至输出顺序填写 2 至 8 个齿数。","۲ تا ۸ تعداد دندانه از ورودی به خروجی وارد کنید.","Zadejte 2 až 8 počtů zubů od vstupu k výstupu."],
    ["branchHint","Saisissez les dents de l’entrée puis des deux sorties.","Enter the input and both output tooth counts.","Indica los dientes de la entrada y de las dos salidas.","Zähnezahlen von Antrieb und beiden Abtrieben eingeben.","入力と二つの出力の歯数を入力します。","Informe os dentes da entrada e das duas saídas.","Введите числа зубьев входа и двух выходов.","Inserisci i denti dell’ingresso e delle due uscite.","Voer de tandtallen van de ingang en beide uitgangen in.","Wpisz liczby zębów wejścia i obu wyjść.","Giriş ve iki çıkışın diş sayılarını girin.","Masukkan jumlah gigi masukan dan kedua keluaran.","输入输入轮及两个输出轮的齿数。","تعداد دندانهٔ ورودی و دو خروجی را وارد کنید.","Zadejte počty zubů vstupu a obou výstupů."],
    ["planetaryHint","Saisissez les dents du soleil et d’un satellite. La couronne est calculée.","Enter the sun and one planet tooth count. The ring is calculated.","Indica los dientes del solar y de un satélite. La corona se calcula.","Zähnezahlen von Sonne und einem Planeten eingeben. Das Hohlrad wird berechnet.","太陽歯車と遊星歯車一つの歯数を入力します。内歯車は自動計算されます。","Informe os dentes do solar e de um planeta. A coroa é calculada.","Введите числа зубьев солнца и сателлита. Венец рассчитывается.","Inserisci i denti del solare e di un satellite. La corona viene calcolata.","Voer de tandtallen van de zon en één planeet in. De krans wordt berekend.","Wpisz liczby zębów słońca i jednego satelity. Wieniec zostanie obliczony.","Güneş ve bir planetin diş sayısını girin. Çember hesaplanır.","Masukkan jumlah gigi matahari dan satu planet. Cincin dihitung otomatis.","输入太阳轮和一个行星轮的齿数。齿圈自动计算。","تعداد دندانهٔ خورشیدی و یک سیاره را وارد کنید. حلقه محاسبه می‌شود.","Zadejte počty zubů slunce a jednoho satelitu. Věnec se vypočítá."],
    ["beltHint","Saisissez les dents des deux poulies et réglez le pas et l’entraxe. Pour une poulie seule, saisissez un seul nombre de dents.","Enter both pulley tooth counts, then set pitch and center distance. For a single pulley, enter one tooth count.","Indica los dientes de ambas poleas, el paso y la distancia entre ejes. Para una sola polea, indica un único número de dientes.","Zähnezahlen beider Scheiben, Teilung und Achsabstand eingeben. Für eine einzelne Riemenscheibe nur eine Zähnezahl eingeben.","両プーリーの歯数、ピッチ、軸間距離を指定します。 プーリー単体の場合は歯数を一つ入力します。","Informe os dentes das duas polias, o passo e a distância entre centros. Para uma só polia, informe um número de dentes.","Введите числа зубьев обоих шкивов, шаг и межосевое расстояние. Для одного шкива укажите одно число зубьев.","Inserisci denti di entrambe le pulegge, passo e interasse. Per una sola puleggia inserisci un solo numero di denti.","Voer beide tandtallen, steek en hartafstand in. Voer voor één poelie één tandtal in.","Wpisz liczby zębów obu kół, podziałkę i rozstaw osi. Dla pojedynczego koła wpisz jedną liczbę zębów.","Her iki kasnağın diş sayısını, adımı ve eksen mesafesini girin. Tek kasnak için bir diş sayısı girin.","Masukkan jumlah gigi kedua puli, pitch, dan jarak sumbu. Untuk satu puli, masukkan satu jumlah gigi.","输入两个带轮的齿数、节距和中心距。 只需一个带轮时，仅输入一个齿数。","تعداد دندانهٔ دو پولی، گام و فاصلهٔ محورها را وارد کنید. برای یک پولی فقط یک تعداد دندانه وارد کنید.","Zadejte počty zubů obou řemenic, rozteč a osovou vzdálenost. Pro jednu řemenici zadejte jeden počet zubů."],
    ["teethError","Vérifiez le nombre de valeurs et saisissez des entiers de 1 à 240.","Check the number of values and enter integers from 1 to 240.","Comprueba la cantidad de valores y escribe enteros de 1 a 240.","Anzahl der Werte prüfen und ganze Zahlen von 1 bis 240 eingeben.","入力数を確認し、1～240の整数を入力してください。","Verifique a quantidade de valores e use inteiros de 1 a 240.","Проверьте количество значений и введите целые числа от 1 до 240.","Verifica il numero di valori e inserisci interi da 1 a 240.","Controleer het aantal waarden en gebruik gehele getallen van 1 tot 240.","Sprawdź liczbę wartości i wpisz liczby całkowite od 1 do 240.","Değer sayısını denetleyin ve 1–240 arası tam sayılar girin.","Periksa banyaknya nilai; masukkan bilangan bulat 1–240.","检查输入项数，并填写 1 至 240 的整数。","تعداد مقدارها را بررسی کنید و اعداد صحیح ۱ تا ۲۴۰ وارد کنید.","Zkontrolujte počet hodnot a zadejte celá čísla od 1 do 240."],
    ["geometry","Ces paramètres ne permettent pas de tracer ce profil.","These parameters cannot produce the selected profile.","Estos parámetros no permiten trazar el perfil.","Mit diesen Parametern lässt sich das Profil nicht zeichnen.","この条件では輪郭を作図できません。","Esses parâmetros não permitem traçar o perfil.","При этих параметрах построить профиль нельзя.","Questi parametri non consentono di tracciare il profilo.","Met deze parameters kan het profiel niet worden getekend.","Te parametry nie pozwalają narysować profilu.","Bu parametrelerle profil çizilemez.","Parameter ini tidak dapat menghasilkan profil.","这些参数无法生成该轮廓。","با این پارامترها رسم پروفیل ممکن نیست.","S těmito parametry nelze profil vykreslit."],
    ["spacing","L’entraxe ne laisse pas assez de place pour les éléments.","The center distance leaves insufficient clearance.","La distancia entre ejes no deja espacio suficiente.","Der Achsabstand lässt zu wenig Platz.","軸間距離が不足しています。","A distância entre centros não deixa folga suficiente.","Недостаточно места между центрами.","L’interasse non lascia spazio sufficiente.","De hartafstand geeft onvoldoende ruimte.","Rozstaw osi pozostawia za mało miejsca.","Eksen mesafesi yetersiz.","Jarak sumbu tidak memberi cukup ruang.","中心距不足。","فاصلهٔ محورها کافی نیست.","Osová vzdálenost je příliš malá."],
    ["planetError","Les satellites ne peuvent pas être répartis régulièrement avec ces valeurs.","These values do not allow equally spaced planets.","Estos valores no permiten repartir los satélites de forma uniforme.","Mit diesen Werten sind gleichmäßig verteilte Planeten nicht möglich.","この値では遊星歯車を等間隔に配置できません。","Esses valores não permitem planetas igualmente espaçados.","Нельзя равномерно разместить сателлиты с этими значениями.","Con questi valori i satelliti non si possono distribuire uniformemente.","Met deze waarden kunnen de planeten niet gelijkmatig worden verdeeld.","Tych satelitów nie da się rozmieścić równomiernie.","Bu değerlerle planetler eşit aralıkla dizilemez.","Nilai ini tidak memungkinkan planet berjarak sama.","这些参数无法让行星轮等间距分布。","با این مقادیر توزیع یکنواخت سیاره‌ها ممکن نیست.","S těmito hodnotami nelze satelity rozmístit rovnoměrně."],
    ["undercut","Petit nombre de dents. Vérifiez le risque de dégagement en pied.","Low tooth count. Check for undercut.","Pocos dientes. Comprueba el riesgo de socavado.","Geringe Zähnezahl. Unterschnitt prüfen.","歯数が少ないため、切下げを確認してください。","Poucos dentes. Verifique o risco de rebaixo.","Мало зубьев. Проверьте подрезание.","Pochi denti. Verifica il rischio di sottotaglio.","Weinig tanden. Controleer op ondersnijding.","Mało zębów. Sprawdź podcięcie.","Diş sayısı az. Alttan kesmeyi kontrol edin.","Gigi sedikit. Periksa risiko undercut.","齿数较少，请检查根切风险。","تعداد دندانه کم است. خطر بریدگی پای دندانه را بررسی کنید.","Málo zubů. Zkontrolujte riziko podříznutí."],
    ["approximate","Les gorges GT2 sont indicatives. Utilisez le profil du fabricant pour l’usinage.","GT2 grooves are approximate. Use the manufacturer profile for machining.","Las gargantas GT2 son aproximadas. Para mecanizar, usa el perfil del fabricante.","GT2-Nuten sind angenähert. Für die Fertigung das Herstellerprofil verwenden.","GT2 の溝は近似です。加工にはメーカーの輪郭を使ってください。","Os sulcos GT2 são aproximados. Use o perfil do fabricante na usinagem.","Впадины GT2 приближённые. Для обработки используйте профиль производителя.","Le gole GT2 sono indicative. Per la lavorazione usa il profilo del fabbricante.","GT2-groeven zijn benaderd. Gebruik voor bewerking het fabrikantprofiel.","Rowki GT2 są orientacyjne. Do obróbki użyj profilu producenta.","GT2 olukları yaklaşıktır. İşlemede üretici profilini kullanın.","Alur GT2 hanya perkiraan. Gunakan profil produsen untuk pemesinan.","GT2 齿槽为近似示意。加工请使用制造商的轮廓。","شیارهای GT2 تقریبی‌اند. برای ساخت از پروفیل سازنده استفاده کنید.","Drážky GT2 jsou pouze orientační. Pro obrábění použijte profil výrobce."],
  ];
  const messages=Object.fromEntries(languages.map((language,i)=>
    [language,Object.fromEntries(translations.map(([key,...terms])=>[key,terms[i]]))]));
  VelocivectorPlugins.register({id:'transmissions',apiVersion:1,messages,
    workshops:[{id:'designer',title:'title',mount}]});
})();
