'use strict';
const CursorProfiles=(()=>{
  const profiles={
    select:['Sélection','pointer','pointerCorner','selectCross'],
    moveReady:['Objet survolé','hand','moveMark','pointerCorner'],
    move:['Déplacement','move','hand','moveMark'],
    point:['Sommet ou poignée','diamond','nodeSquare','selectCross'],
    box:['Sélection par zone','box','boxDash','boxCross'],
    draw:['Tracé précis','cross','crossDot','fineCross'],
    target:['Choix d’un point ou d’un axe','target','diamond','crossDot'],
    scaleReady:['Échelle au survol','pushArrow','pushBar','pushCorner'],
    scaleDrag:['Échelle pendant le glisser','doubleArrow','doubleBar','doubleChevrons'],
    rotateReady:['Rotation au survol','turn','turnDot','turnQuarter'],
    rotateDrag:['Rotation pendant le glisser','turnDouble','turnDot','turnQuarter']
  };
  const icons={
    precision:['Flèche précise','M3 3l17 14-8-1-3 7z',3,3,true],
    pointer:['Flèche','M5 4l17 15-8-1-3 7z',5,4,true],
    pointerCorner:['Flèche et repère','M5 4l13 11-6-1-2 6z M19 16h7v7 M26 27h-7',5,4],
    selectCross:['Croix encadrée','M16 6v6m0 8v6M6 16h6m8 0h6 M13 13h6v6h-6z',16,16],
    cross:['Croix','M16 5v22M5 16h22',16,16],
    crossDot:['Croix à point','M16 4v8m0 8v8M4 16h8m8 0h8 M15 16h2',16,16],
    fineCross:['Croix ouverte','M16 3v9m0 8v9M3 16h9m8 0h9 M16 15v2',16,16],
    target:['Cible','M22 16a6 6 0 1 1-12 0 6 6 0 1 1 12 0z M16 5v5m0 12v5M5 16h5m12 0h5',16,16],
    diamond:['Losange','M16 7l9 9-9 9-9-9z M15 16h2',16,16],
    nodeSquare:['Carré de nœud','M9 9h14v14H9z M13 16h6m-3-3v6',16,16],
    box:['Cadre','M9 10h15v13H9z M5 6l4 4',9,10],
    boxDash:['Cadre pointillé','M8 9h5m4 0h5v4m0 4v5h-5m-4 0H8v-5m0-4V9',8,9],
    boxCross:['Cadre et croix','M7 7h18v18H7z M12 16h8m-4-4v8',16,16],
    pencil:['Crayon','M7 25l4-9L22 5l5 5-11 11z M11 16l5 5',7,25],
    nib:['Plume','M7 25l3-12 9-8 8 8-8 9z M7 25l10-10m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0z',7,25],
    hand:['Main','M7 17l4 3V9a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-5a2 2 0 0 1 4 0v6l2-2a2 2 0 0 1 3 2l-3 9H13z',16,16],
    move:['Quatre flèches','M16 4v24M4 16h24M12 8l4-4 4 4m-8 16 4 4 4-4M8 12l-4 4 4 4m16-8 4 4-4 4',16,16],
    moveMark:['Croix de déplacement','M16 6v20M6 16h20 M16 3v3m0 20v3M3 16h3m20 0h3 M13 13h6v6h-6z',16,16],
    pushArrow:['Flèche simple','M5 16h22m-8-4 8 4-8 4',16,16],
    pushBar:['Flèche et butée','M7 9v14m0-7h19m-6-5 6 5-6 5',16,16],
    pushCorner:['Chevron orienté','M7 16h17m-8-8 8 8-8 8',16,16],
    doubleArrow:['Double flèche','M4 16h24m-16-4-8 4 8 4m8-8 8 4-8 4',16,16],
    doubleBar:['Double flèche à butées','M5 9v14m22-14v14M5 16h22m-16-5-6 5 6 5m10-10 6 5-6 5',16,16],
    doubleChevrons:['Deux chevrons','M11 9l-7 7 7 7m10-14 7 7-7 7M10 16h12',16,16],
    turn:['Flèche courbe','M7 20a10 10 0 1 1 17 2m-1-7 1 7 6-3',16,16],
    turnDot:['Arc et pivot','M6 19a10 10 0 1 1 18 3m-1-7 1 7 6-2 M15 16h2',16,16],
    turnQuarter:['Quart de tour','M7 22a14 14 0 0 1 16-14m-5-4 5 4-4 5 M14 20h4',16,16],
    turnDouble:['Arc à deux flèches','M6 20a10 10 0 1 1 20 0M3 15l3 5 5-3m10 0 5 3 3-5',16,16]
  };
  const tools={
    select:['Sélection','#50d7bf'],poly:['Ligne / polyligne','#f7be5a'],tangentPoly:['Polyligne tangente','#f6a879'],rect:['Rectangle','#a5d96d'],circle:['Cercle','#70beff'],
    arc:['Arc','#fb9374'],polygon:['Polygone','#ce9aff'],ellipse:['Ellipse','#f58dcc'],slot:['Oblong','#68d8ed'],
    bezier:['Plume Bézier','#ffcc78'],origin:['Origine de travail','#82bce7'],point:['Point','#7fe0a6'],offset:['Décalage de tracé','#efb58f'],dimension:['Cotation','#8fb9ff'],text:['Texte','#b3a0f2'],
    move:['Déplacer','#70d3a4'],rotate:['Tourner','#ef9b53'],scale:['Échelle','#ad9aff'],mirror:['Miroir','#56c7ff'],
    reverse:['Inverser','#ffc58e'],explode:['Éclater','#ef869c'],close:['Fermer','#87d586'],fillet:['Congé','#68d6d8'],scissors:['Ciseaux','#f5a743'],pan:['Navigation','#aab9c9'],
    horizontal:['Horizontale','#6ed3e8'],vertical:['Verticale','#91b7ff'],coincident:['Coïncidente','#95df98'],
    midpoint:['Milieu','#f6e070'],parallel:['Parallèle','#c7a3ff'],perpendicular:['Perpendiculaire','#8bd6ef'],equal:['Égale','#f1abce'],tangent:['Tangente','#ffac85'],symmetry:['Symétrie','#abd880'],
    locked:['Verrouillée','#ff8d91'],collinear:['Colinéaire','#9caeff'],
    autoClose:['Fermeture automatique','#87d586'],raster:['Image matricielle','#82bce7']
  };
  const isColor=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
  function normalize(raw) {
    const shapes={}, colors={};
    for(const [key,[,fallback,...choices]] of Object.entries(profiles)) {
      const shape=raw?.shapes?.[key];
      shapes[key]=[fallback,...choices].includes(shape)?shape:fallback;
    }
    for(const [key,[,fallback]] of Object.entries(tools)) colors[key]=isColor(raw?.colors?.[key])?raw.colors[key]:fallback;
    return {mode:raw?.mode==='classic'?'classic':'precision',shapes,colors};
  }
  const cache=new Map();
  function image(name,color,rotation=0) {
    const [label,path,x,y,fill]=icons[name];
    const key=[name,color,rotation].join('/');
    if(!cache.has(key)) {
      if(cache.size>=300) cache.clear();
      const start='<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g transform="rotate('+rotation+' 16 16)" stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="3">';
      const shape='<path d="'+path+'" fill="'+(fill?color:'none')+'" stroke="';
      const svg=name==='precision'?start+'<path d="'+path+'" fill="'+color+'"/><path d="M5 5.5l12.5 10.3-6.1-.7-2.2 5.1z" fill="none" stroke="#0d1520" stroke-width=".8"/></g></svg>':
        start+shape+'#0d1520" stroke-width="3.1"/>'+shape+color+'" stroke-width="1.35"/></g></svg>';
      cache.set(key,{src:'data:image/svg+xml,'+encodeURIComponent(svg),x,y,label});
    }
    return cache.get(key);
  }
  function css(behavior,tool,rotation,preferences,fallback) {
    const name=preferences.shapes[behavior]??profiles.select[1];
    const picture=image(name,preferences.colors[tool]??preferences.colors.select,rotation);
    return 'url("'+picture.src+'") '+picture.x+' '+picture.y+', '+fallback;
  }
  function precisionCss(tool,preferences) {
    const picture=image('precision',preferences.colors[tool]??preferences.colors.select);
    return 'url("'+picture.src+'") '+picture.x+' '+picture.y+', default';
  }
  return {profiles,icons,tools,normalize,image,css,precisionCss};
})();
if(typeof module!=='undefined') module.exports=CursorProfiles;

const SnapIndicators=(()=>{
  const labels={point:'Point ou sommet',midpoint:'Milieu',center:'Centre',quadrant:'Quadrant',
    intersection:'Intersection',origin:'Origine',grid:'Grille',coincidence:'Coïncidence automatique',join:'Raccord ou fermeture'};
  const black='#101519';
  const icons={
    point:'<path d="M5 4v9a7 7 0 0 0 14 0V4h-4v9a3 3 0 0 1-6 0V4z" fill="'+black+'"/><path d="M5 4h4v5H5z" fill="#e83949"/><path d="M15 4h4v5h-4z" fill="#287be5"/>',
    midpoint:'<path d="M3 12h18M12 6v12"/>',
    center:'<circle cx="12" cy="12" r="8"/><rect x="10" y="10" width="4" height="4" fill="'+black+'" stroke="none"/>',
    quadrant:'<path d="M3 12h8M18 4Q4 12 18 20"/><rect x="9" y="10" width="4" height="4" fill="'+black+'" stroke="none"/>',
    intersection:'<path d="M3 12h9m0 0 8-6m-8 6 8 6"/>',
    origin:'<path d="M12 12V3a9 9 0 0 0-9 9zm0 0h9a9 9 0 0 1-9 9z" fill="'+black+'" stroke="none"/><circle cx="12" cy="12" r="9"/>',
    grid:'<path d="M4 8h16M4 16h16M8 4v16m8-16v16"/>',
    join:'<circle cx="12" cy="13" r="8"/><rect x="9.5" y="2.5" width="5" height="5" fill="'+black+'" stroke="none"/>'
  };
  const corners={ne:[1,-1],nw:[-1,-1],se:[1,1],sw:[-1,1]};
  const cache=new Map();
  function image(kind,color) {
    const key=kind+(kind==='coincidence'?color:'');
    if(!cache.has(key)) {
      const tone=kind==='coincidence'&&/^#[0-9a-f]{6}$/i.test(color)?color:black;
      const shape=kind==='coincidence'?'<path d="M8 10V7a4 4 0 0 1 8 0v3"/><rect x="5" y="10" width="14" height="10" rx="2" fill="'+tone+'"/><path d="M12 14v3" stroke="'+black+'"/>':icons[kind];
      const outline=kind==='point'?' stroke="none"':' stroke="'+tone+'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
      if(cache.size>=100) cache.clear();
      cache.set(key,'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g fill="none"'+outline+'>'+shape+'</g></svg>'));
    }
    return cache.get(key);
  }
  function normalize(saved) {
    const enabled=Object.fromEntries(Object.keys(labels).map(key=>[key,saved?.enabled?.[key]!==false]));
    return {enabled,corner:Object.hasOwn(corners,saved?.corner)?saved.corner:'ne'};
  }
  function distanceTo(segment,p) {
    const {a,b}=segment, vx=b[0]-a[0],vy=b[1]-a[1], denom=vx*vx+vy*vy;
    const t=denom?Math.max(0,Math.min(1,((p[0]-a[0])*vx+(p[1]-a[1])*vy)/denom)):0;
    return Math.hypot(p[0]-a[0]-t*vx,p[1]-a[1]-t*vy);
  }
  function placement(pointer,viewport,paths,count,preferred,previous) {
    const width=20*count,height=20;
    const choices=Object.entries(corners).map(([corner,[sx,sy]])=>{
      const x=pointer[0]+(sx>0?16:-16-width),y=pointer[1]+(sy>0?15:-15-height);
      const overflow=Math.max(0,3-x)+Math.max(0,3-y)+Math.max(0,x+width+3-viewport[0])+Math.max(0,y+height+3-viewport[1]);
      let score=overflow*1000+(corner===preferred?0:1)+(corner===previous?0:2);
      for(let i=0;i<count;i++) {
        const center=[x+10+i*20,y+10];
        for(const path of paths) {
          const distance=distanceTo(path,center);
          if(distance<28) score+=(28-distance)*(path.weight??1);
        }
      }
      return {corner,score,x,y};
    }).sort((a,b)=>a.score-b.score);
    const {corner,x,y}=choices[0];
    return {corner,x:Math.max(2,Math.min(viewport[0]-width-2,x)),y:Math.max(2,Math.min(viewport[1]-height-2,y))};
  }
  return {labels,normalize,image,placement};
})();
if(typeof module!=='undefined') module.exports.SnapIndicators=SnapIndicators;
