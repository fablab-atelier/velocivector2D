'use strict';
const $ = id => document.getElementById(id);
const canvas = $('drawing'), context = canvas.getContext('2d');
const definitions = {
  select:['↖','Sélection et déplacement','V','Glissez la sélection par un sommet, un milieu ou le centre du cadre. Ctrl + glisser déplace seulement le point ou le tracé saisi.'],
  poly:['⬠','Ligne / polyligne','P','Posez deux points pour une ligne ou continuez pour une polyligne. Entrée, Échap ou double-clic termine.'],
  tangentPoly:['⌒','Polyligne tangente','U','Tracez des segments droits. Maintenez Ctrl pour poser un arc tangent au dernier élément.'],
  rect:['▭','Rectangle','R','Posez deux coins opposés.'],
  circle:['○','Cercle','C','Posez le centre puis un point sur le cercle.'],
  arc:['◠','Arc','A','Posez le centre, le départ puis l’arrivée. Maintenez le bouton Arc pour choisir la méthode.'],
  polygon:['⬡','Polygone régulier','G','Indiquez le nombre de côtés, puis posez le centre et un sommet.'],
  ellipse:['⬭','Ellipse','E','Posez le centre, une extrémité du premier axe puis la demi-largeur.'],
  slot:['▱','Oblong','O','Posez les deux centres ou les extrémités, puis un point à mi-largeur.'],
  bezier:['∿','Plume Bézier','B','Posez les points de passage. Entrée ou Échap termine. Cliquez sur le départ pour fermer.'],
  origin:['⊕','Origine de travail','J','Cliquez pour créer un POT ou saisissez ses coordonnées par rapport au POA.'],
  point:['•','Point de construction','N','Cliquez pour placer un point de construction. Il est conservé dans le projet.'],
  offset:['⇉','Décalage de tracé','K','Sélectionnez les tracés, choisissez la distance et le côté, puis créez le décalage.'],
  text:['T','Texte','T','Saisissez le texte puis cliquez dans le dessin pour le poser. Double-cliquez sur un texte pour le modifier.'],
  dimension:['↔','Cotation intelligente','I','Choisissez une géométrie ou deux références, puis posez la cote.']
};
const nudgeDirections={ArrowLeft:[-1,0,'←'],ArrowRight:[1,0,'→'],ArrowUp:[0,1,'↑'],ArrowDown:[0,-1,'↓']};
const nudgeSteps=[[1,''],[.1,'Ctrl+'],[10,'Maj+']];
const nudgeBindings=Object.fromEntries(nudgeSteps.flatMap(([distance,modifier])=>
  Object.entries(nudgeDirections).map(([key,[x,y,glyph]])=>['nudge:'+distance+':'+key,{distance,x,y,glyph,key,modifier}])));
const shortcutCatalog={
  'Déplacement au clavier':Object.fromEntries(Object.entries(nudgeBindings).map(([id,{key,modifier}])=>
    [id,['Déplacer la sélection de {distance}',modifier+key]])),
  'Fichier':{save:['Enregistrer','Ctrl+s'],saveAs:['Enregistrer sous','Ctrl+Maj+s'],open:['Ouvrir','Ctrl+o']},
  'Édition':{copy:['Copier','Ctrl+c'],cut:['Couper','Ctrl+x'],paste:['Coller','Ctrl+v'],undo:['Annuler','Ctrl+z'],
    group:['Grouper','Ctrl+g'],ungroup:['Dégrouper','Ctrl+Maj+g'],
    redo:['Rétablir','Ctrl+y'],redoAlternate:['Rétablir (second raccourci)','Ctrl+Maj+z'],remove:['Supprimer','Delete'],selectLayer:['Sélectionner les tracés du calque actif','Ctrl+a'],construction:['Basculer le trait de construction','x']},
  'Contraintes':{
    'constraint:horizontal':['Horizontale','Maj+h'],'constraint:vertical':['Verticale','Maj+v'],
    'constraint:coincident':['Coïncidente','Maj+c'],'constraint:midpoint':['Milieu','Maj+m'],
    'constraint:parallel':['Parallèle','Maj+p'],'constraint:collinear':['Colinéaire','Maj+b'],'constraint:radial':['Radiale','Maj+r'],'constraint:perpendicular':['Perpendiculaire','Maj+d'],
    'constraint:equal':['Égale','Maj+e'],'constraint:tangent':['Tangente','Maj+t'],
    'constraint:symmetry':['Symétrie','Maj+s'],'constraint:locked':['Verrouillée','Maj+l']
  },
  'Modification':{
    'operation:transform':['Transformer','Alt+t'],'operation:mirror':['Miroir','Alt+m'],
    'operation:reverse':['Inverser','Alt+i'],'operation:explode':['Éclater','Alt+x'],
    'operation:close':['Fermer','Alt+o'],'operation:autoClose':['Fermeture automatique','Alt+j'],'operation:scissors':['Ciseaux','Alt+c'],'operation:fillet':['Congé','Alt+u'],
    'transform:auto':['Transformation automatique','Alt+a'],'transform:move':['Verrouiller le déplacement','Alt+g'],
    'transform:scale':['Verrouiller la mise à l’échelle','Alt+s'],'transform:rotate':['Verrouiller la rotation','Alt+r']
  },
  'Dessin et navigation':{...Object.fromEntries(Object.entries(definitions).map(([id,[,name,key]])=>
    ['tool:'+id,[id==='poly'?'Polyligne (variante active)':name,key.toLowerCase()]])),
    polyAlternate:['Polyligne classique','l'],fit:['Tout voir','f'],finish:['Terminer ou appliquer','Enter'],
    exit:['Quitter / annuler la saisie','Escape'],cycleSnap:['Aimantation suivante','Tab'],suspendSnap:['Suspendre l’aimantation','Space']}
};
const gestureDefaults={shiftKey:['Aligner par 15° / ajouter à la sélection','Shift'],
  ctrlKey:['Éditer localement / retirer de la sélection','Control'],altKey:['Édition directe du tracé','Alt']};
const modifierLabels={Control:'Ctrl',Shift:'Maj',Alt:'Alt',Meta:'Windows'};
const defaultShortcuts=Object.fromEntries(Object.values(shortcutCatalog).flatMap(group=>
  Object.entries(group).map(([id,[,value]])=>[id,value])));
let shortcuts={...defaultShortcuts}, gestureKeys=Object.fromEntries(Object.entries(gestureDefaults).map(([id,[,key]])=>[id,key]));
let metricSnapStep=0;
let absoluteFrameReadout=false;
try {
  const saved=JSON.parse(localStorage.getItem('velocivector-shortcuts')??'null');
  const keyBindings={}, assigned=new Set();
  for(const id of Object.keys(defaultShortcuts)) {
    const key=saved?.keys?.[id];
    if(typeof key!=='string') continue;
    keyBindings[id]=assigned.has(key)?'':key;
    if(key) assigned.add(key);
  }
  for(const [id,key] of Object.entries(defaultShortcuts)) if(!Object.hasOwn(keyBindings,id)) {
    keyBindings[id]=assigned.has(key)?'':key;
    if(key) assigned.add(key);
  }
  if(!saved?.nudgeStepLayout) for(const key of Object.keys(nudgeDirections)) {
    const previous=saved?.nudgeFineShift?[[.1,'Maj+'],[10,'Ctrl+Maj+']]:[[10,'Ctrl+Maj+']];
    for(const [step,modifier] of previous) {
      const id='nudge:'+step+':'+key, old=modifier+key, next=defaultShortcuts[id];
      if(keyBindings[id]!==old||assigned.has(next)) continue;
      keyBindings[id]=next;
      assigned.delete(old);assigned.add(next);
    }
  }
  shortcuts=keyBindings;
  const keys={...gestureKeys};
  for(const id of Object.keys(keys)) if(Object.hasOwn(modifierLabels,saved?.gestures?.[id])) keys[id]=saved.gestures[id];
  if(new Set(Object.values(keys)).size===Object.keys(keys).length) gestureKeys=keys;
} catch {}
function keyboardChord(e) {
  if(Object.hasOwn(modifierLabels,e.key)||['Dead','Unidentified','Process'].includes(e.key)) return '';
  const physicalLetter=e.altKey&&!/^[a-z]$/i.test(e.key)&&/^Key[A-Z]$/.test(e.code??'')?e.code.at(-1):null;
  const key=e.key===' '?'Space':physicalLetter?physicalLetter.toLowerCase():e.key.length===1?e.key.toLowerCase():e.key;
  return [e.ctrlKey&&'Ctrl',e.altKey&&'Alt',e.shiftKey&&'Maj',e.metaKey&&'Windows',key].filter(Boolean).join('+');
}
function pointerModifiers(e) {
  const held={Control:e.ctrlKey,Shift:e.shiftKey,Alt:e.altKey,Meta:e.metaKey};
  return Object.fromEntries(Object.entries(gestureKeys).map(([id,key])=>[id,Boolean(held[key])]));
}
function drawingModifiers(e) {
  const mod=pointerModifiers(e);
  if(metricSnapStep&&gestureKeys.shiftKey==='Shift') mod.shiftKey=false;
  return mod;
}
function shortcutText(value) {
  if(!value) return I18n.t('Aucun');
  return value.split('+').map(key=>({Space:I18n.t('Espace'),Enter:I18n.t('Entrée'),Escape:I18n.t('Échap'),Delete:I18n.t('Suppr'),Tab:'Tab'})[key]??
    (nudgeDirections[key]?.[2]??(key.length===1?key.toUpperCase():I18n.t(key)))).join(' + ');
}
function nudgeLabel(distance) {
  return I18n.t('Déplacer la sélection de {distance}',{distance:num(distance)+' mm'});
}
function shortcutCaption(id,label) {
  const nudge=nudgeBindings[id];
  return nudge?nudge.glyph+' · '+nudgeLabel(nudge.distance):I18n.t(label);
}
function saveShortcuts() {
  try {localStorage.setItem('velocivector-shortcuts',JSON.stringify({keys:shortcuts,gestures:gestureKeys,nudgeStepLayout:2}));} catch {}
  updateShortcutTitles();
  if($('helpDialog').open) showHelpSection(activeHelpSection);
  $('help').textContent=toolHint(tool);
  update();
}
function updateShortcutTitles() {
  const titles={fit:I18n.t('Tout voir'),undo:I18n.t('Annuler'),redo:I18n.t('Rétablir')};
  for(const [id,label] of Object.entries(titles)) $(id).title=label+' ('+shortcutText(shortcuts[id])+')';
  for(const id of ['open','save','saveAs']) {
    const key=$(id).querySelector('kbd');
    key.hidden=!shortcuts[id];
    key.textContent=shortcuts[id]?shortcutText(shortcuts[id]):'';
  }
  $('frameReadout').title=I18n.t('Arrondi des dimensions · Tab : 1 mm · Maj + Tab : 10 mm');
  for(const button of $('tools').children) {
    const id=button.dataset.tool, variant=toolForMethod(id), label=I18n.t(definitions[variant][1]);
    const alternate=id==='poly'?(variant==='poly'?shortcuts.polyAlternate:shortcuts['tool:'+variant]):null;
    const keys=[shortcuts['tool:'+id],alternate].filter(Boolean);
    button.setAttribute('aria-label',label);
    button.title=label+(keys.length?' ('+keys.map(shortcutText).join(' / ')+')':'');
  }
  for(const [selector,data,prefix,category] of [
    ['[data-angle]','angle','constraint:','Contraintes'],
    ['[data-operation]','operation','operation:','Modification'],
    ['[data-transform-mode]','transformMode','transform:','Modification']
  ]) for(const button of document.querySelectorAll(selector)) {
    const id=prefix+button.dataset[data], entry=shortcutCatalog[category][id];
    if(entry) button.title=I18n.t(entry[0])+(shortcuts[id]?' ('+shortcutText(shortcuts[id])+')':'');
  }
}
const $slot = document.createElement('label');
$slot.innerHTML = 'Hors tout <input type="checkbox" id="overall">';
I18n.staticText($slot);
$('sidesRow').after($slot);
const splineSettings=$('splineSettings').content.cloneNode(true);
I18n.staticText(splineSettings);
$slot.after(splineSettings);
for(const input of document.querySelectorAll('input[type="number"], #point #x, #point #y')) Numeric.install(input);
const menus=[...document.querySelectorAll('.app-menu')];
for(const menu of menus) menu.addEventListener('toggle',()=>{
  if(menu.open) for(const other of menus) if(other!==menu) other.open=false;
});
document.addEventListener('click',e=>{
  for(const menu of menus) if(!menu.contains(e.target)) menu.open=false;
  if(!$('angleContext').contains(e.target)) $('angleContext').hidden=true;
  if(!$('layerPalette').contains(e.target)&&!e.target.closest?.('.layer-color')) $('layerPalette').hidden=true;
  for(const menu of toolPopups()) if(!menu.contains(e.target)&&
    e.target.closest?.('[data-tool]')?.dataset.tool!==menu.dataset.toolPopup) hideToolPopup(menu);
});
function menuAction(button,action) {
  button.onclick=()=>{
    const menu=button.closest('details');
    menu.open=false;
    menu.querySelector('summary').focus();
    action();
  };
}

let doc = Formats.empty(), activeLayer='0', tool='select', points=[], segments=[];
let numericDrawing=null, numericDimensionValues=new Map();
Numeric.setResolver(name=>{
  if(numericDrawing!==doc) {numericDrawing=doc;numericDimensionValues=DimensionTable.values(doc);}
  return numericDimensionValues.get(name.toUpperCase());
});
let angleHeld=false, tangentHeld=false, draftAxes=[], draftRelations=[], slotAxis=null;
const polylineTool=()=>tool==='poly'||tool==='tangentPoly';
const tangentMode=(previous=segments.at(-1))=>tool==='tangentPoly'&&tangentHeld&&Boolean(previous);
const angleStep=Math.PI/12;
function angularGuide(from,to) {
  const length=G.dist(from,to);
  if(length<=G.eps) return null;
  const step=Math.round(G.angle(from,to)/angleStep), angle=step*angleStep;
  const aligned=(step%24+24)%24;
  const axis=aligned%12===0?'horizontal':aligned%6===0?'vertical':null;
  const delta=axis==='horizontal'?[Math.sign(Math.cos(angle))*length,0]:
    axis==='vertical'?[0,Math.sign(Math.sin(angle))*length]:G.polar([0,0],length,angle);
  const q=G.add(from,delta);
  const degrees=aligned>12?360-aligned*15:aligned*15;
  const negative=delta[0]<0||delta[0]===0&&delta[1]<0;
  return {from,q,angle,axis,label:(degrees?negative?'−':'+':'')+degrees+'°'};
}
function drawingGuide(vertices,p) {
  if(polylineTool()&&!tangentMode()&&vertices.length) return angularGuide(vertices.at(-1),p);
  if(tool==='slot'&&vertices.length===1) return angularGuide(vertices[0],p);
  return null;
}
function tangentLineGuide(vertices,p,previous,snap) {
  if(tool!=='tangentPoly'||tangentHeld||previous?.type!=='arc'||
    !vertices.length||suspended||!$('snap').checked) return null;
  const from=vertices.at(-1), q=G.tangentLineEnd(previous,from,p);
  // Keep a positional snap intact when it cannot also satisfy tangency.
  if(!q||snap&&G.dist(q,p)>G.eps) return null;
  return {from,q:snap?p:q,tangent:true,label:I18n.t('Tangence')};
}
function draftLineGuide(vertices,p,previous,snap,align) {
  const priority=tangentLineGuide(vertices,p,previous,snap)||align&&drawingGuide(vertices,p);
  if(priority||snap||tangentMode(previous)||!vertices.length||suspended||!$('snap').checked) return priority;
  const from=vertices.at(-1);
  if(previous) {
    const q=previous.type==='line'&&G.collinearLineEnd(previous,from,p);
    return q?{from,q,collinear:true,label:I18n.t('Colinéaire')}:null;
  }
  for(const entity of doc.entities) if(entity.layer===activeLayer&&visible(entity)) {
    for(const [index,part] of Formal.referenceEdges(entity).entries()) {
      if(part.type!=='line'||!constructionShown(entity.layer)&&G.constructionAt(entity,index)) continue;
      const end=part.p.findIndex(q=>G.dist(q,from)<=G.eps);
      if(end<0) continue;
      const axis=end===1?part:{...part,p:part.p.slice().reverse()};
      const q=G.collinearLineEnd(axis,from,p);
      if(q) return {from,q,collinear:true,reference:{id:entity.id,kind:'edge',index},label:I18n.t('Colinéaire')};
    }
  }
  return null;
}
function axisConstraints(refs,existing=[]) {
  const added=refs.map(({id,index,type})=>({type,refs:[{id,kind:'edge',index}]}));
  const signatures=new Set(existing.map(Formal.signature));
  return added.filter(c=>!signatures.has(Formal.signature(c)));
}
function displayAngularGuide(guide,ink) {
  if(!guide) return;
  const [x,y]=screen(guide.q);
  stroke([screen(guide.from),[x,y]],ink.point,1,[4,4]);
  drawAngleTag(guide.label,x+10,y-10,ink);
}
let arcMethod='center', rectangleMethod='corners', polylineMethod='tangent', arcTrack=null;
const toolPopupIds={arc:'arcOptions',rect:'rectOptions',poly:'polyOptions'};
const toolPopups=()=>Object.values(toolPopupIds).map($);
function toolMethod(id) {
  if(id==='arc') return arcMethod;
  if(id==='rect') return rectangleMethod;
  if(id==='poly') return polylineMethod;
}
function toolForMethod(id,method=toolMethod(id)) {
  return id==='poly'&&method==='tangent'?'tangentPoly':id;
}
function hideToolPopup(menu) {
  menu.hidden=true;
  const button=[...$('tools').children].find(b=>b.dataset.tool===menu.dataset.toolPopup);
  button?.setAttribute('aria-expanded','false');
}
function closeToolPopups() {
  const visibleMenus=toolPopups().filter(menu=>!menu.hidden);
  visibleMenus.forEach(hideToolPopup);
  return visibleMenus.length>0;
}
let selection=new Set(), undo=[], redo=[], marker=null, hover=null, snapIndex=0, suspended=false, drag=null;
let camera={x:0,y:0,scale:4}, viewport=[1,1], pending=false, nextId=1;
let filename='dessin', dirty=false;
let edgeFocus=null, wholeFocus=null;
const segmentSelection=new Map();
const constructionChoices=new Set(['dashed','dashDot']);
let drawConstruction=false, constructionStyle='dashed', constructionOpacity=80;
let draftConstruction=[];
try {
  const saved=JSON.parse(localStorage.getItem('velocivector-construction')??'null');
  if(constructionChoices.has(saved?.style)) constructionStyle=saved.style;
  if(Number.isFinite(saved?.opacity)&&saved.opacity>=0&&saved.opacity<=100) constructionOpacity=saved.opacity;
} catch {}
function saveConstructionPreferences() {
  try {localStorage.setItem('velocivector-construction',JSON.stringify({style:constructionStyle,opacity:constructionOpacity}));} catch {}
}
const drawingUsesConstruction=()=>!['select','dimension','origin','point','text'].includes(tool);
const draftStyle=()=>drawConstruction?constructionStyle:null;
const styledDraft=e=>G.withConstruction(e,draftStyle());
function styledDraftParts(e,styles) {
  if(!styles.length) return e;
  if(styles.every(style=>style===styles[0])) return G.withConstruction(e,styles[0]);
  const constructionParts=Object.fromEntries(styles.flatMap((style,i)=>style?[[i,style]]:[]));
  return {...e,constructionParts};
}
let knotFocus=null, splineTension=1.38;
const pointDragDelay=100;
const delayedPointTools=new Set(['poly','tangentPoly','bezier','arc']);
let dimensionOpacity=60;
try {
  const saved=localStorage.getItem('velocivector-dimension-opacity');
  if(saved!==null && Number(saved)>=0 && Number(saved)<=100) dimensionOpacity=Number(saved);
} catch {}
$('dimensionOpacity').value=dimensionOpacity;
$('dimensionOpacityValue').textContent=dimensionOpacity+' %';
try {
  const saved=localStorage.getItem('velocivector-spline-tension');
  if(saved!==null && Number(saved)>=0 && Number(saved)<=G.maxSplineRatio) splineTension=Number(saved);
} catch {}
$('splineTension').value=splineTension*100;
let constraintMode=null;
let formalTargets=[], formalSelection=[];
let dimensionRefs=[], dimensionRound=null, dimensionSelectionPoint=null;
let selectedDimension=null, selectedConstraint=null;
let modification=null, clipboard=null, removalBatches=[], blockedMovement=null;
let cursorPoint=null, cursorPositionKey='', cursorInputs=[];
let centerDraftSnap=null, activeSnap=null, previousSnapCorner=null, snapIconKey='';
let snapPreferences=SnapIndicators.normalize();
try {snapPreferences=SnapIndicators.normalize(JSON.parse(localStorage.getItem('velocivector-snap-indicators')??'null'));} catch {}
let cursorPreferences=CursorProfiles.normalize();
try {cursorPreferences=CursorProfiles.normalize(JSON.parse(localStorage.getItem('velocivector-cursors')??'null'));} catch {}
const clipboardRelations=new Map();
const transformModes=new Set(['move','scale','rotate']);
const modificationNames={move:'Déplacer',rotate:'Tourner',scale:'Mise à l’échelle',mirror:'Miroir',reverse:'Inverser',explode:'Éclater',close:'Fermer',autoClose:'Fermeture automatique',scissors:'Ciseaux',fillet:'Congé'};
let closeTolerance=.1;
try {
  const saved=localStorage.getItem('velocivector-close-tolerance');
  if(saved!==null&&Number.isFinite(Number(saved))&&Number(saved)>=0) closeTolerance=Number(saved);
} catch {}
$('closeTolerance').value=closeTolerance;
let closurePlanCache=null;
try {
  const value=localStorage.getItem('velocivector-auto-close-tolerance');
  if(value!==null&&Number.isFinite(Number(value))&&Number(value)>=0) $('autoCloseTolerance').value=value;
} catch {}
const constraintSymbols={
  horizontal:['M3 10h14','#78c9ff','#145b91'],
  vertical:['M10 3v14','#82e1b6','#116844'],
  coincident:['M10 3v14M3 10h14M7 7h6v6H7z','#ffcd69','#805300'],
  midpoint:['M3 10h14M10 5v10M8 8h4v4H8z','#f6e070','#726300'],
  parallel:['M6 16l6-12m-1 12 6-12','#c5a1ff','#633ba3'],
  radial:['M14 5a5 5 0 1 0 0 10a5 5 0 1 0 0-10M2 10h7m1 0h1m2 0h2','#7de3cf','#177461'],
  collinear:['M2 10h6m4 0h6M8 10l2-2 2 2-2 2z','#9caeff','#3e54a0'],
  perpendicular:['M10 3v13M3 16h14','#65dbea','#14616c'],
  equal:['M4 7h12M4 13h12','#ff9dcf','#983465'],
  tangent:['M13 9a5 5 0 1 0-10 0 5 5 0 1 0 10 0M8 14h10','#ff9f7a','#a53d1d'],
  symmetry:['M10 2v2m0 3v2m0 2v2m0 3v2M7 5l-4 5 4 5m6-10 4 5-4 5','#bae47a','#436b17'],
  locked:['M5 9h10v8H5zM7 9V6a3 3 0 0 1 6 0v3m-3 3v2','#f190a0','#a12541'],
  cornerAngle:['M15 4 4 16h13M8 12a6 6 0 0 1 4 4','#efb5eb','#8a3988']
};
function constraintIcon(type) {
  const [path,dark,light]=constraintSymbols[type];
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 20 20');
  svg.setAttribute('aria-hidden','true');
  svg.classList.add('constraint-icon');
  svg.style.setProperty('--constraint-dark',dark);
  svg.style.setProperty('--constraint-light',light);
  const glyph=document.createElementNS('http://www.w3.org/2000/svg','path');
  glyph.setAttribute('d',path);
  svg.append(glyph);
  return svg;
}
function setConstraintButton(button,type,label=Formal.names[type]) {
  button.type='button';
  button.replaceChildren(constraintIcon(type));
  button.classList.add('constraint-command');
  I18n.attribute(button,'title',label);
  I18n.attribute(button,'aria-label',label);
}
const constraintBadgeSize=19;
const constraintPaths=new Map();
function drawConstraintBadge(type,x,y,ink,selected=false,tint=null) {
  const [path,dark,light]=constraintSymbols[type];
  const color=tint??(theme==='dark'?dark:light), size=constraintBadgeSize;
  if(!constraintPaths.has(type)) constraintPaths.set(type,new Path2D(path));
  context.save();
  context.setLineDash([]);
  context.fillStyle=selected?color:ink.base;
  context.strokeStyle=color;context.lineWidth=selected?2:1;
  context.fillRect(x,y,size,size);
  context.strokeRect(x+.5,y+.5,size-1,size-1);
  context.translate(x+1.5,y+1.5);context.scale(.8,.8);
  context.strokeStyle=selected?ink.base:color;
  context.lineWidth=1.65;context.lineJoin='round';context.lineCap='round';
  context.stroke(constraintPaths.get(type));
  context.restore();
}
const toolbarConstraints=[...$('constraints').querySelectorAll('button')];
const constraintButtons=[...toolbarConstraints];
const angleLabel=angle=>num(angle)+'°';
const palettes={
  dark:{selection:'#73e4bf',hover:'#9acfc5',preview:'#91cfea',grid:'#25303c',x:'#493237',y:'#304840',point:'#ffc87c',base:'#121820',defaultInk:'#cbd9eb'},
  light:{selection:'#006e60',hover:'#3b7d75',preview:'#155f93',grid:'#e2e8ef',x:'#e1b1b5',y:'#afcec3',point:'#995000',base:'#fbfcfe',defaultInk:'#26364b'}
};
let theme='dark';
try {if(localStorage.getItem('velocivector-theme')==='light') theme='light';} catch {}
function applyTheme() {
  document.documentElement.dataset.theme=theme;
  $('theme').textContent=theme==='dark'?I18n.t('Mode sombre'):I18n.t('Mode clair');
  $('theme').setAttribute('aria-pressed',String(theme==='dark'));
  requestDraw();
}
function constructionShown(layer) {
  return doc.layers.find(l=>l.name===layer)?.constructionVisible!==false;
}
const visible = e => e&&doc.layers.find(l=>l.name===e.layer)?.visible&&
  (constructionShown(e.layer)||G.hasRegularStroke(e));
function visibleStrokeParts(e) {
  if(!constructionShown(e.layer)&&e.constructionParts) {
    return G.strokeParts(e).filter((_,i)=>!G.constructionAt(e,i));
  }
  return [e];
}
const visibleSnapFeatures=e=>visibleStrokeParts(e).flatMap(G.snapFeatures);
function visibleReference(entities,ref) {
  if(ref.kind==='origin') return true;
  const entity=entities.get(ref.id);
  if(!visible(entity)) return false;
  if(ref.kind==='edge') return constructionShown(entity.layer)||!G.constructionAt(entity,ref.index);
  const point=Formal.resolve(entities,ref);
  if(!point) return false;
  if(Formal.isMidpointRef(ref)) {
    return constructionShown(entity.layer)||!G.strokeParts(entity).some((_,i)=>
      Formal.sameRef(Formal.midpointRef({id:entity.id,index:i}),ref)&&G.constructionAt(entity,i));
  }
  return referencePointVisible(entity,ref.index,point);
}
function visiblePoint(e,p) {
  return constructionShown(e.layer)||!e.constructionParts||
    visibleSnapFeatures(e).some(feature=>G.dist(p,feature.q)<=G.eps*8);
}
const absoluteOrigin={name:'POA',target:[0,0]};
let selectedOrigin=null, pendingOrigin=null;
function editableOrigin() {
  if(tool!=='select'||modification||constraintMode||selection.size||selectedOrigin?.layer!==activeLayer||
    !doc.layers.some(layer=>layer.name===activeLayer&&layer.visible)) return null;
  return layerOrigins(activeLayer).find(origin=>origin.name===selectedOrigin.name&&origin.name!=='POA')??null;
}
function updateOriginEditor() {
  const origin=editableOrigin();
  $('selectedOriginForm').hidden=!origin;
  if(!origin) return;
  $('selectedOriginName').textContent=origin.name+I18n.t(' · origine de travail');
  $('selectedOriginX').value=origin.target[0];
  $('selectedOriginY').value=origin.target[1];
}
function workOriginAt([x,y]) {
  if(!doc.layers.some(layer=>layer.name===activeLayer&&layer.visible)) return null;
  return layerOrigins(activeLayer).slice(1).find(({name,target})=>{
    const [sx,sy]=screen(target);
    return G.dist([x,y],[sx,sy])<=7||x>=sx+7&&x<=sx+10+name.length*7&&y>=sy+4&&y<=sy+16;
  });
}
function originPosition(prefix) {
  const p=[$(prefix+'X').valueAsNumber,$(prefix+'Y').valueAsNumber];
  return p.every(v=>Number.isFinite(v)&&Math.abs(v)<=1e12)?p:null;
}
function openOriginDialog(layer,p) {
  if(layer.raster) {message(I18n.t('Choisissez un calque vectoriel pour dessiner.'));return;}
  const id=doc.layers.flatMap(l=>l.origins??[]).reduce((max,o)=>Math.max(max,Number(o.name.slice(3))),0)+1;
  if(!Number.isSafeInteger(id)) {message(I18n.t('Numérotation des POT épuisée.'));return;}
  const name='POT'+id;
  pendingOrigin={layer:layer.name,name,target:p};
  $('originDialogTitle').textContent=I18n.t('Position de ')+name;
  $('originDialogX').value=p[0];$('originDialogY').value=p[1];
  $('originDialog').showModal();
  requestDraw();
}
function moveWorkOrigin(origin,target) {
  if(G.dist(target,origin.target)<=G.eps) return true;
  const before=doc.entities;
  const direct=new Set();
  const constraints=(doc.constraints??[]).map(c=>{
    if(c.origin===origin.name) {
      for(const ref of c.refs) direct.add(ref.id);
      return {...c,target};
    }
    if(!Formal.isDimension(c)||c.layer!==activeLayer||!c.refs.some(ref=>ref.kind==='origin'&&ref.name===origin.name)) return c;
    if(Formal.isDriving(c)) for(const ref of c.refs) if(ref.kind!=='origin') direct.add(ref.id);
    return {...c,refs:c.refs.map(ref=>ref.kind==='origin'&&ref.name===origin.name?{...ref,target}:ref)};
  });
  const connected=Formal.connected(constraints,[...direct]);
  const ids=new Set(connected.flatMap(c=>c.refs.filter(ref=>ref.kind!=='origin').map(ref=>ref.id)));
  let entities=before;
  if(ids.size) {
    const delta=G.sub(target,origin.target);
    const translated=before.map(e=>ids.has(e.id)?G.transform(e,p=>G.add(p,delta)):e);
    entities=Formal.solve(translated,connected,ids)??Formal.solve(before,connected);
    if(!entities||!Formal.preservesContourOrientation(before,entities,connected)||entities.some(e=>!G.serial(e)||!Edit.valid(e))) {
      message(I18n.t('Position incompatible avec les cotes ou les contraintes liées à ')+origin.name+'.');
      return false;
    }
  }
  const layers=doc.layers.map(layer=>layer.name===activeLayer?{...layer,origins:layer.origins.map(o=>
    o.name===origin.name?{...o,target}:o)}:layer);
  if(!commit(d=>({...d,entities,constraints,layers}),false,true,true)) return false;
  message(origin.name+I18n.t(' repositionné.'));
  if(lastPointer) refreshPointer(lastPointer);
  return true;
}
function layerOrigins(name,source=doc) {
  return [absoluteOrigin,...(source.layers.find(l=>l.name===name)?.origins??[])];
}
function workingOrigin() {
  const name=doc.layers.find(l=>l.name===activeLayer)?.activeOrigin??'POA';
  return layerOrigins(activeLayer).find(origin=>origin.name===name)??absoluteOrigin;
}
const fromWork=p=>G.add(p,workingOrigin().target);
const toWork=p=>G.sub(p,workingOrigin().target);
function setPivotFields(p) {
  const [x,y]=toWork(p);
  $('pivotX').value=x;$('pivotY').value=y;
}
function gridPoint(p,step) {
  return fromWork(toWork(p).map(n=>Math.round(n/step)*step));
}
function referencePointVisible(e,index,p) {
  if(constructionShown(e.layer)||!e.constructionParts) return true;
  const center=Formal.theoreticalReferences(e).find(entry=>entry.index===index);
  return center?center.part===undefined||!G.constructionAt(e,center.part):visiblePoint(e,p);
}
const selected = () => doc.entities.filter(e=>selection.has(e.id)&&
  (visible(e)||e.vectorGroup&&doc.layers.some(layer=>layer.name===e.layer&&layer.visible)));
const num = x => Number(x.toFixed(5)).toLocaleString(I18n.locale,{maximumFractionDigits:5});
const message = text => { $('status').textContent=text; };
const screen = p => [viewport[0]/2+(p[0]-camera.x)*camera.scale,viewport[1]/2-(p[1]-camera.y)*camera.scale];
const world = p => [camera.x+(p[0]-viewport[0]/2)/camera.scale,camera.y-(p[1]-viewport[1]/2)/camera.scale];
const mouse = e => {const r=canvas.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top];};
const identity = e => ({...e,id:nextId++});
const newVectorGroup=()=>[...crypto.getRandomValues(new Uint32Array(4))].map(n=>n.toString(16).padStart(8,'0')).join('');
const vectorGroupKey=e=>e?.vectorGroup?JSON.stringify([e.layer,e.vectorGroup]):null;
function copiedVectorGroup(entity,groups) {
  const key=vectorGroupKey(entity);
  if(!key) return {};
  if(!groups.has(key)) groups.set(key,newVectorGroup());
  return {vectorGroup:groups.get(key)};
}
function groupedIds(ids) {
  const result=new Set(ids), groups=new Set();
  for(const entity of doc.entities) if(result.has(entity.id)&&entity.vectorGroup) groups.add(vectorGroupKey(entity));
  if(groups.size) for(const entity of doc.entities) if(groups.has(vectorGroupKey(entity))) result.add(entity.id);
  return [...result];
}
function groupVectors(group) {
  const ids=new Set(groupedIds([...selection]));
  const layers=new Map();
  for(const entity of doc.entities) if(ids.has(entity.id)) layers.set(entity.layer,(layers.get(entity.layer)??0)+1);
  const keys=new Map([...layers].filter(([,count])=>count>1).map(([layer])=>[layer,newVectorGroup()]));
  const changes=doc.entities.some(e=>ids.has(e.id)&&(group?keys.has(e.layer):e.vectorGroup));
  if(!changes) return;
  segmentSelection.clear();
  commit(d=>({...d,entities:d.entities.map(e=>{
    if(!ids.has(e.id)||group&&!keys.has(e.layer)) return e;
    const {vectorGroup,...rest}=e;
    return group?{...rest,vectorGroup:keys.get(e.layer)}:rest;
  })}),false,false,true);
  pick([...ids],{});
}

function requestDraw() {
  if(!pending) {pending=true;requestAnimationFrame(draw);}
}
function update() {
  cursorInputs=[];
  if(selectedConstraint&&(!doc.constraints?.includes(selectedConstraint)||
    !selectedConstraint.refs.some(ref=>selection.has(ref.id)&&doc.entities.some(e=>e.id===ref.id&&visible(e))))) selectedConstraint=null;
  if(selectedDimension&&(!dimensionOpacity||!doc.constraints?.includes(selectedDimension)||
    !dimensionVisible(selectedDimension,new Map(doc.entities.map(e=>[e.id,e]))))) selectedDimension=null;
  $('undo').disabled=!undo.length;
  $('redo').disabled=!redo.length;
  for(const b of document.querySelectorAll('[data-operation]')) b.classList.toggle('active',b.dataset.operation===(modification?.transform&&!modification.protected?'transform':modification?.type));
  $('units').value=doc.units;
  for(const button of constraintButtons) {
    const active=button.dataset.angle===constraintMode;
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active));
  }
  const command=constraintButtons.find(button=>button.dataset.angle===constraintMode);
  const focus=focusedEdge();
  const knot=focusedKnot();
  $('knotOptions').hidden=!knot;
  if(knot) {
    const {setting,arms}=curveKnotHandle(knot.entity,knot.index);
    const paired=arms.every(Boolean);
    $('toggleKnotSymmetry').disabled=!paired;
    $('toggleKnotAngles').disabled=!paired;
    updateHandleFields(setting);
    const max=curveRatioLimit(knot.entity,setting)*100;
    $('incomingRatio').max=$('knotRatio').max=max;
    $('incomingRow').hidden=!setting.split;
    $('outgoingLabel').textContent=setting.split?I18n.t('Bras sortant (%)'):I18n.t('Longueur des bras (%)');
    $('toggleKnotSymmetry').textContent=setting.split?I18n.t('Égaliser les longueurs'):I18n.t('Dissocier les longueurs');
    $('toggleKnotAngles').textContent=setting.splitAngles?I18n.t('Réaligner les bras'):I18n.t('Dissocier les angles');
    $('resetKnot').disabled=knot.entity.type==='spline'&&knot.entity.handles?.[knot.index]===undefined;
  }
  const angle=focus?angleLabel(Edit.bearing(Edit.edges(focus.entity)[focus.index])):null;
  $('hint').textContent=command
    ? I18n.t(Formal.names[constraintMode])+' · '+constraintPrompt(constraintMode,formalTargets.length)+
      (shortcuts.exit?I18n.t(' · Quitter ({exit})',{exit:shortcutText(shortcuts.exit)}):'')
    : angle?I18n.t('Orientation {angle} · Clic droit pour afficher les contraintes',{angle})
      : knot?I18n.t('Glissez le point pour le déplacer, ou un bras pour régler son angle et sa longueur.'):
        tool==='dimension'?dimensionHint():toolHint(tool);
  updateModification();
  updateToolShortcutHint();
  updateConstructionOptions();
  updateOriginEditor();
  if(tool==='offset') $('applyOffset').disabled=!selected().length||!offsetSides().length;
  updateClipboardOptions();
  drawLayers();
  updateTextPanel();
  if(rasterMode) $('hint').textContent=rasterHint();
  requestDraw();
}
function commit(change,join=true,protectContour=false,validated=false,keepGroup=false,coincidence=join,movement=false,recordUndo=true,blockedFeedback=false) {
  const before=doc;
  let next=change(doc);
  if(next===before) return true;
  if(next.entities!==before.entities) {
    const previous=new Map(before.entities.map(e=>[e.id,e]));
    const changed=next.entities.filter(e=>previous.get(e.id)!==e).map(e=>e.id);
    const remaining=new Set(next.entities.map(e=>e.id));
    let constraints=(next.constraints??[]).filter(c=>c.refs.every(r=>r.kind==='origin'||remaining.has(r.id)));
    const connected=Formal.connected(constraints,changed);
    if(connected.length&&!validated) {
      const protectedSlots=protectContour?new Set(connected.flatMap(c=>c.refs.map(r=>r.id))
        .filter(id=>previous.has(id)&&Formal.protectedSlot(previous.get(id),constraints))):new Set();
      const preserves=items=>items&&(!protectContour||Formal.preservesContourOrientation(before.entities,items,connected)&&
        items.every(e=>!protectedSlots.has(e.id)||G.slotParts(e)));
      const showBlock=()=>{if(blockedFeedback) signalBlockedMovement(next.entities,changed);};
      if(!preserves(next.entities)) {showBlock();message(I18n.t('Déplacement annulé · la forme du contour contraint serait altérée.'));update();return false;}
      const anchored=Formal.solve(next.entities,connected,new Set(changed));
      const solved=preserves(anchored)?anchored:keepGroup?null:Formal.solve(next.entities,connected);
      if(!solved) {showBlock();message(I18n.t('Modification incompatible avec les contraintes.'));update();return false;}
      if(!preserves(solved)) {showBlock();message(I18n.t('Déplacement annulé · la forme du contour contraint serait altérée.'));update();return false;}
      if(blockedFeedback&&solved!==anchored&&changed.every(id=>{
        const original=previous.get(id), result=solved.find(e=>e.id===id);
        return original&&result&&sameMovementGeometry(original,result);
      })) {
        showBlock();
        message(I18n.t('Modification incompatible avec les contraintes.'));
        update();
        return false;
      }
      next={...next,entities:solved};
    }
    if(join) {
      const result=Edit.joinContours(next.entities,changed);
      if(result.remap.size) {
        const remapped=Formal.remap(next.entities,result.entities,constraints,result.remap);
        if(remapped&&(!protectContour||remapped.length===constraints.length)) {
          next={...next,entities:result.entities};
          constraints=remapped;
          selection=new Set([...selection].map(id=>result.remap.get(id)??id));
          formalSelection=[];edgeFocus=null;knotFocus=null;wholeFocus=null;segmentSelection.clear();
        }
      }
    }
    if($('autoCoincidence').checked&&changed.length) {
      if(coincidence) constraints=Formal.automatic(before.entities,next.entities,constraints,name=>layerOrigins(name,next));
      if(movement) {
        const layers=new Map(next.layers.map(layer=>[layer.name,layer]));
        constraints=Formal.movementRelations(before.entities,next.entities,constraints,
          entity=>layers.get(entity.layer)?.visible,
          (entity,index)=>layers.get(entity.layer)?.constructionVisible!==false||!G.constructionAt(entity,index));
      }
    }
    next={...next,constraints};
  }
  try {
    if(next.entities!==before.entities||next.constraints!==before.constraints) {
      next=DimensionTable.reconcile(DimensionTable.restoreMissing(before,DimensionTable.assign(next)));
    }
  } catch(error) {message(I18n.t(error.message));update();return false;}
  if(selectedDimension?.dimensionId) selectedDimension=next.constraints?.find(c=>c.dimensionId===selectedDimension.dimensionId)??null;
  doc=next;
  if(recordUndo) undo.push(before);
  if(undo.length>100) undo.shift();
  redo=[];
  dirty=true;
  update();
  return true;
}
function history(back) {
  if(dimensionEdit) closeDimensionEditor();
  const source=back?undo:redo, target=back?redo:undo;
  if(!source.length) return;
  const fields=captureCoordinateFields();
  finishInlineText(false);textDraft=null;textPicking=null;textSelection=null;
  const next=source.pop(), renamed=layerRenames.get(back?doc:next);
  if(renamed&&activeLayer===(back?renamed.name:renamed.previous)) activeLayer=back?renamed.previous:renamed.name;
  if(rasterMode) setRasterMode();
  target.push(doc);doc=next;
  removalBatches=[];blockedMovement=null;
  segmentSelection.clear();
  selectedDimension=null;selectedConstraint=null;
  clipboardRelations.clear();
  formalTargets=[];formalSelection=[];
  if(!doc.layers.some(l=>l.name===activeLayer)) activeLayer=doc.layers[0].name;
  restoreCoordinateFields(fields);
  dirty=true;
  update();
}
function add(entities,axes=[],relations=[],centerSnap=null) {
  if(entities.some(e=>!G.serial(e))) {message(I18n.t('Coordonnées ou dimensions hors limites.'));return false;}
  const layer=doc.layers.find(l=>l.name===activeLayer);
  if(layer.raster) {message(I18n.t('Choisissez un calque vectoriel pour dessiner.'));return false;}
  if(!layer.visible) {message(I18n.t('Affichez le calque actif avant de dessiner.'));return false;}
  const additions=entities.map(e=>identity({...e,layer:activeLayer}));
  const shapeTool=tool==='rect'&&rectangleMethod==='corners'?'rectCorners':tool;
  const defaults=additions.flatMap(e=>Formal.shapeConstraints(e,shapeTool));
  if(additions.length===1) {
    const [entity]=additions;
    defaults.push(...axisConstraints(axes.map(axis=>({...axis,id:entity.id}))));
    if(centerSnap?.refs?.length&&$('autoCoincidence').checked) {
      const items=[...doc.entities,...additions], map=new Map(items.map(item=>[item.id,item]));
      const center={id:entity.id,kind:'point',index:entity.type==='circle'?0:2};
      for(const ref of centerSnap.refs) {
        const relation=Formal.make('coincident',[center,ref],items);
        if(relation&&Formal.satisfied(map,relation)) defaults.push(relation);
      }
    }
    for(const {type,before,after} of relations) {
      const refs=[before,after].map(index=>typeof index==='number'?{id:entity.id,kind:'edge',index}:index);
      const relation=Formal.make(type,refs,[...doc.entities,...additions]);
      if(relation) defaults.push(relation);
    }
    if(tool==='slot') {
      const axis=Formal.slotCenterline(entity,nextId++,constructionStyle);
      if(axis) return commit(d=>{
        const entities=[...d.entities,entity];
        const constraints=[...(d.constraints??[]),...defaults,...axis.constraints];
        return {...d,entities:[...entities,axis.line],constraints:$('autoCoincidence').checked?
          Formal.automatic(d.entities,entities,constraints,name=>layerOrigins(name,d)):constraints};
      },false);
    }
  }
  return commit(d=>({...d,entities:[...d.entities,...additions],constraints:[...(d.constraints??[]),...defaults]}));
}
function choose(id) {
  if(tool==='bezier' && points.length) {
    if(id===tool) return false;
    finishBezier();
    if(points.length) return false;
  }
  if(polylineTool()&&id!==tool&&segments.length) finishPolyline();
  closeToolPopups();
  constraintMode=null;
  modification=null;clipboardRelations.clear();
  if(rasterMode) setRasterMode();
  const before=formalSelection.slice();
  const dimensionItems=id==='dimension'?selected():[];
  formalTargets=[];formalSelection=[];
  dimensionRefs=[];dimensionRound=null;
  dimensionSelectionPoint=null;
  selectedDimension=null;selectedConstraint=null;selectedOrigin=null;
  $('angleContext').hidden=true;
  tool=id;points=[];segments=[];draftAxes=[];draftRelations=[];draftConstruction=[];slotAxis=null;centerDraftSnap=null;arcTrack=null;marker=null;activeSnap=null;
  if(id==='polygon') applyToolDefaults(['sides']);
  if(id==='slot') applyToolDefaults(['overall']);
  if(id==='offset') applyToolDefaults(defaultOffsetFields);
  if(id==='dimension') applyToolDefaults(['linearDimensionMode']);
  if(id==='bezier'&&applyToolDefaults(['splineTension'])) splineTension=$('splineTension').valueAsNumber/100;
  if(id==='text'&&!textSelection) applyToolDefaults(defaultTextFields);
  knotFocus=null;
  if(id!=='select') {edgeFocus=null;wholeFocus=null;}
  if(polylineTool()) {
    polylineMethod=id==='tangentPoly'?'tangent':'classic';
    updateToolIcons();
    updateShortcutTitles();
  }
  for(const b of $('tools').children) b.classList.toggle('active',b.dataset.tool===tool||(polylineTool()&&b.dataset.tool==='poly'));
  $('toolName').textContent=I18n.t(definitions[id][1]);
  $('help').textContent=toolHint(id);
  $('hint').textContent=toolHint(id);
  $('point').hidden=['select','dimension','offset','text'].includes(id);
  $('offsetOptions').hidden=id!=='offset';
  $('dimensionOptions').hidden=id!=='dimension';
  if(id!=='text') {finishInlineText(true);textDraft=null;textPicking=null;}
  if(id!=='text'&&id!=='select') textSelection=null;
  if(id==='text') {selection.clear();segmentSelection.clear();}
  if(id==='dimension') {
    const [item]=dimensionItems;
    const seed=before.length?before:
      dimensionItems.length<=2&&dimensionItems.every(entity=>['point','circle','arc','line'].includes(entity.type))?
        dimensionItems.map(entity=>({id:entity.id,kind:entity.type==='point'?'point':'edge',index:0})):[];
    if(!seedDimension(seed)&&item&&(dimensionItems.length>1||!['point','line'].includes(item.type)&&
      !G.theoreticalPoints(item).some(p=>p.part===undefined))) {
      const center=selectionFrame(dimensionItems)?.center;
      if(center) dimensionSelectionPoint=identity({type:'point',p:[center],layer:activeLayer});
    }
  }
  $('sidesRow').hidden=id!=='polygon';
  $slot.hidden=id!=='slot';
  $('splineDefault').hidden=id!=='bezier';
  $('resetSplineTension').hidden=id!=='bezier';
  update();
  return true;
}
function toolHint(id) {
  if(id==='rect'&&rectangleMethod==='center') return I18n.t('Posez le centre du rectangle, puis un coin.');
  if(id==='arc'&&arcMethod==='three') return I18n.t('Posez les deux extrémités, puis cliquez sur un point de passage pour définir l’arc.');
  if(id==='tangentPoly') return I18n.t('Tracez un premier segment, puis maintenez ')+I18n.t(modifierLabels[gestureKeys.ctrlKey])+
    I18n.t(' pour poser un arc tangent. Relâchez pour revenir à un segment droit.');
  if(id==='poly') return I18n.t('Posez les points de la polyligne. ')+I18n.t(modifierLabels[gestureKeys.shiftKey])+I18n.t(' aligne par pas de 15°.');
  if(id==='slot') return I18n.t(definitions[id][3])+' '+I18n.t(modifierLabels[gestureKeys.shiftKey])+I18n.t(' aligne l’oblong par pas de 15°.');
  if(id==='select') return I18n.t('Glissez le groupe ou maintenez ')+I18n.t(modifierLabels[gestureKeys.ctrlKey])+I18n.t(' pour une retouche locale. ')+
    I18n.t(modifierLabels[gestureKeys.shiftKey])+I18n.t(' aligne par pas de 15°.');
  return I18n.t(definitions[id][3]);
}
let toolShortcutsCollapsed=false;
try {toolShortcutsCollapsed=localStorage.getItem('velocivector-tool-shortcuts-collapsed')==='true';} catch {}
$('toggleToolShortcuts').onclick=()=>{
  toolShortcutsCollapsed=!toolShortcutsCollapsed;
  try {localStorage.setItem('velocivector-tool-shortcuts-collapsed',String(toolShortcutsCollapsed));} catch {}
  updateToolShortcutHint();
};
function updateToolShortcutHint() {
  const rows=[];
  const bind=(id,label)=>{if(shortcuts[id]) rows.push([shortcutText(shortcuts[id]),label]);};
  const gesture=(id,label)=>rows.push([I18n.t(modifierLabels[gestureKeys[id]])+I18n.t(' + glisser'),label]);
  const metric=label=>{
    rows.push(['Tab',label+I18n.t(' à 1 mm')],[I18n.t('Maj + Tab'),label+I18n.t(' à 10 mm')]);
  };
  const transformModesHint=()=>{
    bind('transform:auto',I18n.t('Mode automatique'));
    bind('transform:move',I18n.t('Déplacement'));
    bind('transform:scale',I18n.t('Mise à l’échelle'));
    bind('transform:rotate',I18n.t('Rotation'));
  };
  if(rasterMode) {
    if(rasterMode==='rotate') {
      gesture('shiftKey',I18n.t('Rotation par pas de 15°'));
      gesture('ctrlKey',I18n.t('Rotation fine × ¼'));
    }
  } else if(constraintMode) {
    bind('constraint:'+constraintMode,I18n.t('Désactiver la contrainte'));
  } else if(modification) {
    if(!['scissors','fillet'].includes(modification.type)) bind('finish',I18n.t('Appliquer après validation des champs'));
    if(modification.transform) {
      const {type,auto}=modification;
      if(auto||type==='move') gesture('ctrlKey',I18n.t('Retouche locale'));
      if(auto||type==='move'||type==='rotate') gesture('shiftKey',I18n.t('Aligner par 15°'));
      if(auto||type==='move'||type==='scale') metric(I18n.t('Arrondir une dimension'));
      transformModesHint();
    } else if(modification.type==='scissors') {
      rows.push([I18n.t('Cliquer-glisser'),I18n.t('Couper plusieurs portions')]);
    }
  } else if(tool==='select') {
    gesture('ctrlKey',I18n.t('Retouche locale'));
    gesture('altKey',I18n.t('Édition directe du tracé'));
    gesture('shiftKey',I18n.t('Aligner par 15°'));
    rows.push([I18n.t(modifierLabels[gestureKeys.shiftKey])+I18n.t(' + clic'),I18n.t('Ajouter à la sélection')]);
    metric(I18n.t('Arrondir une dimension'));
    bind('selectLayer',I18n.t('Sélectionner le calque actif'));
    bind('remove',I18n.t('Supprimer la sélection'));
    bind('construction',I18n.t('Basculer le trait de construction'));
  } else if(tool==='dimension') {
    rows.push([I18n.t('Double-clic'),I18n.t('Modifier une cote posée')]);
  } else if(tool==='offset') {
    bind('finish',I18n.t('Appliquer le décalage'));
  } else {
    if(polylineTool()||tool==='bezier') bind('finish',I18n.t('Terminer le tracé'));
    if(tool==='tangentPoly') rows.push([I18n.t(modifierLabels[gestureKeys.ctrlKey]),I18n.t('Tracer un arc tangent')]);
    if(polylineTool()||tool==='slot') rows.push([I18n.t(modifierLabels[gestureKeys.shiftKey]),I18n.t('Aligner par 15°')]);
    const rounds=polylineTool()||['rect','circle','ellipse','slot'].includes(tool);
    if(rounds) metric(polylineTool()?I18n.t('Arrondir la longueur du segment'):I18n.t('Arrondir une dimension'));
    bind('cycleSnap',rounds&&shortcuts.cycleSnap==='Tab'?I18n.t('Cible suivante hors arrondi'):I18n.t('Choisir la cible d’aimantation suivante'));
    bind('suspendSnap',I18n.t('Suspendre l’aimantation'));
  }
  if(selection.size&&selected().length) for(const [distance,modifier] of nudgeSteps) {
    const bindings=Object.keys(nudgeDirections).map(key=>shortcuts['nudge:'+distance+':'+key]);
    const unchanged=Object.keys(nudgeDirections).every((key,i)=>bindings[i]===modifier+key);
    const keys=unchanged?(modifier?shortcutText(modifier.slice(0,-1))+' + ':'')+'← → ↑ ↓'
      :bindings.filter(Boolean).map(shortcutText).join(' / ');
    if(keys) rows.push([keys,nudgeLabel(distance)]);
  }
  bind('exit',tool==='select'&&!modification&&!constraintMode&&!rasterMode?I18n.t('Désélectionner'):I18n.t('Quitter l’outil'));
  const list=$('toolShortcuts');
  list.replaceChildren(...rows.map(([key,label])=>{
    const line=document.createElement('li'), kbd=document.createElement('kbd'), text=document.createElement('span');
    kbd.textContent=key;text.textContent=label;
    line.append(kbd,text);
    return line;
  }));
  list.hidden=toolShortcutsCollapsed||!rows.length;
  const toggle=$('toggleToolShortcuts');
  const label=toolShortcutsCollapsed?I18n.t('Afficher les raccourcis'):I18n.t('Masquer les raccourcis');
  toggle.title=I18n.t('help.shortcutPanel.title')+' · '+label;
  toggle.setAttribute('aria-label',toggle.title);
  $('toolShortcutPanel').setAttribute('aria-label',I18n.t('help.shortcutPanel.title'));
  toggle.setAttribute('aria-expanded',String(!list.hidden));
}
function exitTool() {
  if(drag) cancelDrag();
  if(polylineTool()) finishPolyline();
  if(tool==='bezier') finishBezier();
  points=[];
  choose('select');
}
function constructionTargets() {
  if(tool!=='select'||constraintMode||selectedConstraint||selectedDimension||modification&&!modification.protected) return [];
  const items=selected();
  return items.flatMap(entity=>[...(segmentSelection.get(entity.id)??[undefined])].map(index=>({entity,index})));
}
function updateConstructionOptions() {
  const drawing=drawingUsesConstruction(), targets=constructionTargets();
  const toggle=$('constructionToggle');
  const active=drawing?drawConstruction:targets.length>0&&targets.every(({entity,index})=>
    index===undefined?!G.hasRegularStroke(entity):Boolean(G.constructionAt(entity,index)));
  toggle.disabled=!drawing&&!targets.length;
  toggle.classList.toggle('active',active);
  toggle.setAttribute('aria-pressed',String(active));
  toggle.title=tool==='select'?I18n.t('Basculer (')+shortcutText(shortcuts.construction)+')':I18n.t('Utiliser un trait de construction');
  toggle.setAttribute('aria-label',tool==='select'&&targets.some(t=>t.index!==undefined)?
    I18n.t('Segment de construction'):I18n.t('Trait de construction'));
  const styles=new Set(targets.flatMap(({entity,index})=>{
    if(index!==undefined||!entity.constructionParts) return [G.constructionAt(entity,index)].filter(Boolean);
    return G.strokeParts(entity).map((_,i)=>G.constructionAt(entity,i)).filter(Boolean);
  }));
  const selectedStyle=styles.size===1?[...styles][0]:null;
  $('constructionStyle').value=!drawing&&constructionChoices.has(selectedStyle)?selectedStyle:constructionStyle;
  $('constructionOpacity').value=constructionOpacity;
  $('constructionOpacityValue').textContent=constructionOpacity+' %';
}
function toggleConstruction() {
  if(drawingUsesConstruction()) {
    drawConstruction=!drawConstruction;
    updateConstructionOptions();
    requestDraw();
    return;
  }
  const targets=constructionTargets();
  if(!targets.length) return;
  const style=targets.every(({entity,index})=>
    index===undefined?!G.hasRegularStroke(entity):Boolean(G.constructionAt(entity,index)))?null:constructionStyle;
  const changes=new Map();
  for(const {entity,index} of targets) changes.set(entity.id,G.withConstruction(changes.get(entity.id)??entity,style,index));
  commit(d=>({...d,entities:d.entities.map(e=>changes.get(e.id)??e)}),false,false,true);
  message(style?I18n.t('Trait de construction activé.'):I18n.t('Trait normal rétabli.'));
}
function restyleConstruction(style) {
  if(!constructionChoices.has(style)) return;
  constructionStyle=style;
  saveConstructionPreferences();
  const changes=new Map();
  for(const {entity,index} of constructionTargets()) {
    let next=changes.get(entity.id)??entity;
    const restyle=i=>{
      const old=G.constructionAt(entity,i);
      if(old&&old!==style) next=G.withConstruction(next,style,i);
    };
    if(index===undefined&&entity.constructionParts) G.strokeParts(entity).forEach((_,i)=>restyle(i));
    else restyle(index);
    if(next!==entity) changes.set(entity.id,next);
  }
  if(changes.size) commit(d=>({...d,entities:d.entities.map(e=>changes.get(e.id)??e)}),false,false,true);
  else requestDraw();
}
function segmentAt(entity,position) {
  if(!entity) return null;
  let best=null, distance=7/camera.scale;
  for(const [i,part] of G.strokeParts(entity).entries()) {
    if(!constructionShown(entity.layer)&&G.constructionAt(entity,i)) continue;
    const trace=G.trace(part,camera.scale);
    for(let j=1;j<trace.length;j++) {
      const gap=G.dist(position,G.nearest(trace[j-1],trace[j],position));
      if(gap<distance) {best=i;distance=gap;}
    }
  }
  return best;
}
function selectSegment(entity,position,mod={}) {
  if(entity?.vectorGroup) {pick([entity.id],mod);return;}
  const index=segmentAt(entity,position);
  if(index===null) {
    if(!mod.shiftKey&&!mod.ctrlKey) segmentSelection.clear();
    return;
  }
  if(wholeFocus===entity.id&&!mod.shiftKey&&!mod.ctrlKey) return;
  const previous=segmentSelection.get(entity.id);
  if(mod.ctrlKey) {
    if(!previous) return;
    previous.delete(index);
    if(!previous.size) {segmentSelection.delete(entity.id);selection.delete(entity.id);}
    return;
  }
  selectedDimension=null;selectedConstraint=null;
  if(!mod.shiftKey) {
    segmentSelection.clear();
    clipboardRelations.clear();
    edgeFocus=null;
    if(knotFocus?.id!==entity.id) knotFocus=null;
    selection=new Set([entity.id]);
  }
  const indices=segmentSelection.get(entity.id)??new Set();
  indices.add(index);
  segmentSelection.set(entity.id,indices);
  selection.add(entity.id);
}
const layerGray=['#ffffff','#bdbdbd','#858585','#565656','#303030','#000000'];
const layerHues=['Rouge','Orange','Jaune','Vert','Bleu','Violet'];
const layerColors=[
  ['#df3434','#dd701f','#c7a915','#42a34f','#3482d2','#9052c4'],
  ['#c3262d','#be5816','#aa8b10','#318d44','#246dbc','#7841ab'],
  ['#a52128','#a04912','#8d7210','#26723a','#205a9f','#64358f'],
  ['#891d23','#853d13','#755c10','#205d32','#194b84','#542f76'],
  ['#701921','#6e3111','#5d4b10','#194b29','#143b69','#47275e']
];
const layerSequence=layerColors.flat().concat(layerGray.slice(0,-1));
const nextLayerColor=()=>layerSequence[(doc.layers.length-1)%layerSequence.length];
function openLayerPalette(layer,button) {
  const menu=$('layerPalette'), box=button.getBoundingClientRect(), shades=$('layerSwatches');
  shades.replaceChildren();
  const names=[I18n.t('Blanc'),I18n.t('Gris clair'),I18n.t('Gris'),I18n.t('Gris foncé'),I18n.t('Anthracite'),I18n.t('Noir')];
  for(const [row,colors] of [layerGray,...layerColors].entries()) for(const [i,color] of colors.entries()) {
    const swatch=document.createElement('button');
    swatch.type='button';swatch.style.setProperty('--layer-swatch',color);
    swatch.title=row?I18n.t(layerHues[i])+I18n.t(' · nuance ')+row:names[i];
    swatch.setAttribute('aria-label',swatch.title);
    swatch.setAttribute('aria-pressed',String(layer.color===color));
    swatch.onclick=()=>{menu.hidden=true;editLayer(layer.name,{color});};
    shades.append(swatch);
  }
  const custom=$('layerCustomColor');
  custom.value=layer.color;
  custom.onchange=()=>{menu.hidden=true;editLayer(layer.name,{color:custom.value});};
  menu.hidden=false;
  menu.style.left=Math.max(0,Math.min(box.left,window.innerWidth-menu.offsetWidth))+'px';
  menu.style.top=Math.max(0,Math.min(box.bottom+4,window.innerHeight-menu.offsetHeight))+'px';
  shades.querySelector('button')?.focus();
}
const rasterDefaults=Object.freeze({angle:0,scale:1,activeOpacity:80,inactiveOpacity:35});
const rasterImages=new Map();
let renderedLayers=null, rasterOptionsLayer=null, rasterMode=null, rasterAnchor=null, rasterProbe=null, rasterRotation=null, rasterCalibration=null;
const rasterButtons={calibrate:'calibrateRaster',rotate:'rotateRaster',origin:'alignRasterOrigin'};
const activeRasterLayer=()=>doc.layers.find(layer=>layer.name===activeLayer&&layer.raster);
function setRasterMode(mode=null) {
  const pointer=rasterRotation?.pointer;
  rasterMode=mode;rasterAnchor=null;rasterProbe=null;rasterRotation=null;
  if(pointer!==undefined&&canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
  for(const [id,button] of Object.entries(rasterButtons)) {
    $(button).classList.toggle('active',id===mode);
    $(button).setAttribute('aria-pressed',String(id===mode));
  }
  if(mode) $('hint').textContent=rasterHint();
  requestDraw();
}
function rasterHint() {
  if(rasterMode==='rotate') return I18n.t('Cliquez sur l’image pour choisir le pivot. Glissez horizontalement pour tourner et verticalement pour ajuster la précision.');
  if(rasterMode==='origin') return I18n.t('Cliquez sur le point de l’image à placer au POA.');
  return rasterAnchor?I18n.t('Posez le deuxième point de la distance de référence.'):I18n.t('Posez le premier point de la distance de référence.');
}
for(const [mode,id] of Object.entries(rasterButtons)) $(id).onclick=()=>{
  const layer=activeRasterLayer();
  if(!layer?.visible) {message(I18n.t('Affichez le calque d’image avant de le modifier.'));return;}
  if(rasterMode===mode) {setRasterMode();update();return;}
  if(!choose('select')) return;
  setRasterMode(mode);
  updateToolShortcutHint();
};
function rasterPointerDown(event) {
  const layer=activeRasterLayer(), position=mouse(event), point=world(position);
  if(!layer?.visible) return;
  const image=rasterPlacement(layer.raster)??layer.raster;
  if(!Formats.rasterContains(image,point)) {message(I18n.t('Cliquez à l’intérieur de l’image.'));return;}
  event.preventDefault();
  if(rasterMode==='rotate') {
    rasterRotation={layer,image,pivot:point,start:position,last:position,pointer:event.pointerId,raw:0,degrees:0};
    canvas.setPointerCapture(event.pointerId);
    requestDraw();
  } else if(rasterMode==='origin') {
    const placement={...image,center:G.add(image.center,G.sub(absoluteOrigin.target,point))};
    setRasterMode();
    if(applyRasterTransform(layer,placement)) message(I18n.t('Image calée sur le POA.'));
    else update();
  } else if(!rasterAnchor) {
    rasterProbe=rasterAnchor=point;
    $('hint').textContent=rasterHint();
    requestDraw();
  } else {
    const distance=G.dist(rasterAnchor,point);
    if(distance<=G.eps) {message(I18n.t('Choisissez deux points distincts sur l’image.'));return;}
    rasterProbe=point;
    rasterCalibration={layer,image,distance,pivot:rasterAnchor};
    const field=$('calibrateRasterDistance');
    field.value=String(distance);
    $('calibrateRasterUnit').textContent=I18n.t(Formats.units[doc.units]);
    $('calibrateRasterDialog').showModal();
    field.select();
    requestDraw();
  }
}
function updateRasterRotation(event,position) {
  const turn=rasterRotation;
  if(!turn) return;
  const mod=pointerModifiers(event);
  if(position) {
    const lever=Math.max(25,Math.abs((turn.last[1]+position[1])/2-turn.start[1]));
    turn.raw-=(position[0]-turn.last[0])*180/(Math.PI*lever*(mod.ctrlKey?4:1));
    turn.last=position;
  }
  turn.degrees=mod.shiftKey?Math.round(turn.raw/15)*15:turn.raw;
  requestDraw();
}
function applyRasterTransform(layer,image) {
  if(!doc.layers.includes(layer)) return false;
  if(!Formats.validRasterPlacement(image)) {message(I18n.t('Réglages de l’image hors limites.'));return false;}
  editLayer(layer.name,{raster:image});
  return true;
}
$('calibrateRasterForm').onsubmit=event=>{
  event.preventDefault();
  const field=$('calibrateRasterDistance'), target=field.valueAsNumber;
  if(!rasterCalibration) return;
  if(!(target>0)) {
    field.setCustomValidity(I18n.t('Saisissez une distance strictement positive.'));
    field.reportValidity();
    return;
  }
  const {layer,image,pivot,distance}=rasterCalibration;
  if(!applyRasterTransform(layer,Formats.transformRaster(image,pivot,target/distance))) return;
  $('calibrateRasterDialog').close();
  message(I18n.t('Échelle de l’image calibrée.'));
};
$('cancelCalibrateRaster').onclick=()=>$('calibrateRasterDialog').close();
$('calibrateRasterDialog').addEventListener('close',()=>{
  rasterCalibration=null;setRasterMode();update();
});
function drawRasterGuide(ink) {
  if(!rasterAnchor&&!rasterRotation) return;
  const start=screen(rasterAnchor??rasterRotation.pivot);
  const end=rasterRotation?rasterRotation.last:screen(rasterProbe??rasterAnchor);
  const value=rasterRotation?num(rasterRotation.degrees)+'°':
    num(G.dist(rasterAnchor,rasterProbe??rasterAnchor))+(doc.units?' '+I18n.t(Formats.units[doc.units]):'');
  context.save();
  stroke([start,end],ink.point,1.5,[4,3]);
  for(const [x,y] of [start,end]) {
    stroke([[x-4,y],[x+4,y]],ink.point,1.5);
    stroke([[x,y-4],[x,y+4]],ink.point,1.5);
  }
  context.font='12px system-ui';
  const label=G.mid(start,end), width=context.measureText(value).width;
  context.fillStyle=ink.base;
  context.fillRect(label[0]-width/2-4,label[1]-20,width+8,17);
  context.fillStyle=ink.point;context.textAlign='center';
  context.fillText(value,label[0],label[1]-7);
  context.restore();
}
function updateRasterOptions(layer) {
  $('rasterOptions').hidden=!layer?.raster;
  $('activeOriginRow').hidden=Boolean(layer?.raster);
  if(rasterOptionsLayer===layer) return;
  if(rasterMode&&(!layer?.visible||rasterOptionsLayer?.name!==layer.name)) setRasterMode();
  rasterOptionsLayer=layer;
  if(!layer?.raster) return;
  const {angle,scale,activeOpacity,inactiveOpacity}=layer.raster;
  $('rasterAngle').value=angle;
  $('rasterScale').value=Number((scale*100).toPrecision(12));
  $('rasterActiveOpacity').value=activeOpacity;
  $('rasterInactiveOpacity').value=inactiveOpacity;
  updateRasterOpacityLabels();
}
function updateRasterOpacityLabels() {
  $('rasterActiveValue').value=$('rasterActiveOpacity').value+' %';
  $('rasterInactiveValue').value=$('rasterInactiveOpacity').value+' %';
}
function rasterPlacement(image) {
  const angle=$('rasterAngle'), scale=$('rasterScale');
  const ratio=scale.value.trim()?scale.valueAsNumber/100:0;
  const placement={...image,angle:angle.value.trim()?angle.valueAsNumber:0,scale:ratio===0?image.scale:ratio,
    activeOpacity:$('rasterActiveOpacity').valueAsNumber,inactiveOpacity:$('rasterInactiveOpacity').valueAsNumber};
  return Formats.validRasterPlacement(placement)?placement:null;
}
function drawRasterLayers() {
  const current=new Set(doc.layers.flatMap(layer=>layer.raster?[Formats.rasterSource(layer.raster)]:[]));
  for(const png of rasterImages.keys()) if(!current.has(png)) rasterImages.delete(png);
  // The first image layer in the list is the closest to the vector drawing.
  for(let i=doc.layers.length-1;i>=0;i--) {
    const {name,raster,visible}=doc.layers[i];
    if(!raster||!visible) continue;
    const active=name===activeLayer;
    const turn=rasterRotation?.layer.name===name?rasterRotation:null;
    const placement=turn?Formats.transformRaster(turn.image,turn.pivot,1,turn.degrees):
      active?rasterPlacement(raster)??raster:raster;
    const opacity=(active?placement.activeOpacity:placement.inactiveOpacity)/100;
    if(!opacity) continue;
    const source=Formats.rasterSource(raster);
    let bitmap=rasterImages.get(source);
    if(!bitmap) {
      bitmap=new Image();
      rasterImages.set(source,bitmap);
      bitmap.onload=requestDraw;
      bitmap.onerror=()=>message(I18n.t('Le projet contient une image illisible.'));
      bitmap.src=source;
    }
    if(!bitmap.complete||!bitmap.naturalWidth) continue;
    const [x,y]=screen(placement.center), pixel=placement.pixelSize*placement.scale*camera.scale;
    const width=raster.width*pixel, height=raster.height*pixel;
    context.save();
    context.globalAlpha=opacity;
    context.translate(x,y);
    context.rotate(-placement.angle*Math.PI/180);
    context.drawImage(bitmap,-width/2,-height/2,width,height);
    context.restore();
  }
}
for(const id of ['rasterAngle','rasterScale']) $(id).addEventListener('blur',event=>{
  if(!event.target.value.trim()) event.target.value='0';
});
$('rasterOptions').oninput=()=>{
  updateRasterOpacityLabels();
  requestDraw();
};
$('rasterOptions').addEventListener('keydown',event=>{
  if(event.key==='Enter') event.stopPropagation();
});
$('rasterOptions').onsubmit=event=>{
  event.preventDefault();
  const layer=doc.layers.find(item=>item.name===activeLayer&&item.raster);
  if(!layer) return;
  for(const id of ['rasterAngle','rasterScale']) if(!$(id).value.trim()) $(id).value='0';
  const raster=rasterPlacement(layer.raster);
  if(!raster) {message(I18n.t('Réglages de l’image hors limites.'));return;}
  if(Object.keys(rasterDefaults).every(key=>raster[key]===layer.raster[key])) return;
  editLayer(layer.name,{raster});
  message(I18n.t('Réglages de l’image appliqués.'));
};
$('resetRasterOptions').onclick=()=>{
  const layer=doc.layers.find(item=>item.name===activeLayer&&item.raster);
  if(layer) editLayer(layer.name,{raster:{...layer.raster,...rasterDefaults}});
};

function drawLayers() {
  updateRasterOptions(doc.layers.find(layer=>layer.name===activeLayer));
  const selector=$('activeOrigin'), current=workingOrigin(), label=tool==='origin'?'POA':current.name;
  selector.replaceChildren(...layerOrigins(activeLayer).map(({name,target})=>
    new Option(name+' · '+target.map(num).join(' / '),name)));
  selector.value=current.name;
  $('coordinateX').textContent='X ('+label+')';
  $('coordinateY').textContent='Y ('+label+')';
  if(cursorPoint) showCoordinates(hover??world(cursorPoint));
  const list=$('layers');
  if(renderedLayers===doc.layers) {
    for(const row of list.children) row.querySelector('.layer-name').classList.toggle('active',row.dataset.layer===activeLayer);
    return;
  }
  renderedLayers=doc.layers;
  list.replaceChildren();
  let dragged=null, target=null, after=false;
  const clearTarget=()=>{
    target?.classList.remove('layer-drop-before','layer-drop-after');
    target=null;
  };
  const locateTarget=y=>{
    clearTarget();
    const rows=[...list.children];
    target=rows.find(row=>y<row.getBoundingClientRect().bottom)??rows.at(-1);
    const box=target.getBoundingClientRect();
    after=y>box.top+box.height/2;
  };
  list.ondragover=event=>{
    if(!dragged) return;
    event.preventDefault();
    event.dataTransfer.dropEffect='move';
    locateTarget(event.clientY);
    if(target!==dragged) target.classList.add(after?'layer-drop-after':'layer-drop-before');
  };
  list.ondragleave=event=>{
    if(!list.contains(event.relatedTarget)) clearTarget();
  };
  list.ondrop=event=>{
    if(!dragged) return;
    event.preventDefault();
    locateTarget(event.clientY);
    const name=dragged.dataset.layer, destination=target.dataset.layer;
    dragged.classList.remove('layer-dragging');
    dragged=null;
    clearTarget();
    if(name===destination) return;
    commit(d=>{
      const layers=d.layers.filter(layer=>layer.name!==name);
      const index=layers.findIndex(layer=>layer.name===destination)+(after?1:0);
      layers.splice(index,0,d.layers.find(layer=>layer.name===name));
      return layers.every((layer,i)=>layer===d.layers[i])?d:{...d,layers};
    });
    [...list.children].find(row=>row.dataset.layer===name)?.querySelector('.layer-grip')?.focus();
  };
  for(const l of doc.layers) {
    const row=document.createElement('div');row.className='layer';row.dataset.layer=l.name;
    const grip=document.createElement('button');grip.type='button';
    grip.className='layer-grip';grip.textContent='||';grip.title=I18n.t('Glisser pour réordonner · Suppr pour retirer le calque');
    grip.setAttribute('aria-label',I18n.t('Poignée du calque ')+l.name);
    grip.draggable=doc.layers.length>1;
    grip.onclick=()=>grip.focus();
    grip.ondragstart=event=>{
      grip.focus();
      dragged=row;
      row.classList.add('layer-dragging');
      event.dataTransfer.effectAllowed='move';
      event.dataTransfer.setData('text/plain',l.name);
    };
    grip.ondragend=()=>{
      row.classList.remove('layer-dragging');
      dragged=null;
      clearTarget();
    };
    const name=document.createElement('button');name.className='layer-name';name.textContent=l.name;name.title=l.name;
    name.classList.toggle('active',activeLayer===l.name);
    if(l.raster) {
      const icon=document.createElement('span');
      icon.className='raster-layer-icon';icon.textContent='▧';icon.setAttribute('aria-hidden','true');
      name.prepend(icon);name.title=l.name+' · '+I18n.t('Image matricielle');
    }
    name.onclick=()=>{
      if(activeLayer===l.name) return;
      const fields=captureCoordinateFields();
      activeLayer=l.name;selectedDimension=null;selectedConstraint=null;selectedOrigin=null;
      formalSelection=[];formalTargets=[];dimensionRefs=[];dimensionRound=null;
      restoreCoordinateFields(fields);
      update();
    };
    name.ondblclick=()=>openRenameLayer(l.name);
    const color=document.createElement('button');color.type='button';color.className='layer-color';
    color.style.setProperty('--layer-swatch',l.color);
    color.title=I18n.t('Couleur du calque ')+l.name;color.setAttribute('aria-label',color.title);
    color.onclick=()=>openLayerPalette(l,color);
    const eye=document.createElement('button');eye.textContent=l.visible?'◉':'○';eye.title=l.visible?I18n.t('Masquer le calque'):I18n.t('Afficher le calque');
    eye.onclick=()=>editLayer(l.name,{visible:!l.visible});
    const construction=document.createElement('button'), shown=l.constructionVisible!==false;
    construction.type='button';construction.textContent=shown?'┄':'┄̸';
    construction.classList.toggle('active',shown);
    construction.title=(shown?I18n.t('Masquer'):I18n.t('Afficher'))+I18n.t(' les traits de construction de ')+l.name;
    construction.setAttribute('aria-label',construction.title);
    construction.setAttribute('aria-pressed',String(shown));
    construction.onclick=()=>editLayer(l.name,{constructionVisible:!shown});
    if(l.raster) row.append(grip,name,eye);
    else row.append(grip,name,color,eye,construction);
    list.append(row);
  }
}
const layerRenames=new WeakMap();
function openRenameLayer(name) {
  const dialog=$('renameLayerDialog'), input=$('renameLayerName');
  dialog.dataset.layer=name;
  input.value=name;
  input.setCustomValidity('');
  dialog.showModal();
  input.select();
}
$('renameLayerName').oninput=event=>event.target.setCustomValidity('');
$('cancelRenameLayer').onclick=()=>$('renameLayerDialog').close();
$('renameLayerForm').onsubmit=event=>{
  event.preventDefault();
  const dialog=$('renameLayerDialog'), input=$('renameLayerName');
  const previous=dialog.dataset.layer, name=input.value.trim();
  if(!name||/[\r\n]/.test(name)||doc.layers.some(layer=>layer.name!==previous&&layer.name.toUpperCase()===name.toUpperCase())) {
    input.setCustomValidity(I18n.t('Saisissez un nom de calque différent des noms existants.'));
    input.reportValidity();
    return;
  }
  dialog.close();
  if(name===previous||!doc.layers.some(layer=>layer.name===previous)) return;
  const fields=captureCoordinateFields();
  const rename=item=>item.layer===previous?{...item,layer:name}:item;
  if(activeLayer===previous) activeLayer=name;
  if(selectedOrigin?.layer===previous) selectedOrigin={...selectedOrigin,layer:name};
  if(dimensionSelectionPoint?.layer===previous) dimensionSelectionPoint=rename(dimensionSelectionPoint);
  if(rasterMode) setRasterMode();
  if(textDraft?.layer===previous) textDraft={...textDraft,layer:name};
  commit(d=>({...d,layers:d.layers.map(layer=>layer.name===previous?{...layer,name}:layer),
    entities:d.entities.map(rename),...(d.texts?{texts:d.texts.map(rename)}:{}),constraints:(d.constraints??[]).map(rename)}),false,false,true);
  layerRenames.set(doc,{previous,name});
  restoreCoordinateFields(fields);
  message(I18n.t('Calque renommé en « {name} ».',{name}));
};
function askRemoveLayer(name) {
  const destinations=doc.layers.filter(layer=>layer.name!==name&&!layer.raster);
  if(!destinations.length) {message(I18n.t('Le dessin doit conserver au moins un calque vectoriel.'));return;}
  const count=doc.entities.filter(entity=>entity.layer===name).length+(doc.texts??[]).filter(text=>text.layer===name).length;
  if(!count) {removeLayer(name);return;}
  const dialog=$('removeLayerDialog');
  dialog.dataset.layer=name;
  $('removeLayerTitle').textContent=I18n.t('Supprimer le calque « {name} »',{name});
  $('removeLayerCount').textContent=I18n.t('{count} tracé(s) sur ce calque.',{count});
  $('removeLayerDestination').replaceChildren(...destinations.map(layer=>new Option(layer.name,layer.name)));
  dialog.showModal();
}
function removeLayer(name,destination) {
  const source=doc.layers.find(layer=>layer.name===name);
  const remaining=doc.layers.filter(layer=>layer.name!==name);
  if(!source||!remaining.some(layer=>!layer.raster)||destination&&!remaining.some(layer=>!layer.raster&&layer.name===destination)) return;
  const before=doc.entities;
  const removed=new Set(before.filter(entity=>entity.layer===name).map(entity=>entity.id));
  const entities=destination?before.map(entity=>removed.has(entity.id)?{...entity,layer:destination}:entity):
    before.filter(entity=>!removed.has(entity.id));
  const layers=destination&&source.origins?.length?remaining.map(layer=>layer.name===destination?
    {...layer,origins:[...(layer.origins??[]),...source.origins]}:layer):remaining;
  const lost=[];
  const constraints=(doc.constraints??[]).flatMap(constraint=>{
    if(!destination&&(constraint.layer===name||constraint.refs.some(ref=>removed.has(ref.id)))) {
      lost.push(constraint);
      return [];
    }
    return [constraint.layer===name?{...constraint,layer:destination}:constraint];
  });
  const fields=captureCoordinateFields();
  if(activeLayer===name) {
    activeLayer=destination??remaining.find(layer=>!layer.raster&&layer.visible)?.name??remaining.find(layer=>!layer.raster).name;
    selectedOrigin=null;
  }
  if(!destination) {
    for(const id of removed) {selection.delete(id);segmentSelection.delete(id);}
    formalSelection=[];formalTargets=[];dimensionRefs=[];dimensionRound=null;
  }
  if(textDraft?.layer===name) {textDraft=null;textPicking=null;}
  const texts=(doc.texts??[]).flatMap(text=>text.layer===name?destination?[{...text,layer:destination}]:[]:[text]);
  commit(d=>({...d,layers,entities,constraints,...(d.texts?{texts}:{})}),false,false,true);
  restoreCoordinateFields(fields);
  animateRemoval(lost,before);
  message(I18n.t('Calque « {name} » supprimé.',{name}));
}
$('removeLayerTraces').onclick=()=>{
  const dialog=$('removeLayerDialog');
  dialog.close();
  removeLayer(dialog.dataset.layer);
};
$('moveLayerTraces').onclick=()=>{
  const dialog=$('removeLayerDialog'), destination=$('removeLayerDestination').value;
  if(!destination) return;
  dialog.close();
  removeLayer(dialog.dataset.layer,destination);
};
$('cancelRemoveLayer').onclick=()=>$('removeLayerDialog').close();
function editLayer(name,values) {
  commit(d=>({...d,layers:d.layers.map(l=>l.name===name?{...l,...values}:l)}));
}

function stroke(p,color,width=1,dashes=[]) {
  if(p.length<2) return;
  context.beginPath();context.moveTo(...p[0]);
  for(const v of p.slice(1)) context.lineTo(...v);
  context.strokeStyle=color;context.lineWidth=width;context.setLineDash(dashes);context.stroke();
}
function drawEntity(e,color,width,showConstruction=true) {
  const parts=e.constructionParts?G.strokeParts(e):[];
  if(parts.length) {
    for(const [i,part] of parts.entries()) drawEntity(G.withConstruction(part,G.constructionAt(e,i)),color,width,showConstruction);
    return;
  }
  const style=e.construction;
  if(style&&!showConstruction) return;
  if(!style) {paintEntity(e,color,width,[]);return;}
  context.save();
  context.globalAlpha*=constructionOpacity/100;
  paintEntity(e,color,width,G.constructionStyles[style].pattern);
  context.restore();
}
function paintEntity(e,color,width,dashes) {
  if(e.type==='point') {
    const [x,y]=screen(e.p[0]);
    stroke([[x-4,y],[x+4,y]],color,width);
    stroke([[x,y-4],[x,y+4]],color,width);
    return;
  }
  if(e.type==='spline') {
    for(const span of G.splineSpans(e)) paintEntity(span,color,width,dashes);
    return;
  }
  if(e.type==='path') {
    for(const part of e.segments) paintEntity(part,color,width,dashes);
    return;
  }
  const to=screen;
  context.beginPath();
  context.strokeStyle=color;context.lineWidth=width;context.setLineDash(dashes);
  if(e.type==='bezier') {
    context.moveTo(...to(e.p[0]));
    context.bezierCurveTo(...to(e.p[1]),...to(e.p[2]),...to(e.p[3]));
  } else if(e.type==='circle' || e.type==='arc') {
    const a=e.a||0,s=e.s??G.tau;
    context.arc(...to(e.c),e.r*camera.scale,-a,-a-s,s>0);
  } else if(e.type==='ellipse') {
    const t=e.t??0,s=e.s??G.tau;
    context.ellipse(...to(e.c),e.r*camera.scale,e.ry*camera.scale,-e.a,-t,-t-s,s>0);
  } else {
    context.moveTo(...to(e.p[0]));
    for(const p of e.p.slice(1)) context.lineTo(...to(p));
    if(e.closed) context.closePath();
  }
  context.stroke();
}
function drawGeometryHover(ink,preview) {
  if(rasterMode) return;
  if(!cursorPoint||drag&&drag.kind!=='point') return;
  const ref=constraintTarget(world(cursorPoint));
  if(!ref||selection.has(ref.id)&&(!segmentSelection.has(ref.id)||ref.kind==='edge'&&segmentSelection.get(ref.id).has(ref.index))) return;
  const entity=doc.entities.find(e=>e.id===ref.id);
  if(!entity) return;
  if(ref.kind==='point') {
    // Centers and derived midpoints already have their own hover marker.
    if(Formal.isMidpointRef(ref)||Formal.theoreticalReferences(entity).some(p=>p.index===ref.index)) return;
    const point=Formal.resolve(new Map([[entity.id,entity]]),ref);
    if(!point) return;
    context.save();
    context.beginPath();
    context.setLineDash([]);
    context.arc(...screen(point),5.5,0,G.tau);
    context.strokeStyle=ink.hover;
    context.lineWidth=1.2;
    if(entity.type!=='point') {
      context.fillStyle=ink.base;
      context.fill();
    }
    context.stroke();
    context.restore();
  } else {
    const part=Formal.referenceEdges(entity)[ref.index];
    if(!part) return;
    context.save();
    context.globalAlpha=.65*(previewDimsPart(preview,entity.id,ref.index) ? .6 : 1);
    drawEntity(G.withConstruction(part,G.constructionAt(entity,ref.index)),ink.hover,1.75,constructionShown(entity.layer));
    context.restore();
  }
}
const cadTextFields={content:'cadTextContent',family:'cadTextFont',align:'cadTextAlign',height:'cadTextHeight',
  letter:'cadTextLetter',line:'cadTextLine',width:'cadTextWidth',angle:'cadTextAngle',pathMode:'cadTextPath',
  radius:'cadTextRadius',along:'cadTextAlong',offset:'cadTextOffset'};
const cadTextMeasure=document.createElement('canvas').getContext('2d');
const cadTextDefaults={content:'',family:'Arial',align:'left',height:5,letter:0,line:2,width:100,angle:0,
  pathMode:'straight',radius:0,along:0,offset:0};
let textDraft=null,textPicking=null,textSelection=null,inlineText=null,textCaretClick=false;
const cadInlineEditor=$('cadInlineEditor');
let cadFontChoices=[];
const cadLocalFonts=new Map(), cadFontLoads=new Map();
function prepareCadFont(family) {
  const entry=cadLocalFonts.get(family);
  if(!entry||typeof FontFace!=='function') return;
  if(!cadFontLoads.has(family)) {
    const load=(async()=>{
      try {
        const source=await entry.blob();
        const face=new FontFace(family,await source.arrayBuffer());
        document.fonts.add(await face.load());
        requestDraw();
      } catch {cadFontLoads.delete(family);}
    })();
    cadFontLoads.set(family,load);
  }
  return cadFontLoads.get(family);
}
const cadFontFamily=name=>TextGeometry.font(name).replace(/^\d+px /,'');
function syncCadFontChoice() {
  const name=$('cadTextFont').value.trim()||'Arial', current=$('cadFontCurrent');
  current.textContent=name;
  current.style.fontFamily=cadFontFamily(name);
  $('cadCustomFontRow').hidden=cadFontChoices.includes(name);
  for(const row of $('cadFontList').children) row.setAttribute('aria-pressed',String(row.dataset.font===name));
}
function showCadFonts(fonts) {
  cadFontChoices=[...new Set(fonts.filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  $('cadFontList').replaceChildren(...[...cadFontChoices,''].map(name=>{
    const button=document.createElement('button');
    button.type='button';button.dataset.font=name;
    button.textContent=name||I18n.t('Autre police…');
    if(name) button.style.fontFamily=cadFontFamily(name);
    button.onclick=()=>{
      if(name) {
        $('cadTextFont').value=name;
        syncCadFontChoice();
        prepareCadFont(name);
        if(textDraft?.id) applyCadText();else requestDraw();
      } else {
        $('cadFontMenu').open=false;
        $('cadCustomFontRow').hidden=false;
        $('cadTextFont').focus();
        $('cadTextFont').select();
      }
    };
    return button;
  }));
  syncCadFontChoice();
}
const cadFontStorageKey='velocivector-local-font-families';
function readSavedCadFonts() {
  try {
    const families=JSON.parse(localStorage.getItem(cadFontStorageKey)??'[]');
    return Array.isArray(families)?families.filter(name=>typeof name==='string'&&name.trim()&&name.length<=128):[];
  } catch {return [];}
}
function updateCadFontRefresh(hasLocalFonts) {
  const button=$('listCadFonts');
  const label=I18n.t(hasLocalFonts?'Actualiser les polices locales':'Lister les polices locales');
  button.title=label;
  button.setAttribute('aria-label',label);
}
function showCadFontCatalog(families) {
  showCadFonts([...TextGeometry.fonts,...families]);
  updateCadFontRefresh(Boolean(families.length));
}
showCadFontCatalog(readSavedCadFonts());
$('cadTextFont').onchange=()=>{syncCadFontChoice();if(textDraft?.id) applyCadText();};
$('listCadFonts').hidden=typeof window.queryLocalFonts!=='function';
$('listCadFonts').onclick=async()=>{
  const button=$('listCadFonts');
  button.disabled=true;
  try {
    const available=await window.queryLocalFonts();
    cadLocalFonts.clear();
    for(const item of available) if(item.family&&(!cadLocalFonts.has(item.family)||/^(regular|normal|book)$/i.test(item.style)))
      cadLocalFonts.set(item.family,item);
    const families=[...cadLocalFonts.keys()];
    prepareCadFont($('cadTextFont').value);
    try {localStorage.setItem(cadFontStorageKey,JSON.stringify(families));} catch {}
    showCadFontCatalog(families);
    $('cadFontStatus').value=I18n.t('{count} polices locales accessibles.',{count:families.length});
    $('cadFontMenu').open=true;
    $('cadFontMenu').querySelector('summary').focus();
  } catch {
    $('cadFontStatus').value=I18n.t('La liste des polices locales n’est pas accessible. Vous pouvez saisir le nom d’une police.');
  } finally {button.disabled=false;}
};
function updateTextPanel() {
  $('textOptions').hidden=tool!=='text';
  $('textPathOptions').hidden=$('cadTextPath').value==='straight';
  const linked=$('cadTextPath').value==='linked';
  $('pickCadTextPath').hidden=!linked;
  const curve=linked&&doc.entities.find(entity=>entity.id===textDraft?.pathId);
  $('cadTextRadius').disabled=Boolean(curve&&!['circle','arc'].includes(curve.type));
  $('pickCadTextPath').classList.toggle('active',textPicking==='path');
  $('moveCadText').disabled=!textDraft?.p;
  $('moveCadText').classList.toggle('active',textPicking==='move');
  $('deleteCadText').disabled=!textDraft?.id;
}
function cadTextValues() {
  const values={...textDraft};
  for(const [key,id] of Object.entries(cadTextFields)) {
    const field=$(id);
    values[key]=typeof cadTextDefaults[key]==='number'?field.valueAsNumber:field.value;
  }
  values.family=values.family.trim()||'Arial';
  values.reverse=$('cadTextReverse').checked;
  values.upright=$('cadTextOrientation').value==='upright';
  values.inside=$('cadTextSide').value==='inside';
  return {...values,fraction:values.fraction??0};
}
function cadTextValid(text) {
  return text.p?.every(q=>Number.isFinite(q)&&Math.abs(q)<=1e12)&&
    Object.keys(cadTextDefaults).filter(key=>typeof cadTextDefaults[key]==='number').every(key=>Number.isFinite(text[key])&&Math.abs(text[key])<=1e12)&&
    text.height>0&&text.width>0&&text.line>=0&&text.radius>=0;
}
function loadCadText(text) {
  textDraft={...text};
  textPicking=null;
  for(const [key,id] of Object.entries(cadTextFields)) $(id).value=text[key];
  syncCadFontChoice();
  prepareCadFont(text.family);
  textSelection=text.id;
  $('cadTextReverse').checked=text.reverse;
  $('cadTextOrientation').value=text.upright?'upright':'tangent';
  $('cadTextSide').value=text.inside?'inside':'outside';
  update();
}
function applyCadText() {
  const text=cadTextValues(), layer=textDraft?.id?textDraft.layer:activeLayer;
  if(!doc.layers.some(item=>item.name===layer&&item.visible&&!item.raster)) {
    message(I18n.t('Choisissez un calque vectoriel pour dessiner.'));return false;
  }
  if(!text.content.trim()||!cadTextValid(text)||text.pathMode==='arc'&&text.radius<=0) {
    message(I18n.t('Saisissez le texte et ses réglages, puis cliquez dans le dessin pour le placer.'));return false;
  }
  if(text.pathMode==='linked'&&!doc.entities.some(entity=>entity.id===text.pathId)) {
    textPicking='path';updateTextPanel();
    message(I18n.t('Cliquez sur la courbe qui doit supporter le texte.'));return false;
  }
  const items=doc.texts??[], id=text.id??items.reduce((max,item)=>Math.max(max,item.id),0)+1;
  const next={...text,id,layer};
  if(next.pathMode!=='linked') delete next.pathId;
  const original=items.find(item=>item.id===id);
  if(original&&Object.keys(next).length===Object.keys(original).length&&Object.entries(next).every(([key,value])=>
    key==='p'?G.dist(value,original.p)<=G.eps:value===original[key])) return true;
  commit(d=>({...d,texts:items.some(item=>item.id===id)?items.map(item=>item.id===id?next:item):[...items,next]}),false);
  textDraft=next;textSelection=id;textPicking=null;updateTextPanel();
  message(I18n.t('Texte appliqué.'));
  BrandPreview.onTextApplied(text.content,original?.content);
  return true;
}
function deleteCadText() {
  const id=textDraft?.id??textSelection;
  if(!id||!(doc.texts??[]).some(item=>item.id===id)) return;
  finishInlineText(false);
  textDraft=null;textPicking=null;textSelection=null;
  $('cadTextContent').value='';
  commit(d=>({...d,texts:(d.texts??[]).filter(item=>item.id!==id)}),false);
}
$('textOptions').onsubmit=event=>{event.preventDefault();applyCadText();};
$('textOptions').addEventListener('keydown',event=>{
  if(event.key==='Enter') event.stopPropagation();
});
$('textOptions').oninput=()=>{
  if($('cadTextPath').value==='arc'&&!$('cadTextRadius').valueAsNumber) $('cadTextRadius').value=30;
  if($('cadTextPath').value!=='linked'&&textPicking==='path') textPicking=null;
  updateTextPanel();requestDraw();
};
$('newCadText').onclick=()=>{
  textDraft=null;textPicking=null;$('cadTextContent').value='';applyToolDefaults(defaultTextFields);
  $('cadTextContent').focus();update();
};
$('pickCadTextPath').onclick=()=>{
  textPicking='path';updateTextPanel();message(I18n.t('Cliquez sur la courbe qui doit supporter le texte.'));
};
$('moveCadText').onclick=()=>{
  textPicking=$('cadTextPath').value==='linked'?'path':'move';updateTextPanel();
  message(I18n.t('Cliquez dans le dessin pour repositionner le texte.'));
};
$('deleteCadText').onclick=deleteCadText;
function refreshInlineCaret() {
  if(!inlineText) return;
  inlineText.visible=true;
  clearInterval(inlineText.timer);
  inlineText.timer=setInterval(()=>{
    if(!inlineText) return;
    inlineText.visible=!inlineText.visible;
    requestDraw();
  },530);
  requestDraw();
}
function startInlineText(position,caret) {
  if(!$('cadTextContent').value&&textDraft?.id) return;
  inlineText={position,original:$('cadTextContent').value,visible:true,timer:null};
  cadInlineEditor.value=inlineText.original;
  const [x,y]=screen(position);
  cadInlineEditor.style.left=x+'px';cadInlineEditor.style.top=y+'px';
  cadInlineEditor.hidden=false;
  cadInlineEditor.focus({preventScroll:true});
  const index=caret??cadInlineEditor.value.length;
  cadInlineEditor.setSelectionRange(index,index);
  refreshInlineCaret();
}
function finishInlineText(save) {
  if(!inlineText) return;
  const {original,timer}=inlineText;
  clearInterval(timer);
  inlineText=null;
  $('cadTextContent').value=save&&cadInlineEditor.value.trim()?cadInlineEditor.value:original;
  cadInlineEditor.hidden=true;
  if(save&&$('cadTextContent').value.trim()&&(!textDraft?.id||$('cadTextContent').value!==original)) applyCadText();
  requestDraw();
}
cadInlineEditor.oninput=()=>{
  $('cadTextContent').value=cadInlineEditor.value;
  refreshInlineCaret();
};
cadInlineEditor.onblur=()=>finishInlineText(true);
cadInlineEditor.onselect=refreshInlineCaret;
cadInlineEditor.onkeyup=refreshInlineCaret;
cadInlineEditor.onkeydown=event=>{
  event.stopPropagation();
  if(event.isComposing) return;
  if(event.key==='Escape'||event.key==='Enter'&&(event.ctrlKey||event.metaKey)) {
    event.preventDefault();finishInlineText(event.key==='Enter');
  }
};
function cadCaretAt(text,at) {
  const entities=new Map(doc.entities.map(entity=>[entity.id,entity])), p=world(at), carets=[];
  const glyphs=cadTextLayout(text,entities,carets);
  const character=glyphs.find(glyph=>cadGlyphContains(glyph,p,0));
  const inside=Boolean(character);
  let nearest=Infinity,result=null;
  for(const caret of carets) {
    const end=G.add(caret.q,G.polar([0,0],caret.height,caret.angle+Math.PI/2));
    const distance=G.dist(p,G.nearest(caret.q,end,p));
    if(distance<nearest) {nearest=distance;result={index:caret.index,distance,inside,character:character?.index};}
  }
  return result;
}
function positionCadCaret(at,anchor=null) {
  const caret=cadCaretAt(cadTextValues(),at);
  if(!caret) return;
  const start=anchor??caret.index,end=caret.index;
  cadInlineEditor.setSelectionRange(Math.min(start,end),Math.max(start,end),end<start?'backward':'forward');
  refreshInlineCaret();
}
function paintCadCaret(carets,ink) {
  const {selectionStart:start,selectionEnd:end,selectionDirection}=cadInlineEditor;
  const index=selectionDirection==='backward'?start:end;
  const caret=carets.find(item=>item.index===index)??carets.reduce((best,item)=>
    !best||Math.abs(item.index-index)<Math.abs(best.index-index)?item:best,null);
  if(!caret) return;
  const [x,y]=screen(caret.q);
  cadInlineEditor.style.left=x+'px';cadInlineEditor.style.top=y+'px';
  if(inlineText.visible) stroke([[x,y],screen(G.add(caret.q,G.polar([0,0],caret.height,caret.angle+Math.PI/2)))],ink.point,1.5);
}
function startCadTextDrag(event,start,text) {
  finishInlineText(true);
  text=(doc.texts??[]).find(item=>item.id===text.id)??text;
  selection.clear();segmentSelection.clear();selectedConstraint=null;selectedDimension=null;
  textSelection=text.id;
  drag={kind:'textMove',text,start,id:event.pointerId,preview:null};
  cursorPoint=start;canvas.setPointerCapture(event.pointerId);requestDraw();
}
function movedCadText(action,at) {
  const {text,start}=action, delta=G.sub(world(at),world(start));
  const p=G.add(text.p,delta);
  if(text.pathMode==='linked') {
    const entity=doc.entities.find(item=>item.id===text.pathId);
    const path=TextGeometry.course(entity,text.radius/Formats.millimeters[doc.units],32);
    if(path) {
      const anchor=path.at(path.length*text.fraction).q;
      return {...text,fraction:path.pick(G.add(anchor,delta))};
    }
  }
  return {...text,p};
}
function finishCadTextDrag(action,at,distance) {
  if(distance<=4) {
    if(tool==='text') loadCadText(action.text);
    else update();
    return;
  }
  const text=movedCadText(action,at);
  if(!cadTextValid(text)) return;
  if(textDraft?.id===text.id) textDraft=text;
  commit(d=>({...d,texts:(d.texts??[]).map(item=>item.id===text.id?text:item)}),false);
}
function clickCadText(at) {
  const p=world(at), linked=$('cadTextPath').value==='linked';
  if(textPicking==='path'||linked&&!textDraft?.pathId) {
    const entity=hit(p).find(item=>item.type!=='point');
    const path=TextGeometry.course(entity,0,32);
    if(!path) {message(I18n.t('Cliquez sur la courbe qui doit supporter le texte.'));return;}
    textDraft={...textDraft,p,pathId:entity.id,fraction:path.pick(p)};
  } else if(!textPicking) {
    const existing=textAt(at);
    if(existing) {loadCadText(existing);return;}
    if(textDraft?.id) {
      $('cadTextContent').value='';
      textSelection=null;textDraft=null;
    }
    textDraft={...textDraft,p};
  } else textDraft={...textDraft,p};
  textPicking=null;
  if($('cadTextContent').value.trim()) applyCadText();
  else {startInlineText(p);update();}
}
function cadTextLayout(text,entities,carets) {
  return TextGeometry.layout(text,entities,cadTextMeasure,Formats.millimeters[doc.units],carets);
}
function drawCadTexts(ink) {
  if(!doc.texts?.length&&tool!=='text') return;
  const entities=new Map(doc.entities.map(entity=>[entity.id,drag?.changes?.get(entity.id)??entity]));
  const moving=drag?.kind==='textMove'?drag.preview:null;
  const draft=tool==='text'?cadTextValues():null, texts=doc.texts??[];
  const show=(text,color,editing=false)=>{
    if(!cadTextValid(text)||!editing&&!text.content.trim()) return;
    const carets=editing?[]:undefined;
    context.save();context.font=TextGeometry.font(text.family);context.fillStyle=color;
    context.textAlign='left';context.textBaseline='alphabetic';
    for(const glyph of cadTextLayout(text,entities,carets)) {
      context.save();context.translate(...screen(glyph.q));context.rotate(-glyph.angle);
      context.scale(glyph.sx*camera.scale,glyph.sy*camera.scale);
      if(editing&&glyph.index>=cadInlineEditor.selectionStart&&glyph.index<cadInlineEditor.selectionEnd) {
        context.fillStyle=ink.point;context.globalAlpha=.28;
        context.fillRect(-glyph.half,-glyph.metrics.actualBoundingBoxAscent,glyph.metrics.width,
          glyph.metrics.actualBoundingBoxAscent+glyph.metrics.actualBoundingBoxDescent);
        context.globalAlpha=1;context.fillStyle=color;
      }
      context.fillText(glyph.value,-glyph.half,0);context.restore();
    }
    context.restore();
    if(editing) paintCadCaret(carets,ink);
  };
  for(const text of texts) {
    const layer=doc.layers.find(item=>item.name===text.layer);
    if(!layer?.visible||moving?.id===text.id||draft?.id===text.id&&cadTextValid(draft)&&(inlineText||draft.content.trim())) continue;
    show(text,textSelection===text.id?ink.selection:layer.color==='#000000'&&theme==='dark'?ink.defaultInk:layer.color);
  }
  if(moving) show(moving,ink.selection);
  else if(draft?.p) show(draft,ink.selection,Boolean(inlineText));
  else if(draft&&cursorPoint&&!textPicking&&draft.pathMode!=='linked'&&
    doc.layers.some(layer=>layer.name===activeLayer&&layer.visible&&!layer.raster))
    show({...draft,p:world(cursorPoint)},ink.preview);
}
function cadGlyphContains(glyph,p,margin) {
  const [x,y]=G.sub(p,glyph.q),c=Math.cos(glyph.angle),s=Math.sin(glyph.angle);
  const u=(x*c+y*s)/glyph.sx+glyph.half,v=(x*s-y*c)/glyph.sy,m=glyph.metrics;
  return u>=-m.actualBoundingBoxLeft-margin/glyph.sx&&u<=m.actualBoundingBoxRight+margin/glyph.sx&&
    v>=-m.actualBoundingBoxAscent-margin/glyph.sy&&v<=m.actualBoundingBoxDescent+margin/glyph.sy;
}
function textAt(at) {
  const p=world(at), entities=new Map(doc.entities.map(entity=>[entity.id,entity]));
  const margin=5/camera.scale;
  return (doc.texts??[]).findLast(text=>doc.layers.some(layer=>layer.name===text.layer&&layer.visible)&&
    cadTextLayout(text,entities).some(glyph=>cadGlyphContains(glyph,p,margin)));
}
function draw() {
  pending=false;
  updatePrecisionIcons();
  updateCanvasCursor();
  if(drag?.previewPoint) updateDragPreview(drag);
  const ink=palettes[theme];
  const [w,h]=viewport, origin=screen(absoluteOrigin.target), gridOrigin=screen(workingOrigin().target);
  context.clearRect(0,0,w,h);
  drawRasterLayers();
  let step=$('spacing').valueAsNumber*camera.scale;
  if($('grid').checked && step>0) {
    while(step<12) step*=10;
    for(let x=((gridOrigin[0]%step)+step)%step;x<w;x+=step) stroke([[x,0],[x,h]],ink.grid);
    for(let y=((gridOrigin[1]%step)+step)%step;y<h;y+=step) stroke([[0,y],[w,y]],ink.grid);
  }
  stroke([[0,origin[1]],[w,origin[1]]],ink.x);
  stroke([[origin[0],0],[origin[0],h]],ink.y);
  const active=workingOrigin();
  const origins=layerOrigins(activeLayer);
  if(pendingOrigin?.layer===activeLayer) origins.push(pendingOrigin);
  for(const {name,target} of origins) {
    const [x,y]=screen(target);
    if(x<0||x>w||y<0||y>h) continue;
    const chosen=selectedOrigin?.layer===activeLayer&&selectedOrigin.name===name;
    const hovered=cursorPoint&&!drag&&G.dist([x,y],cursorPoint)<=7;
    const color=name===active.name||chosen||pendingOrigin?.name===name?ink.point:hovered?ink.hover:ink.selection;
    drawKnotSquare([x,y],ink,chosen?6:hovered?5:4,color);
    context.fillStyle=color;context.font='11px system-ui';
    context.fillText(name,x+8,y+13);
  }
  const preview=modificationPreview();
  const colors=new Map(doc.layers.filter(l=>l.visible).map(l=>[l.name,l.color]));
  for(const e of doc.entities) {
    if(!colors.has(e.layer)||!visible(e)) continue;
    const picked=selection.has(e.id);
    const shown=drag?.changes?.get(e.id)??e;
    const layerInk=colors.get(e.layer);
    const partial=segmentSelection.get(e.id), whole=picked&&!partial;
    const color=whole?ink.selection:layerInk==='#cbd9eb'||layerInk==='#000000'&&theme==='dark'?ink.defaultInk:layerInk;
    const construction=constructionShown(e.layer), width=whole?2:1.25;
    const dimmed=preview.originals.get(e.id);
    if(dimmed instanceof Set&&G.strokeParts(shown).length) {
      G.strokeParts(shown).forEach((part,index)=>drawPreviewSource(G.withConstruction(part,G.constructionAt(shown,index)),
        color,width,construction,dimmed.has(index)));
    } else drawPreviewSource(shown,color,width,construction,Boolean(dimmed));
    if(shown.type==='spline' && whole && tool==='select') {
      for(const p of shown.p) if(visiblePoint(shown,p)) drawKnotSquare(screen(p),ink,3);
    }
    if(!picked) continue;
    if(partial) {
      const parts=G.strokeParts(shown);
      for(const i of partial) if(parts[i])
        drawPreviewSource(G.withConstruction(parts[i],G.constructionAt(shown,i)),ink.point,3,construction,previewDimsPart(preview,e.id,i));
    }
    if(tool!=='select') continue;
    Edit.edges(shown).forEach((part,i)=>{
      if(partial&&!partial.has(i)) return;
      if(!constructionShown(e.layer)&&G.constructionAt(shown,i)) return;
      const focused=edgeFocus?.id===e.id && edgeFocus.index===i;
      if(focused) drawPreviewSource(G.withConstruction(part,G.constructionAt(shown,i)),ink.selection,3,construction,previewDimsPart(preview,e.id,i));
      const [a,b]=Edit.ends(part);
      for(const [j,p] of [a,b].entries()) {
        const [x,y]=screen(p);
        context.fillStyle=focused && edgeFocus.anchorEnd===(j===0)?ink.point:ink.base;
        context.strokeStyle=ink.selection;context.lineWidth=1;
        context.fillRect(x-3,y-3,6,6);context.strokeRect(x-3,y-3,6,6);
      }
    });
  }
  drawCadTexts(ink);
  drawGeometryHover(ink,preview);
  if(tool==='select'&&(!modification||modification.transform&&modification.type!=='scale')&&!constraintMode) drawSelectionFrame(ink);
  const knot=focusedKnot();
  if(knot) {
    const shown=drag?.changes?.get(knot.entity.id)??knot.entity;
    const {center,arms}=handleLayout(shown,knot.index);
    stroke([arms[0],center,arms[1]].filter(Boolean),ink.point,1.2);
    drawKnotSquare(center,ink,4);
    for(const p of arms) if(p) drawKnotSquare(p,ink,4,ink.point);
  }
  if(tool==='select') {
    const entities=new Map(doc.entities.map(e=>[e.id,drag?.changes?.get(e.id)??e]));
    for(const ref of constraintMode?formalTargets:formalSelection) {
      const target=Formal.resolve(entities,ref);
      if(!target||!visibleReference(entities,ref)) continue;
      if(ref.kind==='point'||ref.kind==='origin') drawKnotSquare(screen(target),ink,5,ink.point);
      else drawEntity(target,ink.point,2.5);
    }
    for(const {constraint,x,y} of constraintTags(entities)) {
      drawConstraintBadge(constraint.type,x,y,ink,constraint===selectedConstraint);
    }
  }
  drawTheoreticalPoints(ink);
  drawDimensions(ink);
  if(tool==='offset') for(const entity of offsetProposal().entities) drawEntity(styledDraft(entity),ink.preview,1.5);
  drawModification(ink,preview);
  if(drag?.kind==='scissors'&&drag.sweeping) {
    stroke(drag.points,ink.point,2,[4,3]);
  } else if(modification?.type==='scissors'&&cursorPoint) {
    const target=scissorsTarget(cursorPoint);
    if(target) {
      for(const cut of target.cuts??[target]) if(cut.to-cut.from>1e-8)
        drawEntity(Edit.trimInterval(cut.part,cut.from,cut.to),ink.point,3);
      for(const {q} of target.bounds) drawKnotSquare(screen(q),ink,3,ink.point);
    }
  }
  if(!drag&&cursorPoint&&automaticGesture(cursorPoint)?.type==='scale') {
    for(const handle of scaleHandles({map:q=>q})) drawKnotSquare(handle.at,ink,3,ink.point);
  }
  drawRemovedRelations(ink);
  drawBlockedMovement(ink);
  drawRasterGuide(ink);
  const ghost=ink.preview;
  let measured=null;
  for(const [i,s] of segments.entries()) drawEntity(G.withConstruction(s,draftConstruction[i]),ghost,1.6);
  const pointDrag=drag?.kind==='point' && drag.tool===tool?drag:null;
  const pressed=pointDrag?.captureStart && (!delayedPointTools.has(tool)||pointDrag.held)?pointDrag.point:null;
  const previewPoints=pressed?[...points,pressed]:points;
  if(hover && polylineTool()) {
    const previous=segments.at(-1);
    const pressedGuide=pressed&&draftLineGuide(points,pressed,previous,pointDrag.snap,angleHeld);
    const stagePoint=pressed&&roundDraftPoint(points,pressedGuide?.q??pressed,previous,pointDrag.snap);
    const stagedSegment=stagePoint&&points.length&&tangentMode(previous)?G.tangentArc(previous,stagePoint):
      stagePoint&&points.length&&G.dist(points.at(-1),stagePoint)>G.eps?{type:'line',p:[points.at(-1),stagePoint]}:null;
    const staged=pressed?previewPolylinePoint(points,stagePoint,ghost):points;
    const candidate=pointDrag && !pointDrag.held?pointDrag.point:hover;
    if(staged) {
      const snap=pointDrag&&!pointDrag.held?pointDrag.snap:activeSnap;
      const guide=draftLineGuide(staged,candidate,stagedSegment??previous,snap,angleHeld);
      const prior=stagedSegment??previous;
      const end=roundDraftPoint(staged,guide?.q??candidate,prior,snap), last=staged.at(-1);
      if(last&&G.dist(last,end)>G.eps) measured=tangentMode(prior)?G.tangentArc(prior,end):
        {type:'line',p:[last,end]};
      previewPolylinePoint(staged,end,ghost,prior);
      displayAngularGuide(guide,ink);
    }
  } else if(hover && tool==='bezier') {
    const draft=[];
    let closed=false;
    const candidate=pointDrag && !pointDrag.held?pointDrag.point:hover;
    for(const p of [...previewPoints,candidate]) {
      if(draft.length && G.dist(draft.at(-1),p)<=G.eps) continue;
      if(draft.length>=3 && G.dist(draft[0],p)<=G.eps) {closed=true;break;}
      draft.push(p);
    }
    if(draft.length>=2) {
      const current={type:'spline',p:draft,closed,tension:splineTension};
      measured=G.splineSpans(current).at(-1);
      const styles=G.strokeParts(current).map((_,i)=>i<draftConstruction.length?draftConstruction[i]:draftStyle());
      drawEntity(styledDraftParts(current,styles),ghost,1.6);
    }
    context.fillStyle=ghost;
    for(const p of points) {
      const [x,y]=screen(p);
      context.fillRect(x-2,y-2,4,4);
    }
  } else if(hover && previewPoints.length) {
    const pressedGuide=pressed&&angleHeld&&drawingGuide(points,pressed);
    const vertices=pressed?[...points,roundDraftPoint(points,pressedGuide?.q??pressed,null,pointDrag.snap)]:previewPoints;
    const guide=angleHeld&&drawingGuide(vertices,hover);
    const end=roundDraftPoint(vertices,guide?.q??hover,null,activeSnap);
    const preview=guess([...vertices,end]);
    if(preview) {measured=preview;drawEntity(styledDraft(preview),ghost,1.6);}
    else {
      if(counts[tool]>1) measured={type:'line',p:[vertices.at(-1),end]};
      stroke([...vertices,end].map(screen),ghost,1,[4,4]);
    }
    const slotGuide=angleHeld&&tool==='slot'&&vertices.length===2&&
      G.dist(angularGuide(...vertices)?.q??vertices[1],vertices[1])<=G.eps?
      angularGuide(...vertices):null;
    displayAngularGuide(guide||pressedGuide||slotGuide,ink);
  }
  displayAngularGuide(drag?.angleGuide,ink);
  drawLiveMeasurements(measured,ink);
  if(drag?.kind==='box' && drag.end) {
    const [x,y]=drag.start,[u,v]=drag.end;
    const color=u>=x?ink.preview:ink.selection;
    context.fillStyle=color+'20';context.fillRect(x,y,u-x,v-y);
    stroke([[x,y],[u,y],[u,v],[x,v],[x,y]],color,1,u>=x?[]:[5,4]);
    drawFrameDimensions([Math.min(x,u),Math.min(y,v)],[Math.max(x,u),Math.max(y,v)],
      [Math.abs(u-x)/camera.scale,Math.abs(v-y)/camera.scale],ink);
  }
  if(drag?.defer && drag.deferredPoint) {
    stroke([drag.start,drag.deferredPoint],ink.preview,1,[4,4]);
    drawKnotSquare(drag.deferredPoint,ink,3,ink.preview);
  }
  if(marker && tool!=='select') {
    const [x,y]=screen(marker);context.strokeStyle=ink.point;context.lineWidth=1.4;context.setLineDash([]);
    context.strokeRect(x-4,y-4,8,8);
  }
  updateSnapIndicator(previewPoints,pointDrag);
  if(constraintMode!==null && hover && cursorPreferences.mode==='classic') {
    const [x,y]=screen(hover);
    drawConstraintBadge(constraintMode,x+12,y-22,ink);
  }
  $('zoom').textContent=num(camera.scale*100/4)+' %';
}

function previewPolylinePoint(vertices,p,color,previous=segments.at(-1)) {
  if(!vertices.length) return [p];
  const last=vertices.at(-1);
  if(G.dist(last,p)<=G.eps) return vertices;
  if(tangentMode(previous)) {
    const curve=G.tangentArc(previous,p);
    if(curve) drawEntity(styledDraft(curve),color,1.6);
    else {stroke([screen(last),screen(p)],color,1,[4,4]);return vertices;}
  } else stroke([screen(last),screen(p)],color,1,[4,4]);
  if(segments.length>=2 && G.dist(p,segmentStart(segments[0]))<=G.eps) return null;
  return [p];
}

function midpointMarkers(entities) {
  const refs=new Map();
  for(const c of doc.constraints??[]) for(const ref of c.refs) {
    const point=c.type==='midpoint'&&ref.kind==='edge'?Formal.midpointRef(ref):ref;
    if(Formal.isMidpointRef(point)&&visibleReference(entities,point)) refs.set(Formal.key(point),point);
  }
  return [...refs.values()];
}
function theoreticalMarkers() {
  const used=new Set(), entities=new Map(doc.entities.map(e=>[e.id,e]));
  for(const c of doc.constraints??[]) {
    if(Formal.isDimension(c)&&(c.layer??activeLayer)!==activeLayer) continue;
    for(const ref of c.refs) {
      if(ref.kind==='point') used.add(Formal.key(ref));
      else if(c.type==='radial'&&ref===c.refs[1]||Formal.isDimension(c)&&['radius','diameter'].includes(c.mode)) {
        const center=radialCenterReference(entities.get(ref.id),ref);
        if(center) used.add(Formal.key(center));
      }
    }
  }
  const inUse=new Set((tool==='dimension'?dimensionRefs:constraintMode?formalTargets:formalSelection).map(Formal.key));
  const markers=[];
  for(const e of doc.entities) if(visible(e)) {
    const shown=drag?.changes?.get(e.id)??e;
    for(const {q,index,part} of Formal.theoreticalReferences(shown)) {
      if(part!==undefined&&!constructionShown(e.layer)&&G.constructionAt(shown,part)) continue;
      const key=Formal.key({id:e.id,kind:'point',index});
      const at=screen(q), permanent=e.layer===activeLayer&&used.has(key);
      const hovered=cursorPoint&&G.dist(at,cursorPoint)<=9;
      const editing=e.layer===activeLayer&&inUse.has(key);
      if(permanent||hovered||editing) markers.push({at,active:editing,hovered});
    }
  }
  const shown=new Map([...entities].map(([id,e])=>[id,drag?.changes?.get(id)??e]));
  const shared=[];
  for(const ref of midpointMarkers(shown)) {
    if(shown.get(ref.id).layer!==activeLayer) continue;
    const q=Formal.resolve(shown,ref);
    if(!q||shared.some(p=>G.dist(p,q)<=G.eps*8)) continue;
    shared.push(q);
    const at=screen(q);
    markers.push({at,active:inUse.has(Formal.key(ref)),hovered:cursorPoint&&G.dist(at,cursorPoint)<=9,midpoint:true});
  }
  return markers;
}
function drawTheoreticalPoints(ink) {
  for(const {at,active,hovered,midpoint} of theoreticalMarkers()) {
    const color=active?ink.point:hovered?ink.hover:ink.selection;
    const [x,y]=at;
    if(midpoint) {drawKnotSquare(at,ink,4,color);continue;}
    context.beginPath();
    context.setLineDash([]);
    context.arc(x,y,5,0,G.tau);
    context.fillStyle=ink.base;context.fill();
    context.strokeStyle=color;context.lineWidth=1;context.stroke();
    context.fillStyle=color;context.fillRect(x-1,y-1,2,2);
  }
}
function rightAngleBadge(entities,constraint) {
  if(constraint.type!=='perpendicular') return null;
  const [a,b]=constraint.refs.map(ref=>Formal.resolve(entities,ref));
  if(a?.type!=='line'||b?.type!=='line') return null;
  const vertex=a.p.find(p=>b.p.some(q=>G.dist(p,q)<=1e-7))??G.intersection(...a.p,...b.p);
  if(!vertex) return null;
  const origin=screen(vertex);
  const rays=[a,b].map(line=>{
    const end=line.p.slice().sort((p,q)=>G.dist(q,vertex)-G.dist(p,vertex))[0];
    const delta=G.sub(screen(end),origin);
    return G.mul(delta,1/Math.hypot(...delta));
  });
  const outside=G.mul(G.add(...rays),-1);
  const center=G.add(origin,G.mul(outside,19/Math.hypot(...outside)));
  return {origin,center};
}
function constraintTags(entities,extra=new Set()) {
  if(!extra.size&&(tool!=='select'||!selection.size)) return [];
  const tags=[], size=constraintBadgeSize, spacing=size+3;
  for(const constraint of doc.constraints??[]) {
    if(Formal.isDimension(constraint)) continue;
    const ref=constraint.refs.find(r=>tool==='select'&&selection.has(r.id)&&visibleReference(entities,r))??
      (extra.has(constraint)?constraint.refs.find(r=>r.kind!=='origin'&&visibleReference(entities,r)):null);
    if(!ref) continue;
    const value=Formal.resolve(entities,ref);
    if(!value) continue;
    let p=ref.kind==='point'?value:value.c??G.mid(value.p[0],value.p.at(-1));
    if(Formal.isPointOnTrace(constraint)) p=Formal.resolve(entities,constraint.refs.find(r=>r.kind==='point'))??p;
    if(constraint.type==='tangent'&&constraint.refs.every(r=>r.id===ref.id)) {
      const [a,b]=constraint.refs.map(r=>Edit.ends(Formal.resolve(entities,r)));
      p=a.find(point=>b.some(other=>G.dist(point,other)<=G.eps))??p;
    }
    const angle=rightAngleBadge(entities,constraint);
    const [sx,sy]=angle?.origin??screen(p);
    if(sx<0||sx>viewport[0]||sy<0||sy>viewport[1]) continue;
    const x=Math.max(0,Math.min(angle?angle.center[0]-size/2:sx+8,viewport[0]-size));
    const preferred=Math.max(0,Math.min(angle?angle.center[1]-size/2:sy-size-5,viewport[1]-size));
    for(let i=0;i*spacing<=viewport[1]*2+spacing;i++) {
      const y=preferred+(i%2?1:-1)*Math.ceil(i/2)*spacing;
      if(y<0||y+size>viewport[1]||tags.some(t=>Math.abs(t.y-y)<size+2&&Math.abs(t.x-x)<size+2)) continue;
      tags.push({constraint,x,y});
      break;
    }
  }
  return tags;
}
function constraintTagAt([x,y]) {
  if(tool!=='select'||!selection.size||!doc.constraints?.length) return null;
  const entities=new Map(doc.entities.map(e=>[e.id,e]));
  return constraintTags(entities).find(tag=>x>=tag.x&&x<=tag.x+constraintBadgeSize&&
    y>=tag.y&&y<=tag.y+constraintBadgeSize)?.constraint;
}
function drawAngleTag(label,x,y,ink) {
  context.font='12px system-ui';
  const width=context.measureText(label).width+8;
  context.fillStyle=ink.base;context.fillRect(x,y-13,width,17);
  context.strokeStyle=ink.selection;context.lineWidth=1;context.setLineDash([]);
  context.strokeRect(x,y-13,width,17);
  context.fillStyle=ink.selection;context.fillText(label,x+4,y);
}
function liveLength(value) {
  return num(value)+(doc.units?' '+I18n.t(Formats.units[doc.units]):'');
}
function metricStep(action) {
  return action.ignoreSnap?0:metricSnapStep/Formats.millimeters[doc.units];
}
function drawFrameDimensions([left,top],[right,bottom],[width,height],ink) {
  context.font='12px system-ui';
  const widthLabel=liveLength(width), heightLabel=liveLength(height);
  const labelWidth=context.measureText(widthLabel).width+8, labelHeightWidth=context.measureText(heightLabel).width+8;
  const clampX=(x,size)=>Math.max(2,Math.min(x,viewport[0]-size-2));
  const clampY=y=>Math.max(15,Math.min(y,viewport[1]-5));
  const x=clampX((left+right-labelWidth)/2,labelWidth), y=clampY(top+4);
  const sideX=clampX(right-labelHeightWidth/2,labelHeightWidth);
  let sideY=clampY((top+bottom)/2+4);
  if(Math.abs(sideY-y)<16&&sideX<x+labelWidth&&sideX+labelHeightWidth>x) {
    sideY=clampY(y+18<=viewport[1]-5?y+18:y-18);
  }
  drawAngleTag(widthLabel,x,y,ink);
  drawAngleTag(heightLabel,sideX,sideY,ink);
}
function syncTransformSize(frame) {
  if($('transformSize').hidden) return;
  const tf=modification.type==='scale'&&!modification.applied?modificationTransform():null;
  const size=frame&&G.sub(frame.bounds[1],frame.bounds[0]);
  for(const [i,id] of ['transformWidth','transformHeight'].entries()) {
    const field=$(id), value=size?.[i];
    field.disabled=!(value>G.eps);
    if(document.activeElement===field) continue;
    field.value=Number.isFinite(value)?Number((value*(i===0?tf?.factor??1:tf?.sy??1)).toPrecision(10)):'';
  }
}
function setTransformSize(field) {
  if(!modification?.transform||modification.protected) return;
  const items=modificationItems(), frame=selectionFrame(items);
  if(!frame) return;
  const axis=field.id==='transformWidth'?0:1;
  const size=G.sub(frame.bounds[1],frame.bounds[0]), value=field.valueAsNumber;
  const current=modification.type==='scale'&&!modification.applied?modificationTransform():null;
  const factors=[current?.factor??1,current?.sy??1];
  const prior=factors[axis], next=value/size[axis];
  const restore=()=>{
    field.value=Number((size[axis]*prior).toPrecision(10));
    field.getAnimations().forEach(animation=>animation.cancel());
    const highlight={boxShadow:'inset 0 0 0 2px #e02e42'};
    if(matchMedia('(prefers-reduced-motion: reduce)').matches) {
      field.animate([highlight,highlight],{duration:1100});
    } else {
      field.animate([highlight,{boxShadow:'none'}],{duration:360,iterations:3});
    }
    message(I18n.t('Transformation hors limites.'));
  };
  if(!(value>0)||!(size[axis]>G.eps)||!Number.isFinite(next)||next<.000001) return restore();
  if(Math.abs(next-prior)<=1e-9*Math.max(1,next,prior)) return;
  factors[axis]=next;
  if(modification.locked) factors.fill(next);
  const useDefaultPivot=modification.type!=='scale'&&!modification.pivot;
  const pivot=useDefaultPivot?frame.center:modificationPivot();
  if(!pivot) return restore();
  const tf=planarTransform(pivot,0,...factors);
  if(items.some(item=>{
    const scaled=transformSelection(item,tf);
    return !scaled||!G.serial(scaled)||!Edit.valid(scaled);
  })) return restore();
  if(useDefaultPivot) setPivotFields(pivot);
  Object.assign(modification,{type:'scale',phase:null,applied:false,ids:selectionSignature(items)});
  $('scaleValue').value=factors[0];$('scaleY').value=factors[1];
  update();
}
function drawLiveMeasurements(measured,ink) {
  const items=tool==='select'?selected():[];
  const original=selectionFrame(items);
  syncTransformSize(original);
  const gesture=drag?.kind==='scaleGesture'||drag?.kind==='rotateGesture';
  const tf=gesture&&!modification?.applied?
    drag.transformSnap?.tf??drag.angleTransform??modificationTransform():null;
  const changed=drag?.changes;
  const active=tf||changed?.size;
  const frame=active&&original?selectionFrame(items.map(e=>tf?transformSelection(e,tf)??e:changed.get(e.id)??e)):original;
  $('frameReadout').hidden=!frame;
  if(frame) {
    const coordinates=absoluteFrameReadout?toWork(frame.center):G.sub(frame.center,original.center);
    $('framePosition').textContent=(absoluteFrameReadout?'':'Δ ')+'X '+num(coordinates[0])+' · Y '+num(coordinates[1]);
    const snapping=drag&&['edit','radialResize','scaleGesture'].includes(drag.kind)?metricSnapStep:0;
    $('frameStep').hidden=!snapping;
    if(snapping) $('frameStep').textContent=snapping+' mm';
  }
  if(!measured&&active) {
    const entity=drag.entity??drag.knot?.entity??(items.length===1?items[0]:drag.items?.length===1?drag.items[0]:null);
    const shown=entity&&(tf?transformSelection(entity,tf):changed.get(entity.id));
    if(shown) measured=Formal.referenceEdges(shown)[drag.preferredIndex]??selectionRuns([shown])[0];
  }
  if(!measured||!cursorPoint) return;
  const length=G.traceLength(measured);
  if(length<=G.eps||!Number.isFinite(length)) return;
  let label='L '+liveLength(length);
  if(metricSnapStep&&measured.type==='circle') label='Ø '+liveLength(measured.r*2);
  if(metricSnapStep&&drag?.kind==='radialResize'&&measured.type==='arc') label='R '+liveLength(measured.r);
  if(metricSnapStep&&measured.type==='ellipse'&&measured.s===undefined)
    label=liveLength(measured.r*2)+' × '+liveLength(measured.ry*2);
  if(metricSnapStep&&tool==='rect'&&measured.type==='poly') {
    const [a,b,c]=measured.p;
    label=liveLength(G.dist(a,b))+' × '+liveLength(G.dist(b,c));
  }
  if(metricSnapStep&&tool==='slot'&&measured.profile==='slot') {
    const parts=G.slotParts(measured);
    if(parts) {
      const frame=G.slotFrame(measured,parts), diameter=frame.radius*2;
      label=liveLength(frame.length+($('overall').checked?diameter:0))+' × '+liveLength(diameter);
    }
  }
  const [x,y]=cursorPoint;
  context.font='12px system-ui';
  drawAngleTag(label,Math.max(2,Math.min(x+14,viewport[0]-context.measureText(label).width-12)),
    y+38<viewport[1]?y+34:Math.max(16,y-33),ink);
}

function drawKnotSquare([x,y],ink,size,color=ink.selection) {
  context.fillStyle=ink.base;
  context.fillRect(x-size,y-size,2*size,2*size);
  context.strokeStyle=color;context.lineWidth=1.3;context.setLineDash([]);
  context.strokeRect(x-size,y-size,2*size,2*size);
}

function selectionFrame(items) {
  const bounds=getBounds(selectionRuns(items));
  if(!Number.isFinite(bounds[0][0])) return null;
  return {bounds,center:G.mid(...bounds)};
}
function rotationCenter(items,frame=selectionFrame(items)) {
  items=selectionRuns(items);
  if(items.length===1) {
    const center=G.theoreticalPoints(items[0]).find(point=>point.part===undefined);
    if(center) return center.q;
  }
  return frame?.center??null;
}
function selectionAnchor(p,items,frame=selectionFrame(items)) {
  if(!frame) return null;
  let distance=8, best=null;
  for(const anchor of [...selectionRuns(items).flatMap(visibleSnapFeatures),{q:frame.center,kind:'selectionCenter'}]) {
    const gap=G.dist(p,screen(anchor.q));
    if(gap<distance) {best=anchor;distance=gap;}
  }
  return best;
}
function drawSelectionFrame(ink) {
  const items=selected().map(e=>drag?.changes?.get(e.id)??e);
  const frame=selectionFrame(items);
  if(!frame) return;
  const [[left,bottom],[right,top]]=frame.bounds.map(screen);
  const padding=5;
  const a=[left-padding,top-padding], b=[right+padding,bottom+padding];
  stroke([a,[b[0],a[1]],b,[a[0],b[1]],a],ink.selection,1,[4,4]);
  drawFrameDimensions(a,b,G.sub(frame.bounds[1],frame.bounds[0]),ink);
  const center=screen(frame.center), [x,y]=center;
  drawKnotSquare(center,ink,4);
  stroke([[x-2,y],[x+2,y]],ink.selection);
  stroke([[x,y-2],[x,y+2]],ink.selection);
  const anchor=drag?.anchor??(!drag&&cursorPoint&&selectionAnchor(cursorPoint,items,frame));
  if(anchor&&anchor.kind!=='selectionCenter') {
    const delta=drag?.anchor&&drag.changes?G.sub(frame.center,drag.anchorCenter):[0,0];
    drawKnotSquare(screen(G.add(anchor.q,delta)),ink,4,ink.point);
  }
}

function placingCircularCenter(count=points.length) {
  return count===0&&(tool==='circle'||tool==='arc'&&arcMethod==='center');
}
function snapped(p,allowSelect=false) {
  marker=null;
  activeSnap=null;
  if(suspended || !$('snap').checked || !allowSelect&&['select','dimension'].includes(tool)) return p;
  const candidates=[];
  const center=placingCircularCenter(), margin=10/camera.scale;
  const include=(q,kind,entity,refs)=>{
    const d=G.dist(p,q)*camera.scale;
    if(d<=10) candidates.push({q,d,kind,entity,refs});
  };
  if(polylineTool() && segments.length) include(segmentStart(segments[0]),segments.length>=2?'join':'point');
  if(tool==='bezier' && points.length>=2) include(points[0],points.length>=3?'join':'point');
  for(const {name,target} of layerOrigins(activeLayer)) include(target,'origin',undefined,[{kind:'origin',name,target}]);
  const nearby=[];
  for(const e of doc.entities) if(visible(e)) {
    const parts=center||['line','poly','path'].includes(e.type)?Formal.referenceEdges(e):[];
    const features=visibleSnapFeatures(e).filter(({q})=>G.dist(q,p)<=margin);
    const pointRefs=center&&features.length?[...Formal.originPoints(e)]:[];
    for(const {q,kind} of features) {
      const exact=pointRefs.find(entry=>G.dist(entry.p,q)<=G.eps*4);
      const index=center&&kind==='quadrant'?parts.findIndex((part,i)=>
        (constructionShown(e.layer)||!G.constructionAt(e,i))&&G.dist(G.nearestOnTrace(part,q)??p,q)<=G.eps*4):-1;
      const refs=exact?[exact.ref]:index>=0?[{id:e.id,kind:'edge',index}]:undefined;
      include(q,kind,e,refs);
    }
    for(const [index,part] of parts.entries()) {
      if(!constructionShown(e.layer)&&G.constructionAt(e,index)) continue;
      const ref={id:e.id,kind:'edge',index};
      if(part.type==='line'&&G.dist(p,G.nearest(...part.p,p))<=margin) nearby.push({p:part.p,ref});
      if(!center) continue;
      const bounds=G.boundsPoints(part);
      if(p.some((value,i)=>value<Math.min(...bounds.map(q=>q[i]))-margin||
        value>Math.max(...bounds.map(q=>q[i]))+margin)) continue;
      const q=G.nearestOnTrace(part,p);
      if(q) include(q,'trace',e,[ref]);
    }
  }
  for(let i=0;i<nearby.length;i++) for(let j=0;j<i;j++) {
    const q=G.intersection(...nearby[i].p,...nearby[j].p);
    if(q) include(q,'intersection',undefined,[nearby[i].ref,nearby[j].ref]);
  }
  candidates.sort((a,b)=>Number(a.kind==='trace')-Number(b.kind==='trace')||a.d-b.d);
  const unique=candidates.filter(({q},i)=>!i || !candidates.slice(0,i).some(other=>G.dist(q,other.q)*camera.scale<.1));
  if(unique.length) activeSnap=unique[snapIndex%unique.length];
  if(!activeSnap&&$('gridSnap').checked) {
    const step=$('spacing').valueAsNumber;
    if(step>0) activeSnap={q:gridPoint(p,step),kind:'grid'};
  }
  marker=activeSnap?.q??null;
  return marker||p;
}
function snapIsEndpoint(entity,p) {
  if(!p||entity.closed||entity.type==='point'||entity.type==='circle'||entity.type==='ellipse'&&entity.s===undefined) return false;
  const ends=entity.type==='path'?[Edit.ends(entity.segments[0])[0],Edit.ends(entity.segments.at(-1))[1]]:Edit.ends(entity);
  return ends.some(q=>G.dist(p,q)<=G.eps*4);
}
function uniqueJoinTarget(entity,p,sourceId) {
  return doc.entities.filter(e=>e.layer===entity.layer&&e.id!==sourceId&&snapIsEndpoint(e,p)).length===1;
}
function draftSnapExtra(snap,staged=false) {
  if(placingCircularCenter(points.length+(staged?1:0))&&snap.refs?.length&&$('autoCoincidence').checked) return 'coincidence';
  const target=snap.entity;
  if(snap.kind!=='origin'&&(!target||!['point','center'].includes(snap.kind)||
    !Formal.vertices(target).some(p=>G.dist(p,snap.q)<=G.eps*4))) return null;
  const count=points.length+(staged?1:0);
  const isPath=['poly','bezier','arc'].includes(tool);
  const endsNow=polylineTool()?count>0:tool==='bezier'?count>0:tool==='arc'&&count===(arcMethod==='center'?2:1);
  if(isPath&&endsNow&&target?.layer===activeLayer&&snapIsEndpoint(target,snap.q)&&uniqueJoinTarget(target,snap.q)) return 'join';
  const storesPoint=tool==='point'||tool==='rect'&&(rectangleMethod==='corners'||count===1)||tool==='bezier'||polylineTool()||
    (tool==='circle'||tool==='ellipse')&&count===0||tool==='arc'&&(arcMethod==='center'||count<2);
  const storesOriginPoint=snap.kind==='origin'&&(tool==='rect'||tool==='slot'&&count<2||
    tool==='polygon');
  return (storesPoint||storesOriginPoint)&&$('autoCoincidence').checked?'coincidence':null;
}
const snapIndicatorColor=()=>cursorPreferences.colors[modification?.type??constraintMode??tool]??cursorPreferences.colors.select;
function updatePrecisionIcons() {
  const color=snapIndicatorColor();
  for(const icon of $('precisionIcons').querySelectorAll('[data-snap-icon]')) {
    const src=SnapIndicators.image(icon.dataset.snapIcon,color);
    if(icon.getAttribute('src')!==src) icon.src=src;
  }
}
function updateSnapIndicator(previewPoints,pointDrag) {
  const indicator=$('snapIndicator');
  const action=cursorPreferences.mode==='precision'&&tool!=='text'&&currentCanvasCursor?.tool!=='text'&&currentCanvasCursor?.behavior?
    cursorActionBadge(currentCanvasCursor):null;
  const dragged=drag?.snapAt&&cursorPoint&&G.dist(drag.snapAt,cursorPoint)<=2?drag.snapIndicator:null;
  const dimensionBadge=tool==='dimension'&&(!drag||drag.kind==='dimension');
  const allowSnap=!suspended&&$('snap').checked&&(!drag||drag.kind==='point'||drag.kind==='modifyAction'||dragged);
  const snap=allowSnap?(dragged??(tool==='select'&&modification?.phase!=='pivot'?null:
    pointDrag&&!pointDrag.held?pointDrag.snap:activeSnap)):null;
  const extra=snap&&(dragged?snap.extra:draftSnapExtra(snap,Boolean(pointDrag?.held&&pointDrag.captureStart)));
  const kinds=[snap?.kind==='trace'?'point':snap?.kind,extra].filter(kind=>kind&&snapPreferences.enabled[kind]);
  if(dimensionBadge) kinds.unshift('dimension');
  if(action&&!dimensionBadge) kinds.unshift('action');
  if(!cursorPoint||!kinds.length) {indicator.hidden=true;previousSnapCorner=null;return;}
  const paths=[];
  const add=(points,weight)=>{
    for(let i=1;i<points.length;i++) {
      const a=screen(points[i-1]),b=screen(points[i]);
      if(G.dist(cursorPoint,G.nearest(a,b,cursorPoint))<=90) paths.push({a,b,weight});
    }
  };
  const traced=(entity,weight)=>{
    if(!entity) return;
    const [min,max]=getBounds([entity]);
    const p=world(cursorPoint), margin=90/camera.scale;
    if(p.some((n,i)=>n<min[i]-margin||n>max[i]+margin)) return;
    add(G.trace(entity,camera.scale),weight);
  };
  if(dragged||action&&drag?.changes) {
    for(const e of drag.changes?.values()??[]) traced(e,3);
  } else if(snap&&previewPoints.length) {
    if(tool==='bezier') {
      const knots=previewPoints.filter((p,i)=>!i||G.dist(p,previewPoints[i-1])>G.eps);
      const closed=knots.length>=3&&G.dist(knots[0],snap.q)<=G.eps;
      if(!closed&&G.dist(knots.at(-1),snap.q)>G.eps) knots.push(snap.q);
      if(knots.length>=2) traced({type:'spline',p:knots,closed,tension:splineTension},3);
    } else if(polylineTool()) {
      const curve=tangentMode()?G.tangentArc(segments.at(-1),snap.q):null;
      if(curve) traced(curve,3);else add([...previewPoints,snap.q],3);
    } else {
      const shape=guess([...previewPoints,snap.q]);
      if(shape) traced(shape,3);else add([...previewPoints,snap.q],3);
    }
  }
  traced(snap?.entity,1);
  const spot=SnapIndicators.placement(cursorPoint,viewport,paths,kinds.length,snapPreferences.corner,previousSnapCorner);
  previousSnapCorner=spot.corner;
  const color=snapIndicatorColor();
  const key=kinds.join('/')+(kinds.some(kind=>kind==='coincidence'||kind==='dimension')?color:'')+(action??'');
  if(snapIconKey!==key) {
    snapIconKey=key;
    indicator.replaceChildren(...kinds.map(kind=>{
      const image=document.createElement('img');image.alt='';
      image.src=kind==='action'?action:kind==='dimension'?toolIconSource('dimension'):SnapIndicators.image(kind,color);
      return image;
    }));
  }
  indicator.style.left=spot.x+'px';indicator.style.top=spot.y+'px';indicator.hidden=false;
}
function showCoordinates(p) {
  const [x,y]=toWork(p), {name}=workingOrigin();
  $('coords').textContent=name+'   X '+num(x)+'   Y '+num(y)+' '+I18n.t(Formats.units[doc.units]);
}
function refreshPointer(p) {
  hover=snapped(world(p),modification?.phase==='pivot');
  if(tool==='arc'&&arcMethod==='center'&&points.length) {
    const start=points[1]??(drag?.kind==='point'&&drag.held?drag.point:null);
    if(start) arcTrack=G.arcProgress(points[0],start,hover,arcTrack);
  }
  showCoordinates(hover);
  requestDraw();
}
function hitsEntity(e,p) {
  return visibleStrokeParts(e).some(part=>hitsStroke(part,p))||
    Formal.theoreticalReferences(e).some(({q,index})=>G.dist(p,q)<=7/camera.scale&&referencePointVisible(e,index,q));
}
const strokeBounds=new WeakMap();
function hitsStroke(e,p) {
  const radius=7/camera.scale;
  if((e.type==='point'||e.type==='circle')&&G.dist(p,e.type==='point'?e.p[0]:e.c)<=radius) return true;
  let bounds=strokeBounds.get(e);
  if(!bounds) {
    const min=[Infinity,Infinity], max=[-Infinity,-Infinity];
    for(const point of G.boundsPoints(e)) for(let i=0;i<2;i++) {
      min[i]=Math.min(min[i],point[i]);max[i]=Math.max(max[i],point[i]);
    }
    bounds={min,max};
    strokeBounds.set(e,bounds);
  }
  if(p.some((value,i)=>value<bounds.min[i]-radius||value>bounds.max[i]+radius)) return false;
  const path=G.trace(e,camera.scale);
  return path.slice(1).some((b,i)=>G.dist(p,G.nearest(path[i],b,p))<=radius);
}
function hit(p) {
  return doc.entities.filter(e=>visible(e)&&hitsEntity(e,p)).reverse();
}
function guess(p) {
  if(tool==='arc') {
    if(p.length<3) return null;
    return arcMethod==='center'?G.arcFromCenter(p[0],p[1],p[2],arcTrack):G.arc(p[0],p[2],p[1]);
  }
  const sides=Math.max(3,Math.min(360,Math.round($('sides').valueAsNumber||6)));
  return G.shape(tool==='rect'&&rectangleMethod==='center'?'rectCenter':tool,p,sides,$('overall').checked);
}
const counts={rect:2,circle:2,arc:3,polygon:2,ellipse:3,slot:3};
function roundedSize(value,step) {
  return value>G.eps?Math.max(step,Math.round(value/step)*step):value;
}
function roundDistance(from,to,step) {
  const length=G.dist(from,to);
  return length>G.eps?G.polar(from,roundedSize(length,step),G.angle(from,to)):to;
}
function roundDraftPoint(vertices,p,previous,snap) {
  const step=metricStep({});
  if(!step||!vertices.length||snap?.kind==='join') return p;
  const [a,b]=vertices;
  if(polylineTool()) return tangentMode(previous)?p:roundDistance(vertices.at(-1),p,step);
  if(tool==='rect') {
    const factor=rectangleMethod==='center'?2:1;
    return G.add(a,G.sub(p,a).map(n=>Math.sign(n)*roundedSize(Math.abs(n)*factor,step)/factor));
  }
  if(tool==='circle') return roundDistance(a,p,step/2);
  if(tool==='ellipse'&&!b) return roundDistance(a,p,step/2);
  if(tool==='slot'&&!b) return roundDistance(a,p,step);
  if((tool==='ellipse'||tool==='slot')&&b&&G.dist(a,b)>G.eps) {
    const direction=G.mul(G.sub(b,a),1/G.dist(a,b)), normal=[-direction[1],direction[0]];
    const depth=G.dot(G.sub(p,a),normal);
    return G.add(p,G.mul(normal,Math.sign(depth)*roundedSize(Math.abs(depth)*2,step)/2-depth));
  }
  return p;
}
const segmentStart = s => s.type==='line'?s.p[0]:G.polar(s.c,s.r,s.a);
const segmentEnd = s => s.type==='line'?s.p[1]:G.polar(s.c,s.r,s.a+s.s);
function finishPolyline(closed=false) {
  if(segments.length) {
    const singleLine=segments.length===1 && segments[0].type==='line';
    const e=singleLine?segments[0]:segments.some(s=>s.type==='arc')?{type:'path',segments,closed}:
      {type:'poly',p:closed?segments.map(segmentStart):[segmentStart(segments[0]),...segments.map(segmentEnd)],closed};
    if(!add([singleLine?G.withConstruction(e,draftConstruction[0]):styledDraftParts(e,draftConstruction)],draftAxes,draftRelations)) return;
    message(singleLine?I18n.t('Ligne ajoutée.'):I18n.t('Polyligne ajoutée.'));
  }
  points=[];segments=[];draftAxes=[];draftRelations=[];draftConstruction=[];requestDraw();
}
function finishBezier(closed=false) {
  if(points.length>=2) {
    const e={type:'spline',p:points,closed,tension:splineTension};
    if(!add([styledDraftParts(e,draftConstruction)])) return;
    message(closed?I18n.t('Courbe Bézier fermée.'):I18n.t('Courbe Bézier ajoutée.'));
  }
  points=[];draftConstruction=[];
  requestDraw();
}
function place(p,align=false,snap) {
  if(doc.layers.some(layer=>layer.name===activeLayer&&layer.raster)) {
    message(I18n.t('Choisissez un calque vectoriel pour dessiner.'));return;
  }
  const guide=polylineTool()&&snap!==undefined?draftLineGuide(points,p,segments.at(-1),snap,align):align&&drawingGuide(points,p);
  if(guide&&G.dist(guide.q,p)>G.eps) p=guide.q;
  if(snap!==undefined) p=roundDraftPoint(points,p,segments.at(-1),snap);
  if(!p.every(v=>Number.isFinite(v)&&Math.abs(v)<=1e12)) {message(I18n.t('Point invalide.'));return;}
  if(tool==='origin') {
    const layer=doc.layers.find(l=>l.name===activeLayer);
    if(!layer.visible) {message(I18n.t('Affichez le calque actif avant de créer un POT.'));return;}
    openOriginDialog(layer,p);
    return;
  }
  if(tool==='point') {if(add([{type:'point',p:[p]}])) message(I18n.t('Point de construction ajouté.'));return;}
  if(tool==='bezier') {
    if(points.length && G.dist(p,points.at(-1))<=G.eps) return;
    if(points.length) draftConstruction.push(draftStyle());
    if(points.length>=3 && G.dist(p,points[0])<=G.eps) finishBezier(true);
    else {points.push(p);requestDraw();}
    return;
  }
  if(polylineTool()) {
    if(!points.length) {points=[p];requestDraw();return;}
    const first=points[0], closes=segments.length>=2 && G.dist(p,segmentStart(segments[0]))<=G.eps;
    if(G.dist(p,points.at(-1))<=G.eps) return;
    const tangent=tangentMode();
    const s=tangent?G.tangentArc(segments.at(-1),p):{type:'line',p:[first,p]};
    if(!s) {
      message(I18n.t('Écartez le point de la tangente pour créer un arc.'));
      return;
    }
    if(tangent||guide?.tangent) draftRelations.push({type:'tangent',before:segments.length-1,after:segments.length});
    if(guide?.collinear) draftRelations.push({type:'collinear',before:guide.reference??segments.length-1,after:segments.length});
    if(guide?.axis) draftAxes.push({index:segments.length,type:guide.axis});
    segments.push(s);draftConstruction.push(draftStyle());points=[p];
    if(closes) finishPolyline(true);
    requestDraw();return;
  }
  if(!counts[tool]) return;
  if(placingCircularCenter()) centerDraftSnap=snap?.refs?.length?snap:null;
  if(tool==='slot'&&points.length===1) slotAxis=guide?.axis??null;
  points.push(p);
  if(points.length===counts[tool]) {
    const entity=guess(points);
    if(!entity) {points.pop();message(I18n.t('Ces points ne définissent pas une forme valide.'));requestDraw();return;}
    const axes=tool==='slot'&&slotAxis?[{index:0,type:slotAxis}]:[];
    if(add([styledDraft(entity)],axes,[],centerDraftSnap)) message(I18n.t(definitions[tool][1])+I18n.t(' ajouté au calque ')+activeLayer+'.');
    points=[];slotAxis=null;centerDraftSnap=null;
    if(tool==='arc') arcTrack=null;
  }
  requestDraw();
}

function replaceSelected(fn,join=true,rebind=false,removedSegments,bindCut=null,selectedOutput=null) {
  const picked=new Set(selected().map(e=>e.id));
  const updated=[], chosen=[];
  const remap=new Map();
  let entities=doc.entities.flatMap(e=>{
    if(!picked.has(e.id)) return [e];
    const parts=fn(e).map((part,i)=>{
      const metadata={layer:e.layer,...(e.vectorGroup?{vectorGroup:e.vectorGroup}:{})};
      const next=i===0?(part===e?e:{...part,...metadata,id:e.id}):identity({...part,...metadata});
      updated.push(next.id);
      if(!selectedOutput||selectedOutput(e,i)) chosen.push(next.id);
      return next;
    });
    if(rebind&&(parts.length!==1||parts[0]!==e)) remap.set(e.id,parts.map(part=>part.id));
    return parts;
  });
  if(entities.some(e=>!G.serial(e)||!Edit.valid(e))) {message(I18n.t('Transformation hors limites ou incompatible avec une contrainte d’angle.'));return false;}
  const before=doc.entities;
  const after=new Map(entities.map(e=>[e.id,e]));
  const affected=new Set(picked), lost=[], constraints=[];
  for(const c of doc.constraints??[]) {
    if(!c.refs.some(r=>affected.has(r.id))) {constraints.push(c);continue;}
    const removed=c.refs.some(r=>r.kind==='edge'&&removedSegments?.get(r.id)?.has(r.index));
    const mapped=removed?null:rebind?Formal.remap(before,entities,[c],remap):[c];
    if(mapped?.length&&mapped.every(next=>Formal.satisfied(after,next))) constraints.push(...mapped);
    else lost.push(c);
  }
  if(bindCut) entities=bindCut(before,entities,constraints,remap,updated);
  edgeFocus=null;
  knotFocus=null;
  wholeFocus=null;
  const previousSegments=new Map(segmentSelection);
  segmentSelection.clear();
  formalSelection=[];
  const previous=selection;
  selection=new Set(chosen);
  if(selectedOutput) for(const [id,indices] of previousSegments) {
    const original=before.find(e=>e.id===id);
    if(selection.has(id)&&entities.includes(original)) segmentSelection.set(id,indices);
  }
  if(commit(d=>({...d,entities,constraints}),join,false,true)) {
    animateRemoval(lost,before);
    if(lost.length) warnLost(lost.length,I18n.t('Modification appliquée.'));
    return true;
  }
  selection=previous;
  for(const [id,indices] of previousSegments) segmentSelection.set(id,indices);
  update();return false;
}
function replaceSelectedRuns(operation,extract=false) {
  const outputs=new Map(), counts=new Map();
  for(const e of selected()) {
    const parts=G.strokeParts(e);
    const selectedIndices=segmentSelection.get(e.id);
    const indices=extract&&!constructionShown(e.layer)&&parts.length?
      new Set([...(selectedIndices??parts.keys())].filter(i=>!G.constructionAt(e,i))):selectedIndices;
    const runs=Edit.selectedRuns(e,indices);
    const modified=runs.flatMap(run=>operation(run)??[run]);
    const extractsSubset=extract&&indices&&indices.size<parts.length;
    const unchanged=modified.length===runs.length&&modified.every((run,i)=>run===runs[i]);
    if(!modified.length||unchanged&&!extractsSubset) continue;
    const remainder=indices?Edit.removeSegments(e,indices):[];
    outputs.set(e.id,[...modified,...remainder]);
    counts.set(e.id,modified.length);
  }
  return outputs.size>0&&replaceSelected(e=>outputs.get(e.id)??[e],false,true,undefined,null,
    (e,i)=>i<(counts.get(e.id)??1));
}
function operate(type) {
  if(rasterMode) setRasterMode();
  if(type==='remove') {
    if(selectedConstraint) {
      const constraint=selectedConstraint;
      selectedConstraint=null;
      clipboardRelations.delete(constraint);
      commit(d=>({...d,constraints:d.constraints.filter(c=>c!==constraint)}));
      message(I18n.t('Contrainte supprimée.'));
    } else if(selectedDimension) {
      const dimension=selectedDimension;
      selectedDimension=null;
      commit(d=>({...d,constraints:d.constraints.filter(c=>c!==dimension)}));
      animateRemoval([dimension],doc.entities);
      message(I18n.t('Cote supprimée.'));
    } else if(selected().length) {
      const removed=new Map(segmentSelection);
      if(replaceSelected(e=>removed.has(e.id)?Edit.removeSegments(e,removed.get(e.id)):[],false,true,removed)) {
        selection.clear();
        update();
      }
    }
    return;
  }
  if(type==='transform') {
    if(!modification?.transform||modification.protected) openTransformation(toolDefault('transformModeDefault','auto'),false);
    return;
  }
  if(modification?.type===type) return;
  if(polylineTool()) finishPolyline();
  if(tool!=='select'&&!choose('select')) return;
  constraintMode=null;formalTargets=[];selectedConstraint=null;
  if(type==='autoClose') {segmentSelection.clear();formalSelection=[];}
  if(type==='explode') wholeFocus=null;
  modification={type,phase:null,ids:null,pivot:null,axis:null,locked:true};
  $('rotateValue').value=0;$('scaleValue').value=1;$('scaleY').value=1;$('mirrorHorizontal').checked=true;
  $('moveMode').value='relative';$('moveX').value=0;$('moveY').value=0;
  $('mirrorCopy').checked=false;$('scaleDimensions').checked=true;
  applyModificationDefaults(type);
  $('options').hidden=false;
  update();
}
function openTransformation(mode,protectRelations) {
  const auto=mode==='auto', type=auto?'move':mode;
  if(tool!=='select'&&!choose('select')) return;
  if(drag) cancelDrag();
  if(!protectRelations) selectedConstraint=null;
  if(modification?.transform&&modification.protected===protectRelations) {
    if(modification.type===type&&modification.auto===auto) return;
    Object.assign(modification,{type,auto,phase:null,ids:null,applied:false});
  } else {
    constraintMode=null;
    formalTargets=[];
    modification={type,auto,transform:true,protected:protectRelations,phase:null,ids:null,pivot:null,locked:true};
  }
  $('moveMode').value='relative';
  $('moveX').value=$('moveY').value=$('rotateValue').value=0;
  $('scaleValue').value=$('scaleY').value=1;
  $('scaleDimensions').checked=true;
  applyModificationDefaults(type);
  $('options').hidden=false;
  update();
}
function modificationItems() {
  return selected();
}
function selectionRuns(items) {
  return items.flatMap(entity=>Edit.selectedRuns(entity,segmentSelection.get(entity.id)));
}
function selectionSignature(items) {
  return items.map(e=>e.id+':'+[...(segmentSelection.get(e.id)??[])].sort((a,b)=>a-b).join('.')).join(',');
}
function selectedTraceHit(entity,position) {
  return entity&&selection.has(entity.id)&&(!segmentSelection.has(entity.id)||
    selectionRuns([entity]).some(part=>hitsEntity(part,position)));
}
function mirrorMode() {
  return $('mirrorSegment').checked?'segment':$('mirrorVertical').checked?'vertical':'horizontal';
}
function updateModification() {
  $('transformModes').hidden=tool!=='select'||Boolean(constraintMode)||Boolean(modification&&!modification.transform);
  for(const button of $('transformModes').querySelectorAll('[data-transform-mode]')) {
    const active=button.dataset.transformMode===(!modification||modification.auto?'auto':modification.type);
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active));
  }
  $('modifyOptions').hidden=!modification;
  $('transformSize').hidden=!modification?.transform||modification.protected;
  $('transformSizeLock').disabled=!modificationItems().length;
  $('closureReadout').hidden=modification?.type!=='autoClose';
  if(!modification) return;
  const {type,phase}=modification, items=modificationItems();
  const ids=selectionSignature(items);
  if(modification.ids!==ids && !phase) {
    modification.ids=ids;
    modification.applied=false;
    if(type==='rotate') $('rotateValue').value=0;
    if(type==='scale') {$('scaleValue').value=1;$('scaleY').value=1;}
    if(items.length&&!modification.pivot&&type!=='rotate') {
      const pivot=type==='mirror'?[0,0]:selectionFrame(items)?.center??G.mid(...getBounds(items));
      setPivotFields(pivot);
      if(type==='move'&&$('moveMode').value==='absolute') setMoveDestination(pivot);
    }
  }
  if(type==='rotate'&&!phase&&!modification.pivot&&items.length) {
    const center=rotationCenter(items);
    if(center) setPivotFields(center);
  }
  const segmentAxis=type==='mirror'&&mirrorMode()==='segment';
  $('modifyName').textContent=modification.transform?
    (modification.protected?I18n.t('Sélection · '):I18n.t('Transformer · '))+I18n.t(modificationNames[type]):I18n.t(modificationNames[type]);
  $('scaleDimensionsRow').hidden=Boolean(modification.protected);
  $('modifyPivot').hidden=!(type==='move'||type==='rotate'||type==='scale'||type==='mirror'&&!segmentAxis);
  $('moveOptions').hidden=type!=='move';
  $('rotateOptions').hidden=type!=='rotate';
  $('scaleOptions').hidden=type!=='scale';
  $('scaleYRow').hidden=modification.locked;
  $('scaleLock').textContent=modification.locked?I18n.t('🔒 Proportions'):I18n.t('🔓 Proportions');
  $('scaleLock').setAttribute('aria-pressed',String(modification.locked));
  const sizeLock=$('transformSizeLock');
  sizeLock.setAttribute('aria-pressed',String(modification.locked));
  sizeLock.title=$('scaleLock').textContent;
  sizeLock.setAttribute('aria-label',sizeLock.title);
  $('mirrorOptions').hidden=type!=='mirror';
  $('pickMirrorAxis').hidden=!segmentAxis;
  $('closeOptions').hidden=type!=='close';
  $('autoCloseOptions').hidden=type!=='autoClose';
  $('scissorsOptions').hidden=type!=='scissors';
  $('filletOptions').hidden=type!=='fillet';
  $('applyModification').hidden=['scissors','fillet'].includes(type);
  $('applyModification').disabled=!items.length||Boolean(phase)||(segmentAxis&&!modification.axis);
  if(type==='autoClose') {
    const traces=items.filter(e=>e.type!=='point'), closed=traces.filter(Edit.isClosed).length;
    $('openContourCount').value=traces.length-closed;
    $('closedContourCount').value=closed;
    const plan=automaticClosurePlan(items);
    $('closureProposal').textContent=plan?plan.length+I18n.t(' jonction(s) possible(s).'):I18n.t('Saisissez une distance positive ou nulle.');
    $('applyModification').disabled=!plan?.length;
  }
  const hint=type==='fillet'?I18n.t('Choisissez un coin formé par deux segments.'):
    type==='scissors'?I18n.t('Cliquez sur la portion du tracé à supprimer.'):phase==='pivot'?I18n.t('Cliquez sur le point de pivot.'):phase==='axis'?I18n.t('Cliquez sur un segment droit.'):
    !items.length?I18n.t('Cliquez sur les objets ou tracez une zone pour les sélectionner.'):
    type==='rotate'?I18n.t('Maintenez puis glissez sur un tracé sélectionné pour tourner.'):
    type==='scale'?I18n.t('Glissez une poignée du cadre pour mettre à l’échelle.'):
    modification.auto?I18n.t('Tracé ou centre : déplacement · Bord extérieur : échelle · Plus loin : rotation'):
    type==='move'?I18n.t('Glissez un sommet, un milieu ou le centre. ')+I18n.t(modifierLabels[gestureKeys.ctrlKey])+
      I18n.t(' permet une retouche locale.'):
    type==='autoClose'?I18n.t('Sélectionnez les tracés entiers. Les jonctions possibles sont repérées avant application.'):
    type==='close'?I18n.t('Seuls les tracés dont l’écart est dans la tolérance seront fermés.'):
    type==='explode'?I18n.t('Appliquez pour dissocier les portions sélectionnées. Glissez un morceau indépendant pour le déplacer.'):
    items.length+I18n.t(' objet(s) sélectionné(s).');
  $('modifyHint').textContent=hint;
  $('hint').textContent=hint;
}
function modificationPivot() {
  const x=$('pivotX').valueAsNumber,y=$('pivotY').valueAsNumber;
  return Number.isFinite(x)&&Number.isFinite(y)?fromWork([x,y]):null;
}
function setMoveDestination(p) {
  const [x,y]=$('moveMode').value==='absolute'?toWork(p):p;
  $('moveX').value=x;$('moveY').value=y;
}
function captureCoordinateFields() {
  if(!modification) return null;
  const target=[$('moveX').valueAsNumber,$('moveY').valueAsNumber];
  return {pivot:modificationPivot(),destination:$('moveMode').value==='absolute'&&target.every(Number.isFinite)?fromWork(target):null};
}
function restoreCoordinateFields(fields) {
  if(fields?.pivot) setPivotFields(fields.pivot);
  if(fields?.destination) setMoveDestination(fields.destination);
}
function signedDegrees(value) {
  const rounded=Math.round(value);
  const angle=((rounded+180)%360+360)%360-180;
  return angle===-180&&rounded>0?180:angle;
}
function modificationTransform() {
  if(!modification||!['move','rotate','scale','mirror'].includes(modification.type)) return null;
  const {type,axis}=modification;
  const mirror=type==='mirror', mode=mirrorMode();
  const pivot=mirror&&mode==='segment'?axis?.[0]:
    type==='rotate'&&!modification.pivot?rotationCenter(modificationItems()):modificationPivot();
  if(!pivot) return null;
  if(type==='move') {
    const target=[$('moveX').valueAsNumber,$('moveY').valueAsNumber];
    if(!target.every(Number.isFinite)) return null;
    const delta=$('moveMode').value==='absolute'?G.sub(fromWork(target),pivot):target;
    return {pivot,map:p=>G.add(p,delta),rotation:0,factor:1,sy:1,mirror:false};
  }
  const degrees=type==='rotate'?$('rotateValue').valueAsNumber:0;
  const factor=type==='scale'?$('scaleValue').valueAsNumber:1;
  const sy=type==='scale'&&!modification.locked?$('scaleY').valueAsNumber:factor;
  if(!Number.isFinite(degrees)||!(factor>0)||!(sy>0)||!Number.isFinite(factor)||!Number.isFinite(sy)) return null;
  const rotation=mirror?(mode==='segment'?2*G.angle(...axis):mode==='vertical'?Math.PI:0):
    degrees*Math.PI/180;
  return planarTransform(pivot,rotation,factor,sy,mirror);
}
function planarTransform(pivot,rotation,factor,sy,mirror=false) {
  const cos=Math.cos(rotation),sin=Math.sin(rotation);
  const map=p=>{
    let [x,y]=G.sub(p,pivot);
    if(mirror) y=-y;
    return G.add(pivot,[(x*cos-y*sin)*factor,(x*sin+y*cos)*sy]);
  };
  return {pivot,map,rotation,factor,sy,mirror};
}
function displayedScaleTransform(tf) {
  return modification?.applied&&modification.type==='scale'?{...tf,map:p=>p,factor:1,sy:1}:tf;
}
function transformModification(e,tf) {
  return tf.sy!==tf.factor?G.scaleAxes(e,tf.map,tf.factor,tf.sy):G.transform(e,tf.map,tf.rotation,tf.factor,tf.mirror);
}
function transformSelection(e,tf) {
  const indices=segmentSelection.get(e.id);
  return indices?Edit.transformParts(e,indices,part=>transformModification(part,tf)):transformModification(e,tf);
}
function modificationClick(p) {
  const phase=modification?.phase;
  if(phase==='pivot') {
    const point=snapped(p,true);
    setPivotFields(point);
    modification.pivot=point;
    if(modification.type==='move'&&$('moveMode').value==='absolute') setMoveDestination(point);
    modification.applied=false;
    modification.phase=null;
  } else if(phase==='axis') {
    const hitEdge=hit(p).map(entity=>edgeAt(entity,p,true)).find(Boolean);
    if(!hitEdge) {message(I18n.t('Choisissez un segment droit pour l’axe.'));return;}
    modification.axis=hitEdge.vertices;modification.phase=null;modification.applied=false;
  }
  update();
}
function automaticGesture(p) {
  if(tool!=='select'||constraintMode||modification&&(!modification.auto||modification.phase)) return null;
  const items=selected(), frame=selectionFrame(items);
  if(!frame) return null;
  const [[left,bottom],[right,top]]=frame.bounds.map(screen);
  const gap=Math.max(left-p[0],p[0]-right,top-p[1],p[1]-bottom);
  if(gap<7||gap>36||selectionAnchor(p,items,frame)||selectionRuns(items).some(e=>hitsEntity(e,world(p)))) return null;
  const pivot=modification?.pivot??frame.center;
  const rotationPivot=()=>modification?.pivot??rotationCenter(items,frame);
  if(gap>17) return {type:'rotate',pivot:rotationPivot()};
  const handle=scaleHandleAt({pivot,map:q=>q},[Math.max(left,Math.min(right,p[0])),Math.max(top,Math.min(bottom,p[1]))]);
  return handle?{type:'scale',handle,pivot}:{type:'rotate',pivot:rotationPivot()};
}
function scaleHandles(tf) {
  const items=modificationItems();
  if(!items.length) return [];
  const [min,max]=selectionFrame(items)?.bounds??getBounds(items);
  return [[0,0],[.5,0],[1,0],[1,.5],[1,1],[.5,1],[0,1],[0,.5]].map(fraction=>{
    const point=min.map((n,i)=>n+(max[i]-n)*fraction[i]);
    return {point,at:screen(tf.map(point)),axes:fraction.map(f=>f!==.5),
      direction:Math.atan2(.5-fraction[1],fraction[0]-.5)*180/Math.PI};
  });
}
function scaleCursor(handle,active) {
  const direction=handle.direction;
  const native=Math.abs(direction)%180===0?'ew-resize':Math.abs(direction)%180===90?'ns-resize':
    Math.sign(Math.sin(direction*Math.PI/90))>0?'nwse-resize':'nesw-resize';
  return {behavior:active?'scaleDrag':'scaleReady',tool:'scale',direction,native};
}
function scaleHandleAt(tf,p) {
  const handles=scaleHandles(tf);
  const valid=h=>h.axes.some((active,i)=>active&&Math.abs(h.point[i]-tf.pivot[i])>G.eps);
  const corner=handles.find(h=>valid(h)&&G.dist(h.at,p)<=8);
  if(corner) return corner;
  for(const i of [1,3,5,7]) {
    if(!handles[i]||!valid(handles[i])) continue;
    const a=handles[i-1].at,b=handles[(i+1)%8].at;
    if(G.dist(p,G.nearest(a,b,p))<=6) return handles[i];
  }
  return null;
}
function canvasCursor(p) {
  const colorTool=modification?.type??constraintMode??tool;
  const mode=(behavior,native,source=colorTool)=>({behavior,native,tool:source,direction:0});
  if(drag?.kind==='pan') return mode('move','grabbing','pan');
  if(['radialResize','arcEndpoint'].includes(drag?.kind)) return mode('point','crosshair');
  if(drag?.kind==='scaleGesture') return scaleCursor(drag.handle,true);
  if(drag?.kind==='rotateGesture'&&drag.canRotate) return mode(drag.aim?'rotateDrag':'rotateReady','grabbing','rotate');
  if(drag?.kind==='box'&&drag.end) return mode('box','crosshair');
  if(['splineKnot','splineHandle'].includes(drag?.kind)||drag?.kind==='edit'&&drag.vertices.length===1) return mode('point','move');
  if(['edit','move','rigid','dimensionMove'].includes(drag?.kind)) return mode('move','grabbing');
  if(modification?.phase||['scissors','fillet'].includes(modification?.type)||constraintMode!==null) return mode('target','crosshair');
  if(!drag&&!modification&&tool==='select'&&workOriginAt(p)) return mode('select','pointer');
  if(!drag&&(!modification||modification.protected)&&constraintTagAt(p)) return mode('select','pointer');
  const gesture=!drag&&automaticGesture(p);
  if(gesture?.type==='scale') return scaleCursor(gesture.handle,false);
  if(gesture?.type==='rotate') return mode('rotateReady','grab','rotate');
  if(modification?.type==='scale') {
    const tf=modificationTransform();
    const handle=tf&&scaleHandleAt(displayedScaleTransform(tf),p);
    if(handle) return scaleCursor(handle,false);
  }
  if(modification?.type==='rotate') {
    const tf=modificationTransform(), position=world(p);
    if(modificationItems().some(e=>hitsEntity(e,position)||tf&&!modification.applied&&tf.rotation!==0&&
      hitsEntity(transformModification(e,tf),position))) return mode('rotateReady','grab');
  }
  if(modification?.type==='explode') {
    const object=hit(world(p))[0];
    if(object&&!G.strokeParts(object).length) return mode('moveReady','grab');
  }
  if(modification&&modification.type!=='move') return mode('select','default');
  if(tool==='dimension') return mode('select','default');
  if(drag?.kind==='textMove') return mode('move','grabbing','text');
  if(tool==='text') return {behavior:null,native:textPicking?'crosshair':'text',tool:'text',direction:0};
  if(tool==='select'&&!modification&&!constraintMode&&doc.texts?.length&&textAt(p)) return mode('moveReady','grab','text');
  if(tool==='offset') return mode('target','crosshair');
  if(tool==='point'||tool==='origin') return mode('target','crosshair');
  if(tool!=='select') return mode('draw','crosshair');
  const knot=focusedKnot();
  if(knot&&handleLayout(knot.entity,knot.index).arms.some(a=>a&&G.dist(a,p)<=7)) return mode('point','move');
  const position=world(p);
  if(selectionAnchor(p,selected())) return mode('moveReady','grab');
  if(dimensionAt(p)||hit(position).length) return mode('moveReady','grab');
  return mode('select','default');
}
let currentCanvasCursor=null;
function precisionTool(next) {
  return rasterMode?'raster':next.tool==='pan'?'pan':modification?.type??constraintMode??tool;
}
function cursorActionBadge(next) {
  const id=precisionTool(next), color=cursorPreferences.colors[id]??cursorPreferences.colors.select;
  const badge=(path,size)=>'data:image/svg+xml,'+encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+size+' '+size+'"><path d="'+path+
    '" fill="none" stroke="'+color+'" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>');
  if(next.behavior==='target'&&constraintMode) return badge(constraintSymbols[constraintMode][0],20);
  if(next.behavior==='target'&&rasterMode==='origin') return SnapIndicators.image('origin',color);
  if(next.behavior==='select'||next.behavior==='target') {
    if(modificationIcons[id]) return badge(modificationIcons[id],24);
    if(toolMiniatures[id]) return toolIconSource(id);
  }
  if(next.behavior==='draw'&&toolMiniatures[id]) return toolIconSource(id);
  const shape={moveReady:'moveMark',move:'move',point:'nodeSquare',box:'boxDash',draw:'crossDot',
    target:'target',scaleReady:'pushArrow',scaleDrag:'doubleArrow',rotateReady:'turnDot',rotateDrag:'turnDouble'}[next.behavior];
  return shape?CursorProfiles.image(shape,color,next.direction).src:null;
}
function updateCanvasCursor() {
  const input=[cursorPoint,doc,tool,modification,modification?.phase,modification?.applied,modification?.locked,textPicking,
    constraintMode,rasterMode,rasterRotation,...selection,drag,drag?.aim,drag?.end,camera.x,camera.y,camera.scale,viewport,selectedDimension,
    ...(modification?['pivotX','pivotY','rotateValue','scaleValue','scaleY'].map(id=>$(id).value):[])];
  if(cursorInputs.length===input.length&&input.every((value,i)=>value===cursorInputs[i])) return;
  cursorInputs=input;
  if(!cursorPoint && !rasterMode) {
    currentCanvasCursor=null;
    if(cursorPositionKey) {canvas.style.cursor='';cursorPositionKey='';}
    return;
  }
  const next=rasterMode?{tool:'raster',direction:0,
    behavior:rasterMode==='rotate'?(rasterRotation?'rotateDrag':'rotateReady'):'target',
    native:rasterMode==='rotate'?(rasterRotation?'grabbing':'grab'):'crosshair'}:canvasCursor(cursorPoint);
  currentCanvasCursor=next;
  const css=cursorPreferences.mode==='precision'&&tool!=='text'&&next.tool!=='text'?
    CursorProfiles.precisionCss(precisionTool(next),cursorPreferences):
    next.behavior&&!rasterMode?CursorProfiles.css(next.behavior,next.tool,next.direction,cursorPreferences,next.native):next.native;
  if(css!==cursorPositionKey) {canvas.style.cursor=css;cursorPositionKey=css;}
}
function pickRotationGroup(entity,mod) {
  if(entity.vectorGroup||mod.ctrlKey||mod.shiftKey) {pick([entity.id],mod);return;}
  const visibleObjects=doc.entities.filter(visible);
  const endpoints=visibleObjects.map(e=>({id:e.id,points:Edit.contour(e)?.points??Formal.vertices(e)}));
  const coincident=(doc.constraints??[]).filter(c=>c.type==='coincident'&&!Formal.isPointOnTrace(c));
  const ids=new Set([entity.id]);
  let size=0;
  while(size!==ids.size) {
    size=ids.size;
    const points=endpoints.filter(e=>ids.has(e.id)).flatMap(e=>e.points);
    for(const e of endpoints) if(!ids.has(e.id)&&e.points.some(p=>points.some(q=>G.dist(p,q)<=G.eps))) ids.add(e.id);
    for(const c of Formal.connected(coincident,[...ids])) for(const r of c.refs) ids.add(r.id);
  }
  pick(visibleObjects.filter(e=>ids.has(e.id)).map(e=>e.id),{});
}
function rotationReference(p) {
  const position=world(p);
  let best=null;
  for(const e of selected()) {
    const indices=segmentSelection.get(e.id);
    const edge=edgeAt(e,position,false,index=>(!indices||indices.has(index))&&Edit.edges(e)[index]?.type==='line');
    if(edge&&(!best||edge.distance<best.distance)) best={id:e.id,index:edge.index,distance:edge.distance,part:Edit.edges(e)[edge.index]};
  }
  return best;
}
function changeRotation(action,p) {
  const current=world(p);
  if(G.dist(action.pivot,current)<=G.eps) return;
  const degrees=(G.angle(action.pivot,current)-action.bearing)*180/Math.PI;
  let rotation=(action.initial+degrees)*Math.PI/180;
  action.angleGuide=null;action.axes=[];action.angleTransform=null;
  if(action.shiftKey) {
    action.angleReference??=rotationReference(action.start);
    const reference=action.angleReference;
    if(reference) {
      const [a,b]=reference.part.p, initial=G.angle(a,b);
      const trial=planarTransform(action.pivot,rotation,1,1);
      const from=trial.map(a);
      const guide=angularGuide(from,trial.map(b));
      if(guide) {
        rotation=guide.angle-initial;
        action.angleTransform=planarTransform(action.pivot,rotation,1,1);
        const start=action.angleTransform.map(a), end=action.angleTransform.map(b);
        action.angleGuide={...guide,from:start,q:end};
        if(guide.axis) action.axes=[{id:reference.id,index:reference.index,type:guide.axis}];
      }
    } else {
      rotation=Math.round(rotation/angleStep)*angleStep;
      action.angleTransform=planarTransform(action.pivot,rotation,1,1);
    }
  }
  $('rotateValue').value=signedDegrees(rotation*180/Math.PI);
  modification.applied=false;
  action.aim=p;
  snapTransform(action,p);
}
function changeScale(action,p) {
  const delta=G.sub(world(p),action.origin);
  const available=action.handle.axes.map((enabled,i)=>enabled&&Math.abs(action.handle.point[i]-action.pivot[i])>G.eps);
  const factors=action.factors.map((factor,i)=>available[i]?
    Math.max(.000001,factor+delta[i]/(action.handle.point[i]-action.pivot[i])):factor);
  const dominant=Math.abs(factors[0]-action.factors[0])>=Math.abs(factors[1]-action.factors[1])?0:1;
  const step=metricStep(action);
  if(step>0) {
    const items=modificationItems();
    const size=G.sub(...(selectionFrame(items)?.bounds??getBounds(items)).slice().reverse());
    for(const i of modification.locked?[dominant]:[0,1]) if(available[i]&&size[i]>G.eps)
      factors[i]=Math.max(step,Math.round(size[i]*factors[i]/step)*step)/size[i];
  }
  if(modification.locked) {
    factors.fill(factors[dominant]);
  }
  $('scaleValue').value=factors[0];$('scaleY').value=factors[1];
  modification.applied=false;
  snapTransform(action,p);
}
function snapTransform(action,p) {
  action.transformSnap=null;
  action.snapAt=null;
  if(suspended||!$('snap').checked||action.angleTransform||
    action.kind==='scaleGesture'&&metricStep(action)) return;
  const tf=modificationTransform();
  if(!tf) return;
  const radius=8/camera.scale;
  const cell=q=>q.map(n=>Math.floor(n/radius));
  if(action.transformTargets?.radius!==radius) {
    const items=selected(), ids=new Set(items.map(e=>e.id)), buckets=new Map();
    for(const entity of doc.entities) if(visible(entity)&&!ids.has(entity.id)) {
      for(const q of Formal.vertices(entity)) {
        if(!visiblePoint(entity,q)) continue;
        const key=cell(q).join('/');
        if(!buckets.has(key)) buckets.set(key,[]);
        buckets.get(key).push({q,entity,kind:entity.type==='circle'||entity.type==='ellipse'&&entity.s===undefined?'center':'point'});
      }
      for(const part of visibleStrokeParts(entity)) if(part.type==='line') {
        const q=G.mid(...part.p), key=cell(q).join('/');
        if(!buckets.has(key)) buckets.set(key,[]);
        buckets.get(key).push({q,entity,kind:'midpoint'});
      }
    }
    for(const {target:q} of layerOrigins(activeLayer)) {
      const key=cell(q).join('/');
      if(!buckets.has(key)) buckets.set(key,[]);
      buckets.get(key).push({q,kind:'origin'});
    }
    action.transformTargets={radius,buckets,points:selectionRuns(items).flatMap(Formal.vertices)};
  }
  let nearest=radius, best=null;
  for(const source of action.transformTargets.points) {
    const moved=tf.map(source), [x,y]=cell(moved);
    for(let dx=-1;dx<=1;dx++) for(let dy=-1;dy<=1;dy++) {
      const targets=action.transformTargets.buckets.get((x+dx)+'/'+(y+dy))??[];
      for(const target of targets) {
        const gap=G.dist(moved,target.q);
        if(gap>=nearest||G.dist(source,target.q)<=G.eps) continue;
        const exact=coincidenceTransform(action,tf,source,target.q);
        if(!exact||G.dist(exact.map(source),target.q)>G.eps*4) continue;
        best={tf:exact,target};
        nearest=gap;
      }
    }
  }
  if(!best) return;
  action.transformSnap=best;
  action.snapAt=p;
  action.snapIndicator={...best.target,extra:$('autoCoincidence').checked?'coincidence':null};
}
function coincidenceTransform(action,tf,source,target) {
  const a=G.sub(source,tf.pivot), b=G.sub(target,tf.pivot);
  if(action.kind==='rotateGesture') {
    if(Math.hypot(...a)<=G.eps||Math.abs(Math.hypot(...a)-Math.hypot(...b))>G.eps*4) return null;
    return planarTransform(tf.pivot,G.angle(tf.pivot,target)-G.angle(tf.pivot,source),1,1);
  }
  const ratios=a.map((value,i)=>Math.abs(value)>G.eps?b[i]/value:null);
  const previous=[tf.factor,tf.sy];
  const factors=modification.locked?Array(2).fill(ratios.find(r=>r!==null)):
    ratios.map((ratio,i)=>action.handle.axes[i]&&ratio!==null?ratio:previous[i]);
  if(!factors.every(f=>Number.isFinite(f)&&f>=.000001)) return null;
  return planarTransform(tf.pivot,0,...factors);
}
function directionArrows(entity,ink) {
  const points=G.trace(entity,camera.scale).map(screen);
  const spacing=52, margin=12;
  const halfLength=points.slice(1).reduce((sum,p,i)=>sum+G.dist(points[i],p)/2,0);
  let phase=halfLength%spacing, drawn=false;
  const arrow=(p,angle)=>stroke([G.polar(p,8,angle+2.58),p,G.polar(p,8,angle-2.58)],ink.point,1.7);
  for(let i=1;i<points.length;i++) {
    const a=points[i-1], b=points[i], v=G.sub(b,a), length=Math.hypot(...v);
    if(length<=G.eps) continue;
    let lo=0,hi=1;
    for(let j=0;j<2;j++) {
      if(!v[j]) {if(a[j]<-margin||a[j]>viewport[j]+margin) hi=-1;continue;}
      const p=(-margin-a[j])/v[j], q=(viewport[j]+margin-a[j])/v[j];
      lo=Math.max(lo,Math.min(p,q));hi=Math.min(hi,Math.max(p,q));
    }
    const first=phase+Math.max(0,Math.ceil((lo*length-phase)/spacing))*spacing;
    const maxArrows=Math.ceil((viewport[0]+viewport[1]+4*margin)/spacing)+2;
    for(let mark=0;mark<maxArrows&&first+mark*spacing<=hi*length;mark++) {
      const offset=first+mark*spacing;
      arrow(G.add(a,G.mul(v,offset/length)),G.angle(a,b));drawn=true;
    }
    phase=((phase-length)%spacing+spacing)%spacing;
  }
  if(!drawn&&points.length>=2) {
    const i=Math.floor((points.length-1)/2), a=points[i],b=points[i+1], mid=G.mid(a,b);
    if(G.dist(a,b)>G.eps&&mid.every((p,j)=>p>=0&&p<=viewport[j])) arrow(mid,G.angle(a,b));
  }
}
function previewDimsPart(preview,id,index) {
  const value=preview.originals.get(id);
  return value===true||value?.has(index);
}
function drawPreviewSource(entity,color,width,construction,dimmed) {
  if(!dimmed) {drawEntity(entity,color,width,construction);return;}
  context.save();
  context.globalAlpha*=.6;
  drawEntity(entity,color,width,construction);
  context.restore();
}
function modificationPreview() {
  const originals=new Map(), shapes=[];
  const mark=(entity,index)=>{
    if(originals.get(entity.id)===true) return;
    if(index===undefined) originals.set(entity.id,true);
    else {
      if(!originals.has(entity.id)) originals.set(entity.id,new Set());
      originals.get(entity.id).add(index);
    }
  };
  const preview={originals,shapes,tf:null};
  if(!modification) return preview;
  const {type,applied}=modification;
  if(type==='fillet') {
    const target=cursorPoint&&filletTarget(cursorPoint);
    if(target?.proposal) {
      preview.fillet=target.proposal;
      for(const side of target.sides) mark(side.entity,side.index);
    }
    return preview;
  }
  if(type==='autoClose') {
    preview.closures=automaticClosurePlan(modificationItems())??[];
    for(const {a,b,connector} of preview.closures) if(connector) {
      mark(a.entity,a.index);mark(b.entity,b.index);
    }
    return preview;
  }
  if(type==='move'&&drag?.selectionGesture) return preview;
  const tf=drag?.transformSnap?.tf??drag?.angleTransform??modificationTransform();
  preview.tf=tf;
  if(!tf||applied||
    !tf.mirror&&tf.rotation===0&&tf.factor===1&&tf.sy===1&&G.dist(tf.map(tf.pivot),tf.pivot)<=G.eps) return preview;
  for(const entity of modificationItems()) {
    for(const run of selectionRuns([entity])) {
      const shape=transformModification(run,tf);
      if(!G.serial(shape)) continue;
      shapes.push(shape);
      const parts=segmentSelection.get(entity.id);
      if(parts) for(const index of parts) mark(entity,index);
      else mark(entity);
    }
  }
  return preview;
}
function drawModification(ink,preview) {
  if(!modification) return;
  if(modification.type==='fillet') {
    if(preview.fillet) {
      drawEntity(preview.fillet.arc,ink.preview,2);
      for(const point of preview.fillet.points) drawKnotSquare(screen(point),ink,4,ink.point);
    }
    return;
  }
  if(modification.type==='autoClose') {
    for(const {connector} of preview.closures) if(connector) drawEntity(connector,ink.point,1.8);
    return;
  }
  if(modification.type==='move'&&drag?.selectionGesture) return;
  if(modification.type==='reverse') {
    for(const e of selectionRuns(modificationItems())) for(const part of visibleStrokeParts(e)) directionArrows(part,ink);
    return;
  }
  const {tf,shapes}=preview;
  if(!tf) return;
  const {pivot,rotation}=tf;
  for(const shape of shapes) drawEntity(shape,ink.preview,1.7,constructionShown(shape.layer));
  drawKnotSquare(screen(pivot),ink,4,ink.point);
  if(modification.type==='scale') {
    const handles=scaleHandles(displayedScaleTransform(tf));
    if(handles.length) {
      stroke([0,2,4,6,0].map(i=>handles[i].at),ink.preview,1,[4,3]);
      for(const handle of handles) drawKnotSquare(handle.at,ink,4,ink.point);
      const [left,bottom]=handles[0].at,[right,top]=handles[4].at;
      drawFrameDimensions([left,top],[right,bottom],[(right-left)/camera.scale,(bottom-top)/camera.scale],ink);
    }
  }
  if(modification.type==='mirror') {
    const heading=rotation/2, length=Math.hypot(...viewport)/camera.scale;
    stroke([screen(G.polar(pivot,-length,heading)),screen(G.polar(pivot,length,heading))],ink.point,1,[5,4]);
  }
  if(drag?.kind==='rotateGesture'&&drag.aim) {
    stroke([screen(pivot),drag.start],ink.point,1,[5,4]);
    stroke([screen(pivot),drag.aim],ink.preview,1);
    const [x,y]=drag.aim;
    if(!drag.angleGuide) drawAngleTag(angleLabel(signedDegrees(rotation*180/Math.PI)),x+10,y-10,ink);
  }
}
function transferRelation(c,ids,before,after,tf,{copy=false,scale=false,layer}={}) {
  const refs=c.refs.map(r=>r.kind==='origin'?r:{...r,id:ids.get(r.id)??r.id});
  const all=c.refs.every(r=>ids.has(r.id));
  if(copy&&!c.refs.every(r=>r.kind==='origin'||ids.has(r.id))) return null;
  if(refs.some(r=>r.kind==='origin'&&!layerOrigins(layer??c.layer).some(o=>o.name===r.name&&G.dist(o.target,r.target)<=G.eps))) return null;
  let result={...c,refs};
  if(c.origin&&!layerOrigins(after.get(refs[0].id)?.layer).some(o=>o.name===c.origin)) return null;
  if(c.type==='cornerAngle'&&tf.mirror) result.value=-c.value;
  if(c.type==='locked'&&copy) result=Formal.make('locked',refs,[...after.values()]);
  if(!result) return null;
  if(Formal.isDimension(c)) {
    if(layer!==undefined) result.layer=layer;
    if(scale&&all) {
      const value=Formal.dimensionValue(after,result);
      if(value===null||c.mode==='angle'&&!(value>0&&value<180)) return null;
      result.value=value;
      if(c.expression!==undefined&&value!==c.value) {
        const adjustment=c.value===0?' + ('+value+')':' * ('+value/c.value+')';
        const expression='('+c.expression+')'+adjustment;
        const evaluated=Numeric.evaluate(expression);
        if(Number.isFinite(evaluated)&&Math.abs(evaluated-value)<=1e-12*Math.max(1,Math.abs(value))) result.expression=expression;
        else delete result.expression;
      }
    }
    else if(c.driven) result.value=Formal.dimensionValue(after,result)??c.value;
    if(all) {
      const layout=dimensionLayout(c,before), geometry=Formal.dimensionGeometry(after,result);
      if(layout&&geometry) result.offset=dimensionOffsetAt(result,geometry,tf.map(world(layout.label)));
    }
  }
  return result&&Formal.satisfied(after,result)?result:null;
}
function warnLost(count,action) {
  message(action+(count?' · '+count+I18n.t(' cote(s) ou contrainte(s) non transférée(s).'):''));
}
function confirmCoincidence(before,after,constraints,lost) {
  if(!lost.length||!$('autoCoincidence').checked) return true;
  const newRelations=Formal.automatic(before,after,constraints,layerOrigins).slice(constraints.length);
  if(!newRelations.length) return true;
  if(window.confirm(I18n.t('Ce raccord crée une coïncidence et contredit ')+lost.length+
    I18n.t(' cote(s) ou contrainte(s). OK : conserver le raccord et supprimer ces relations. ')+
    I18n.t('Annuler : garder le geste sans le raccord si les relations le permettent.'))) return true;
  return false;
}
let keyboardMovement=null;
function nudgeSelection(items,nudge,event) {
  const factor=nudge.distance/Formats.millimeters[doc.units];
  const delta=[nudge.x*factor,nudge.y*factor];
  const transform=entity=>G.transform(entity,p=>G.add(p,delta));
  const signature=selectionSignature(items);
  const repeat=event.repeat&&keyboardMovement?.key===event.key&&keyboardMovement.nudge===nudge&&
    keyboardMovement.doc===doc&&keyboardMovement.signature===signature;
  if(!repeat) keyboardMovement=null;
  const changes=new Map(items.map(entity=>{
    const indices=segmentSelection.get(entity.id);
    return [entity.id,indices?Edit.transformParts(entity,indices,transform):transform(entity)];
  }));
  if([...changes.values()].some(entity=>!entity||!G.serial(entity)||!Edit.valid(entity))) {
    message(I18n.t('Déplacement hors des limites de la géométrie.'));
    return;
  }
  if(commit(d=>({...d,entities:d.entities.map(e=>changes.get(e.id)??e)}),
    false,true,false,true,false,false,!repeat,!modification)) {
    keyboardMovement={key:event.key,nudge,doc,signature};
  }
}
function commitWithoutCoincidence(changes,axes=[]) {
  if(!changes?.size||[...changes.values()].some(e=>!G.serial(e)||!Edit.valid(e))) {
    message(I18n.t('Le geste sans aimantation ne produit pas de transformation valide.'));
    return false;
  }
  const ok=commit(d=>({...d,entities:d.entities.map(e=>changes.get(e.id)??e),
    constraints:[...(d.constraints??[]),...axisConstraints(axes,d.constraints)]}),false,true,false,true);
  if(ok) message(I18n.t('Transformation appliquée sans raccord. Les relations sont conservées.'));
  return ok;
}
function commitTransform(tf,type,withoutSnap,axes=[]) {
  const selectedItems=modificationItems(), copy=type==='mirror'&&$('mirrorCopy').checked;
  const partialCopy=copy&&selectedItems.some(e=>segmentSelection.has(e.id));
  const snapshot=partialCopy?selectionSnapshot(selectedItems,doc.constraints??[]):null;
  const source=snapshot?.entities??selectedItems;
  const ids=new Map(), before=new Map(doc.entities.map(e=>[e.id,e]));
  if(snapshot) for(const e of source) before.set(e.id,e);
  const groups=new Map();
  const transformed=source.map(e=>{
    const moved=copy?transformModification(e,tf):transformSelection(e,tf);
    if(!moved) return null;
    const result=copy?identity({...moved,...copiedVectorGroup(e,groups)}):moved;
    ids.set(e.id,result.id);return result;
  });
  if(transformed.some(e=>!e||!G.serial(e)||!Edit.valid(e))) {message(I18n.t('Transformation hors limites.'));return false;}
  const after=new Map(doc.entities.map(e=>[e.id,e]));
  for(const e of transformed) after.set(e.id,e);
  if(modification.protected) {
    const constraints=(doc.constraints??[]).map(c=>c.refs.every(r=>ids.has(r.id))?
      transferRelation(c,ids,before,after,tf)??c:c);
    constraints.push(...axisConstraints(axes,constraints));
    if(!commit(d=>({...d,entities:[...after.values()],constraints}),false,true,false,true,true,true)) return false;
    if(type==='move') storeMovedPivot(tf.map(tf.pivot));
    message(I18n.t('Transformation appliquée.'));
    return true;
  }
  const constraints=snapshot?[...(doc.constraints??[])]:[];
  const lost=[], copies=[];
  for(const c of snapshot?.constraints??doc.constraints??[]) {
    const affected=c.refs.some(r=>ids.has(r.id));
    if(!snapshot&&(copy||!affected)) constraints.push(c);
    if(!affected) continue;
    const adapted=transferRelation(c,ids,before,after,tf,{copy,scale:type==='scale'&&$('scaleDimensions').checked});
    if(adapted) (copy?copies:constraints).push(adapted);
    else lost.push(c);
  }
  if(copy) constraints.push(...DimensionTable.rebase(copies,doc));
  const coincidence=transformModes.has(type);
  if(coincidence&&!confirmCoincidence([...before.values()],[...after.values()],constraints,lost)) {
    const raw=withoutSnap??tf;
    const changes=new Map(source.map(e=>[e.id,transformSelection(e,raw)]));
    const ok=commitWithoutCoincidence(changes,axes);
    if(ok&&type==='move') storeMovedPivot(raw.map(raw.pivot));
    return ok;
  }
  constraints.push(...axisConstraints(axes,constraints));
  if(!commit(d=>({...d,entities:[...after.values()],constraints}),false,false,true,false,coincidence,!copy&&coincidence)) return false;
  if(!copy) selection=new Set(transformed.map(e=>e.id));
  if(type==='move') storeMovedPivot(tf.map(tf.pivot));
  formalSelection=[];clipboardRelations.clear();
  if(!copy) animateRemoval(lost,[...before.values()]);
  warnLost(lost.length+(snapshot?.omitted??0),copy?I18n.t('Copie miroir créée.'):I18n.t('Transformation appliquée.'));
  return true;
}
function closeSelected() {
  if(!$('closeTolerance').checkValidity()||!Number.isFinite($('closeTolerance').valueAsNumber)) {
    message(I18n.t('Saisissez une tolérance positive ou nulle.'));return false;
  }
  const maximum=closeTolerance/Formats.millimeters[doc.units];
  let closed=0, skipped=0;
  const ok=replaceSelectedRuns(e=>{
    const entry=Edit.contour(e);
    if(!entry||entry.parts.length===1&&entry.parts[0].type==='line') {skipped++;return null;}
    const [start,end]=entry.points, gap=G.dist(start,end);
    if(gap>maximum+G.eps) {skipped++;return null;}
    let result;
    if(e.type==='poly'&&gap>G.eps&&e.p.length>=3) result={...e,closed:true};
    else {
      const segments=entry.parts.slice();
      if(gap>G.eps) segments.push({type:'line',p:[end,start]});
      result={...e,type:'path',segments,closed:true};
      for(const key of ['p','c','r','ry','a','s','t']) delete result[key];
    }
    closed++;return [result];
  });
  if(!closed) {message(I18n.t('Aucun tracé ouvert n’a ses extrémités dans la tolérance.'));return false;}
  if(!ok) return false;
  message(closed+I18n.t(' tracé(s) fermé(s)')+(skipped?' · '+skipped+I18n.t(' ignoré(s).'):'.'));
  return true;
}
function automaticClosurePlan(items) {
  const input=$('autoCloseTolerance'), value=input.valueAsNumber;
  if(!input.checkValidity()||!Number.isFinite(value)) return null;
  const method=$('autoCloseMethod').value, key=method+':'+items.map(e=>e.id).join(',');
  if(closurePlanCache?.doc===doc&&closurePlanCache.key===key&&closurePlanCache.value===value) return closurePlanCache.pairs;
  const pairs=Edit.closurePairs(items,value/Formats.millimeters[doc.units],method);
  closurePlanCache={doc,key,value,pairs};
  return pairs;
}
function applyAutomaticClosure() {
  const items=modificationItems(), pairs=automaticClosurePlan(items);
  if(!pairs?.length) {message(I18n.t('Aucune jonction dans la distance choisie.'));return false;}
  const before=doc.entities;
  let result;
  try {result=Formal.closeTraces(before,items,pairs,doc.constraints??[],identity);}
  catch(error) {message(I18n.t(error.message));return false;}
  if(!result) {message(I18n.t('Aucune jonction géométriquement possible.'));return false;}
  const {entities,joined,constraints,lost}=result;
  if(!commit(d=>({...d,entities,constraints}),false,false,true)) return false;
  pick(joined.map(e=>e.id),{});
  animateRemoval(lost,before);
  warnLost(lost.length,I18n.t('Fermeture automatique appliquée.'));
  return true;
}
function finishTransformGesture(action) {
  const exact=action.transformSnap?.tf??action.angleTransform;
  if(!applyModification(exact,action.axes)) {
    if(action.kind==='rotateGesture') $('rotateValue').value=action.previous;
    else {
      $('scaleValue').value=action.previous[0];
      $('scaleY').value=action.previous[1];
    }
    modification.applied=action.wasApplied;
    update();
  }
}
function storeMovedPivot(pivot) {
  setPivotFields(pivot);
  if(modification.pivot) modification.pivot=pivot;
}
function updateTranslationPivot(changes,action) {
  if(modification?.type!=='move') return;
  if(action.kind==='move'&&action.selectionGesture?.group===action&&modification.pivot) {
    const original=action.items[0], moved=changes.get(original.id);
    storeMovedPivot(G.add(modification.pivot,G.sub(G.mid(...getBounds([moved])),G.mid(...getBounds([original])))));
  }
  modification.ids=null;
  modification.applied=true;
  update();
}
function commitFreeTranslation(changes,action,p) {
  if([...changes.values()].some(e=>!G.serial(e)||!Edit.valid(e))) {
    message(I18n.t('Déplacement hors des limites de la géométrie.'));
    return false;
  }
  const before=doc.entities;
  const entities=before.map(e=>changes.get(e.id)??e);
  const after=new Map(entities.map(e=>[e.id,e]));
  const lost=[];
  const constraints=(doc.constraints??[]).filter(c=>{
    if(!c.refs.some(r=>changes.has(r.id))||Formal.satisfied(after,c)) return true;
    lost.push(c);
    return false;
  });
  if(!confirmCoincidence(before,entities,constraints,lost)) {
    const raw=dragGeometry({...action,ignoreSnap:true},p);
    return commitWithoutCoincidence(raw,action.axes)?raw:null;
  }
  constraints.push(...axisConstraints(action.axes??[],constraints));
  if(!commit(d=>({...d,entities,constraints}),!action.explodeMove,true,true,false,true,!action.explodeMove)) return false;
  animateRemoval(lost,before);
  warnLost(lost.length,I18n.t('Déplacement appliqué.'));
  return changes;
}
function applyModification(exact,axes=[]) {
  if(!modification||!selected().length||modification.phase) return;
  const {type}=modification;
  let ok=false;
  if(type==='reverse') ok=replaceSelectedRuns(e=>[G.reverse(e)]);
  if(type==='explode') ok=replaceSelectedRuns(e=>{
    const parts=G.strokeParts(e);
    if(!parts.length) return [e];
    return parts.map((part,i)=>G.withConstruction(part,G.constructionAt(e,i)));
  },true);
  if(type==='close') ok=closeSelected();
  if(type==='autoClose') ok=applyAutomaticClosure();
  if(transformModes.has(type)||type==='mirror') {
    const tf=exact??modificationTransform();
    if(!tf) {message(I18n.t('Vérifiez le pivot, l’angle ou le facteur.'));return;}
    ok=commitTransform(tf,type,exact&&modificationTransform(),axes);
  }
  if(ok) {
    modification.applied=true;
    modification.ids=selectionSignature(modificationItems());
    update();
  }
  return ok;
}
function relationLabel(c) {
  if(Formal.isDimension(c)) return I18n.t(Formal.dimensionNames[c.mode])+' · '+dimensionText(c);
  if(c.type==='cornerAngle') return I18n.t(Formal.names.cornerAngle)+' · '+num(180-Math.abs(c.value)*180/Math.PI)+'°';
  return I18n.t(Formal.names[c.type])+(c.origin?' · '+c.origin:'');
}
function clipboardIncludes(relation,ids) {
  if(!relation.refs.some(ref=>ids.has(ref.id))) return false;
  return clipboardRelations.get(relation)??relation.refs.every(ref=>ref.kind==='origin'||ids.has(ref.id));
}
function updateClipboardOptions() {
  const ids=new Set(selected().map(e=>e.id));
  const relations=(doc.constraints??[]).filter(c=>c.refs.some(r=>ids.has(r.id)));
  $('clipboardOptions').hidden=tool!=='select'||!relations.length;
  $('clipboardRelations').replaceChildren();
  for(const c of relations) {
    const label=document.createElement('label'), check=document.createElement('input');
    check.type='checkbox';check.checked=clipboardIncludes(c,ids);
    check.onchange=()=>{
      clipboardRelations.set(c,check.checked);
      requestDraw();
    };
    const description=relationLabel(c);
    if(Formal.isDimension(c)) label.append(check,document.createTextNode(description));
    else {
      check.setAttribute('aria-label',description);
      label.title=description;
      label.append(check,constraintIcon(c.type));
    }
    $('clipboardRelations').append(label);
  }
}
function copyGeometry(cut=false) {
  const entities=selected();
  if(!entities.length) {message(I18n.t('Sélectionnez les objets à copier ou couper.'));return;}
  const ids=new Set(entities.map(e=>e.id));
  const constraints=(doc.constraints??[]).filter(c=>clipboardIncludes(c,ids));
  const snapshot=selectionSnapshot(entities,constraints);
  if(cut&&!replaceSelected(e=>segmentSelection.has(e.id)?Edit.removeSegments(e,segmentSelection.get(e.id)):[],
    false,true,segmentSelection)) return;
  clipboard={...snapshot,pastes:0};
  if(cut) clipboardRelations.clear();
  update();
  message(cut?I18n.t('Sélection coupée.'):I18n.t('Sélection copiée.'));
}
function pasteGeometry() {
  if(!clipboard) {message(I18n.t('Le presse-papiers Velocivector est vide.'));return;}
  if(!doc.layers.some(l=>l.name===activeLayer&&l.visible&&!l.raster)) {message(I18n.t('Choisissez un calque vectoriel visible pour coller.'));return;}
  const n=clipboard.pastes+1;
  const delta=[12*n/camera.scale,-12*n/camera.scale];
  const map=p=>G.add(p,delta), tf={map,factor:1};
  const ids=new Map(), groups=new Map(), before=new Map(clipboard.entities.map(e=>[e.id,e]));
  const added=clipboard.entities.map(e=>{
    const next=identity({...G.transform(e,map),layer:activeLayer,...copiedVectorGroup(e,groups)});
    ids.set(e.id,next.id);return next;
  });
  if(added.some(e=>!G.serial(e))) {message(I18n.t('Collage hors limites.'));return;}
  const after=new Map(added.map(e=>[e.id,e]));
  const relations=DimensionTable.rebase(clipboard.constraints.map(c=>transferRelation(c,ids,before,after,tf,{copy:true,layer:activeLayer})).filter(Boolean),doc);
  if(!commit(d=>({...d,entities:[...d.entities,...added],constraints:[...(d.constraints??[]),...relations]}),false,false,true)) return;
  clipboard.pastes=n;selection=new Set(added.map(e=>e.id));segmentSelection.clear();formalSelection=[];clipboardRelations.clear();
  warnLost(clipboard.omitted+clipboard.constraints.length-relations.length,I18n.t('Sélection collée.'));update();
}
function selectionSnapshot(items,relations) {
  const ids=new Map();
  const entities=items.flatMap(e=>{
    const indices=segmentSelection.get(e.id);
    if(!indices) return [e];
    const runs=Edit.selectedRuns(e,indices).map(run=>identity(run));
    ids.set(e.id,runs.map(run=>run.id));
    return runs;
  });
  const before=new Map(items.map(entity=>[entity.id,entity]));
  const after=new Map(entities.map(entity=>[entity.id,entity]));
  const related=relations.filter(c=>c.refs.some(ref=>before.has(ref.id)));
  const constraints=related.flatMap(c=>{
    if(!c.refs.every(ref=>ref.kind==='origin'||before.has(ref.id))) return [];
    const mapped=ids.size?Formal.remap(before,after,[c],ids)??[]:[c];
    return mapped.filter(constraint=>constraint.refs.every(ref=>Formal.resolve(after,ref)!==null));
  });
  return {entities,constraints,omitted:related.length-constraints.length};
}
function getBounds(entities) {
  const min=[Infinity,Infinity], max=[-Infinity,-Infinity];
  for(const e of entities) for(const p of visibleStrokeParts(e).flatMap(G.boundsPoints)) for(let i=0;i<2;i++) {
    min[i]=Math.min(min[i],p[i]);max[i]=Math.max(max[i],p[i]);
  }
  return [min,max];
}
function fit() {
  const bounds=getBounds(doc.entities.filter(visible));
  if(doc.texts?.length) {
    const entities=new Map(doc.entities.map(entity=>[entity.id,entity]));
    for(const text of doc.texts) if(doc.layers.some(layer=>layer.name===text.layer&&layer.visible)) {
      for(const glyph of cadTextLayout(text,entities)) {
        const m=glyph.metrics;
        for(const x of [-m.actualBoundingBoxLeft,m.actualBoundingBoxRight])
          for(const y of [-m.actualBoundingBoxAscent,m.actualBoundingBoxDescent]) {
            const p=TextGeometry.position(glyph,x,y);
            for(let axis=0;axis<2;axis++) {
              bounds[0][axis]=Math.min(bounds[0][axis],p[axis]);bounds[1][axis]=Math.max(bounds[1][axis],p[axis]);
            }
          }
      }
    }
  }
  for(const {raster,visible} of doc.layers) {
    if(!raster||!visible) continue;
    const angle=raster.angle*Math.PI/180, cos=Math.abs(Math.cos(angle)), sin=Math.abs(Math.sin(angle));
    const {width,height,center,pixelSize,scale}=raster;
    const half=pixelSize*scale/2, size=[half*(width*cos+height*sin),half*(width*sin+height*cos)];
    for(let axis=0;axis<2;axis++) {
      bounds[0][axis]=Math.min(bounds[0][axis],center[axis]-size[axis]);
      bounds[1][axis]=Math.max(bounds[1][axis],center[axis]+size[axis]);
    }
  }
  if(!Number.isFinite(bounds[0][0])) camera={x:0,y:0,scale:4};
  else {
    const [x,y]=G.mid(...bounds), span=G.sub(bounds[1],bounds[0]);
    camera={x,y,scale:Math.max(1e-10,Math.min(1e7,.9*viewport[0]/Math.max(span[0],1e-9),.9*viewport[1]/Math.max(span[1],1e-9)))};
  }
  requestDraw();
}
function pick(ids,mod,parts=new Map(),refs=[]) {
  ids=groupedIds(ids);
  selectedOrigin=null;
  edgeFocus=null;
  wholeFocus=null;
  if(!mod.shiftKey&&!mod.ctrlKey) segmentSelection.clear();
  knotFocus=null;
  selectedDimension=null;selectedConstraint=null;
  if(!mod.shiftKey&&!mod.ctrlKey) {formalSelection=[];clipboardRelations.clear();}
  if(!mod.shiftKey && !mod.ctrlKey) selection.clear();
  for(const id of ids) {
    const touched=doc.entities.find(e=>e.id===id)?.vectorGroup?null:parts.get(id), previous=segmentSelection.get(id);
    if(touched&&mod.ctrlKey) {
      if(!selection.has(id)) continue;
      const entity=doc.entities.find(e=>e.id===id);
      const remaining=new Set([...(previous??G.strokeParts(entity).keys())].filter(index=>!touched.has(index)));
      if(remaining.size) segmentSelection.set(id,remaining);
      else {segmentSelection.delete(id);selection.delete(id);}
    } else if(touched) {
      if(!selection.has(id)||previous) segmentSelection.set(id,new Set([...(previous??[]),...touched]));
      selection.add(id);
    } else {
      segmentSelection.delete(id);
      if(mod.ctrlKey) selection.delete(id);else selection.add(id);
    }
  }
  if(refs.length) {
    formalSelection=formalSelection.filter(ref=>selection.has(ref.id)&&
      (!mod.ctrlKey||!refs.some(other=>Formal.sameRef(ref,other))));
    if(!mod.ctrlKey) for(const ref of refs) {
      if(!formalSelection.some(other=>Formal.sameRef(ref,other))) formalSelection.push(ref);
    }
  }
  update();
}
function curveKnotHandle(entity,index) {
  return entity.type==='spline'?{...G.splineHandle(entity,index),point:entity.p[index]}:G.bezierKnot(entity,index);
}
function curveKnots(entity) {
  return entity.type==='spline'?entity.p.map((point,index)=>({point,index})):
    G.bezierJunctions(entity).filter(Boolean);
}
function focusedKnot() {
  if(tool!=='select'||!knotFocus||!selection.has(knotFocus.id)) return null;
  const entity=doc.entities.find(e=>e.id===knotFocus.id), {index}=knotFocus;
  return visible(entity)&&(!entity.vectorGroup||freeTranslation())&&curveKnots(entity).some(knot=>knot.index===index)?{entity,index}:null;
}
function knotAt(position) {
  let best=null, radius=7;
  for(const entity of doc.entities.slice().reverse()) {
    if(!visible(entity)) continue;
    for(const {point,index} of curveKnots(entity)) {
      if(!visiblePoint(entity,point)) continue;
      const distance=G.dist(position,screen(point));
      if(distance<radius) {radius=distance;best={entity,index};}
    }
  }
  return best;
}
function handleLayout(entity,index) {
  const handle=curveKnotHandle(entity,index), center=screen(handle.point);
  const angles=[handle.heading+Math.PI+handle.setting.inAngle,handle.heading+handle.setting.outAngle];
  const arms=angles.map((angle,i)=>handle.arms[i]&&G.polar(center,Math.max(11,Math.hypot(...handle.arms[i])*camera.scale),-angle));
  return {center,arms,handle};
}
function updateHandleFields(setting) {
  $('incomingRatio').value=Number((setting.inRatio*100).toFixed(3));
  $('knotRatio').value=Number((setting.outRatio*100).toFixed(3));
}
function knotChanges(knot,setting) {
  if(knot.entity.type!=='spline') {
    return new Map([[knot.entity.id,G.withBezierKnot(knot.entity,knot.index,setting,splineTension)]]);
  }
  const handles={...knot.entity.handles};
  if(setting===null) delete handles[knot.index];
  else handles[knot.index]=setting;
  return new Map([[knot.entity.id,{...knot.entity,handles}]]);
}
function handleSetting(setting,arm,ratio,angle) {
  return {...setting,
    inRatio:!setting.split||arm===0?ratio:setting.inRatio,
    outRatio:!setting.split||arm===1?ratio:setting.outRatio,
    inAngle:!setting.splitAngles||arm===0?angle:setting.inAngle,
    outAngle:!setting.splitAngles||arm===1?angle:setting.outAngle
  };
}
function curveRatioLimit(entity,setting) {
  return entity.type==='spline'?G.maxSplineRatio:Math.max(G.maxSplineRatio,2*setting.inRatio,2*setting.outRatio);
}
function adjustHandle(action,position) {
  const {knot,handle,arm,initialVector,origin}=action;
  const {setting,heading,reference}=handle;
  const vector=G.add(initialVector,G.sub(world(position),origin));
  const length=Math.hypot(...vector), initialLength=Math.hypot(...initialVector);
  const startRatio=arm===0?setting.inRatio:setting.outRatio;
  const ratio=Math.max(0,Math.min(curveRatioLimit(knot.entity,setting),startRatio+(length-initialLength)/reference));
  const angle=length<=G.eps?(arm===0?setting.inAngle:setting.outAngle):
    G.mod(Math.atan2(vector[1],vector[0])-heading-(arm===0?Math.PI:0)+Math.PI)-Math.PI;
  return knotChanges(knot,handleSetting(setting,arm,ratio,angle));
}
function moveKnot(action,position) {
  const {knot,origin}=action;
  const original=curveKnotHandle(knot.entity,knot.index).point;
  const delta=G.sub(world(position),origin);
  const target=editedPoint(action,[knot.entity],original,delta);
  if(knot.entity.type!=='spline') return Edit.changedVertices([knot.entity],[[original,target]]);
  const p=knot.entity.p.slice();
  p[knot.index]=target;
  const entity={...knot.entity,p};
  return G.serial(entity)?new Map([[entity.id,entity]]):null;
}
function focusedEdge() {
  if(tool!=='select'||!edgeFocus||!selection.has(edgeFocus.id)) return null;
  const entity=doc.entities.find(e=>e.id===edgeFocus.id);
  if(!entity||!visible(entity)||Edit.edges(entity)[edgeFocus.index]?.type!=='line') return null;
  return {...edgeFocus,entity};
}
function handleAt(p,straightOnly=false) {
  const radius=8/camera.scale;
  let best=null;
  for(let i=doc.entities.length-1;i>=0;i--) {
    const e=doc.entities[i];
    if(!visible(e)) continue;
    Edit.edges(e).forEach((part,index)=>{
      if(straightOnly&&part.type!=='line'||!constructionShown(e.layer)&&G.constructionAt(e,index)) return;
      const vertices=Edit.ends(part);
      vertices.forEach((vertex,j)=>{
        const distance=G.dist(vertex,p);
        if(distance<=radius && (!best||distance<best.distance)) best={e,index,vertices:[vertex],distance,anchorEnd:j===0};
      });
    });
  }
  return best;
}
function edgeAt(e,p,straightOnly=false,accept=()=>true,limit=straightOnly?7/camera.scale:Infinity) {
  let best=null, distance=limit;
  Edit.edges(e).forEach((part,index)=>{
    if((straightOnly&&part.type!=='line')||!accept(index)||!constructionShown(e.layer)&&G.constructionAt(e,index)) return;
    const curve=G.trace(part,camera.scale);
    for(let i=1;i<curve.length;i++) {
      const d=G.dist(p,G.nearest(curve[i-1],curve[i],p));
      if(d<distance) {distance=d;best={e,index,vertices:Edit.ends(part),anchorEnd:false,distance:d};}
    }
  });
  return best;
}
function applyChanges(changes,protectContour=false,keepGroup=false,axes=[],movement=false) {
  if([...changes.values()].some(e=>!G.serial(e)||!Edit.valid(e))) {
    message(I18n.t('Déplacement hors des limites de la géométrie.'));
    return false;
  }
  if(changes.size) return commit(d=>({...d,entities:d.entities.map(e=>changes.get(e.id)??e),
    constraints:[...(d.constraints??[]),...axisConstraints(axes,d.constraints)]}),true,protectContour,false,keepGroup,true,movement,true,movement&&!modification);
  return true;
}
function editDrag(action,p) {
  const entities=action.localOnly?[action.entity]:doc.entities;
  const delta=G.sub(world(p),world(action.start));
  const step=metricStep(action);
  const slot=action.slot??(action.shiftKey&&action.entity.profile==='slot'?G.slotParts(action.entity):null);
  if(slot&&action.vertices.length===1&&action.shiftKey) {
    const entity=action.entity, vertex=action.vertices[0];
    const [first,second]=slot.arcs.map(index=>entity.segments[index]);
    const end=G.dist(vertex,second.c)<G.dist(vertex,first.c)?1:0;
    const fixed=end?first.c:second.c, moving=end?second.c:first.c;
    const guide=angularGuide(fixed,G.add(moving,delta));
    if(!guide) return null;
    const [x,y]=G.mid(fixed,guide.q);
    const frame=G.slotFrame(entity,slot);
    const oriented=G.withSlotFrame(entity,slot,{...frame,x,y,angle:guide.angle+(end?0:Math.PI),length:G.dist(fixed,guide.q)});
    action.angleGuide=guide;
    if(guide.axis) action.axes=[{id:entity.id,index:slot.lines[0],type:guide.axis}];
    return oriented?new Map([[oriented.id,oriented]]):null;
  }
  if(action.slot) {
    const resized=G.stretchSlot(action.entity,action.slot,action.vertices[0],delta);
    return resized?new Map([[resized.id,resized]]):null;
  }
  if(action.vertices.length===1&&(action.shiftKey||step)) {
    const vertex=action.vertices[0], part=Edit.edges(action.entity)[action.preferredIndex];
    if(part?.type==='line') {
      const pivot=part.p.find(q=>G.dist(q,vertex)>G.eps);
      const target=G.add(vertex,delta);
      const guide=pivot&&action.shiftKey&&angularGuide(pivot,target);
      if(guide) {
        const q=step?roundDistance(pivot,guide.q,step):guide.q;
        action.angleGuide={...guide,q};
        if(guide.axis) action.axes=[{id:action.entity.id,index:action.preferredIndex,type:guide.axis}];
        return Edit.drag(entities,action.vertices,G.sub(q,vertex),true);
      }
      if(pivot&&step) return Edit.drag(entities,action.vertices,G.sub(roundDistance(pivot,target,step),vertex),true);
    }
  }
  const snap=endpointSnap(action,[action.entity],action.vertices,delta);
  if(snap) {
    const exact=Edit.drag(entities,action.vertices,snap.delta,true);
    if(exact) return exact;
  }
  if(action.vertices.length===1&&!action.ignoreSnap&&!suspended&&$('snap').checked&&$('autoCoincidence').checked) {
    const edge=Formal.referenceEdges(action.entity)[action.preferredIndex];
    if(edge?.type==='line') {
      const vertex=action.vertices[0], pivot=edge.p.find(q=>G.dist(q,vertex)>G.eps);
      const target=G.add(vertex,delta);
      const guide=pivot&&movementAngleGuide(action,pivot,target);
      if(guide) {
        const exact=Edit.drag(entities,action.vertices,G.sub(guide.q,vertex),true);
        if(exact) {action.angleGuide=guide;return exact;}
      }
    }
  }
  return Edit.drag(entities,action.vertices,delta);
}
function movementAngleGuide(action,pivot,target) {
  const length=G.dist(pivot,target);
  if(length<=G.eps) return null;
  const original=G.angle(pivot,target);
  const angles=[0,Math.PI/2];
  if(!action.orientationTargets) {
    action.orientationTargets=[];
    for(const entity of doc.entities) if(visible(entity)&&entity.layer===action.entity.layer) {
      for(const [index,edge] of Formal.referenceEdges(entity).entries()) {
        if(edge.type!=='line'||entity.id===action.entity.id&&index===action.preferredIndex||
          !constructionShown(entity.layer)&&G.constructionAt(entity,index)) continue;
        if([...edge.p,G.mid(...edge.p)].some(q=>G.dist(q,pivot)<=G.eps*8))
          action.orientationTargets.push(G.angle(...edge.p)+Math.PI/2);
      }
    }
  }
  angles.push(...action.orientationTargets);
  let best=null, limit=Math.PI/60;
  for(const axis of angles) {
    const angle=axis+Math.round((original-axis)/Math.PI)*Math.PI;
    const gap=Math.abs(angle-original);
    if(gap>=limit) continue;
    const q=G.polar(pivot,length,angle);
    if(G.dist(q,target)*camera.scale>8) continue;
    limit=gap;best={from:pivot,q,angle,label:Math.round(angle*180/Math.PI)+'°'};
  }
  return best;
}
function editedPoint(action,entities,original,delta) {
  return G.add(original,endpointSnap(action,entities,[original],delta)?.delta??delta);
}
function endpointSnap(action,sources,moving,delta) {
  if(action.ignoreSnap||!$('snap').checked||suspended) return null;
  const near=(a,b)=>G.dist(a,b)<=G.eps;
  const radius=8/camera.scale;
  const cell=p=>p.map(n=>Math.floor(n/radius));
  if(action.snapTargets?.doc!==doc||action.snapTargets.radius!==radius) {
    const buckets=new Map(), entities=new Map();
    for(const e of doc.entities) if(visible(e)) {
      entities.set(e.id,e);
      for(const [index,point] of Formal.vertices(e).entries()) {
        if(!visiblePoint(e,point)) continue;
        const key=cell(point).join('/');
        if(!buckets.has(key)) buckets.set(key,[]);
        buckets.get(key).push({id:e.id,index,point});
      }
      for(const [index,part] of Formal.referenceEdges(e).entries()) if(part.type==='line'&&
        (constructionShown(e.layer)||!G.constructionAt(e,index))) {
        const point=G.mid(...part.p), key=cell(point).join('/');
        if(!buckets.has(key)) buckets.set(key,[]);
        buckets.get(key).push({id:e.id,index,point,kind:'midpoint'});
      }
    }
    for(const origin of layerOrigins(activeLayer)) {
      const key=cell(origin.target).join('/');
      if(!buckets.has(key)) buckets.set(key,[]);
      buckets.get(key).push({origin,point:origin.target});
    }
    action.snapTargets={doc,radius,buckets,entities};
  }
  let distance=radius, best=null;
  for(const source of sources) for(const [index,p] of Formal.vertices(source).entries()) {
    if(!moving.some(q=>near(p,q))) continue;
    const moved=G.add(p,delta), [x,y]=cell(moved);
    for(let dx=-1;dx<=1;dx++) for(let dy=-1;dy<=1;dy++) for(const target of action.snapTargets.buckets.get((x+dx)+'/'+(y+dy))??[]) {
      const gap=G.dist(moved,target.point);
      const preferredOrigin=target.origin&&best&&!best.target.origin&&Math.abs(gap-distance)<=G.eps;
      if((gap<distance||preferredOrigin)&&!(target.kind==='midpoint'&&sources.some(e=>e.id===target.id))&&!moving.some(q=>near(target.point,q))) {
        distance=gap;best={source:{id:source.id,index},target,delta:G.sub(target.point,p)};
      }
    }
  }
  action.snapCandidate=best;
  return best;
}
function moveDelta(action,end,entities) {
  const delta=G.sub(world(end),world(action.start));
  if(action.shiftKey) {
    const from=action.anchor?.q??world(action.start);
    const guide=angularGuide(from,G.add(from,delta));
    action.angleGuide=guide;
    if(guide) return G.sub(guide.q,from);
  }
  if(!action.anchor) return endpointSnap(action,entities,selectionRuns(entities).flatMap(Formal.vertices),delta)?.delta??delta;
  action.anchorSnap=null;
  if(action.ignoreSnap||!$('snap').checked||suspended) return delta;
  if(!action.anchorTargets) {
    const moving=new Set(entities.map(e=>e.id));
    action.anchorTargets=layerOrigins(activeLayer).map(({name,target:q})=>({q,kind:'origin',name}));
    for(const entity of doc.entities) if(visible(entity)&&!moving.has(entity.id)) {
      action.anchorTargets.push(...visibleSnapFeatures(entity).map(feature=>({...feature,entity})));
    }
  }
  const position=G.add(action.anchor.q,delta);
  let distance=8/camera.scale;
  for(const target of action.anchorTargets) {
    const gap=G.dist(position,target.q);
    if(gap<distance) {action.anchorSnap=target;distance=gap;}
  }
  if(action.anchorSnap) return G.sub(action.anchorSnap.q,action.anchor.q);
  if($('gridSnap').checked) {
    const step=$('spacing').valueAsNumber;
    if(step>0) return G.sub(gridPoint(position,step),action.anchor.q);
  }
  return delta;
}
function confirmDragSnap(action,p) {
  if(!action.changes) return;
  if(action.anchorSnap) {
    const target=action.anchorSnap, shown=target.entity&&action.changes.get(target.entity.id);
    if(shown&&!G.snapFeatures(shown).some(({q,kind})=>kind===target.kind&&G.dist(q,target.q)<=G.eps*4)) return;
    const originBound=target.kind==='origin'&&[...action.changes.values()].some(e=>
      layerOrigins(e.layer).some(o=>o.name===target.name)&&
      [...Formal.originPoints(e)].some(({p:q})=>G.dist(q,target.q)<=G.eps*4));
    action.snapAt=p;
    const formalSource=action.items.some(e=>Formal.vertices(e).some(q=>G.dist(q,action.anchor.q)<=G.eps));
    const formalTarget=target.entity&&Formal.vertices(target.entity).some(q=>G.dist(q,target.q)<=G.eps);
    action.snapIndicator={...target,extra:(originBound||formalSource&&(formalTarget||target.kind==='midpoint'))&&$('autoCoincidence').checked?'coincidence':null};
    return;
  }
  const candidate=action.snapCandidate;
  if(!candidate) return;
  const position=ref=>{
    const e=action.changes.get(ref.id)??action.snapTargets.entities.get(ref.id);
    if(!e) return null;
    if(ref.kind==='midpoint') {
      const line=Formal.referenceEdges(e)[ref.index];
      return line?.type==='line'?G.mid(...line.p):null;
    }
    return Formal.vertices(e)[ref.index];
  };
  const source=position(candidate.source), target=candidate.target.origin?.target??position(candidate.target);
  const tolerance=Math.max(G.eps*4,1e-6/camera.scale);
  if(!source||!target||G.dist(source,target)>tolerance||G.dist(target,candidate.target.point)>tolerance) return;
  const from=action.snapTargets.entities.get(candidate.source.id);
  if(candidate.target.origin) {
    const canBind=layerOrigins(from?.layer).some(o=>o.name===candidate.target.origin.name);
    action.snapAt=p;
    action.snapIndicator={q:target,kind:'origin',extra:canBind&&$('autoCoincidence').checked?'coincidence':null};
    return;
  }
  const to=action.snapTargets.entities.get(candidate.target.id);
  const movedPoint=from&&Formal.vertices(from)[candidate.source.index];
  const fitsJoin=from&&to&&from.layer===to.layer&&snapIsEndpoint(from,movedPoint)&&snapIsEndpoint(to,target)&&
    (from.id===to.id||uniqueJoinTarget(to,target,from.id));
  const extra=fitsJoin?'join':from?.id!==to?.id&&$('autoCoincidence').checked?'coincidence':null;
  const kind=candidate.target.kind??(to&&(to.type==='circle'||to.type==='ellipse'&&to.s===undefined)?'center':'point');
  action.snapAt=p;
  action.snapIndicator={q:target,kind,entity:to,extra};
}
const previewInterval=40, previewSolveBudget=6;
const geometryDrags=new Set(['move','edit','rigid','splineHandle','splineKnot','radialResize','arcEndpoint']);
function contourDragMode(entity) {
  if(!entity.closed) return null;
  const slot=Formal.protectedSlot(entity,doc.constraints??[]);
  if(slot) return {slot,rigidVertex:false};
  const constraints=doc.constraints??[];
  const tangencies=constraints.filter(c=>c.type==='tangent'&&c.contact&&c.refs.every(ref=>ref.id===entity.id));
  if(tangencies.length>=3) return {tangentChain:true,rigidVertex:false};
  const dimensions=constraints.filter(c=>Formal.isDimension(c)&&Formal.isDriving(c)&&c.refs.some(r=>r.id===entity.id));
  if(!dimensions.length) return null;
  const parts=Edit.edges(entity);
  const sides=new Set(dimensions.filter(c=>c.mode==='aligned'&&c.refs.length===1&&c.refs[0].kind==='edge').map(c=>c.refs[0].index));
  return {rigidVertex:parts.length===3&&parts.every(e=>e.type==='line')&&sides.size===3};
}
function rigidDrag(entity,start,id) {
  const constraints=doc.constraints??[];
  const positional=constraints.filter(c=>['coincident','symmetry','tangent'].includes(c.type)||
    Formal.isDimension(c)&&new Set(c.refs.map(r=>r.id)).size>1);
  const base=selection.has(entity.id)?[...selection]:[entity.id];
  const related=Formal.connected(positional,base);
  const ids=new Set([...base,...related.flatMap(c=>c.refs.map(r=>r.id))]);
  const blocked=constraints.some(c=>c.type==='locked'&&ids.has(c.refs[0].id));
  return {kind:'rigid',start,items:doc.entities.filter(e=>ids.has(e.id)),blocked,keepGroup:true,id};
}
function projectDraggedCoincidence(changes) {
  const relations=(doc.constraints??[]).filter(c=>Formal.isPointOnTrace(c)&&
    changes.has(c.refs.find(r=>r.kind==='point')?.id)&&!changes.has(c.refs.find(r=>r.kind==='edge')?.id));
  if(!relations.length) return changes;
  const counts=new Map();
  for(const c of relations) {
    const {id}=c.refs.find(r=>r.kind==='point');
    counts.set(id,(counts.get(id)??0)+1);
  }
  const entities=new Map(doc.entities.map(e=>[e.id,changes.get(e.id)??e]));
  for(const c of relations) {
    const point=c.refs.find(r=>r.kind==='point'), edge=c.refs.find(r=>r.kind==='edge');
    if(counts.get(point.id)!==1) continue;
    const p=Formal.resolve(entities,point), support=Formal.resolve(entities,edge);
    const q=p&&support&&Formal.coincidenceProjection(support,p);
    if(q) changes.set(point.id,G.transform(changes.get(point.id),x=>G.add(x,G.sub(q,p))));
  }
  return changes;
}
function dragGeometry(action,p,preview=false) {
  action.snapCandidate=null;action.anchorSnap=null;action.angleGuide=null;action.axes=[];action.blockedRequest=null;
  const distance=G.dist(action.start,p);
  if(distance<=(action.kind==='splineHandle'?1:3)) return new Map();
  if(action.kind==='arcEndpoint') {
    const {entity,index}=action, original=Edit.ends(entity)[index];
    const delta=G.sub(world(p),world(action.start));
    const target=editedPoint(action,[entity],original,delta);
    if(freeTranslation()) {
      const arc=G.arcMovedEnd(entity,index,target);
      return arc?new Map([[arc.id,arc]]):null;
    }
    const options=preview?{deadline:performance.now()+previewSolveBudget,maxPasses:12}:undefined;
    const solved=Formal.solveArcEndpoint(doc.entities,doc.constraints??[],entity,index,target,options);
    if(!preview&&!modification&&(!solved||sameMovementGeometry(entity,solved.find(e=>e.id===entity.id)))) {
      const desired=G.arcMovedEnd(entity,index,target);
      if(desired) action.blockedRequest=new Map([[entity.id,desired]]);
    }
    return solved&&new Map(solved.filter((e,i)=>e!==doc.entities[i]).map(e=>[e.id,e]));
  }
  if(action.kind==='radialResize') {
    const {entity,start}=action;
    let radius=entity.r+G.dist(entity.c,world(p))-G.dist(entity.c,world(start));
    const step=metricStep(action), multiplier=entity.type==='circle'?2:1;
    if(step&&radius>0) radius=Math.max(step,Math.round(radius*multiplier/step)*step)/multiplier;
    return radius>G.eps?new Map([[entity.id,{...entity,r:radius}]]):null;
  }
  if(action.kind==='edit') return editDrag(action,p);
  if(action.kind==='splineKnot') return moveKnot(action,p);
  if(action.kind==='splineHandle') return adjustHandle(action,p);
  if(action.kind==='rigid') {
    if(action.blocked) {
      if(!preview&&!modification) animateBlockedMovement((doc.constraints??[]).filter(c=>
        c.type==='locked'&&action.items.some(item=>item.id===c.refs[0].id)));
      return null;
    }
    const delta=moveDelta(action,p,action.items);
    return new Map(action.items.map(e=>[e.id,G.transform(e,q=>G.add(q,delta))]));
  }
  const items=action.items??selected(), delta=moveDelta(action,p,items);
  const translate=part=>G.transform(part,q=>G.add(q,delta));
  const changes=new Map(items.map(e=>{
    const indices=action.selectionGesture?.local===action?null:segmentSelection.get(e.id);
    return [e.id,indices?Edit.transformParts(e,indices,translate):translate(e)];
  }));
  if([...changes.values()].some(e=>!e)) return null;
  if(items.length!==1||freeTranslation()||action.explodeMove) return changes;
  const [item]=items;
  const requested=changes.get(item.id);
  const projected=projectDraggedCoincidence(changes);
  if(!preview&&!modification&&!sameMovementGeometry(item,requested)&&sameMovementGeometry(item,projected.get(item.id))) {
    // The projection mutates the map. Retain the exact geometry requested before projection.
    action.blockedRequest=new Map([[item.id,requested]]);
  }
  return projected;
}
function freeTranslation() {
  return modification?.transform&&modification.type==='move'&&!modification.protected;
}
function updateDragPreview(action) {
  const now=performance.now();
  const remaining=(action.nextPreviewAt??0)-now;
  if(remaining>0) {
    if(action.previewTimer===undefined) action.previewTimer=setTimeout(()=>{
      action.previewTimer=undefined;
      if(drag===action&&action.previewPoint) requestDraw();
    },remaining);
    return;
  }
  const p=action.previewPoint;
  action.previewPoint=null;
  action.snapAt=null;
  if(action.defer) {
    action.deferredPoint=G.dist(action.start,p)>3?p:null;
    return;
  }
  const desired=dragGeometry(action,p,true);
  if(!desired) return;
  if(!desired.size) {
    action.changes=null;
    if(action.kind==='splineHandle') updateHandleFields(action.handle.setting);
    return;
  }
  if(action.kind==='rigid'||action.kind==='arcEndpoint'||freeTranslation()||action.explodeMove) {
    action.changes=desired;
    confirmDragSnap(action,p);
    return;
  }
  const ids=[...desired.keys()];
  const signature=ids.join(',');
  if(action.previewComponent?.signature!==signature||action.previewComponent?.doc!==doc) {
    const constraints=Formal.connected(doc.constraints??[],ids);
    const involved=new Set(constraints.flatMap(c=>c.refs.map(r=>r.id)));
    const items=constraints.length?doc.entities.filter(e=>involved.has(e.id)):[];
    action.previewComponent={signature,doc,constraints,items,
      small:constraints.length<=40&&items.reduce((sum,e)=>sum+(e.p?.length??e.segments?.length??2),0)<=160};
  }
  const {constraints,items,small}=action.previewComponent;
  if(!constraints.length||action.kind==='move'&&action.keepGroup&&constraints.every(c=>c.type!=='locked'&&!c.origin&&c.refs.every(ref=>desired.has(ref.id)))) {
    action.changes=desired;
  }
  else {
    action.nextPreviewAt=performance.now()+previewInterval;
    if(!small) return;
    const requested=items.map(e=>desired.get(e.id)??e);
    if(!Formal.preservesContourOrientation(items,requested,constraints)) return;
    const start=performance.now();
    const options={deadline:start+previewSolveBudget,maxPasses:12,epsilon:Math.max(1e-7,Math.min(.01,.15/camera.scale))};
    const solved=Formal.solve(requested,constraints,new Set(ids),{...options,deadline:start+2,maxPasses:5})??
      (action.keepGroup?null:Formal.solve(requested,constraints,new Set(),options));
    if(!solved||!Formal.preservesContourOrientation(items,solved,constraints)) return;
    action.changes=new Map([...desired,...solved.filter((e,i)=>e!==items[i]).map(e=>[e.id,e])]);
  }
  confirmDragSnap(action,p);
  if(action.kind==='splineHandle') {
    const entity=action.changes.get(action.knot.entity.id)??action.knot.entity;
    updateHandleFields(curveKnotHandle(entity,action.knot.index).setting);
  }
}
function pickBox(start,end,mod) {
  const a=world(start),b=world(end),lo=a.map((v,i)=>Math.min(v,b[i])),hi=a.map((v,i)=>Math.max(v,b[i]));
  const inside=p=>p.every((v,i)=>v>=lo[i]&&v<=hi[i]);
  const crossing=end[0]<start[0];
  const ids=[], parts=new Map(), refs=[];
  for(const e of doc.entities) {
    if(!visible(e)) continue;
    if(crossing) {
      const touched=Edit.crossingParts(e,lo,hi,camera.scale,constructionShown(e.layer));
      if(!touched.length) continue;
      ids.push(e.id);
      if(modification?.type!=='autoClose'&&touched.length<G.strokeParts(e).length) parts.set(e.id,new Set(touched));
      for(const index of touched) refs.push({id:e.id,kind:e.type==='point'?'point':'edge',index});
    } else if(visibleStrokeParts(e).every(part=>G.trace(part,camera.scale).every(inside))) ids.push(e.id);
  }
  pick(ids,mod,parts,refs);
}
function filletTarget(position) {
  const p=world(position), candidates=[];
  for(const entity of hit(p)) for(const [index,part] of Formal.referenceEdges(entity).entries()) {
    if(!['line','arc','bezier','ellipse'].includes(part.type)||part.type==='ellipse'&&part.s===undefined||
      !constructionShown(entity.layer)&&G.constructionAt(entity,index)) continue;
    for(const [end,q] of Edit.ends(part).entries()) {
      const gap=G.dist(p,q)*camera.scale;
      if(gap<=10) candidates.push({entity,index,part,end,q,gap});
    }
  }
  candidates.sort((a,b)=>a.gap-b.gap);
  const vertex=candidates.find(a=>candidates.some(b=>a!==b&&a.entity.layer===b.entity.layer&&G.dist(a.q,b.q)<=G.eps*8));
  if(!vertex) return candidates.length?{sides:[candidates[0]],proposal:null}:null;
  const sides=candidates.filter(side=>side.entity.layer===vertex.entity.layer&&G.dist(vertex.q,side.q)<=G.eps*8);
  const radius=$('filletRadius').valueAsNumber/Formats.millimeters[doc.units];
  if(sides.length!==2) return {sides,proposal:null};
  let seam=false;
  if(sides[0].entity===sides[1].entity) {
    if(sides[0].end===0) sides.reverse();
    const [first,second]=sides;
    const count=Formal.referenceEdges(first.entity).length;
    // The ends can already coincide even though the contour is still marked open.
    seam=first.index===count-1&&second.index===0;
    if(first.end!==1||second.end!==0||!seam&&second.index!==first.index+1) return {sides,proposal:null};
  }
  const [first,second]=sides, same=first.entity===second.entity;
  const proposal=Edit.filletLines(first,second,radius,same);
  const supports=sides.map(side=>side.index);
  if(proposal&&same) {
    const edges=Formal.referenceEdges(first.entity), closed=first.entity.closed||seam;
    for(const [i,side] of sides.entries()) {
      if(proposal.lines[i]) continue;
      let index=side.index+(i===0?-1:1);
      if(closed) index=(index+edges.length)%edges.length;
      const neighbor=edges[index], end=i===0?1:0;
      if(!neighbor||sides.some(other=>other.index===index)||G.dist(Edit.ends(neighbor)[end],proposal.points[i])>G.eps*16)
        return {sides,proposal:null};
      const a=G.traceDerivative(neighbor,end), b=G.traceDerivative(proposal.arc,i);
      if(G.dot(a,b)<=0||Math.abs(G.cross(a,b))>1e-7*Math.hypot(...a)*Math.hypot(...b))
        return {sides,proposal:null};
      supports[i]=index;
    }
  }
  return {sides,seam,proposal,supports};
}
function applyFillet(position) {
  const target=filletTarget(position);
  const refs=target?.sides.map(({entity,index})=>({id:entity.id,kind:'edge',index}))??[];
  if(!target?.proposal) {
    if(refs.length) animateRemoval([{type:'tangent',refs}],doc.entities,true,true);
    message(I18n.t('Congé impossible à ce rayon ou sur ce coin.'));
    return;
  }
  const {sides,proposal:{arc,lines}}=target, [first,second]=sides, before=doc.entities;
  const same=first.entity===second.entity, replacements=new Map(), edgeIndices=new Map();
  let arcIndex=0;
  const styles=sides.map(side=>G.constructionAt(side.entity,side.index));
  const arcStyle=styles[0]===styles[1]?styles[0]:null;
  function rebuild(entity,updated,insert=false) {
    const source=Formal.referenceEdges(entity);
    if(source.length===1&&!insert) return {...updated.get(0),id:entity.id,layer:entity.layer,
      ...(entity.vectorGroup?{vectorGroup:entity.vectorGroup}:{})};
    const {p,segments,construction,constructionParts,profile,...rest}=entity;
    const parts=[], marks=[];
    for(const [index,part] of source.entries()) {
      const next=updated.has(index)?updated.get(index):part;
      if(next) {
        if(insert) edgeIndices.set(index,parts.length);
        parts.push(next);marks.push(G.constructionAt(entity,index));
      }
      if(insert&&index===first.index) {arcIndex=parts.length;parts.push(arc);marks.push(arcStyle);}
    }
    let result={...rest,type:'path',segments:parts,closed:entity.closed||insert&&target.seam};
    for(const [index,style] of marks.entries()) if(style) result=G.withConstruction(result,style,index);
    return result;
  }
  if(same) replacements.set(first.entity.id,rebuild(first.entity,new Map([[first.index,lines[0]],[second.index,lines[1]]]),true));
  else sides.forEach(({entity,index},i)=>replacements.set(entity.id,rebuild(entity,new Map([[index,lines[i]]]))));
  const group=first.entity.vectorGroup===second.entity.vectorGroup?first.entity.vectorGroup:null;
  const connector=same?null:identity(G.withConstruction({...arc,layer:first.entity.layer,...(group?{vectorGroup:group}:{})},arcStyle));
  const entities=before.map(entity=>replacements.get(entity.id)??entity);
  if(connector) entities.push(connector);
  if([...replacements.values(),...(connector?[connector]:[])].some(entity=>!G.serial(entity)||!Edit.valid(entity))) {
    animateRemoval([{type:'tangent',refs}],before,true,true);
    message(I18n.t('Congé impossible à ce rayon ou sur ce coin.'));
    return;
  }
  const after=new Map(entities.map(entity=>[entity.id,entity]));
  const changed=new Map([...replacements.keys()].map(id=>[id,id]));
  const mapRef=ref=>{
    if(!changed.has(ref.id)) return ref;
    if(same&&ref.kind==='edge') {
      const index=edgeIndices.get(ref.index);
      return index===undefined?null:{...ref,index};
    }
    if(same&&Formal.isMidpointRef(ref)) {
      const base=Formal.midpointRef({id:ref.id,index:0}).index;
      const index=edgeIndices.get(ref.index-base);
      return index===undefined?null:Formal.midpointRef({id:ref.id,index});
    }
    if(ref.kind==='edge'||Formal.isMidpointRef(ref)) return ref;
    return Formal.remapReference(before,entities,changed,ref);
  };
  const lost=[], constraints=(doc.constraints??[]).flatMap(c=>{
    if(!c.refs.some(ref=>changed.has(ref.id))) return [c];
    const mapped=c.refs.map(mapRef), adapted={...c,refs:mapped};
    if(mapped.every(Boolean)&&Formal.satisfied(after,adapted)) return [adapted];
    lost.push(c);return [];
  });
  const arcRef={id:connector?.id??first.entity.id,kind:'edge',index:arcIndex};
  for(const [i,ref] of refs.entries()) {
    const lineRef=mapRef({...ref,index:target.supports[i]}), tangent=Formal.make('tangent',[lineRef,arcRef],entities);
    if(tangent&&Formal.satisfied(after,tangent)) constraints.push(tangent);
    if(connector) {
      const point=side=>Formal.vertices(after.get(lineRef.id)).findIndex(q=>G.dist(q,side)<=G.eps*8);
      const endpoint=point(Edit.ends(arc)[i]);
      if(endpoint>=0) constraints.push({type:'coincident',refs:[
        {id:lineRef.id,kind:'point',index:endpoint},{id:connector.id,kind:'point',index:i}]});
    }
  }
  segmentSelection.clear();formalSelection=[];edgeFocus=null;knotFocus=null;wholeFocus=null;
  commit(d=>({...d,entities,constraints}),false,false,true);
  animateRemoval(lost,before);
  warnLost(lost.length,I18n.t('Congé appliqué.'));
}
function scissorsToleranceWorld() {
  const value=$('scissorsTolerance').valueAsNumber;
  return Number.isFinite(value)&&value>=0?value/Formats.millimeters[doc.units]:null;
}
function scissorsParts(entity) {
  const parts=G.strokeParts(entity);
  if(parts.length) return parts;
  return ['line','arc','circle','ellipse','bezier'].includes(entity.type)?[entity]:[];
}
function scissorsTarget(position) {
  const p=world(position), tolerance=scissorsToleranceWorld();
  if(tolerance===null) return null;
  let best=null, distance=7/camera.scale;
  for(const entity of hit(p)) for(const [index,part] of scissorsParts(entity).entries()) {
    if(!constructionShown(entity.layer)&&G.constructionAt(entity,index)) continue;
    const location=G.traceLocation(part,p), gap=location&&G.dist(p,location.q);
    if(location&&gap<distance) {best={entity,index,part,...location};distance=gap;}
  }
  return best?scissorsInterval(best,tolerance):null;
}
function scissorsInterval(best,tolerance) {
  const parts=scissorsParts(best.entity);
  if($('scissorsAlong').checked&&parts.length>1) {
    const result=Edit.trimAlong(parts,best.index,best.t,Boolean(best.entity.closed),index=>
      scissorsStops({...best,index,part:parts[index]},tolerance,true),
      index=>constructionShown(best.entity.layer)||!G.constructionAt(best.entity,index));
    return {...best,...result};
  }
  const cyclic=best.part.s===undefined&&['circle','ellipse'].includes(best.part.type);
  const unique=scissorsStops(best,tolerance,false);
  const [from,to]=Edit.trimBounds(best.t,unique.map(stop=>stop.t),cyclic);
  const bounds=[from,to].map(t=>{
    const parameter=cyclic?(t%1+1)%1:t;
    return {q:G.traceAt(best.part,t),ref:unique.find(stop=>Math.abs(stop.t-parameter)<=1e-7)?.ref};
  });
  return {...best,from,to,bounds};
}
function scissorsStops(best,tolerance,along) {
  let cache=modification.scissorsBoundaries;
  if(cache?.doc!==doc||cache.tolerance!==tolerance) {
    cache={doc,tolerance,byStroke:new Map()};
    modification.scissorsBoundaries=cache;
  }
  const key=best.entity.id+'/'+best.index+'/'+along;
  let stops=cache.byStroke.get(key);
  if(!stops) {
    stops=[];
    for(const e of doc.entities) if(visible(e)) {
      const vertices=Formal.vertices(e);
      const count=e.type==='arc'?2:['circle','ellipse'].includes(e.type)&&e.s===undefined?0:vertices.length;
      for(let index=0;index<count&&(!along||e!==best.entity);index++) {
        const vertex=vertices[index];
        if(!visiblePoint(e,vertex)) continue;
        const location=G.traceLocation(best.part,vertex);
        if(location&&G.dist(location.q,vertex)<=tolerance+G.eps)
          stops.push({t:location.t,ref:{id:e.id,kind:'point',index},gap:G.dist(location.q,vertex)});
      }
      const parts=scissorsParts(e);
      for(const [i,part] of parts.entries()) {
        if(e===best.entity&&i===best.index||!constructionShown(e.layer)&&G.constructionAt(e,i)) continue;
        const adjacent=along&&e===best.entity&&(Math.abs(i-best.index)===1||
          e.closed&&Math.abs(i-best.index)===parts.length-1);
        const crossings=Edit.curveIntersections(best.part,part);
        if(along&&e===best.entity&&!adjacent)
          crossings.push(...Edit.endpointContacts(best.part,part,tolerance));
        for(const t of crossings) {
          if(adjacent&&(t<=1e-7||t>=1-1e-7)) continue;
          stops.push({t,ref:{id:e.id,kind:'edge',index:i},gap:0});
        }
      }
    }
    cache.byStroke.set(key,stops);
  }
  const cyclic=best.part.s===undefined&&['circle','ellipse'].includes(best.part.type);
  const ordered=stops.map(stop=>({...stop,t:cyclic&&stop.t>=1-1e-7?0:stop.t}))
    .sort((a,b)=>a.t-b.t);
  const unique=[];
  for(const stop of ordered) {
    const last=unique.at(-1);
    if(!last||stop.t-last.t>1e-7) unique.push(stop);
    else if((stop.ref.kind==='point'&&last.ref.kind!=='point')||
      stop.ref.kind===last.ref.kind&&(stop.ref.id!==best.entity.id&&last.ref.id===best.entity.id||stop.gap<last.gap)) {
      unique[unique.length-1]=stop;
    }
  }
  return unique;
}
function bindScissorsCoincidences(target,before,entities,constraints,remap,updated) {
  const ids=new Set(updated), signatures=new Set(constraints.map(Formal.signature));
  let skipped=0, added=0;
  for(const {q,ref} of target.bounds) {
    if(!ref) continue;
    const previous=entities;
    const endpoints=[];
    for(const e of previous) if(ids.has(e.id)) {
      const contour=Edit.contour(e);
      if(!contour) continue;
      const vertices=Formal.vertices(e);
      const tail=e.type==='arc'?1:vertices.length-1;
      for(const [index,point] of [[0,contour.points[0]],[tail,contour.points[1]]])
        if(G.dist(point,q)<=1e-7) endpoints.push({id:e.id,kind:'point',index});
    }
    if(!endpoints.length) continue;
    if(target.cuts&&ref.id===target.entity.id&&endpoints.length===2) {
      const coincidence=Formal.make('coincident',endpoints,entities);
      if(coincidence) {
        const signature=Formal.signature(coincidence);
        if(!signatures.has(signature)) {signatures.add(signature);constraints.push(coincidence);added++;}
        continue;
      }
    }
    const support=remap.has(ref.id)?Formal.remapReference(before,previous,remap,ref):ref;
    if(!support) {skipped++;continue;}
    for(const endpoint of endpoints) {
      if(Formal.sameRef(endpoint,support)) continue;
      const relation=Formal.make('coincident',[endpoint,support],entities);
      if(!relation) {skipped++;continue;}
      const key=Formal.signature(relation);
      if(signatures.has(key)) continue;
      const map=new Map(entities.map(e=>[e.id,e]));
      if(!Formal.satisfied(map,relation)) {
        const connected=Formal.connected([...constraints,relation],[endpoint.id]);
        const fixed=new Set(entities.filter(e=>e.id!==endpoint.id).map(e=>e.id));
        const solved=Formal.solve(entities,connected,fixed);
        if(!solved||solved.some(e=>!G.serial(e)||!Edit.valid(e))) {skipped++;continue;}
        entities=solved;
      }
      constraints.push(relation);signatures.add(key);added++;
    }
  }
  return {entities,added,skipped};
}
function scissorsSweep(points) {
  const tolerance=scissorsToleranceWorld();
  if(tolerance===null) return [];
  const trail=points.map(world), cuts=new Map();
  for(const entity of doc.entities) if(visible(entity)) {
    for(const [index,part] of scissorsParts(entity).entries()) {
      if(!constructionShown(entity.layer)&&G.constructionAt(entity,index)) continue;
      const bounds=G.boundsPoints(part);
      const limits=[0,1].map(axis=>[Math.min(...bounds.map(p=>p[axis])),Math.max(...bounds.map(p=>p[axis]))]);
      for(let i=1;i<trail.length;i++) {
        if(G.dist(trail[i-1],trail[i])<=G.eps) continue;
        const line={type:'line',p:[trail[i-1],trail[i]]};
        if(limits.some(([low,high],axis)=>line.p.every(p=>p[axis]<low-1e-7)||
          line.p.every(p=>p[axis]>high+1e-7))) continue;
        const hits=Edit.curveIntersections(part,line);
        for(const endpoint of line.p) {
          const hit=G.traceLocation(part,endpoint);
          if(hit&&G.dist(hit.q,endpoint)<=1e-7) hits.push(hit.t);
        }
        for(const t of hits) {
          const cut=scissorsInterval({entity,index,part,t,q:G.traceAt(part,t)},tolerance);
          const key=entity.id+'/'+(cut.cuts??[cut]).map(part=>[part.index,part.from,part.to].join(':')).join('/');
          cuts.set(key,cut);
        }
      }
    }
  }
  return [...cuts.values()];
}
function applyScissorsCuts(targets) {
  const cuts=new Map();
  for(const target of targets) {
    if(!target) continue;
    const portions=(target.cuts??[target]).filter(cut=>cut.to-cut.from>1e-8);
    if(!portions.length) continue;
    if(!cuts.has(target.entity.id)) cuts.set(target.entity.id,[]);
    cuts.get(target.entity.id).push(...portions);
  }
  if(!cuts.size) {message(I18n.t('Aucune portion de tracé à couper.'));return;}
  pick([...cuts.keys()],{});
  const previousRemoval=removalBatches.at(-1);
  let added=0, skipped=0;
  const bind=$('scissorsCoincidence').checked?(before,entities,constraints,remap,updated)=>{
    for(const target of targets) {
      const sameEntity=remap.get(target.entity.id)??updated;
      const result=bindScissorsCoincidences(target,before,entities,constraints,remap,sameEntity);
      entities=result.entities;added+=result.added;skipped+=result.skipped;
    }
    return entities;
  }:null;
  if(replaceSelected(entity=>cuts.has(entity.id)?Edit.trimContours(entity,cuts.get(entity.id)):[entity],false,true,undefined,bind)) {
    const lost=removalBatches.at(-1);
    let status=I18n.t('Coupe appliquée.');
    if(added) status+=' '+added+I18n.t(' coïncidence(s) ajoutée(s).');
    if(skipped) status+=' '+skipped+I18n.t(' coïncidence(s) impossible(s).');
    warnLost(lost&&lost!==previousRemoval?lost.relations.length:0,status);
  }
}
canvas.addEventListener('pointerdown',e=>{
  if(dimensionEdit&&e.button===0) {
    const target=dimensionAt(mouse(e));
    if(target?.dimensionName) {
      e.preventDefault();
      const field=$('dimensionExpression');
      field.setRangeText(target.dimensionName,field.selectionStart,field.selectionEnd,'end');
      field.focus();
      requestDraw();
    }
    return;
  }
  if(rasterRotation) return;
  if(rasterMode&&e.button===0) {if(!rasterRotation&&!drag) rasterPointerDown(e);return;}
  const mod=drawingModifiers(e);
  angleHeld=mod.shiftKey;tangentHeld=mod.ctrlKey;
  if(drag || ![0,1].includes(e.button)) return;
  const start=mouse(e);
  const field=document.activeElement;
  const priorText=field?.form===$('textOptions')&&e.button===0?textAt(start):null;
  if(field?.matches?.(parameterSelector)) field.blur();
  if(e.button===0&&tool==='text'&&inlineText) {
    const caret=cadCaretAt(cadTextValues(),start);
    if(caret&&(caret.inside||caret.distance*camera.scale<=9)) {
      e.preventDefault();
      const anchor=e.shiftKey?(cadInlineEditor.selectionDirection==='backward'?cadInlineEditor.selectionEnd:cadInlineEditor.selectionStart):caret.index;
      drag={kind:'textCaret',start,id:e.pointerId,anchor};
      canvas.setPointerCapture(e.pointerId);
      positionCadCaret(start,anchor);
      return;
    }
    finishInlineText(true);
  }
  if(e.button===0&&(tool==='text'||tool==='select'&&!modification&&!constraintMode)&&!textPicking) {
    const text=textAt(start)??(priorText&&(doc.texts??[]).find(item=>item.id===priorText.id));
    if(text) {startCadTextDrag(e,start,text);return;}
    if(tool==='select') textSelection=null;
  }
  if(e.button===0&&tool==='text') {
    drag={kind:'textPlacement',start,id:e.pointerId};
    canvas.setPointerCapture(e.pointerId);
    return;
  }
  cursorPoint=start;
  requestDraw();
  canvas.setPointerCapture(e.pointerId);
  if(e.button===1) {
    e.preventDefault();drag={kind:'pan',start,camera:{...camera},id:e.pointerId};return;
  }
  if(modification?.type==='fillet') {drag={kind:'fillet',start,id:e.pointerId};return;}
  if(modification?.type==='scissors') {
    drag={kind:'scissors',start,id:e.pointerId,points:[start],sweeping:false};return;
  }
  if(tool==='select'&&!constraintMode&&!modification&&!mod.shiftKey&&!mod.ctrlKey&&!mod.altKey) {
    const origin=workOriginAt(start);
    if(origin) {
      pick([],{});
      selectedOrigin={layer:activeLayer,name:origin.name};
      update();
      return;
    }
  }
  if(selectedOrigin) {selectedOrigin=null;update();}
  if(tool==='select'&&!constraintMode&&(!modification||modification.protected&&!modification.phase)) {
    const constraint=!mod.shiftKey&&!mod.ctrlKey&&!mod.altKey&&constraintTagAt(start);
    if(constraint) {
      selectedConstraint=constraint;
      selectedDimension=null;
      message(relationLabel(constraint)+I18n.t(' · Suppr pour retirer la contrainte.'));
      update();
      return;
    }
    if(selectedConstraint) {selectedConstraint=null;update();}
  }
  const automatic=!mod.ctrlKey&&!mod.altKey&&automaticGesture(start);
  if(automatic) {
    if(!modification) openTransformation('auto',true);
    const {type,handle,pivot}=automatic, origin=world(start);
    modification.type=type;
    $('rotateValue').value=0;
    $('scaleValue').value=$('scaleY').value=1;
    modification.applied=true;
    drag=type==='scale'?
      {kind:'scaleGesture',start,origin,handle,pivot,factors:[1,1],previous:[1,1],id:e.pointerId,automatic:true}:
      {kind:'rotateGesture',start,pivot,bearing:G.angle(pivot,origin),canRotate:true,
        initial:0,previous:0,startedAt:e.timeStamp,id:e.pointerId,automatic:true};
    requestDraw();return;
  }
  if(modification&&(modification.phase||modification.type!=='move')) {
    if(modification.phase) {drag={kind:'modifyAction',start,id:e.pointerId};return;}
    const position=world(start), tf=modificationTransform();
    const previewObject=modification.type==='rotate'&&!modification.applied&&tf&&tf.rotation!==0&&modificationItems().find(e=>
      hitsEntity(transformModification(e,tf),position));
    const object=previewObject||hit(position)[0];
    if(modification.type==='explode'&&object&&!object.vectorGroup&&!G.strokeParts(object).length&&
      !mod.ctrlKey&&!mod.shiftKey&&!mod.altKey) {
      drag={kind:'move',start,items:[object],explodeMove:true,id:e.pointerId};
      return;
    }
    if(modification.type==='scale'&&tf&&!mod.ctrlKey) {
      const shown=displayedScaleTransform(tf);
      const handle=scaleHandleAt(shown,start);
      if(handle) {
        drag={kind:'scaleGesture',start,origin:position,handle,pivot:tf.pivot,factors:[shown.factor,shown.sy],
          wasApplied:modification.applied,previous:[tf.factor,tf.sy],id:e.pointerId};return;
      }
    }
    const anchor=modification.type==='rotate'&&selectionAnchor(start,selected());
    if(modification.type==='rotate'&&(object||anchor)) {
      const pivot=tf?.pivot;
      drag={kind:'rotateGesture',start,object,pivot,bearing:pivot?G.angle(pivot,position):0,
        canRotate:Boolean(pivot&&G.dist(pivot,position)>G.eps&&(anchor||selectedTraceHit(object,position))&&!mod.ctrlKey),
        initial:modification.applied?0:$('rotateValue').valueAsNumber||0,previous:$('rotateValue').value,
        wasApplied:modification.applied,startedAt:e.timeStamp,id:e.pointerId};
    } else drag={kind:'box',start,object,id:e.pointerId};
    return;
  }
  if(constraintMode!==null) {
    drag={kind:'constraint',start,id:e.pointerId};return;
  }
  if(tool==='select'&&!modification&&(mod.shiftKey||mod.ctrlKey)) {
    const c=dimensionAt(start);
    if(c) {
      clipboardRelations.set(c,!mod.ctrlKey);
      update();return;
    }
  }
  if(tool==='select'&&!modification&&!mod.shiftKey&&!mod.ctrlKey) {
    const c=dimensionAt(start);
    if(c) {
      const entities=new Map(doc.entities.map(e=>[e.id,e]));
      const geometry=Formal.dimensionGeometry(entities,c), layout=dimensionLayout(c,entities);
      pick([],{});
      selectedDimension=c;
      update();
      drag={kind:'dimensionMove',start,c,geometry,origin:world(start),label:world(layout.label),id:e.pointerId};
      return;
    }
  }
  if(tool==='offset') {
    drag={kind:'box',start,object:hit(world(start))[0],id:e.pointerId};return;
  }
  if(tool==='dimension') {
    drag={kind:'dimension',start,id:e.pointerId};return;
  }
  if(tool==='select') {
    const position=world(start);
    const direct=!mod.ctrlKey&&(!mod.shiftKey||mod.altKey);
    if(direct) {
      const knot=focusedKnot();
      if(knot) {
        const {arms,handle,center}=handleLayout(knot.entity,knot.index);
        const arm=arms.findIndex(p=>p&&G.dist(p,start)<=7);
        if(arm!==-1&&G.dist(arms[arm],center)>7) {
          const initialVector=G.sub(world(arms[arm]),handle.point);
          drag={kind:'splineHandle',start,origin:position,knot,arm,handle,initialVector,id:e.pointerId};
          return;
        }
      }
    }
    const items=selected(), anchor=selectionAnchor(start,items);
    if((!mod.shiftKey||anchor||hit(position).length||mod.ctrlKey)&&!mod.altKey) {
      const hits=hit(position);
      const object=hits.find(e=>selectedTraceHit(e,position))??hits[snapIndex%hits.length];
      const related=object?new Set(groupedIds([object.id])):null;
      const moving=anchor||selectedTraceHit(object,position)?items:object&&!segmentSelection.has(object.id)?
        doc.entities.filter(e=>related.has(e.id)):[];
      const resize=moving.length===1&&!object?.vectorGroup&&isRadialRim(object,position)&&radialCenterConstrained(object);
      const group=resize?radialResizeDrag(object,start,e.pointerId):moving.length?{kind:'move',start,items:moving,anchor,
        anchorCenter:anchor&&selectionFrame(items).center,keepGroup:true,id:e.pointerId}:null;
      const box={kind:'box',start,object,id:e.pointerId};
      const gesture={group:group??box,box,object,local:null};
      gesture.group.selectionGesture=box.selectionGesture=gesture;
      drag=gesture.group;
      switchSelectionDrag(mod,start);
      return;
    }
    if(direct&&mod.altKey) {
      const target=knotAt(start);
      if(target&&(!target.entity.vectorGroup||freeTranslation())) {
        pick([target.entity.id],{});
        knotFocus={id:target.entity.id,index:target.index};
        drag={kind:'splineKnot',start,origin:position,knot:target,defer:Boolean(contourDragMode(target.entity)),id:e.pointerId};
        update();
        return;
      }
      knotFocus=null;
    }
    const handle=direct&&mod.altKey?handleAt(position):null;
    const candidates=handle?[]:hit(position);
    const object=handle?.e??candidates[snapIndex%candidates.length];
    if(object && direct && mod.altKey) {
      if(object.vectorGroup&&!freeTranslation()) {
        pick([object.id],mod);
        drag={kind:'move',start,items:selected(),keepGroup:true,id:e.pointerId};
        return;
      }
      const preferredIndex=edgeFocus?.id===object.id?edgeFocus.index:undefined;
      if(!selection.has(object.id)) pick([object.id],mod);
      const target=handle??(selection.size===1&&wholeFocus!==object.id?edgeAt(object,position):null);
      const contour=contourDragMode(object);
      if(contour&&(!handle||contour.rigidVertex)) {
        edgeFocus=null;
        drag=rigidDrag(object,start,e.pointerId);
      } else if(target) {
        wholeFocus=null;
        edgeFocus={id:object.id,index:target.index,anchorEnd:target.anchorEnd};
        const orientations=(doc.constraints??[]).filter(c=>['horizontal','vertical','parallel'].includes(c.type)).flatMap(c=>c.refs);
        const vertices=handle?target.vertices:Edit.translationVertices(doc.entities,object,target.index,orientations);
        drag={kind:'edit',start,vertices,entity:object,preferredIndex:preferredIndex??target.index,slot:contour?.slot,defer:Boolean(contour&&!contour.slot),id:e.pointerId};
      } else {
        edgeFocus=null;
        drag={kind:'move',start,id:e.pointerId};
      }
      update();
    } else drag={kind:'box',start,object,id:e.pointerId};
  } else {
    refreshPointer(start);
    const captureStart=tool==='arc'&&arcMethod==='three'?points.length===0:
      polylineTool()||tool==='bezier'||points.length+1<counts[tool];
    drag={kind:'point',start,point:hover,snap:activeSnap,captureStart,tool,startedAt:e.timeStamp,id:e.pointerId};
  }
});
function isRadialRim(entity,p) {
  if(!entity||!['circle','arc'].includes(entity.type)) return false;
  const q=G.nearestOnTrace(entity,p), distance=G.dist(entity.c,p);
  return distance>G.eps&&G.dist(q,p)<=Math.min(7/camera.scale,entity.r/2);
}
function radialCenterConstrained(entity) {
  const center=Formal.theoreticalReferences(entity)[0];
  return center&&(doc.constraints??[]).some(c=>Formal.isDriving(c)&&c.refs.some(ref=>
    ref.id===entity.id&&ref.kind==='point'&&ref.index===center.index));
}
function radialResizeDrag(entity,start,id) {
  return {kind:'radialResize',start,id,entity,items:[entity],keepGroup:true};
}
function localSelectionDrag(group,object) {
  if(object?.vectorGroup&&!freeTranslation()) return group;
  const {start,id}=group, position=world(start);
  if(object?.type==='arc') {
    const index=Edit.ends(object).findIndex(q=>G.dist(q,position)<=Math.min(7/camera.scale,object.r/2));
    if(index>=0) return {kind:'arcEndpoint',start,id,entity:object,index,keepGroup:true};
  }
  if(isRadialRim(object,position)) return radialResizeDrag(object,start,id);
  const knot=knotAt(start);
  if(knot) return {kind:'splineKnot',start,id,origin:position,knot};
  const handle=handleAt(position);
  const entity=handle?.e??object;
  if(!entity) return null;
  const contour=freeTranslation()?null:contourDragMode(entity);
  const target=handle??(contour?.slot?null:edgeAt(entity,position));
  if(target) {
    return {kind:'edit',start,id,entity,vertices:target.vertices,localOnly:true,
      preferredIndex:target.index,slot:contour?.slot,defer:Boolean(contour?.tangentChain)};
  }
  return {kind:'move',start,id,items:[entity],keepGroup:true};
}
function switchSelectionDrag(event,p) {
  const gesture=drag?.selectionGesture;
  if(!gesture) return;
  if(event.ctrlKey && gesture.local===null) {
    gesture.local=localSelectionDrag(gesture.group,gesture.object)??gesture.box;
    gesture.local.selectionGesture=gesture;
  }
  const next=event.ctrlKey?gesture.local:gesture.group;
  if(next===drag) return;
  clearTimeout(drag.previewTimer);
  drag.previewTimer=undefined;
  drag=next;
  drag.changes=null;
  drag.snapAt=null;
  drag.end=null;
  drag.shiftKey=event.shiftKey;
  if(geometryDrags.has(drag.kind)) drag.previewPoint=p;
  if(drag.kind==='box'&&G.dist(p,drag.start)>3) drag.end=p;
  requestDraw();
}
function isPointDrag(action,distance,timeStamp) {
  return distance>4 && (!delayedPointTools.has(action.tool)||timeStamp-action.startedAt>=pointDragDelay);
}
let lastPointer=null;
canvas.addEventListener('pointermove',e=>{
  if(rasterMode&&!drag) {
    if(rasterRotation?.pointer===e.pointerId) updateRasterRotation(e,mouse(e));
    else if(rasterAnchor&&!rasterCalibration) {rasterProbe=world(mouse(e));requestDraw();}
    return;
  }
  const mod=drawingModifiers(e);
  angleHeld=mod.shiftKey;tangentHeld=mod.ctrlKey;
  const p=mouse(e);
  if(drag) drag.shiftKey=mod.shiftKey;
  cursorPoint=p;
  if(!lastPointer || G.dist(lastPointer,p)>1) snapIndex=0;
  lastPointer=p;
  if(drag?.kind==='textCaret'&&drag.id===e.pointerId) {
    positionCadCaret(p,drag.anchor);
    return;
  }
  if(drag?.kind==='textMove'&&drag.id===e.pointerId) {
    drag.preview=G.dist(drag.start,p)>4?movedCadText(drag,p):null;
    requestDraw();
    return;
  }
  if(drag?.id===e.pointerId) {
    switchSelectionDrag(mod,p);
    if(drag.kind==='rotateGesture'&&!drag.canRotate&&G.dist(drag.start,p)>3)
      drag={...drag,kind:'box',end:p};
    if(drag.kind==='rotateGesture'&&drag.canRotate&&e.timeStamp-drag.startedAt>=pointDragDelay&&G.dist(drag.start,p)>4) changeRotation(drag,p);
    if(drag.kind==='scaleGesture'&&G.dist(drag.start,p)>2) changeScale(drag,p);
    if(drag.kind==='scissors'&&G.dist(drag.points.at(-1),p)>=2) {
      drag.points.push(p);
      drag.sweeping||=G.dist(drag.start,p)>4;
    }
    if(drag.kind==='point') drag.held=isPointDrag(drag,G.dist(drag.start,p),e.timeStamp);
    if(drag.kind==='pan'){
      camera.x=drag.camera.x-(p[0]-drag.start[0])/camera.scale;
      camera.y=drag.camera.y+(p[1]-drag.start[1])/camera.scale;
    }
    if(geometryDrags.has(drag.kind)) {
      drag.shiftKey=mod.shiftKey;
      drag.previewPoint=p;
    }
    if(drag.kind==='dimensionMove') drag.offset=G.dist(drag.start,p)>3?annotationOffset(drag,p):null;
    if(drag.kind==='box' && G.dist(drag.start,p)>3) drag.end=p;
  }
  refreshPointer(p);
});
canvas.addEventListener('pointerup',e=>{
  if(rasterRotation?.pointer===e.pointerId) {
    updateRasterRotation(e,mouse(e));
    const {layer,image,pivot,degrees}=rasterRotation;
    rasterRotation=null;
    if(Math.abs(degrees)>G.eps) applyRasterTransform(layer,Formats.transformRaster(image,pivot,1,degrees));
    requestDraw();
    return;
  }
  if(rasterMode&&!drag) return;
  const mod=drawingModifiers(e);
  angleHeld=mod.shiftKey;tangentHeld=mod.ctrlKey;
  if(drag?.id!==e.pointerId) return;
  const p=mouse(e);
  switchSelectionDrag(mod,p);
  const action=drag;drag=null;
  action.shiftKey=mod.shiftKey;
  clearTimeout(action.previewTimer);
  cursorPoint=p;
  const distance=G.dist(action.start,p);
  refreshPointer(p);
  if(action.kind==='textCaret') {textCaretClick=distance<=4;return;}
  if(action.kind==='textMove') {finishCadTextDrag(action,p,distance);return;}
  if(action.kind==='textPlacement') {if(distance<=4) clickCadText(p);return;}
  if(action.kind==='fillet'&&distance<=4) {applyFillet(p);return;}
  if(action.kind==='scissors') {
    if(action.sweeping||distance>4) applyScissorsCuts(scissorsSweep([...action.points,p]));
    else {
      const target=scissorsTarget(p);
      applyScissorsCuts(target?[target]:[]);
    }
  }
  if(action.kind==='modifyAction'&&distance<=4) modificationClick(world(p));
  if(action.kind==='rotateGesture') {
    if(action.canRotate&&e.timeStamp-action.startedAt>=pointDragDelay&&distance>4) {
      changeRotation(action,p);
      if(action.aim) finishTransformGesture(action);
    }
    else if(action.object&&(distance<=4||e.timeStamp-action.startedAt<pointDragDelay)) {
      if(!selection.has(action.object.id)||selection.size===1||mod.shiftKey||mod.ctrlKey) pickRotationGroup(action.object,mod);
    }
  }
  if(action.kind==='scaleGesture'&&distance>2) {
    changeScale(action,p);
    finishTransformGesture(action);
  }
  if(action.automatic) restoreAutomaticMode();
  if(action.kind==='constraint' && constraintMode!==null && distance<=4) {
    collectConstraint(world(p));
  }
  if(action.kind==='dimension' && tool==='dimension' && distance<=4) {
    dimensionClick(world(p));
  }
  if(action.kind==='dimensionMove' && distance>3) {
    const offset=annotationOffset(action,p);
    if(G.dist(offset,action.c.offset)>G.eps) {
      const replacement={...action.c,offset};
      selectedDimension=replacement;
      commit(d=>({...d,constraints:d.constraints.map(c=>c===action.c?replacement:c)}));
    }
  }
  if(action.kind==='point' && action.tool===tool) {
    const held=isPointDrag(action,distance,e.timeStamp);
    let closedAtPress=false;
    if(held && action.captureStart) {
      place(action.point,mod.shiftKey,action.snap);
      closedAtPress=(polylineTool()||tool==='bezier') && points.length===0;
    }
    const fixedClick=tool==='arc'&&arcMethod==='three'&&!action.captureStart;
    const usePress=fixedClick||delayedPointTools.has(tool)&&!held;
    if(!closedAtPress) place(usePress?action.point:hover,mod.shiftKey,usePress?action.snap:activeSnap);
    if(tool==='poly' && held && segments.length) finishPolyline();
  }
  const clickedObject=distance<=3&&(action.selectionGesture?.object??
    (['box','move','edit','rigid','splineKnot','radialResize','arcEndpoint'].includes(action.kind)?hit(world(p))[0]:null));
  const pickedSegment=tool==='select'&&!constraintMode&&(!modification||modification.type==='explode')&&clickedObject&&
    (!mod.ctrlKey||segmentSelection.has(clickedObject.id))&&segmentAt(clickedObject,world(p))!==null;
  if(action.explodeMove&&distance<=3) pick([action.items[0].id],mod);
  if(action.kind==='box'&&!pickedSegment) {
    if(distance>3) pickBox(action.start,p,mod);
    else pick(action.object?[action.object.id]:[],mod);
  }
  else if(action.selectionGesture&&distance<=3&&!pickedSegment) {
    const object=action.selectionGesture.object;
    if(object&&(mod.ctrlKey||!selection.has(object.id))&&(!action.anchor||mod.ctrlKey)) pick([object.id],mod);
  }
  if(geometryDrags.has(action.kind)) {
    const changes=dragGeometry(action,p);
    if(action.blockedRequest) signalBlockedMovement(doc.entities.map(e=>action.blockedRequest.get(e.id)??e),action.blockedRequest.keys());
    if(changes) {
      if(action.explodeMove&&changes.size&&!selection.has(action.items[0].id)) pick([action.items[0].id],{});
      if(changes.size&&action.selectionGesture?.group===action&&action.items.length===1&&
        !selection.has(action.items[0].id)) pick([action.items[0].id],{});
      if(changes.size&&['radialResize','arcEndpoint'].includes(action.kind)&&!selection.has(action.entity.id)) pick([action.entity.id],{});
      const applied=(freeTranslation()||action.explodeMove)&&changes.size?commitFreeTranslation(changes,action,p):
        applyChanges(changes,true,action.keepGroup,action.axes,true)?changes:null;
      if(applied?.size) updateTranslationPivot(applied,action);
      if(action.kind==='splineHandle'&&!changes.size) update();
    } else message(action.blocked?I18n.t('Ce contour est lié à un élément verrouillé.'):I18n.t('Déplacement bloqué par la géométrie ou les contraintes.'));
  }
  if(tool==='select' && constraintMode===null && distance<=3 &&
    ['box','move','edit','rigid','splineKnot','radialResize','arcEndpoint'].includes(action.kind)) {
    const ref=constraintTarget(world(p));
    if(!mod.shiftKey&&!mod.ctrlKey) formalSelection=[];
    if(pickedSegment) selectSegment(clickedObject,world(p),mod);
    else if(!mod.shiftKey&&!mod.ctrlKey) segmentSelection.clear();
    if(action.keepGroup||pickedSegment) {
      const knot=knotAt(p);
      knotFocus=knot&&selection.has(knot.entity.id)?{id:knot.entity.id,index:knot.index}:null;
    }
    update();
    if(ref) {
      if(mod.ctrlKey) formalSelection=formalSelection.filter(r=>!Formal.sameRef(r,ref));
      else if(!formalSelection.some(r=>Formal.sameRef(r,ref))) formalSelection.push(ref);
    }
  }
  requestDraw();
});
function restoreAutomaticMode() {
  if(!modification?.auto) return;
  modification.type='move';
  modification.applied=true;
  update();
}
function cancelDrag() {
  const automatic=drag?.automatic;
  const editedHandle=drag?.kind==='splineHandle';
  if(drag?.kind==='rotateGesture'&&drag.aim&&modification) {
    $('rotateValue').value=drag.previous;modification.applied=drag.wasApplied;
  }
  if(drag?.kind==='scaleGesture') {
    $('scaleValue').value=drag.previous[0];$('scaleY').value=drag.previous[1];
    if(modification) modification.applied=drag.wasApplied;
  }
  clearTimeout(drag?.previewTimer);
  drag=null;
  if(automatic) restoreAutomaticMode();
  if(editedHandle) update();
  else requestDraw();
}
for(const type of ['lostpointercapture','pointercancel']) canvas.addEventListener(type,event=>{
  if(rasterRotation?.pointer===event.pointerId) {rasterRotation=null;requestDraw();return;}
  cancelDrag();
});
canvas.addEventListener('pointerleave',()=>{
  cursorPoint=null;
  requestDraw();
  if(constraintMode!==null) {hover=null;requestDraw();}
});
canvas.addEventListener('pointerenter',e=>{cursorPoint=mouse(e);requestDraw();});
canvas.addEventListener('click',event=>{
  const caretClick=textCaretClick;
  textCaretClick=false;
  if(!inlineText||!caretClick||event.detail<2) return;
  if(event.detail>=3) cadInlineEditor.select();
  else {
    const caret=cadCaretAt(cadTextValues(),mouse(event));
    if(!caret) return;
    const range=TextGeometry.wordRange(cadInlineEditor.value,caret.character??caret.index);
    if(!range) return;
    cadInlineEditor.setSelectionRange(...range);
  }
  refreshInlineCaret();
});
canvas.addEventListener('dblclick',e=>{
  if(dimensionEdit) return;
  if(rasterMode||inlineText) return;
  if((tool==='select'||tool==='text')&&!modification&&!constraintMode) {
    const text=textAt(mouse(e));
    if(text) {
      if(tool==='text'||choose('text')) {
        const at=mouse(e);
        loadCadText(text);startInlineText(world(at),cadCaretAt(text,at)?.index);
      }
      return;
    }
  }
  if(constraintMode!==null||modification) return;
  const dimension=dimensionAt(mouse(e));
  if(dimension && (tool==='select'||tool==='dimension')) {editDimension(dimension);return;}
  if(polylineTool()) finishPolyline();
  if(tool==='select') {
    const object=hit(world(mouse(e)))[0];
    if(object) {
      if(wholeFocus===object.id) {
        wholeFocus=null;
        const target=edgeAt(object,world(mouse(e)));
        if(target) edgeFocus={id:object.id,index:target.index,anchorEnd:false};
        selectSegment(object,world(mouse(e)));
        update();
      } else {
        pick([object.id],pointerModifiers(e));
        wholeFocus=object.id;
        updateConstructionOptions();
        message(I18n.t('Objet entier sélectionné. Double-cliquez pour revenir au segment.'));
      }
    }
  }
});
canvas.addEventListener('wheel',e=>{
  e.preventDefault();
  const p=mouse(e), before=world(p);
  camera.scale=Math.max(1e-10,Math.min(1e7,camera.scale*Math.exp(-Math.max(-300,Math.min(300,e.deltaY*(e.deltaMode===1?16:1)))*.0015)));
  const delta=G.sub(before,world(p));camera.x+=delta[0];camera.y+=delta[1];
  if(drag?.kind==='pan') {drag.start=p;drag.camera={...camera};}
  refreshPointer(p);
},{passive:false});
new ResizeObserver(entries=>{
  const {width,height}=entries[0].contentRect, dpr=window.devicePixelRatio||1;
  viewport=[width,height];canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
  context.setTransform(dpr,0,0,dpr,0,0);requestDraw();
}).observe(canvas);

function download(content,name,type='application/octet-stream') {
  const url=URL.createObjectURL(new Blob([content],{type}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
}
let saveHandle=null, linkedSourceSave=null, saving=false, exporting=false;
async function save(as=false) {
  if(saving||exporting) return;
  const snapshot=doc;
  const {constraints,...drawing}=doc;
  const dimensionTableCsv=DimensionTable.csv(doc), history=ProjectHistory.pack(doc,undo);
  const content=JSON.stringify(history||constraints?.length||doc.texts?.some(text=>text.pathMode==='linked')?{...doc,dimensionTableCsv,history}:{...drawing,dimensionTableCsv,entities:doc.entities.map(({id,...entity})=>entity)},null,2);
  const suggested=filename+'.vcv';
  saving=true;
  try {
    let handle=as?null:saveHandle;
    if(!handle && typeof window.showSaveFilePicker==='function') {
      try {
        handle=await window.showSaveFilePicker({
          suggestedName:suggested,types:[{description:I18n.t('Projet Velocivector'),accept:{'application/json':['.vcv']}}]
        });
      } catch(error) {
        if(error.name!=='SecurityError' && error.name!=='NotSupportedError') throw error;
      }
    }
    if(handle) {
      const output=await handle.createWritable();
      try {await output.write(content);await output.close();}
      catch(error) {await output.abort().catch(()=>{});throw error;}
      if(linkedSourceSave?.handle===handle) await linkedSourceSave.write(content);
      else linkedSourceSave=null;
      saveHandle=handle;
      filename=handle.name.replace(/\.(?:vcv|vvec)$/i,'');
      message(I18n.t('Projet enregistré · ')+handle.name+' · '+undoHistoryStatus(history?.steps.length??0));
    } else {
      if(as) {
        const name=prompt(I18n.t('Nom du projet à télécharger'),filename);
        if(!name?.trim()) return;
        const base=name.trim().replace(/\.vcv$/i,'').trim();
        if(!base || /[<>:"/\\|?*]/.test(base)) {message(I18n.t('Nom de fichier invalide.'));return;}
        filename=base;
      }
      download(content,filename+'.vcv');
      message(I18n.t('Téléchargement demandé · ')+filename+'.vcv · '+undoHistoryStatus(history?.steps.length??0));
    }
    if(doc===snapshot) dirty=false;
  } catch(error) {
    if(error.name!=='AbortError') message(I18n.t('Enregistrement impossible · ')+I18n.t(error.message));
  } finally {saving=false;}
}
function undoHistoryStatus(count) {return I18n.t("Historique d’annulation · {count} / 20 étapes",{count});}
function canReplace() {return !saving&&!exporting && (!(dirty||tool==='bezier'&&points.length) || confirm(I18n.t('Remplacer le dessin actuel ? Enregistrez-le avant de continuer si nécessaire.')));}
function load({history:archivedHistory,...data},name,changed=false) {
  if(rasterMode) setRasterMode();
  removalBatches=[];blockedMovement=null;
  const constraints=[...(data.constraints??[])];
  const restored=ProjectHistory.unpack(data,archivedHistory,Formats.validateNative).map(DimensionTable.assign);
  const hasStoredIds=restored.length>0||constraints.length>0||data.texts?.some(text=>text.pathMode==='linked')&&data.entities.every(e=>Number.isSafeInteger(e.id));
  const known=new Set(constraints.map(Formal.signature));
  const entities=data.entities.map(({angles,...source})=>{
    const entity=hasStoredIds?source:identity(source);
    if(changed||entity.profile!==undefined) return entity;
    const defaults=Formal.slotConstraints(entity);
    if(!defaults.length) return entity;
    for(const c of defaults) {
      const key=Formal.signature(c);
      if(!known.has(key)) {known.add(key);constraints.push(c);}
    }
    return {...entity,profile:'slot'};
  });
  for(const state of [{entities,texts:data.texts},...restored]) {
    for(const items of [state.entities,state.texts??[]]) for(const {id} of items) {
      if(Number.isSafeInteger(id)) nextId=Math.max(nextId,id+1);
    }
  }
  closeDimensionEditor();
  doc=DimensionTable.assign({...data,entities,constraints});
  filename=name;dirty=changed;activeLayer=doc.layers.find(l=>l.visible)?.name||doc.layers[0].name;
  saveHandle=null;linkedSourceSave=null;
  finishInlineText(false);textSelection=null;
  undo=restored;redo=[];selection.clear();segmentSelection.clear();points=[];choose('select');update();fit();
}
menuAction($('new'),()=>{if(canReplace()){
  const drawing=Formats.empty();
  drawing.units=Number(toolDefault('units',drawing.units));
  load(drawing,'dessin');message(I18n.t('Nouveau dessin.'));
}});
menuAction($('open'),()=>openProjectPicker());
menuAction($('import'),()=>$('vectorFile').click());
menuAction($('importRaster'),()=>$('rasterFile').click());
const rasterImportDefaults={rasterBrightness:0,rasterContrast:0,rasterColorTolerance:5,rasterUnprotectedOpacity:100,
  showOriginalRaster:false,scanEnabled:false,scanThreshold:160,scanAdaptive:false,scanShadowRadius:30,
  scanSpecks:0,scanGap:0,scanThickness:0,scanBackground:true,rasterStraightAxis:'horizontal'};
const rasterImportDialog=$('rasterImportDialog'), rasterPreview=$('rasterImportPreview');
const rasterViewport=$('rasterImportViewport');
function rasterPreviewSize(zoom) {
  const {clientWidth,clientHeight}=rasterViewport, {width,height}=rasterPreview;
  const fit=Math.min(1,clientWidth/width,clientHeight/height);
  return [width*fit*zoom,height*fit*zoom];
}
function layoutRasterPreview() {
  if(!rasterImport) return;
  const {zoom,center}=rasterImport.view;
  const [width,height]=rasterPreviewSize(zoom);
  const [x,y]=center;
  Object.assign(rasterPreview.style,{width:width+'px',height:height+'px',
    left:rasterViewport.clientWidth/2-x*width+'px',top:rasterViewport.clientHeight/2-y*height+'px'});
}
rasterViewport.addEventListener('wheel',event=>{
  if(!rasterImport) return;
  event.preventDefault();
  const {view}=rasterImport, box=rasterViewport.getBoundingClientRect();
  const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?rasterViewport.clientHeight:1);
  const zoom=Math.max(.25,Math.min(16,view.zoom*Math.exp(-Math.max(-180,Math.min(180,delta))*.003)));
  if(zoom===view.zoom) return;
  const previous=rasterPreviewSize(view.zoom), next=rasterPreviewSize(zoom);
  const pointer=[event.clientX-box.left-rasterViewport.clientWidth/2,event.clientY-box.top-rasterViewport.clientHeight/2];
  const viewport=[rasterViewport.clientWidth,rasterViewport.clientHeight];
  view.center=view.center.map((coordinate,axis)=>{
    const anchored=coordinate+pointer[axis]*(1/previous[axis]-1/next[axis]);
    // Keep at least a small part of the image in view when zooming away from its edges.
    const margin=Math.min(20,next[axis]/2,viewport[axis]/2);
    const overflow=(viewport[axis]/2-margin)/next[axis];
    return Math.max(-overflow,Math.min(1+overflow,anchored));
  });
  view.zoom=zoom;
  layoutRasterPreview();
},{passive:false});
$('resetRasterZoom').onclick=()=>{
  if(!rasterImport) return;
  rasterImport.view={zoom:1,center:[.5,.5]};
  layoutRasterPreview();
};
new ResizeObserver(layoutRasterPreview).observe(rasterViewport);
const rasterPreviewContext=rasterPreview.getContext('2d',{willReadFrequently:true});
let rasterImport=null, rasterRead=0;
function readRasterDataURL(blob) {
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
function rasterImportSettings() {
  const read=id=>{
    const value=$(id).valueAsNumber;
    return Number.isFinite(value)?value:rasterImportDefaults[id];
  };
  const rgb=hex=>hex.slice(1).match(/../g).map(channel=>parseInt(channel,16));
  return {brightness:read('rasterBrightness'),contrast:read('rasterContrast'),colors:rasterImport.colors.map(rgb),
    erase:rasterImport.erase.map(rgb),opacity:read('rasterUnprotectedOpacity'),tolerance:read('rasterColorTolerance'),
    shape:rasterImport.shape,scan:{enabled:$('scanEnabled').checked,threshold:read('scanThreshold'),
      adaptive:$('scanAdaptive').checked,shadowRadius:read('scanShadowRadius'),specks:read('scanSpecks'),
      gap:read('scanGap'),thickness:read('scanThickness'),background:$('scanBackground').checked}};
}
const rasterRetouched=s=>Boolean(s.brightness||s.contrast||s.opacity!==100||s.erase.length||s.scan.enabled||s.shape.crop||s.shape.quad||s.shape.angle);
function drawRasterColorList() {
  const state=rasterImport;
  $('rasterProtectedColors').replaceChildren(...[...state.colors.map(color=>({color,erase:false})),
    ...state.erase.map(color=>({color,erase:true}))].map(({color,erase})=>{
    const row=document.createElement('li'), remove=document.createElement('button'), swatch=document.createElement('span');
    const label=I18n.t(erase?'Ne plus effacer {color}.':'Retirer la protection de {color}.',{color});
    swatch.className='raster-color-swatch';swatch.style.backgroundColor=color;
    remove.type='button';remove.textContent='×';remove.title=label;remove.setAttribute('aria-label',label);
    remove.onclick=()=>{
      if(state.busy) return;
      const group=erase?'erase':'colors';
      state[group]=state[group].filter(item=>item!==color);
      drawRasterColorList();refreshRasterImport();
    };
    row.append(swatch,document.createTextNode((erase?I18n.t('Fond')+' ':'')+color.toUpperCase()),remove);
    return row;
  }));
}
function resetRasterImportSettings() {
  for(const [id,value] of Object.entries(rasterImportDefaults)) {
    if(typeof value==='boolean') $(id).checked=value;
    else $(id).value=value;
  }
}
function setRasterColorPicking(state,picking) {
  state.picking=picking;
  $('pickRasterBackground').classList.toggle('active',picking==='erase');
  $('pickRasterBackground').setAttribute('aria-pressed',String(picking==='erase'));
  $('pickRasterColor').textContent=I18n.t(picking==='protect'?'Terminer le prélèvement':'Prélever dans l’image');
  $('pickRasterColor').classList.toggle('active',picking==='protect');
  $('pickRasterColor').setAttribute('aria-pressed',String(picking==='protect'));
  rasterPreview.classList.toggle('color-picking',Boolean(picking)||Boolean(state.action));
}
function refreshRasterImport() {
  const state=rasterImport;
  if(!state) return;
  for(const element of $('rasterImportForm').querySelectorAll('aside input, aside select, aside button'))
    element.disabled=state.busy;
  $('showOriginalRaster').disabled=state.busy||Boolean(state.action);
  for(const id of ['scanThreshold','scanAdaptive','scanSpecks','scanGap','scanThickness','scanBackground'])
    $(id).disabled=state.busy||!$('scanEnabled').checked;
  $('scanShadowRadius').disabled=state.busy||!$('scanEnabled').checked||!$('scanAdaptive').checked;
  $('rasterColorTolerance').disabled=state.busy||!state.colors.length&&!state.erase.length;
  $('applyRasterImport').disabled=state.busy||Boolean(state.action);
  for(const id of ['rasterBrightness','rasterContrast','rasterColorTolerance','rasterUnprotectedOpacity']) $(id+'Value').value=$(id).value+' %';
  if(state.frame||state.busy) return;
  state.frame=requestAnimationFrame(()=>{
    state.frame=null;
    if(rasterImport!==state||state.busy) return;
    const {original}=state, settings=rasterImportSettings();
    const source=state.picking||state.action==='perspective'||$('showOriginalRaster').checked;
    const key=source?'original':JSON.stringify(settings);
    if(state.previewKey!==key) {
      state.previewKey=key;
      state.preview=!source&&rasterRetouched(settings)?RasterEditing.processPixels(original.data,original.width,original.height,
        settings,original.width/state.width):original;
    }
    const result=state.preview;
    if(rasterPreview.width!==result.width) rasterPreview.width=result.width;
    if(rasterPreview.height!==result.height) rasterPreview.height=result.height;
    rasterPreviewContext.putImageData(new ImageData(result.data,result.width,result.height),0,0);
    drawRasterWorkshopOverlay(state);
    layoutRasterPreview();
  });
}
function drawRasterWorkshopOverlay(state) {
  const {width,height}=rasterPreview, c=rasterPreviewContext;
  const points=[...state.points,...(state.pointer&&state.points.length?[state.pointer]:[])];
  c.save();
  c.strokeStyle='#147bdd';c.fillStyle='#147bdd';c.lineWidth=2;
  if(points.length) {
    c.beginPath();c.moveTo(points[0][0]*width,points[0][1]*height);
    if(state.action==='crop'&&points.length>1) {
      c.rect(points[0][0]*width,points[0][1]*height,(points[1][0]-points[0][0])*width,(points[1][1]-points[0][1])*height);
    } else for(const [x,y] of points.slice(1)) c.lineTo(x*width,y*height);
    c.stroke();
    for(const [x,y] of state.points) c.fillRect(x*width-3,y*height-3,6,6);
  }
  c.restore();
}
const rasterWorkshopCommands={rasterCrop:'crop',rasterPerspective:'perspective',rasterStraighten:'straighten'};
const rasterWorkshopHelp={crop:'Cliquez sur deux coins opposés de la zone à garder.',
  perspective:'Cliquez sur les quatre coins du rectangle de référence, en tournant depuis le haut gauche.',
  straighten:'Cliquez sur deux points de la ligne à redresser.'};
function setRasterWorkshopAction(action=null) {
  if(!rasterImport) return;
  const state=rasterImport;
  state.action=action;state.points=[];state.pointer=null;
  setRasterColorPicking(state,false);
  for(const [id,value] of Object.entries(rasterWorkshopCommands)) $(id).classList.toggle('active',action===value);
  $('rasterImportStatus').value=action?I18n.t(rasterWorkshopHelp[action]):'';
  if(action) $('showOriginalRaster').checked=false;
  refreshRasterImport();
}
for(const [id,action] of Object.entries(rasterWorkshopCommands)) $(id).onclick=()=>setRasterWorkshopAction(rasterImport.action===action?null:action);
$('rasterResetShape').onclick=()=>{
  rasterImport.shape={};setRasterWorkshopAction();
};
function rasterWorkshopPoint(event) {
  const box=rasterPreview.getBoundingClientRect();
  const point=[(event.clientX-box.left)/box.width,(event.clientY-box.top)/box.height];
  return point.every(value=>value>=0&&value<=1)?point:null;
}
rasterPreview.onpointermove=event=>{
  if(rasterImport?.action&&rasterImport.points.length) {
    rasterImport.pointer=rasterWorkshopPoint(event);
    refreshRasterImport();
  }
};
function completeRasterWorkshopPick(state) {
  const {action,points}=state;
  const [a,b]=points;
  const box=[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])];
  const result=RasterEditing.plan(state.width,state.height,state.shape);
  const vector=[(b[0]-a[0])*result.width,(b[1]-a[1])*result.height], pixels=Math.hypot(...vector);
  let message='';
  if(action==='perspective') {
    if(RasterEditing.validQuad(points)) {state.shape={quad:points.slice(),angle:state.shape.angle??0};}
    else message='Les quatre points doivent former un rectangle en perspective sans croisement.';
  } else if(action==='crop') {
    if((box[2]-box[0])*result.width>=2&&(box[3]-box[1])*result.height>=2) {
      const [left,top,right,bottom]=state.shape.crop??[0,0,1,1];
      const crop=[left+box[0]*(right-left),top+box[1]*(bottom-top),left+box[2]*(right-left),top+box[3]*(bottom-top)];
      state.shape={...state.shape,crop};
    } else message='La zone choisie est trop petite.';
  } else if(pixels<2) message='La zone choisie est trop petite.';
  else if(action==='straighten') {
    const angle=Math.atan2(vector[1],vector[0])*180/Math.PI;
    const offset=($('rasterStraightAxis').value==='vertical'?90:0)-angle;
    state.shape={...state.shape,angle:(state.shape.angle??0)+((offset+270)%180)-90};
  }
  setRasterWorkshopAction();
  $('rasterImportStatus').value=message?I18n.t(message):'';
}
$('rasterFile').onchange=async event=>{
  const file=event.target.files[0];
  event.target.value='';
  if(!file) return;
  const read=++rasterRead, previous=doc;
  let url;
  try {
    const mime=Formats.rasterMime(new Uint8Array(await file.slice(0,256).arrayBuffer()));
    if(!mime) throw Error('Format d’image non pris en charge.');
    const payload=file.slice(0,file.size,mime);
    const bitmap=new Image();
    url=URL.createObjectURL(payload);
    bitmap.src=url;
    try {await bitmap.decode();}
    catch {throw Error('Le navigateur ne peut pas décoder cette image.');}
    if(read!==rasterRead) return;
    if(doc!==previous||saving) {message(I18n.t('Le dessin a changé pendant la lecture. Relancez l’ouverture.'));return;}
    const width=bitmap.naturalWidth, height=bitmap.naturalHeight;
    const scale=Math.min(1,840/Math.max(width,height));
    rasterPreview.width=Math.max(1,Math.round(width*scale));
    rasterPreview.height=Math.max(1,Math.round(height*scale));
    rasterPreviewContext.drawImage(bitmap,0,0,rasterPreview.width,rasterPreview.height);
    const original=rasterPreviewContext.getImageData(0,0,rasterPreview.width,rasterPreview.height);
    rasterImport={file:payload,url,bitmap,previous,width,height,original,view:{zoom:1,center:[.5,.5]},colors:[],erase:[],shape:{},action:null,points:[],pointer:null,busy:false,frame:null,picking:false,cancelRender:null};
    url=null;
    resetRasterImportSettings();
    applyToolDefaults(Object.keys(rasterImportDefaults));
    drawRasterColorList();
    setRasterWorkshopAction();
    $('rasterImportInfo').value=file.name+' · '+width+' × '+height+' px';
    $('rasterImportStatus').value='';
    rasterImportDialog.showModal();
    layoutRasterPreview();
    refreshRasterImport();
  } catch(error) {
    if(read===rasterRead) message(I18n.t('Impossible d’importer l’image.')+' '+I18n.t(error.message));
  } finally {if(url) URL.revokeObjectURL(url);}
};
$('rasterImportForm').oninput=refreshRasterImport;
$('resetRasterImport').onclick=()=>{
  resetRasterImportSettings();
  rasterImport.colors=[];rasterImport.erase=[];rasterImport.shape={};
  setRasterWorkshopAction();
  drawRasterColorList();
  setRasterColorPicking(rasterImport,false);
  $('rasterImportStatus').value='';
  refreshRasterImport();
};
for(const [id,mode] of [['pickRasterColor','protect'],['pickRasterBackground','erase']]) $(id).onclick=()=>{
  if(!rasterImport) return;
  const next=rasterImport.picking===mode?false:mode;
  setRasterWorkshopAction();
  setRasterColorPicking(rasterImport,next);
  $('rasterImportStatus').value=next?I18n.t('Cliquez sur une couleur dans l’image.'):'';
  refreshRasterImport();
};
rasterPreview.onclick=event=>{
  const state=rasterImport, point=rasterWorkshopPoint(event);
  if(!state||!point||!state.action&&!state.picking) return;
  if(state.action) {
    state.points.push(point);state.pointer=null;
    if(state.points.length===(state.action==='perspective'?4:2)) completeRasterWorkshopPick(state);
    else refreshRasterImport();
    return;
  }
  const box=rasterPreview.getBoundingClientRect();
  const sample=document.createElement('canvas');
  sample.width=sample.height=1;
  const context=sample.getContext('2d',{willReadFrequently:true});
  const sx=Math.floor((event.clientX-box.left)*rasterImport.width/box.width);
  const sy=Math.floor((event.clientY-box.top)*rasterImport.height/box.height);
  context.drawImage(rasterImport.bitmap,sx,sy,1,1,0,0,1,1);
  const pixel=context.getImageData(0,0,1,1).data;
  if(!pixel[3]) {
    $('rasterImportStatus').value=I18n.t('Choisissez un pixel visible.');
    return;
  }
  const color='#'+[...pixel.subarray(0,3)].map(channel=>channel.toString(16).padStart(2,'0')).join('');
  const selected=state.picking==='erase'?state.erase:state.colors;
  if(!selected.includes(color)) {
    selected.push(color);
    drawRasterColorList();
  }
  $('showOriginalRaster').checked=false;
  $('rasterImportStatus').value=I18n.t('Prélevez une autre couleur ou terminez le prélèvement.');
  refreshRasterImport();
};
$('cancelRasterImport').onclick=()=>rasterImportDialog.close();
rasterImportDialog.addEventListener('cancel',event=>{
  if(!rasterImport?.action&&!rasterImport?.picking) return;
  event.preventDefault();
  setRasterWorkshopAction();
});
rasterImportDialog.addEventListener('close',()=>{
  const state=rasterImport;
  if(!state) return;
  rasterImport=null;
  state.cancelRender?.();
  if(state.frame) cancelAnimationFrame(state.frame);
  URL.revokeObjectURL(state.url);
  rasterPreview.width=rasterPreview.height=1;
});
async function renderRasterImport(state,settings) {
  const {file,width,height}=state;
  if(typeof OffscreenCanvas==='function'&&typeof Worker==='function') {
    let worker;
    try {worker=RasterEditing.createWorker();} catch {}
    if(worker) return new Promise((resolve,reject)=>{
      const finish=(error,blob)=>{
        worker.onmessage=worker.onerror=null;
        worker.terminate();state.cancelRender=null;
        if(error) reject(Error(error));else resolve(blob);
      };
      state.cancelRender=()=>finish('Calcul arrêté.');
      worker.onmessage=({data})=>finish(data.error?'Le traitement de l’image a échoué.':null,data.blob);
      worker.onerror=()=>finish('Le traitement de l’image a échoué.');
      try {worker.postMessage({file,width,height,settings});}
      catch {finish('Le traitement de l’image a échoué.');}
    });
  }
  // Keep a fallback for environments without background canvas support.
  await new Promise(resolve=>setTimeout(resolve,30));
  if(rasterImport!==state) throw Error('Calcul arrêté.');
  const canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d',{willReadFrequently:true});
  context.drawImage(state.bitmap,0,0,width,height);
  const rendered=RasterEditing.processPixels(context.getImageData(0,0,width,height).data,width,height,settings);
  canvas.width=rendered.width;canvas.height=rendered.height;
  context.putImageData(new ImageData(rendered.data,rendered.width,rendered.height),0,0);
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Le traitement de l’image a échoué.')),'image/png'));
}
$('rasterImportForm').onsubmit=async event=>{
  event.preventDefault();
  const state=rasterImport;
  if(!state||state.busy||state.action) return;
  state.busy=true;
  setRasterColorPicking(state,false);
  refreshRasterImport();
  const settings=rasterImportSettings();
  try {
    const retouched=rasterRetouched(settings);
    $('rasterImportStatus').value=retouched?I18n.t('Retouche de l’image en pleine résolution…'):I18n.t('Conversion de l’image en PNG…');
    const payload=await renderRasterImport(state,settings);
    if(rasterImport!==state) return;
    if(payload?.type!=='image/png') throw Error('La conversion PNG a échoué.');
    const source=await readRasterDataURL(payload);
    if(rasterImport!==state||!rasterImportDialog.open) return;
    if(doc!==state.previous||saving) throw Error('Le dessin a changé pendant la lecture. Relancez l’ouverture.');
    const {width,height}=RasterEditing.plan(state.width,state.height,state.shape);
    addRasterImport(source,width,height);
    rasterImportDialog.close();
  } catch(error) {
    if(rasterImport===state) $('rasterImportStatus').value=I18n.t(error.message);
  } finally {
    if(rasterImport===state) {state.busy=false;refreshRasterImport();}
  }
};
function addRasterImport(source,width,height) {
  const previous=doc;
  let index=Number.isSafeInteger(doc.nextRasterNumber)&&doc.nextRasterNumber>0?doc.nextRasterNumber:1;
  for(const layer of doc.layers) {
    const match=/^Image (\d+)$/i.exec(layer.name), used=Number(match?.[1]);
    if(Number.isSafeInteger(used)&&used>=index&&used<Number.MAX_SAFE_INTEGER-1) index=used+1;
  }
  while(!canCreateLayer('Image '+index)&&index<Number.MAX_SAFE_INTEGER) index++;
  if(index>=Number.MAX_SAFE_INTEGER) throw Error('Numérotation des images épuisée.');
  const name='Image '+index;
  const raster={...rasterDefaults,angle:Number(toolDefault('rasterAngle',0)),
    scale:(Number(toolDefault('rasterScale',100))||100)/100,
    activeOpacity:Number(toolDefault('rasterActiveOpacity',80)),inactiveOpacity:Number(toolDefault('rasterInactiveOpacity',35)),
    source,width,height,center:[camera.x,camera.y],
    pixelSize:(25.4/96)/Formats.millimeters[doc.units]};
  if(!Formats.validRasterPlacement(raster)) throw Error('Réglages de l’image hors limites.');
  const fields=captureCoordinateFields();
  activeLayer=name;selectedOrigin=null;selectedDimension=null;selectedConstraint=null;
  formalSelection=[];formalTargets=[];dimensionRefs=[];dimensionRound=null;
  const layers=[...doc.layers,{name,color:'#000000',visible:true,raster}];
  commit(d=>({...d,nextRasterNumber:index+1,layers}),false);
  restoreCoordinateFields(fields);
  if(!previous.entities.length&&previous.layers.every(layer=>!layer.raster)) fit();
  message(I18n.t('Image ajoutée au calque « {name} ».',{name}));
}
async function openProject(fileOrHandle,fromRecent=false) {
  if(!fileOrHandle||!canReplace()) return;
  const previous=doc;
  const handle=typeof fileOrHandle.getFile==='function'?fileOrHandle:null;
  try {
    const permission={mode:'read'};
    if(fromRecent&&handle.queryPermission&&await handle.queryPermission(permission)!=='granted'&&
      await handle.requestPermission(permission)!=='granted') {
      message(I18n.t('Accès au fichier récent refusé.'));return;
    }
    const file=handle?await handle.getFile():fileOrHandle;
    const raw=await file.text();
    if(doc!==previous||saving||exporting) {
      message(I18n.t('Le dessin a changé pendant la lecture. Relancez l’ouverture.'));
      return;
    }
    load(Formats.native(raw),file.name.replace(/\.[^.]+$/,''));
    saveHandle=handle;
    if(handle) void RecentProjects.remember(handle);
    canvas.focus({preventScroll:true});
    message(I18n.t('Projet ouvert.')+' '+undoHistoryStatus(undo.length));
  } catch(error) {
    if(fromRecent&&['NotFoundError','NotAllowedError','SecurityError'].includes(error.name)) {
      message(I18n.t('Fichier récent inaccessible. Ouvrez-le à nouveau depuis son dossier.'));
    } else if(error.name!=='AbortError') message(I18n.t(error.message));
  }
}
async function openProjectPicker() {
  if(saving||exporting) return;
  if(typeof window.showOpenFilePicker==='function') {
    try {
      const [handle]=await window.showOpenFilePicker({id:'velocivector-projects',multiple:false,
        types:[{description:I18n.t('Projet Velocivector'),accept:{'application/json':['.vcv','.vvec']}}]});
      await openProject(handle);
      return;
    } catch(error) {
      if(error.name==='AbortError') return;
      if(!['SecurityError','NotSupportedError'].includes(error.name)) {message(I18n.t(error.message));return;}
    }
  }
  $('file').click();
}
$('file').onchange=event=>{
  const file=event.target.files[0];event.target.value='';
  void openProject(file);
};
let recentProjectHandles=[];
function showRecentProjects() {
  const list=$('recentProjectList');
  if(!recentProjectHandles.length) {
    const empty=document.createElement('p');empty.textContent=I18n.t('Aucun fichier récent.');
    list.replaceChildren(empty);return;
  }
  list.replaceChildren(...recentProjectHandles.map(handle=>{
    const button=document.createElement('button');button.type='button';
    const label=document.createElement('span');label.textContent=handle.name;button.append(label);
    button.title=handle.name;
    button.onclick=()=>{
      const recent=$('recentProjects'), menu=recent.closest('.app-menu');
      recent.open=false;menu.open=false;menu.querySelector('summary').focus();
      void openProject(handle,true);
    };
    return button;
  }));
}
RecentProjects.subscribe(handles=>{recentProjectHandles=handles;showRecentProjects();});
$('vectorFile').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';
  if(!file) return;
  try {
    const result=/\.svg$/i.test(file.name)?Importing.readSVG(await file.text()):
      Formats.read(Formats.decodeDXF(await file.arrayBuffer()));
    if(!result.doc.entities.length) throw Error(I18n.t('Le fichier ne contient aucun tracé vectoriel pris en charge.'));
    openImportWorkshop(file.name,result,file.size);
  } catch(error) {message(I18n.t(error.message));}
};
const importCanvas=$('importDrawing'), importContext=importCanvas.getContext('2d');
let importState=null, importFrame=false, importDrag=null;
const manualImportThreshold=1_500_000;
const importFields={lineTolerance:'importLineTolerance',arcTolerance:'importArcTolerance',bezierTolerance:'importBezierTolerance',
  symmetricHandles:'importSymmetricHandles',join:'importJoin',deduplicate:'importDeduplicate',coincident:'importCoincident',
  tangent:'importTangent',axes:'importAxes',junction:'importJunction',junctionTolerance:'importJunctionTolerance',
  junctionMethod:'importJunctionMethod',overlapTolerance:'importOverlapTolerance',checkOverlaps:'checkImportOverlaps',
  removeOverlaps:'removeImportOverlaps',oneLayer:'importOneLayer',destination:'importLayer'};
function importSettings() {
  return Object.fromEntries(Object.entries(importFields).map(([key,id])=>{
    const field=$(id), type=typeof Importing.importDefaults[key];
    return [key,type==='boolean'?field.checked:type==='number'?field.valueAsNumber:field.value];
  }));
}
function resetImportSettings(group=$('importForm')) {
  const defaults={...Importing.importDefaults,checkOverlaps:!importState.manual};
  for(const [key,id] of Object.entries(importFields)) {
    const field=$(id), value=defaults[key];
    if(!group.contains(field)) continue;
    if(typeof value==='boolean') field.checked=value;
    else if(key==='destination') {
      const names=[...field.options].map(option=>option.value);
      field.value=names.includes(value)?value:names.includes(activeLayer)?activeLayer:names[0]??'';
    }
    else field.value=value;
  }
  $('importLayerRow').hidden=!$('importOneLayer').checked;
}
function importOptions(settings=importSettings()) {
  return {...settings,junction:Boolean(importState?.isDxf&&settings.junction)};
}
function showImportActionReport(state,options) {
  const target=$('importActionReport');
  const section=(title,rows)=>{
    const group=document.createElement('section'), heading=document.createElement('h3'), list=document.createElement('dl');
    heading.textContent=title;
    for(const [label,text] of rows) {
      const term=document.createElement('dt'), value=document.createElement('dd');
      term.textContent=label;value.textContent=text;list.append(term,value);
    }
    group.append(heading,list);target.append(group);
  };
  target.replaceChildren();
  const {source,skipped,unitKnown,sampledSplines}=state;
  const reading=[[I18n.t('Unités du fichier'),unitKnown?I18n.t(Formats.units[source.units]):I18n.t('À vérifier · millimètres supposés')]];
  if(state.isDxf) reading.push([I18n.t('SPLINE · conversion automatique'),sampledSplines?
    I18n.t('À vérifier · ')+sampledSplines+I18n.t(' spline(s) échantillonnée(s) avant la reconnaissance, avec une tolérance cible de 0,01 mm.'):
    I18n.t('Aucune spline échantillonnée.')]);
  for(const [type,count] of skipped) reading.push([I18n.t('Entité ')+type,I18n.t('À vérifier · ')+count+I18n.t(' entité(s) non importée(s).')]);
  section(state.isDxf?I18n.t('Lecture du DXF'):I18n.t('Lecture du SVG'),reading);
  if(!options||!state.proposal) return;
  const {report,junctions,lost,entities}=state.proposal, handles=report.handles;
  const enabled=(active,result)=>active?result:I18n.t('Option désactivée.');
  section(I18n.t('Reconnaissance'),[
    [I18n.t('Droites · ')+num(options.lineTolerance)+' mm',report.lines+I18n.t(' portion(s) remplacée(s) par une droite.')],
    [I18n.t('Arcs et cercles · ')+num(options.arcTolerance)+' mm',enabled(options.arcTolerance>0,
      report.arcs+I18n.t(' arc(s) et ')+report.circles+I18n.t(' cercle(s) reconstruit(s).'))],
    [I18n.t('Béziers · ')+num(options.bezierTolerance)+' mm',enabled(options.bezierTolerance>0,report.beziers+I18n.t(' portion(s) reconstruite(s).'))],
    [I18n.t('Privilégier les poignées symétriques'),enabled(options.symmetricHandles&&options.bezierTolerance>0,
      report.symmetrized+I18n.t(' paire(s) symétrique(s) supplémentaire(s).'))+I18n.t(' Bilan après reconnaissance · ')+handles.symmetric+
      I18n.t(' paire(s) symétrique(s), ')+handles.asymmetric+I18n.t(' asymétrique(s).')],
    [I18n.t('Regrouper les segments jointifs'),enabled(options.join,report.chains+I18n.t(' chaîne(s) formée(s) sur les calques source.'))],
    [I18n.t('Retirer les lignes et cercles en double'),enabled(options.deduplicate,report.duplicateLines+I18n.t(' ligne(s) et ')+
      report.duplicateCircles+I18n.t(' cercle(s) en double retiré(s).'))],
    [I18n.t('Validation de la géométrie'),report.invalid+I18n.t(' résultat(s) invalide(s) écarté(s).')]
  ]);
  const auto=report.automatic;
  section(I18n.t('Contraintes automatiques dans l’aperçu'),[
    [I18n.t('Coïncidence'),enabled(options.coincident,auto.coincident+I18n.t(' contrainte(s) ajoutée(s).'))],
    [I18n.t('Tangence'),enabled(options.tangent,auto.tangent+I18n.t(' contrainte(s) ajoutée(s).'))],
    [I18n.t('Horizontale et verticale'),enabled(options.axes,auto.horizontal+I18n.t(' horizontale(s) et ')+auto.vertical+I18n.t(' verticale(s) ajoutée(s).'))]
  ]);
  if(state.isDxf) {
    const method={contact:I18n.t('Prolonger ou raccourcir'),arc:I18n.t('Arc tangent'),segment:I18n.t('Segment de raccord')}[options.junctionMethod];
    const total=counts=>{
      const result={open:0,closed:0};
      for(const count of counts.values()) {result.open+=count.open;result.closed+=count.closed;}
      return result;
    };
    const rows=[[I18n.t('Rechercher les jonctions par calque'),enabled(options.junction,method+' · '+num(options.junctionTolerance)+
      ' mm · '+junctions+I18n.t(' jonction(s) réalisée(s).'))]];
    if(options.junction) {
      const before=total(report.beforeJunction), after=total(Importing.contourCounts(entities));
      rows.push([I18n.t('Tracés avant et après la jonction'),before.open+' → '+after.open+I18n.t(' ouverts · ')+before.closed+' → '+after.closed+I18n.t(' fermés.')]);
      if(lost.length) rows.push([I18n.t('Contraintes incompatibles après jonction'),lost.length+I18n.t(' contrainte(s) écartée(s).')]);
    }
    section(I18n.t('Jonction automatique des tracés'),rows);
  }
  section(I18n.t('Détection des chevauchements'),[
    [I18n.t('Tolérance par calque · ')+num(options.overlapTolerance)+' mm',
      state.overlaps?state.overlaps.source.length+I18n.t(' chevauchement(s) dans la source · ')+state.overlaps.optimized.length+I18n.t(' dans la proposition.'):
        I18n.t('Diagnostic visuel désactivé pour ce calcul.')],
    [I18n.t('Supprimer les chevauchements à l’import'),enabled(options.removeOverlaps,
      report.removedOverlaps+I18n.t(' portion(s) superposée(s) écartée(s) de la proposition.'))]
  ]);
  section(I18n.t('Calques'),[
    [I18n.t('Tout importer sur le même calque'),options.oneLayer?I18n.t('Regroupement sur « ')+options.destination+I18n.t(' » à la validation.'):
      I18n.t('Conservation des {count} calque(s) source à la validation.',{count:new Set(entities.map(e=>e.layer)).size})]
  ]);
}
function openImportWorkshop(name,{doc:source,skipped,unitKnown,sampledSplines=0},fileSize=0) {
  // Imported vectors get their own layer if the name is already used by a PNG.
  const rasterNames=new Set(doc.layers.filter(layer=>layer.raster).map(layer=>layer.name.toUpperCase()));
  if(source.layers.some(layer=>rasterNames.has(layer.name.toUpperCase()))) {
    const taken=new Set([...doc.layers,...source.layers].map(layer=>layer.name.toUpperCase()));
    const renamed=new Map();
    const layers=source.layers.map(layer=>{
      if(!rasterNames.has(layer.name.toUpperCase())) return layer;
      let index=2, name;
      do {name=layer.name+' ('+index+')';index++;} while(taken.has(name.toUpperCase()));
      taken.add(name.toUpperCase());
      renamed.set(layer.name,name);
      return {...layer,name};
    });
    source={...source,layers,entities:source.entities.map(entity=>renamed.has(entity.layer)?
      {...entity,layer:renamed.get(entity.layer)}:entity)};
  }
  const units=Formats.millimeters[source.units];
  const entities=units===1?source.entities:source.entities.map(e=>G.transform(e,p=>G.mul(p,units),0,units));
  const bounds=getBounds(entities);
  const isDxf=/\.dxf$/i.test(name);
  importState={source,skipped,unitKnown,sampledSplines,entities,bounds,isDxf,proposal:null,center:G.mid(...bounds),zoom:1,revision:0,
    previewMode:'optimized',timer:null,manual:fileSize>manualImportThreshold,options:null};
  $('importFilename').textContent=name;
  $('importView').value='source';
  $('calculateLargeImport').hidden=!importState.manual;
  $('calculateLargeImport').textContent=I18n.t('Calculer le chemin optimal');
  $('importJunctionOptions').hidden=!isDxf;
  $('importContourReadout').hidden=false;
  $('importPreviewLayer').replaceChildren(new Option(I18n.t('Tous les calques'),''),
    ...[...new Set(entities.map(e=>e.layer))].map(name=>new Option(name,name)));
  $('importLayer').replaceChildren(...doc.layers.filter(layer=>!layer.raster).map(layer=>new Option(layer.name,layer.name)));
  resetImportSettings();
  applyToolDefaults(Object.values(importFields).filter(id=>id!=='importLayer'));
  $('importLayerRow').hidden=!$('importOneLayer').checked;
  $('importActionDetails').open=true;
  $('importDialog').showModal();
  invalidateImport(0);
}
function invalidateImport(delay=120) {
  if(!importState) return;
  const state=importState;
  state.revision++;
  stopImportCalculation(state);
  state.proposal=null;
  state.overlaps=null;
  $('importOptimizedView').disabled=true;
  showImportActionReport(state);
  $('importView').value='source';
  const options=importOptions();
  const {lineTolerance,arcTolerance,bezierTolerance,junction,junctionTolerance,overlapTolerance}=options;
  $('importJunctionMethod').disabled=!junction;
  $('importJunctionTolerance').disabled=!junction;
  $('importOverlapTolerance').disabled=!options.checkOverlaps&&!options.removeOverlaps;
  const tolerances=[lineTolerance,arcTolerance,bezierTolerance,overlapTolerance,...(junction?[junctionTolerance]:[])];
  const valid=tolerances.every(n=>Number.isFinite(n)&&n>=0);
  state.options=valid?options:null;
  state.calculating=false;
  $('calculateLargeImport').disabled=!valid;
  $('calculateLargeImport').classList.toggle('needs-calculation',state.manual&&valid);
  $('applyImport').disabled=true;
  $('applyImport').textContent=I18n.t('Importer la proposition');
  $('importStats').textContent=!valid?I18n.t('Saisissez des tolérances positives ou nulles.'):
    state.manual?I18n.t('Fichier de plus de 1,5 Mo · lancez le calcul pour obtenir une proposition.'):I18n.t('Mise à jour automatique de l’aperçu…');
  requestImportDraw();
  if(!valid) return;
  if(!state.manual) queueImportCalculation(state,typeof delay==='number'?delay:120);
}
function stopImportCalculation(state) {
  if(!state) return;
  clearTimeout(state.timer);
  state.worker?.terminate();
  state.worker=null;
  state.calculating=false;
  $('importCalculation').hidden=true;
}
function showImportProgress(phase,done,total) {
  const labels={preparation:I18n.t('Préparation de la géométrie'),recognition:I18n.t('Reconnaissance des tracés'),
    removeOverlaps:I18n.t('Suppression des chevauchements'),relations:I18n.t('Contraintes automatiques'),junctions:I18n.t('Jonction des tracés'),
    sourceOverlaps:I18n.t('Chevauchements dans la source'),optimizedOverlaps:I18n.t('Chevauchements dans la proposition'),
    transfer:I18n.t('Préparation de l’aperçu')};
  const progress=$('importProgress');
  if(total>0) {
    progress.max=total;
    progress.value=done;
  } else progress.removeAttribute('value');
  $('importProgressLabel').textContent=labels[phase]+(total>0?' · '+Math.floor(100*done/total)+' %':'…');
}
function queueImportCalculation(state,delay) {
  const {revision,options}=state;
  if(!options||state.calculating) return;
  state.calculating=true;
  $('calculateLargeImport').disabled=true;
  $('calculateLargeImport').classList.remove('needs-calculation');
  $('applyImport').disabled=true;$('applyImport').textContent=I18n.t('Calcul en cours…');
  $('importStats').textContent=I18n.t('Calcul du chemin optimal…');
  $('importCalculation').hidden=false;
  showImportProgress('preparation');
  state.timer=setTimeout(()=>{
    if(importState!==state||state.revision!==revision||!state.calculating) return;
    const finish=({proposal,overlaps,before,after,error})=>{
      stopImportCalculation(state);
      state.proposal=proposal??null;
      state.overlaps=overlaps??null;
      $('importOptimizedView').disabled=!proposal;
      $('importView').value=proposal?state.previewMode:'source';
      const reduction=Math.round(100*(before-after)/Math.max(1,before));
      $('importStats').textContent=proposal?before.toLocaleString(I18n.locale)+' → '+after.toLocaleString(I18n.locale)+
        I18n.t(' éléments de tracé · ')+reduction+I18n.t(' % de réduction'):I18n.t('Calcul impossible · ')+I18n.t(error);
      showImportActionReport(state,options);
      requestImportDraw();
      $('calculateLargeImport').disabled=false;
      $('calculateLargeImport').classList.toggle('needs-calculation',state.manual&&!proposal);
      $('calculateLargeImport').textContent=proposal?I18n.t('Recalculer le chemin optimal'):I18n.t('Calculer le chemin optimal');
      $('applyImport').disabled=!proposal?.entities.length;
      $('applyImport').textContent=I18n.t('Importer la proposition');
    };
    try {
      const worker=state.worker=createImportWorker();
      const current=()=>importState===state&&state.revision===revision&&state.worker===worker;
      worker.onmessage=({data})=>{
        if(!current()) return;
        if(data.phase) showImportProgress(data.phase,data.done,data.total);
        else finish(data);
      };
      worker.onerror=event=>{
        if(current()) finish({error:event.message||I18n.t('Le moteur d’importation s’est arrêté.')});
      };
      worker.postMessage({entities:state.entities,options,checkOverlaps:options.checkOverlaps});
    } catch(error) {finish({error:I18n.t(error.message)});}
  },delay);
}
$('calculateLargeImport').onclick=()=>{
  if(importState) queueImportCalculation(importState,30);
};
$('stopImportCalculation').onclick=()=>{
  if(!importState) return;
  stopImportCalculation(importState);
  $('importStats').textContent=I18n.t('Calcul arrêté. Vous pouvez le relancer ou importer la source.');
  $('calculateLargeImport').hidden=false;
  $('calculateLargeImport').disabled=false;
  $('calculateLargeImport').classList.add('needs-calculation');
  $('applyImport').disabled=!importState.proposal?.entities.length;
  $('applyImport').textContent=I18n.t('Importer la proposition');
};
$('checkImportOverlaps').onchange=invalidateImport;
$('removeImportOverlaps').onchange=invalidateImport;
function importPreviewColor(color) {
  if(!color||color==='#cbd9eb') return palettes[theme].defaultInk;
  const luminance=hex=>{
    const rgb=hex.slice(1).match(/../g).map(c=>parseInt(c,16)/255)
      .map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
    return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
  };
  const a=luminance(color)+.05,b=luminance(palettes[theme].base)+.05;
  return Math.max(a,b)/Math.min(a,b)>=3?color:palettes[theme].defaultInk;
}
function importViewState() {
  const {clientWidth:w,clientHeight:h}=importCanvas, {bounds,zoom,center}=importState;
  const spans=G.sub(bounds[1],bounds[0]);
  const scale=Math.max(1e-10,Math.min(Math.max(1,w-36)/Math.max(spans[0],1e-8),
    Math.max(1,h-36)/Math.max(spans[1],1e-8)))*zoom;
  return {w,h,scale,toScreen:q=>[w/2+(q[0]-center[0])*scale,h/2-(q[1]-center[1])*scale]};
}
function drawImportTrace(entity,toScreen,scale) {
  const context=importContext;
  const drawPart=(part,move)=>{
    if(part.type==='bezier') {
      if(move) context.moveTo(...toScreen(part.p[0]));
      context.bezierCurveTo(...toScreen(part.p[1]),...toScreen(part.p[2]),...toScreen(part.p[3]));
      return;
    }
    const points=G.trace(part,scale);
    if(points.length<2) return;
    if(move) context.moveTo(...toScreen(points[0]));
    for(let i=1;i<points.length;i++) context.lineTo(...toScreen(points[i]));
  };
  context.beginPath();
  if(entity.type==='path') {
    for(const [i,part] of entity.segments.entries()) drawPart(part,i===0);
    if(entity.closed) context.closePath();
  } else drawPart(entity,true);
  context.stroke();
}
function requestImportDraw() {
  if(importFrame||!importState) return;
  importFrame=true;
  requestAnimationFrame(()=>{
    importFrame=false;
    if(!importState) return;
    const {w,h,scale,toScreen}=importViewState(), dpr=window.devicePixelRatio||1;
    importCanvas.width=Math.round(w*dpr);importCanvas.height=Math.round(h*dpr);
    importContext.setTransform(dpr,0,0,dpr,0,0);
    const {entities,proposal,source,zoom}=importState;
    const colors=new Map(source.layers.map(l=>[l.name,importPreviewColor(l.color)]));
    const view=$('importView').value==='optimized'&&proposal?'optimized':'source';
    const drawn=view==='optimized'?proposal.entities:entities;
    const layer=$('importPreviewLayer').value, strokes=layer?drawn.filter(e=>e.layer===layer):drawn;
    let open=0, closed=0;
    for(const count of Importing.contourCounts(strokes).values()) {open+=count.open;closed+=count.closed;}
    $('importOpenCount').value=open;$('importClosedCount').value=closed;
    const overlaps=importState.overlaps?.[view].filter(entry=>!layer||entry.layer===layer);
    $('importOverlapCount').value=overlaps?.length??'—';
    importContext.lineWidth=1.25;
    importContext.lineJoin='round';
    for(const e of strokes) {
      importContext.strokeStyle=colors.get(e.layer)??palettes[theme].defaultInk;
      drawImportTrace(e,toScreen,scale);
    }
    importContext.strokeStyle=palettes[theme].point;importContext.lineWidth=3;
    for(const {traces} of overlaps??[]) for(const trace of traces) {
      importContext.beginPath();
      importContext.moveTo(...toScreen(trace[0]));
      for(const p of trace.slice(1)) importContext.lineTo(...toScreen(p));
      importContext.stroke();
    }
    $('importZoom').textContent=Math.round(zoom*100)+' %';
  });
}
importCanvas.addEventListener('wheel',e=>{
  if(!importState) return;
  e.preventDefault();
  const rect=importCanvas.getBoundingClientRect(), {w,h,scale}=importViewState(), before=importState.zoom;
  const offset=[e.clientX-rect.left-w/2,h/2-(e.clientY-rect.top)];
  const newZoom=Math.max(.05,Math.min(100, before*Math.exp(-Math.max(-160,Math.min(160,e.deltaY))*.002)));
  importState.zoom=newZoom;
  importState.center=G.add(importState.center,G.mul(offset,(1-before/newZoom)/scale));
  requestImportDraw();
},{passive:false});
importCanvas.addEventListener('pointerdown',e=>{
  if(!importState||e.button!==0) return;
  importDrag={id:e.pointerId,x:e.clientX,y:e.clientY};
  importCanvas.setPointerCapture(e.pointerId);
});
importCanvas.addEventListener('pointermove',e=>{
  if(!importState||importDrag?.id!==e.pointerId) return;
  const {scale}=importViewState();
  importState.center=G.add(importState.center,[(importDrag.x-e.clientX)/scale,(e.clientY-importDrag.y)/scale]);
  importDrag.x=e.clientX;importDrag.y=e.clientY;
  requestImportDraw();
});
for(const event of ['pointerup','pointercancel','lostpointercapture']) importCanvas.addEventListener(event,()=>{importDrag=null;});
new ResizeObserver(requestImportDraw).observe(importCanvas);
$('fitImport').onclick=()=>{
  if(!importState) return;
  importState.center=G.mid(...importState.bounds);importState.zoom=1;
  requestImportDraw();
};
$('importView').onchange=()=>{
  if(importState) importState.previewMode=$('importView').value;
  requestImportDraw();
};
$('importPreviewLayer').onchange=requestImportDraw;
for(const id of ['importLineTolerance','importArcTolerance','importBezierTolerance','importSymmetricHandles','importJoin','importDeduplicate',
  'importCoincident','importTangent','importAxes','importJunction','importJunctionMethod','importJunctionTolerance',
  'importOverlapTolerance']) $(id).oninput=invalidateImport;
for(const button of $('importForm').querySelectorAll('[data-reset-import-group]')) button.onclick=()=>{
  resetImportSettings(button.closest('fieldset'));
  invalidateImport();
};
$('resetAllImportSettings').onclick=()=>{
  resetImportSettings();
  invalidateImport(0);
};
$('importOneLayer').onchange=()=>{
  $('importLayerRow').hidden=!$('importOneLayer').checked;
  invalidateImport();
};
$('importLayer').onchange=invalidateImport;
$('cancelImport').onclick=()=>$('importDialog').close();
$('importDialog').addEventListener('close',()=>{
  if($('importDialog').open) return;
  stopImportCalculation(importState);
  importState=null;importDrag=null;
});
$('importForm').onsubmit=e=>{
  e.preventDefault();
  applyVectorImport(true);
};
$('importSource').onclick=()=>applyVectorImport(false);
function applyVectorImport(useProposal) {
  if(!importState||useProposal&&(importState.calculating||!importState.proposal?.entities.length)) return;
  const {source,proposal}=importState;
  const oneLayer=$('importOneLayer').checked, destination=$('importLayer').value;
  if(oneLayer&&!doc.layers.some(l=>l.name===destination&&!l.raster)) {message(I18n.t('Le calque cible a changé.'));return;}
  const layers=doc.layers.slice();
  if(!oneLayer) for(const layer of source.layers) {
    if(!layers.some(l=>l.name===layer.name)) layers.push(layer);
  }
  const scale=(useProposal?1:Formats.millimeters[source.units])/Formats.millimeters[doc.units];
  const prepared=useProposal&&importState.isDxf?Importing.placeProposal(proposal,identity,scale,oneLayer?destination:null):null;
  const added=prepared?.entities??(useProposal?proposal.entities:source.entities).map(e=>{
    const shape=scale===1?e:G.transform(e,q=>G.mul(q,scale),0,scale);
    return identity({...shape,layer:oneLayer?destination:e.layer});
  });
  if(!added.length||added.some(e=>!G.serial(e)||!Edit.valid(e))) {message(I18n.t('La géométrie importée est vide ou hors limites.'));return;}
  const entities=[...doc.entities,...added];
  const constraints=prepared?[...(doc.constraints??[]),...prepared.constraints]:
    Importing.relations(doc.entities,entities,doc.constraints??[],importOptions(),name=>layerOrigins(name,{...doc,layers}));
  if(!commit(d=>({...d,layers,entities,constraints}),false,false,true)) return;
  $('importDialog').close();
  message(added.length+I18n.t(' tracé(s) ajouté(s) au dessin')+(useProposal?'.':I18n.t(' sans optimisation.')));
}
menuAction($('save'),()=>save());
menuAction($('saveAs'),()=>save(true));
$('theme').onclick=()=>{
  theme=theme==='dark'?'light':'dark';
  try {localStorage.setItem('velocivector-theme',theme);} catch {}
  applyTheme();
};
const angleContext=$('angleContext');
function dimensionReady() {
  return Boolean(dimensionRound||dimensionRefs.length===2||dimensionRefs[0]?.kind==='edge');
}
function dimensionHint() {
  if(dimensionRefs.length===1 && dimensionRefs[0].kind==='edge' && !dimensionRound)
    return I18n.t('Posez la cote du segment, ou cliquez sur un second segment ou un point.');
  if(dimensionRefs.length===2&&dimensionRefs.every(isDimensionPoint))
    return I18n.t('Posez la cote près du trait entre les points pour la distance directe, au-dessus ou en dessous pour l’horizontale, ou sur le côté pour la verticale.');
  if(dimensionRound==='diameter'&&dimensionRefs.length===1) return I18n.t('Posez le diamètre, ou sélectionnez un point ou un segment pour coter depuis le centre.');
  if(dimensionRound==='radius'&&dimensionRefs.length===1) return I18n.t('Posez le rayon, ou sélectionnez un point ou un segment pour coter depuis le centre.');
  if(dimensionReady()) return I18n.t('Déplacez le curseur pour choisir le type de cote, puis cliquez pour la poser.');
  if(dimensionRefs.length) return I18n.t('Choisissez un second point, un segment, ou le bord du cercle pour son rayon.');
  if(dimensionSelectionPoint) return I18n.t('Cliquez sur le centre du cadre pour coter ce point de construction, ou choisissez une autre référence.');
  return definitions.dimension[3];
}
function radialCenterReference(entity,edge) {
  if(!entity) return null;
  const center=Formal.theoreticalReferences(entity).find(entry=>entity.type==='path'?entry.part===edge.index:entry.part===undefined);
  return center?{id:entity.id,kind:'point',index:center.index}:null;
}
function dimensionItems() {
  return dimensionSelectionPoint?[...doc.entities,dimensionSelectionPoint]:doc.entities;
}
const isDimensionPoint=ref=>ref.kind==='point'||ref.kind==='origin';
function seedDimension(refs) {
  const entities=new Map(dimensionItems().map(e=>[e.id,e]));
  if(refs.length===1) {
    const ref=refs[0], value=Formal.resolve(entities,ref);
    if(isDimensionPoint(ref)&&value || value?.type==='line') dimensionRefs=[ref];
    else if(value?.type==='circle'||value?.type==='arc') {
      dimensionRefs=[ref];dimensionRound=value.type==='circle'?'diameter':'radius';
    }
    return dimensionRefs.length===1;
  } else if(refs.length===2) {
    const center=refs.find(r=>r.kind==='point'), edge=refs.find(r=>r.kind==='edge');
    const values=refs.map(r=>Formal.resolve(entities,r));
    const radial=edge&&radialCenterReference(entities.get(edge.id),edge);
    const curve=edge&&Formal.resolve(entities,edge);
    if(center&&radial&&Formal.sameRef(center,radial)&&['circle','arc'].includes(curve?.type)) {
      dimensionRefs=[edge];dimensionRound='radius';
      return true;
    }
    const compatible=refs.map((ref,index)=>['circle','arc'].includes(values[index]?.type)?
      radialCenterReference(entities.get(ref.id),ref):ref);
    const resolved=compatible.map(ref=>ref&&Formal.resolve(entities,ref));
    if(resolved.every(v=>Array.isArray(v)||v?.type==='line')&&
      !(resolved.every(Array.isArray)&&G.dist(...resolved)<=G.eps)) {
      dimensionRefs=compatible;
      dimensionRound=null;
      return true;
    }
  }
  return false;
}
function dimensionDraft(entities,p) {
  if(!dimensionReady()) return null;
  const c={type:'dimension',refs:dimensionRefs.slice(),mode:dimensionRound??'aligned',offset:[0,0],layer:activeLayer};
  if(dimensionRefs.length===2) {
    const [a,b]=dimensionRefs.map(r=>Formal.resolve(entities,r));
    if(a?.type==='line'&&b?.type==='line') c.mode=Formal.segmentPairMode(a,b);
    else if(a?.type==='line'||b?.type==='line') c.mode='pointDistance';
  }
  const geometry=Formal.dimensionGeometry(entities,c);
  if(!geometry) return null;
  if(dimensionRound) c.offset=G.sub(p,geometry.c);
  else if(c.mode==='angle') {
    c.rays=Formal.angleRays(geometry,p);
    const layout=Formal.angleLayout(geometry,c.rays);
    if(!layout) return null;
    c.offset=[Math.max(20/camera.scale,G.dist(layout.center,p)),0];
  } else if(geometry.axis) {
    const {point,foot,direction}=perpendicularLayout(geometry);
    c.offset=[G.dot(G.sub(p,G.mid(point,foot)),direction),0];
  }
  else {
    const [a,b]=geometry;
    if(G.dist(a,b)<=G.eps) return null;
    const chosen=$('linearDimensionMode').value;
    c.mode=chosen==='auto'?Formal.linearDimensionMode(a,b,p,camera.scale):chosen;
    const delta=G.sub(p,G.mid(a,b));
    const normal=dimensionNormal(a,b,c.mode);
    const distance=G.dot(delta,normal);
    c.offset=[Math.sign(distance||1)*Math.max(Math.abs(distance),12/camera.scale),0];
  }
  c.value=Formal.dimensionValue(entities,c);
  return c;
}
function perpendicularLayout(geometry) {
  const [a,b]=geometry.axis.p;
  const d=G.sub(b,a);
  const direction=G.mul(d,1/Math.max(G.eps,Math.hypot(...d)));
  const foot=G.add(a,G.mul(direction,G.dot(G.sub(geometry.point,a),direction)));
  return {direction,foot,point:geometry.point};
}
function dimensionNormal(a,b,mode) {
  if(mode==='width') return [0,1];
  if(mode==='height') return [1,0];
  const delta=G.sub(b,a);
  return G.mul([-delta[1],delta[0]],1/Math.max(G.eps,Math.hypot(...delta)));
}
function dimensionLayout(c,entities,project=screen,scale=camera.scale) {
  const geometry=Formal.dimensionGeometry(entities,c);
  if(!geometry) return null;
  if(c.mode==='angle') {
    const layout=Formal.angleLayout(geometry,c.rays);
    if(!layout) return null;
    const {center,start:angle,sweep}=layout;
    const steps=Math.max(8,Math.ceil(Math.abs(sweep)*12)), radius=c.offset[0];
    const arc=Array.from({length:steps+1},(_,i)=>project(G.polar(center,radius,angle+sweep*i/steps)));
    const start=arc[0],end=arc.at(-1);
    return {start,end,arc,label:project(G.polar(center,radius,angle+sweep/2)),
      guides:[[project(center),start],[project(center),end]]};
  }
  if(geometry.axis) {
    const {point,foot,direction}=perpendicularLayout(geometry);
    const shift=G.mul(direction,c.offset[0]);
    const start=project(G.add(foot,shift)),end=project(G.add(point,shift));
    return {start,end,label:G.mid(start,end),guides:[[project(foot),start],[project(point),end]]};
  }
  if(!Array.isArray(geometry)) {
    const {c:center,r}=geometry;
    const radial=Math.hypot(...c.offset);
    const u=radial>G.eps?G.mul(c.offset,1/radial):[1,0];
    const edge=G.add(center,G.mul(u,r)), opposite=G.sub(center,G.mul(u,r));
    const label=G.add(center,G.mul(u,radial>G.eps?radial:r+16/scale));
    return {start:project(c.mode==='diameter'?opposite:center),end:project(edge),label:project(label),
      guides:[[project(edge),project(label)]],radial:true};
  }
  const [a,b]=geometry, mid=G.mid(a,b);
  const offset=G.mul(dimensionNormal(a,b,c.mode),c.offset[0]);
  const start=G.add(c.mode==='width'?[a[0],mid[1]]:c.mode==='height'?[mid[0],a[1]]:a,offset);
  const end=G.add(c.mode==='width'?[b[0],mid[1]]:c.mode==='height'?[mid[0],b[1]]:b,offset);
  return {start:project(start),end:project(end),label:project(G.mid(start,end)),guides:[[project(a),project(start)],[project(b),project(end)]]};
}
function dimensionText(c,entities,units=doc.units) {
  const prefix=c.mode==='diameter'?'⌀ ':c.mode==='radius'?'R ':'';
  const value=c.driven&&entities?Formal.dimensionValue(entities,c)??c.value:c.value;
  const expression=c.driven?'':c.expression?.trim();
  const references=expression?Numeric.references(expression):[];
  const formula=expression&&!Numeric.isLiteral(expression)?'fx : ':'';
  const name=references.length&&c.dimensionName?c.dimensionName+' · ':'';
  const text=formula+name+prefix+num(value)+(c.mode==='angle'?'°':units?' '+I18n.t(Formats.units[units]):'');
  return c.driven?'('+text+')':text;
}
function dimensionVisible(c,entities,anyVisibleLayer=false) {
  const layer=c.layer??entities.get(c.refs[0].id)?.layer;
  return (anyVisibleLayer||layer===activeLayer) && doc.layers.some(l=>l.name===layer&&l.visible) &&
    c.refs.every(r=>visibleReference(entities,r));
}
function paintDimension(c,entities,ink,color,highlight=false) {
    const layout=dimensionLayout(c,entities);
    if(!layout) return;
    const {start,end,label,guides}=layout;
    for(const guide of guides) stroke(guide,color,highlight?2:1);
    stroke(layout.arc??[start,end],color,highlight?2.6:1.2);
    const arrows=layout.arc?[[start,layout.arc[1]],[end,layout.arc.at(-2)]]:
      layout.radial&&c.mode==='radius'?[[end,start]]:[[start,end],[end,start]];
    if(G.dist(start,end)>12) for(const [p,q] of arrows) {
      const angle=G.angle(p,q);
      stroke([G.polar(p,7,angle-.4),p,G.polar(p,7,angle+.4)],color,highlight?2.2:1.1);
    }
    context.font=(highlight?'bold ':'')+'12px system-ui';
    const text=dimensionText(c,entities), width=context.measureText(text).width;
    context.fillStyle=ink.base;context.fillRect(label[0]-width/2-4,label[1]-9,width+8,18);
    context.fillStyle=color;context.textBaseline='middle';
    context.fillText(text,label[0]-width/2,label[1]);
    context.textBaseline='alphabetic';
}
function drawDimensions(ink) {
  const dimensions=(doc.constraints??[]).filter(Formal.isDimension);
  if(!dimensions.length&&tool!=='dimension') return;
  const items=tool==='dimension'?dimensionItems():doc.entities;
  const entities=new Map(items.map(e=>[e.id,drag?.changes?.get(e.id)??e]));
  const paint=(c,color,highlight)=>{if(dimensionVisible(c,entities)) paintDimension(c,entities,ink,color,highlight);};
  const sources=new Set(dimensionEdit?Numeric.references($('dimensionExpression').value).map(name=>name.toUpperCase()):[]);
  const referenced=dimensions.filter(c=>c!==dimensionEdit?.c&&sources.has(c.dimensionName?.toUpperCase()));
  const sourceDimensions=new Set(referenced);
  context.save();
  for(const c of dimensions) {
    if(sourceDimensions.has(c)) continue;
    const moving=drag?.kind==='dimensionMove'&&drag.c===c&&drag.offset;
    const selected=c===selectedDimension||clipboardRelations.get(c)===true;
    context.globalAlpha=c===selectedDimension||moving?1:dimensionOpacity/100;
    if(!context.globalAlpha) continue;
    paint(moving?{...c,offset:drag.offset}:c,selected?ink.selection:ink.preview,selected);
  }
  context.globalAlpha=1;
  const sourceGreen=theme==='dark'?'#36a36b':'#145c37';
  for(const c of referenced) if(dimensionVisible(c,entities,true)) paintDimension(c,entities,ink,sourceGreen,true);
  if(tool==='dimension'&&hover) {
    context.globalAlpha=1;
    if(dimensionSelectionPoint) drawKnotSquare(screen(dimensionSelectionPoint.p[0]),ink,4,ink.point);
    if(dimensionRefs.length===2&&dimensionRefs.every(isDimensionPoint)) {
      const points=dimensionRefs.map(ref=>Formal.resolve(entities,ref));
      if(points.every(Boolean)) stroke(points.map(screen),ink.point,1,[4,4]);
    } else if(!dimensionRound) {
      const target=dimensionTarget(hover);
      const point=target&&isDimensionPoint(target)&&Formal.resolve(entities,target);
      if(point) drawKnotSquare(screen(point),ink,4,ink.point);
    }
    const draft=dimensionDraft(entities,hover);
    if(draft) paint(draft,ink.point);
    for(const ref of dimensionRefs) {
      const value=Formal.resolve(entities,ref);
      if(isDimensionPoint(ref)&&value) drawKnotSquare(screen(value),ink,5,ink.point);
      else if(value) drawEntity(value,ink.point,2);
    }
  }
  context.restore();
}
function sameMovementGeometry(before,after) {
  if(!after||before.type!==after.type) return false;
  const a=G.trace(before,1),b=G.trace(after,1);
  return a.length===b.length&&a.every((p,i)=>G.dist(p,b[i])<=G.eps);
}
function signalBlockedMovement(requested,ids) {
  const group=Formal.connected(doc.constraints??[],[...ids]);
  const candidate=new Map(requested.map(e=>[e.id,e]));
  const violated=group.filter(c=>!c.driven&&!Formal.satisfied(candidate,c));
  animateBlockedMovement(violated);
}
function animateBlockedMovement(relations) {
  if(!relations.length||modification) return;
  const now=performance.now();
  const matched=blockedMovement?.relations;
  if(matched?.size===relations.length&&relations.every(c=>matched.has(c))&&now-blockedMovement.started<1250) return;
  blockedMovement={relations:new Set(relations),started:now};
  requestDraw();
}
function drawBlockedMovement(ink) {
  if(!blockedMovement) return;
  const elapsed=performance.now()-blockedMovement.started;
  if(elapsed>=1250) {blockedMovement=null;return;}
  requestDraw();
  if(modification) return;
  const alpha=removalAlpha(elapsed);
  if(!alpha) return;
  const relations=blockedMovement.relations;
  const entities=new Map(doc.entities.map(e=>[e.id,drag?.changes?.get(e.id)??e]));
  const green=theme==='dark'?'#58ed99':'#08783b';
  context.save();
  context.globalAlpha=alpha;
  for(const {constraint,x,y} of constraintTags(entities,relations)) {
    if(relations.has(constraint)) drawConstraintBadge(constraint.type,x,y,ink,constraint===selectedConstraint,green);
  }
  for(const c of relations) if(Formal.isDimension(c)&&dimensionVisible(c,entities)) {
    paintDimension(c,entities,ink,green,true);
  }
  context.restore();
}
function animateRemoval(relations,entities,highlightGeometry=false,geometryOnly=false) {
  if(!relations.length) return;
  removalBatches.push({relations,entities:new Map(entities.map(e=>[e.id,e])),highlightGeometry,geometryOnly,started:performance.now()});
  requestDraw();
}
function removalAlpha(elapsed) {
  if(elapsed<500) return elapsed%250<125?1:0;
  if(elapsed<625) return 1;
  return Math.max(0,1-(elapsed-625)/625);
}
function drawRemovedRelations(ink) {
  if(!removalBatches.length) return;
  const now=performance.now();
  removalBatches=removalBatches.filter(batch=>now-batch.started<1250);
  const red=theme==='dark'?'#ff5d67':'#bb242d';
  for(const batch of removalBatches) {
    const alpha=removalAlpha(now-batch.started);
    if(!alpha) continue;
    context.save();context.globalAlpha=alpha;
    if(batch.highlightGeometry) {
      const refs=new Map(batch.relations.flatMap(c=>c.refs).map(ref=>[Formal.key(ref),ref]));
      for(const ref of refs.values()) {
        if(!visibleReference(batch.entities,ref)) continue;
        const value=Formal.resolve(batch.entities,ref);
        if(!value) continue;
        if(Array.isArray(value)) drawKnotSquare(screen(value),ink,5,red);
        else drawEntity(value,red,3);
      }
    }
    const anchors=new Map();
    for(const c of batch.geometryOnly?[]:batch.relations) {
      if(Formal.isDimension(c)) {
        paintDimension(c,batch.entities,ink,red,true);
      } else {
        const ref=batch.highlightGeometry?c.refs.find(r=>visibleReference(batch.entities,r)):c.refs[0];
        const entity=ref&&Formal.resolve(batch.entities,ref);
        if(!entity) continue;
        const trace=batch.highlightGeometry&&ref.kind==='edge'?G.trace(entity,camera.scale):null;
        const point=Array.isArray(entity)?entity:trace?.[Math.floor(trace.length/2)]??entity.c??G.mid(entity.p[0],entity.p.at(-1));
        const [x,y]=screen(point), key=point.join(',');
        const row=anchors.get(key)??0;
        anchors.set(key,row+1);
        drawConstraintBadge(c.type,x+8,y-24+row*(constraintBadgeSize+3),ink,false,red);
      }
    }
    context.restore();
  }
  if(removalBatches.length) requestDraw();
}
function dimensionAt(p) {
  if(!dimensionOpacity||!dimensionEdit&&tool!=='select'&&tool!=='dimension') return null;
  const candidates=(doc.constraints??[]).filter(Formal.isDimension);
  if(!candidates.length) return null;
  const entities=new Map(doc.entities.map(e=>[e.id,e]));
  return candidates.findLast(c=>{
    if(!dimensionVisible(c,entities)) return false;
    const layout=dimensionLayout(c,entities);
    context.font=(c===selectedDimension?'bold ':'')+'12px system-ui';
    return layout&&Math.abs(layout.label[1]-p[1])<=10&&
      Math.abs(layout.label[0]-p[0])<=context.measureText(dimensionText(c,entities)).width/2+5;
  });
}
function dimensionTarget(p) {
  const origin=layerOrigins(activeLayer).map(o=>({...o,kind:'origin',distance:G.dist(p,o.target)*camera.scale}))
    .filter(o=>o.distance<=6&&!dimensionRefs.some(ref=>Formal.sameRef(ref,o))).sort((a,b)=>a.distance-b.distance)[0];
  if(origin) return {kind:'origin',name:origin.name,target:origin.target};
  if(dimensionSelectionPoint&&!dimensionRefs.some(ref=>ref.id===dimensionSelectionPoint.id)&&
    G.dist(p,dimensionSelectionPoint.p[0])*camera.scale<=8)
    return {id:dimensionSelectionPoint.id,kind:'point',index:0};
  return constraintTarget(p,undefined,undefined,undefined,dimensionRefs,(ref,value)=>
    ref.kind==='point'||['line','arc','circle'].includes(value?.type),true);
}
function dimensionClick(p) {
  if(dimensionRefs.length===1) {
    const first=dimensionRefs[0];
    const ref=dimensionTarget(p);
    if(ref) {
      const entities=new Map(dimensionItems().map(e=>[e.id,e]));
      const a=Formal.resolve(entities,first), b=Formal.resolve(entities,ref);
      const isEndpoint=a?.type==='line'&&Array.isArray(b)&&a.p.some(q=>G.dist(q,b)<=G.eps);
      if(!isEndpoint&&seedDimension([first,ref])) {update();return;}
      if(Array.isArray(a)&&Array.isArray(b)&&G.dist(a,b)<=G.eps) {
        message(I18n.t('Choisissez deux points distincts pour poser la cote.'));return;
      }
    }
  }
  if(dimensionReady()) {
    const c=dimensionDraft(new Map(dimensionItems().map(e=>[e.id,e])),p);
    if(!c) return;
    if(!doc.layers.some(l=>l.name===activeLayer&&l.visible&&!l.raster)) {message(I18n.t('Choisissez un calque vectoriel visible pour poser une cote.'));return;}
    if(c.refs.some(ref=>ref.kind==='origin'&&!layerOrigins(activeLayer).some(o=>o.name===ref.name&&G.dist(o.target,ref.target)<=G.eps))) {
      dimensionRefs=[];dimensionRound=null;update();
      message(I18n.t('Choisissez une origine du calque actif.'));return;
    }
    const extra=dimensionSelectionPoint&&c.refs.some(ref=>ref.id===dimensionSelectionPoint.id)?dimensionSelectionPoint:null;
    const items=extra?dimensionItems():doc.entities;
    if(!Formal.dimensionCanDrive(items,doc.constraints??[],c)) addDrivenDimension(c,items);
    else if(!editDimension(c,true,items)) return;
    if(extra) dimensionSelectionPoint=null;
    dimensionRefs=[];dimensionRound=null;update();return;
  }
  const ref=dimensionTarget(p);
  if(!ref||!isDimensionPoint(ref)&&dimensionAt(screen(p))) return;
  if(!dimensionRefs.length) seedDimension([ref]);
  update();
}
function addDrivenDimension(c,items) {
  commit(d=>({...d,entities:items,constraints:[...(d.constraints??[]),{...c,driven:true}]}),false);
  message(I18n.t('Cote pilotée · sa valeur suit la géométrie et les contraintes existantes.'));
  return true;
}
function recoverSlotDimension(c) {
  const entities=new Map(doc.entities.map(e=>[e.id,e]));
  const value=Formal.dimensionValue(entities,c);
  if(value===null) return;
  const replacement={...c,value,driven:false};
  if(!Formal.dimensionCanDrive(doc.entities,doc.constraints,replacement)) {
    message(I18n.t('Cette cote reste pilotée · sa valeur est déjà déterminée par les autres contraintes.'));
    return;
  }
  if(selectedDimension===c) selectedDimension=replacement;
  commit(d=>({...d,constraints:d.constraints.map(other=>other===c?replacement:other)}));
  message(I18n.t('Cote de l’oblong rendue pilotante. Double-cliquez pour modifier sa valeur.'));
}
let dimensionEdit=null;
function closeDimensionEditor() {
  dimensionEdit=null;
  $('dimensionEditor').hidden=true;
  requestDraw();
}
function editDimension(c,creating=false,items=doc.entities) {
  if(c.driven) {message(I18n.t('Cette cote est pilotée. Sa valeur suit la géométrie.'));return false;}
  dimensionEdit={c,creating,items,source:doc};
  if(!creating) selectedDimension=c;
  const field=$('dimensionExpression');
  $('dimensionEditorTitle').textContent=(c.dimensionName?c.dimensionName+' · ':'')+I18n.t(Formal.dimensionNames[c.mode]);
  $('dimensionEditorStatus').textContent='';
  $('dimensionEditor').hidden=false;
  field.value=c.expression??String(c.value);
  field.focus();field.select();requestDraw();
  return true;
}
$('dimensionEditor').onsubmit=event=>{
  event.preventDefault();
  if(!dimensionEdit) return;
  const {c,creating,items,source}=dimensionEdit, field=$('dimensionExpression');
  const expression=field.value.trim();
  try {
    if(doc!==source||!expression) throw Error('Saisissez une valeur de cote valide.');
    const replacement={...c,expression}, existing=doc.constraints??[];
    const constraints=creating?[...existing,replacement]:existing.map(old=>old===c?replacement:old);
    const next=DimensionTable.assign({...doc,entities:items,constraints});
    const changed=next.constraints[creating?next.constraints.length-1:existing.indexOf(c)];
    const model=DimensionTable.reconcile(next,[changed.dimensionId]);
    if(!commit(()=>model,false,false,true)) return;
    selectedDimension=doc.constraints.find(d=>d.dimensionId===changed.dimensionId);
    closeDimensionEditor();
    message(I18n.t('Cote mise à jour · ')+dimensionText(selectedDimension));
    update();
  } catch(error) {$('dimensionEditorStatus').textContent=I18n.t(error.message);}
};
$('cancelDimensionEditor').onclick=closeDimensionEditor;
$('dimensionExpression').addEventListener('input',requestDraw);
function renderDimensionTable() {
  const rows=DimensionTable.rows(doc);
  $('dimensionTableRows').replaceChildren(...rows.map(row=>{
    const tr=document.createElement('tr');tr.dataset.id=row.id;
    const name=document.createElement('input');name.value=row.name;name.maxLength=64;
    name.setAttribute('aria-label',I18n.t('Identifiant')+' '+row.name);
    const value=document.createElement('input');value.value=String(row.value);
    value.readOnly=row.constraint.driven===true;value.setAttribute('aria-label',I18n.t('Valeur')+' '+row.name);
    const formula=document.createElement('input');formula.value=row.expression;formula.maxLength=512;
    formula.readOnly=value.readOnly;formula.setAttribute('aria-label',I18n.t('Calcul')+' '+row.name);
    value.oninput=()=>{if(!value.readOnly) formula.value='';};
    for(const entry of [name,value,formula,row.constraint.layer??'']) {
      const td=document.createElement('td');td.append(entry);tr.append(td);
    }
    return tr;
  }));
  $('dimensionTableStatus').textContent='';
}
function readDimensionRow(row) {
  const [name,value,formula]=row.querySelectorAll('input');
  const old=doc.constraints.find(c=>c.dimensionId===row.dataset.id);
  const input=formula.value.trim(), literal=value.value.trim();
  const expression=value.readOnly||!input&&!old?.expression&&literal===String(old?.value)?undefined:input||literal;
  return {id:row.dataset.id,name:name.value,expression};
}
function applyDimensionRows(edits,refresh=true) {
  if(!edits.length) return false;
  try {
    const model=DimensionTable.edit(doc,edits);
    if(!commit(()=>model,false,false,true)) return false;
    if(refresh) renderDimensionTable();
    else {
      const byId=new Map(DimensionTable.rows(doc).map(row=>[row.id,row]));
      for(const tr of $('dimensionTableRows').rows) {
        const row=byId.get(tr.dataset.id), [name,value,formula]=tr.querySelectorAll('input');
        name.value=row.name;value.value=String(row.value);formula.value=row.expression;
      }
      $('dimensionTableStatus').textContent='';
    }
    return true;
  } catch(error) {$('dimensionTableStatus').textContent=I18n.t(error.message);return false;}
}
menuAction($('openDimensionTable'),()=>{
  closeDimensionEditor();renderDimensionTable();$('dimensionTableDialog').showModal();
});
$('closeDimensionTable').onclick=()=>$('dimensionTableDialog').close();
$('dimensionTableForm').onsubmit=event=>{
  event.preventDefault();
  applyDimensionRows([...$('dimensionTableRows').rows].map(readDimensionRow));
};
$('dimensionTableRows').onchange=event=>{
  const row=event.target.closest('tr');
  if(row) applyDimensionRows([readDimensionRow(row)],false);
};
$('downloadDimensionCsv').onclick=()=>download('\uFEFF'+DimensionTable.csv(doc),filename+'-cotes.csv','text/csv;charset=utf-8');
$('readDimensionCsv').onclick=()=>$('dimensionCsvFile').click();
$('dimensionCsvFile').onchange=async event=>{
  const file=event.target.files[0];event.target.value='';
  if(!file) return;
  const source=doc;
  try {
    const imported=DimensionTable.readCsv(await file.text());
    if(doc!==source) throw Error('Tableau de cotes CSV invalide.');
    const existing=new Map(DimensionTable.rows(doc).map(row=>[row.id,row]));
    if(imported.some(row=>!existing.has(row.id))) throw Error('Tableau de cotes CSV invalide.');
    applyDimensionRows(imported.map(row=>{
      const previous=existing.get(row.id);
      const valueChanged=Numeric.evaluate(row.value,()=>NaN)!==previous.value;
      const expression=row.expression!==previous.expression?row.expression||row.value:valueChanged?row.value:row.expression||row.value;
      return {...row,expression:previous.constraint.driven?undefined:expression};
    }));
  } catch(error) {$('dimensionTableStatus').textContent=I18n.t(error.message);}
};
function annotationOffset(action,position) {
  return dimensionOffsetAt(action.c,action.geometry,G.add(action.label,G.sub(world(position),action.origin)));
}
function dimensionOffsetAt(c,geometry,p) {
  if(c.mode==='angle') {
    const layout=Formal.angleLayout(geometry,c.rays);
    return layout?[Math.max(12/camera.scale,G.dist(p,layout.center)),0]:c.offset;
  }
  if(geometry.axis) {
    const {point,foot,direction}=perpendicularLayout(geometry);
    return [G.dot(G.sub(p,G.mid(point,foot)),direction),0];
  }
  if(!Array.isArray(geometry)) return G.sub(p,geometry.c);
  const [a,b]=geometry;
  return [G.dot(G.sub(p,G.mid(a,b)),dimensionNormal(a,b,c.mode)),0];
}
function constraintPrompt(type,index) {
  if(type==='radial') {
    if(!index) return I18n.t('Choisissez un segment, un arc, un cercle ou son centre');
    const first=formalTargets[0];
    const entity=first&&doc.entities.find(e=>e.id===first.id);
    return entity&&Formal.part(entity,first.index)?.type==='line'
      ?I18n.t('Choisissez un arc, un cercle ou son centre'):I18n.t('Choisissez un segment droit');
  }
  if(type==='midpoint') return index?I18n.t('Choisissez le second segment ou le point'):I18n.t('Choisissez un segment ou un point');
  if(type==='coincident') return index?I18n.t('Choisissez le point ou le tracé à raccorder'):I18n.t('Choisissez un point, une origine ou un tracé');
  if(type==='symmetry') return index?I18n.t('Choisissez les deux points à rendre symétriques'):I18n.t('Choisissez l’axe de symétrie');
  if(type==='locked') return I18n.t('Choisissez un point ou un élément');
  if(type==='tangent'||type==='equal') return index?I18n.t('Choisissez le second élément'):I18n.t('Choisissez le premier élément');
  if(type==='parallel'||type==='collinear'||type==='perpendicular') return index?I18n.t('Choisissez le second segment'):I18n.t('Choisissez le premier segment');
  return I18n.t('Choisissez un segment droit');
}
function constraintTarget(p,type,index,first,excluded=[],accept=null,includeMidpoints=false) {
  const entities=new Map(doc.entities.map(e=>[e.id,e]));
  const ok=ref=>!excluded.some(r=>Formal.sameRef(r,ref))&&
    (!type||Formal.accepts(type,index,Formal.resolve(entities,ref),first))&&
    (!accept||accept(ref,Formal.resolve(entities,ref)));
  let best=null, distance=8/camera.scale;
  const visibleItems=doc.entities.slice().reverse().filter(visible);
  for(const entity of visibleItems) {
    for(const [index,vertex] of Formal.referencePoints(entity).entries()) {
      if(!referencePointVisible(entity,index,vertex)) continue;
      const point={id:entity.id,kind:'point',index}, gap=G.dist(vertex,p);
      const ref=type==='radial'?Formal.radialReference(entities,point):point;
      if(!ref) continue;
      const selectedTie=best&&Math.abs(gap-distance)<=G.eps&&selection.has(entity.id)&&!selection.has(best.id);
      if((gap<distance||selectedTie)&&ok(ref)) {best=ref;distance=gap;}
    }
    if(includeMidpoints) for(const [index,part] of Formal.referenceEdges(entity).entries()) {
      if(!Formal.hasMidpoint(part)||!constructionShown(entity.layer)&&G.constructionAt(entity,index)) continue;
      const ref=Formal.midpointRef({id:entity.id,index}), gap=G.dist(G.traceAt(part,.5),p);
      if(gap<Math.min(distance,5/camera.scale)&&ok(ref)) {best=ref;distance=gap;}
    }
  }
  if(type!=='midpoint') for(const ref of midpointMarkers(entities)) {
    if(entities.get(ref.id).layer!==activeLayer) continue;
    const gap=G.dist(Formal.resolve(entities,ref),p);
    if(gap<distance&&ok(ref)) {best=ref;distance=gap;}
  }
  if(type==='coincident'&&(index===0||Array.isArray(first))&&!excluded.some(ref=>ref.kind==='origin')) for(const {name,target} of layerOrigins(activeLayer)) {
    const gap=G.dist(target,p);
    if(gap<distance) {
      best={kind:'origin',name,target};distance=gap;
    }
  }
  if(best) return best;
  let edgeDistance=7/camera.scale;
  for(const entity of hit(p)) for(const [index,part] of Formal.referenceEdges(entity).entries()) {
    const ref={id:entity.id,kind:'edge',index};
    if(!visibleReference(entities,ref)||!ok(ref)) continue;
    const q=G.nearestOnTrace(part,p);
    if(!q) continue;
    const distance=G.dist(q,p);
    if(distance<edgeDistance) {best=ref;edgeDistance=distance;}
  }
  return best;
}
function applyFormal(type,refs) {
  const constraint=Formal.make(type,refs,doc.entities);
  if(!constraint) return rejectFormal([{type,refs}]);
  if(constraint.origin&&!layerOrigins(doc.entities.find(e=>e.id===constraint.refs[0].id)?.layer)
    .some(o=>o.name===constraint.origin)) {
    return rejectFormal([constraint],I18n.t('Ce POT appartient à un autre calque.'));
  }
  const last=refs.at(-1).id;
  const anchored=new Set(type==='radial'?[constraint.refs[1].id]:Formal.isPointOnTrace(constraint)?
    constraint.refs.filter(r=>r.kind==='edge'&&r.id!==constraint.refs.find(ref=>ref.kind==='point')?.id).map(r=>r.id):
    refs.slice(0,-1).map(r=>r.id).filter(id=>id!==last));
  return applyFormalBatch(type,[constraint],anchored);
}
function rejectFormal(relations,status=I18n.t('Contrainte incompatible avec la géométrie ou les contraintes existantes.')) {
  animateRemoval(relations,doc.entities,true);
  message(status);
  return false;
}
function applyFormalBatch(type,requested,anchored) {
  const existing=doc.constraints??[];
  const signatures=new Set(existing.map(Formal.signature));
  const additions=requested.filter(c=>!signatures.has(Formal.signature(c)));
  if(!additions.length) {
    message(I18n.t('Contrainte déjà présente.'));return true;
  }
  const constraints=[...existing,...additions];
  const group=Formal.connected(constraints,additions.flatMap(c=>c.refs.map(r=>r.id)));
  const solved=Formal.solve(doc.entities,group,anchored)??Formal.solve(doc.entities,group);
  if(!solved) return rejectFormal(additions);
  if(!commit(d=>({...d,entities:solved,constraints}),false)) return false;
  message(I18n.t(Formal.names[type])+(additions.length===1?I18n.t(' · contrainte appliquée.'):' · '+additions.length+I18n.t(' contraintes appliquées.')));
  return true;
}
function collectConstraint(p) {
  const index=formalTargets.length;
  const entities=new Map(doc.entities.map(e=>[e.id,e]));
  const first=index?Formal.resolve(entities,formalTargets[0]):null;
  const ref=constraintTarget(p,constraintMode,index,first,formalTargets);
  if(!ref) {
    message(constraintPrompt(constraintMode,index));return;
  }
  formalTargets.push(ref);
  if(formalTargets.length===Formal.count[constraintMode]) {
    if(applyFormal(constraintMode,formalTargets)) formalTargets=[];
    else formalTargets.pop();
  }
  update();
}
function canCreateLayer(name) {
  return Boolean(name)&&!doc.layers.some(l=>l.name.toUpperCase()===name.toUpperCase());
}
function sendSelectionToLayer(destination,copy,create=false) {
  const source=selected();
  const valid=create?canCreateLayer(destination):doc.layers.some(l=>l.name===destination&&!l.raster);
  if(!source.length||!valid) return false;
  const layers=create?[...doc.layers,{name:destination,color:nextLayerColor(),visible:true}]:doc.layers;
  const picked=new Map(source.map(e=>[e.id,e]));
  const before=doc.entities, moved=[], remap=new Map(), groups=new Map();
  const entities=before.flatMap(entity=>{
    if(!picked.has(entity.id)||!copy&&entity.layer===destination) return [entity];
    const indices=segmentSelection.get(entity.id);
    const keep=indices?new Set(G.strokeParts(entity).flatMap((_,i)=>indices.has(i)?[]:[i])):null;
    const target=keep?Edit.removeSegments(entity,keep):[entity];
    const remainder=copy?[entity]:indices?Edit.removeSegments(entity,indices):[];
    const survivors=copy?remainder:remainder.map((e,i)=>i?identity({...e,layer:entity.layer}):{...e,id:entity.id,layer:entity.layer});
    const transfers=target.map((e,i)=>!copy&&!survivors.length&&i===0?
      {...e,id:entity.id,layer:destination}:identity({...e,layer:destination,...(copy?copiedVectorGroup(entity,groups):{})}));
    moved.push(...transfers);
    if(copy||indices) remap.set(entity.id,(copy?transfers:[...survivors,...transfers]).map(e=>e.id));
    return [...survivors,...transfers];
  });
  if(!moved.length) {message(I18n.t('La sélection est déjà sur ce calque.'));return false;}
  const map=new Map(entities.map(e=>[e.id,e])), transferred=new Set(moved.map(e=>e.id));
  const constraints=[], lost=[];
  for(const c of doc.constraints??[]) {
    const affected=c.refs.some(r=>remap.has(r.id)||!copy&&transferred.has(r.id));
    if(copy||!affected) constraints.push(c);
    if(!affected) continue;
    const mapped=copy&&!c.refs.every(r=>r.kind==='origin'||picked.has(r.id))?null:Formal.remap(before,entities,[c],remap);
    const result=mapped?.[0];
    const keepsOrigin=!result?.origin||layerOrigins(map.get(result.refs[0].id)?.layer).some(o=>o.name===result.origin);
    const moveLabel=Formal.isDimension(result??{})&&(copy||result.refs.every(r=>r.kind==='origin'||map.get(r.id)?.layer===destination)&&
      result.refs.some(r=>transferred.has(r.id)));
    const keepsDimensionOrigins=result?.refs.every(r=>r.kind!=='origin'||layerOrigins(moveLabel?destination:result.layer)
      .some(o=>o.name===r.name&&G.dist(o.target,r.target)<=G.eps));
    if(result&&keepsOrigin&&keepsDimensionOrigins&&Formal.satisfied(map,result)) {
      constraints.push(moveLabel?{...result,layer:destination}:result);
    } else if(!mapped||mapped.length) lost.push(c);
  }
  if(!commit(d=>({...d,layers,entities,constraints}),false,false,true)) return false;
  pick(moved.map(e=>e.id),{});
  if(!copy) animateRemoval(lost,before);
  warnLost(lost.length,(copy?I18n.t('Sélection copiée vers '):I18n.t('Sélection déplacée vers '))+destination+'.');
  return true;
}
let transferLayerCopy=false;
function openTransferLayer(copy) {
  transferLayerCopy=copy;
  angleContext.hidden=true;
  $('transferLayerTitle').textContent=copy?I18n.t('Copier vers un nouveau calque'):I18n.t('Déplacer vers un nouveau calque');
  const input=$('transferLayerName');
  input.value='';
  input.setCustomValidity('');
  $('transferLayerDialog').showModal();
}
$('transferLayerName').oninput=()=>$('transferLayerName').setCustomValidity('');
$('cancelTransferLayer').onclick=()=>$('transferLayerDialog').close();
$('transferLayerForm').onsubmit=e=>{
  e.preventDefault();
  const input=$('transferLayerName'), name=input.value.trim();
  if(!canCreateLayer(name)) {
    input.setCustomValidity(I18n.t('Saisissez un nom de calque différent des noms existants.'));
    input.reportValidity();
    input.focus();
    return;
  }
  if(sendSelectionToLayer(name,transferLayerCopy,true)) $('transferLayerDialog').close();
};
function addLayerDestinations(copy,menuY) {
  const group=document.createElement('details'), label=document.createElement('summary');
  group.className='context-layer-group';
  label.textContent=copy?I18n.t('Copier vers'):I18n.t('Déplacer vers');
  group.append(label);
  group.addEventListener('toggle',()=>{
    if(!angleContext.hidden) angleContext.style.top=Math.max(0,Math.min(menuY,window.innerHeight-angleContext.offsetHeight))+'px';
  });
  for(const layer of doc.layers.filter(layer=>!layer.raster)) {
    const option=document.createElement('button');
    option.type='button';option.textContent=layer.name;
    option.onclick=()=>{angleContext.hidden=true;sendSelectionToLayer(layer.name,copy);};
    group.append(option);
  }
  const create=document.createElement('button');
  create.type='button';create.textContent=I18n.t('Nouveau calque…');
  create.onclick=()=>openTransferLayer(copy);
  group.append(create);
  angleContext.append(group);
}
canvas.addEventListener('contextmenu',e=>{
  if(rasterMode) {e.preventDefault();return;}
  const position=mouse(e), dimension=dimensionAt(position);
  const ref=dimension?null:constraintTarget(world(position));
  const hasLayerActions=!dimension&&tool==='select'&&!constraintMode&&Boolean(
    hit(world(position)).some(e=>selection.has(e.id))||ref&&selection.has(ref.id));
  if(!ref&&!dimension&&!hasLayerActions) return;
  let relevant=dimension?[dimension]:ref?(doc.constraints??[]).filter(c=>c.refs.some(r=>Formal.sameRef(r,ref))):[];
  if(!relevant.length&&ref) relevant=(doc.constraints??[]).filter(c=>c.refs.some(r=>r.id===ref.id));
  const entities=new Map(doc.entities.map(e=>[e.id,e]));
  relevant=relevant.filter(c=>!Formal.isDimension(c)||dimensionOpacity>0&&dimensionVisible(c,entities));
  if(!relevant.length&&!hasLayerActions) return;
  e.preventDefault();
  angleContext.replaceChildren();
  if(hasLayerActions) {
    for(const [label,group] of [['Grouper',true],['Dégrouper',false]]) {
      const button=document.createElement('button');button.type='button';button.textContent=I18n.t(label);
      button.onclick=()=>{angleContext.hidden=true;groupVectors(group);};
      angleContext.append(button);
    }
    addLayerDestinations(false,e.clientY);
    addLayerDestinations(true,e.clientY);
  }
  if(relevant.length) {
    const title=document.createElement('strong');title.textContent=I18n.t('Contraintes');
    angleContext.append(title);
  }
  if(dimension&&!dimension.driven) {
    const edit=document.createElement('button');edit.textContent=I18n.t('Modifier la valeur');
    edit.onclick=()=>{angleContext.hidden=true;editDimension(dimension);};
    angleContext.append(edit);
  }
  if(dimension?.driven&&dimension.refs.some(r=>Formal.protectedSlot(entities.get(r.id),doc.constraints))) {
    const drive=document.createElement('button');drive.textContent=I18n.t('Rendre pilotante');
    drive.onclick=()=>{angleContext.hidden=true;recoverSlotDimension(dimension);};
    angleContext.append(drive);
  }
  for(const constraint of relevant) {
    const button=document.createElement('button');
    const label='Retirer · '+relationLabel(constraint);
    if(Formal.isDimension(constraint)) button.textContent=label;
    else setConstraintButton(button,constraint.type,label);
    button.onclick=()=>{
      commit(d=>({...d,constraints:d.constraints.filter(c=>c!==constraint)}));
      angleContext.hidden=true;
    };
    angleContext.append(button);
  }
  angleContext.hidden=false;
  angleContext.style.left=Math.max(0,Math.min(e.clientX,window.innerWidth-angleContext.offsetWidth))+'px';
  angleContext.style.top=Math.max(0,Math.min(e.clientY,window.innerHeight-angleContext.offsetHeight))+'px';
  angleContext.querySelector('summary, button')?.focus();
});
function useConstraint(type) {
  if(rasterMode) setRasterMode();
  modification=null;
  if(constraintMode===type) {
    constraintMode=null;formalTargets=[];update();return;
  }
  const entities=new Map(doc.entities.map(e=>[e.id,e]));
  let refs=type==='equal'?[...selection].flatMap(id=>{
    const entity=entities.get(id);
    if(!visible(entity)) return [];
    const indices=segmentSelection.get(id)??Formal.referenceEdges(entity).keys();
    return [...indices].map(index=>({id,kind:'edge',index})).filter(ref=>
      visibleReference(entities,ref)&&Formal.accepts(type,0,Formal.resolve(entities,ref)));
  }):formalSelection.slice();
  if(type==='radial') {
    refs=refs.map(ref=>Formal.radialReference(entities,ref)).filter(ref=>ref&&
      Formal.accepts(type,0,Formal.resolve(entities,ref)));
    if(refs.length<2&&selection.size===2) {
      const edges=[...selection].map(id=>{
        const entity=entities.get(id), indices=segmentSelection.get(id)??Formal.referenceEdges(entity).keys();
        return [...indices].map(index=>({id,kind:'edge',index})).filter(ref=>
          visibleReference(entities,ref)&&Formal.accepts(type,0,Formal.resolve(entities,ref)));
      });
      const pair=edges.map(list=>refs.find(ref=>list.some(edge=>Formal.sameRef(edge,ref)))??(list.length===1?list[0]:null));
      if(pair.every(Boolean)&&Formal.make(type,pair,doc.entities)) refs=pair;
    }
  }
  if(type==='symmetry') refs.sort((a,b)=>(a.kind==='edge'?0:1)-(b.kind==='edge'?0:1));
  if(polylineTool()) finishPolyline();
  if(tool!=='select'&&!choose('select')) return;
  const equalities=type==='equal'?Formal.equalSelection(entities,refs):[];
  const followers=new Set(equalities.map(c=>c.refs[1].id));
  const applied=type==='equal'?equalities.length&&applyFormalBatch(type,equalities,
    new Set(equalities.map(c=>c.refs[0].id).filter(id=>!followers.has(id)))):
    refs.length===Formal.count[type]&&applyFormal(type,refs);
  if(applied) {
    constraintMode=null;formalTargets=[];update();return;
  }
  selectedConstraint=null;
  constraintMode=type;
  formalTargets=[];
  if(refs.length<Formal.count[type]) {
    for(const ref of refs) {
      const first=formalTargets.length?Formal.resolve(entities,formalTargets[0]):null;
      if(Formal.accepts(type,formalTargets.length,Formal.resolve(entities,ref),first)) formalTargets.push(ref);
    }
  }
  update();
}
function labelToolMenuCommand(command,label) {
  command.type='button';
  command.classList.add('tool-visibility-command');
  const text=document.createTextNode(label);
  command.append(text);
  I18n.text(text,label);
}
const hiddenConstraints=new Set();
const constraintVisibility=[];
try {
  for(const value of JSON.parse(localStorage.getItem('velocivector-hidden-formal-constraints')||'[]')) hiddenConstraints.add(value);
} catch {}
for(const button of toolbarConstraints) {
  const value=button.dataset.angle, label=Formal.names[value];
  setConstraintButton(button,value,label);
  const row=document.createElement('div');row.className='constraint-row';
  const command=document.createElement('button');command.dataset.angle=value;
  setConstraintButton(command,value,label);
  labelToolMenuCommand(command,label);
  const eye=document.createElement('button');eye.type='button';
  const icon=document.createElement('span');icon.className='eye-icon';icon.setAttribute('aria-hidden','true');
  eye.append(icon);row.append(command,eye);$('constraintMenu').append(row);
  constraintButtons.push(command);
  function syncVisibility() {
    const shown=!hiddenConstraints.has(value);
    button.hidden=!shown;
    eye.setAttribute('aria-pressed',String(shown));
    eye.setAttribute('aria-label',I18n.t(label)+I18n.t(' dans la barre d’outils'));
    eye.title=(shown?I18n.t('Masquer '):I18n.t('Afficher '))+I18n.t(label)+I18n.t(' dans la barre d’outils');
  }
  eye.onclick=()=>{
    if(hiddenConstraints.has(value)) hiddenConstraints.delete(value);
    else hiddenConstraints.add(value);
    try {localStorage.setItem('velocivector-hidden-formal-constraints',JSON.stringify([...hiddenConstraints]));} catch {}
    syncVisibility();
  };
  menuAction(command,()=>useConstraint(value));
  button.onclick=()=>useConstraint(value);
  constraintVisibility.push(syncVisibility);
  syncVisibility();
}
const resetConstraintVisibility=document.createElement('button');
resetConstraintVisibility.type='button';
I18n.text(resetConstraintVisibility,'Par défaut');
I18n.attribute(resetConstraintVisibility,'title','Réafficher tous les boutons de contrainte');
resetConstraintVisibility.onclick=()=>{
  hiddenConstraints.clear();
  try {localStorage.removeItem('velocivector-hidden-formal-constraints');} catch {}
  for(const refresh of constraintVisibility) refresh();
};
$('constraintMenu').append(resetConstraintVisibility);
const exportFormats={
  dxf2000:{extension:'.dxf',label:'DXF 2000',mime:'application/dxf',write:(drawing,options)=>Formats.dxfBytes(Formats.write(drawing,false,options))},
  dxfR14:{extension:'.dxf',label:'DXF R14 (mm)',mime:'application/dxf',write:(drawing,options)=>Formats.dxfBytes(Formats.write(drawing,'r14',options))},
  dxfR12:{extension:'.dxf',label:'DXF R12 (mm)',mime:'application/dxf',write:(drawing,options)=>Formats.dxfBytes(Formats.write(drawing,'r12',options))},
  svg:{extension:'.svg',label:'SVG',mime:'image/svg+xml',write:Formats.writeSVG},
  png:{extension:'.png',label:'PNG',mime:'image/png',write:exportRasterPNG}
};
const exportDialog=$('exportDialog'), exportForm=$('exportForm');
async function exportRasterPNG(image) {
  const source=Formats.rasterSource(image);
  const blob=await (await fetch(source)).blob();
  if(blob.type==='image/png') return blob;
  // Projects saved before PNG normalization can still contain another image format.
  const bitmap=await createImageBitmap(blob);
  const canvas=document.createElement('canvas');
  canvas.width=bitmap.width;canvas.height=bitmap.height;
  try {canvas.getContext('2d').drawImage(bitmap,0,0);}
  finally {bitmap.close();}
  return new Promise((resolve,reject)=>canvas.toBlob(result=>result?resolve(result):
    reject(Error('La conversion PNG a échoué.')),'image/png'));
}
function exportDrawing() {
  const raster=$('exportFormat').value==='png';
  $('exportScope').hidden=raster;
  $('exportConstructionRow').hidden=raster;
  $('exportTextRow').hidden=raster;
  $('exportRasterRow').hidden=!raster;
  if(raster) {
    const image=doc.layers.find(layer=>layer.name===$('exportRasterLayer').value)?.raster;
    return {drawing:image,notice:image?'':I18n.t('Le dessin ne contient aucun calque matriciel.')};
  }
  const mode=exportForm.elements.namedItem('exportScope').value;
  const layers=$('exportLayers');
  layers.hidden=mode!=='layers';
  const includeConstruction=$('exportConstruction').checked;
  const scope=mode==='layers'?{layerNames:new Set([...layers.querySelectorAll('input:checked')].map(input=>input.value))}:
    mode==='selection'?{selectedIds:new Set(selected().map(e=>e.id)),selectedSegments:segmentSelection}:undefined;
  const drawing=Formats.exportSubset(doc,scope);
  const texts=$('exportText').checked?(doc.texts??[]).filter(text=>
    mode==='selection'?text.id===(textDraft?.id??textSelection):!scope?.layerNames||scope.layerNames.has(text.layer)):[];
  for(const {layer} of texts) if(!drawing.layers.some(item=>item.name===layer))
    drawing.layers=[...drawing.layers,doc.layers.find(item=>item.name===layer)];
  const notice=scope?.layerNames?.size===0?I18n.t('Cochez au moins un calque.'):
    !texts.length&&!Formats.hasExportGeometry(drawing,includeConstruction)?I18n.t('Aucun tracé à exporter avec ces options.'):'';
  return {drawing,includeConstruction,texts,notice};
}
function updateExportDialog() {
  const {notice}=exportDrawing();
  $('exportNotice').hidden=!notice;
  $('exportNotice').textContent=notice;
  $('confirmExport').disabled=exporting||Boolean(notice);
  $('cancelExport').disabled=exporting;
}
menuAction($('quickExport'),()=>{
  if(saving||exporting) return;
  $('exportName').value=filename;
  $('exportFormat').replaceChildren(...Object.entries(exportFormats).map(([id,format])=>
    new Option(format.extension+' — '+format.label,id)));
  $('exportRasterLayer').replaceChildren(...doc.layers.filter(layer=>layer.raster).map(layer=>new Option(layer.name,layer.name)));
  if(doc.layers.some(layer=>layer.name===activeLayer&&layer.raster)) {
    $('exportRasterLayer').value=activeLayer;
    $('exportFormat').value='png';
  }
  const hasSelection=Boolean(selected().length||(doc.texts??[]).some(text=>text.id===(textDraft?.id??textSelection)));
  exportForm.elements.namedItem('exportScope').value=hasSelection?'selection':'all';
  $('exportScope').querySelector('[value="selection"]').disabled=!hasSelection;
  $('exportText').checked=true;
  $('exportConstruction').checked=false;
  applyToolDefaults(['exportText','exportConstruction','exportFormat']);
  const preferredScope=toolDefault('exportScopeDefault','auto');
  if(preferredScope!=='auto'&&(preferredScope!=='selection'||hasSelection))
    exportForm.elements.namedItem('exportScope').value=preferredScope;
  $('exportLayers').replaceChildren(...doc.layers.filter(layer=>!layer.raster).map(layer=>{
    const label=document.createElement('label'), check=document.createElement('input');
    check.type='checkbox';check.value=layer.name;check.checked=layer.name===activeLayer;
    label.append(check,document.createTextNode(layer.name));
    return label;
  }));
  updateExportDialog();
  exportDialog.showModal();
});
exportForm.onchange=updateExportDialog;
$('cancelExport').onclick=()=>exportDialog.close();
exportDialog.addEventListener('cancel',event=>{if(exporting) event.preventDefault();});
exportForm.onsubmit=async event=>{
  event.preventDefault();
  if(exporting) return;
  const {drawing,includeConstruction,texts,notice}=exportDrawing();
  if(notice) return;
  const format=exportFormats[$('exportFormat').value], extension=format?.extension;
  const inputName=$('exportName').value.trim();
  const suffix=Object.values(exportFormats).map(item=>item.extension)
    .find(ending=>inputName.toLowerCase().endsWith(ending));
  const base=suffix?inputName.slice(0,-suffix.length).trim():inputName;
  if(!format||!base||/[<>:"/\\|?*\x00-\x1f]/.test(base)||base==='.'||base==='..') {
    $('exportNotice').textContent=I18n.t('Saisissez un nom de fichier valide.');
    $('exportNotice').hidden=false;
    return;
  }
  const name=base+extension;
  exporting=true;updateExportDialog();
  try {
    let handle=null;
    if(typeof window.showSaveFilePicker==='function') {
      try {
        handle=await window.showSaveFilePicker({suggestedName:name,excludeAcceptAllOption:true,
          types:[{description:format.label,accept:{[format.mime]:[extension]}}],
          ...(saveHandle?{startIn:saveHandle}:{})});
      } catch(error) {
        if(!['SecurityError','NotSupportedError'].includes(error.name)) throw error;
      }
    }
    if(texts?.length) {
      await Promise.all([...new Set(texts.map(text=>text.family))].map(prepareCadFont));
      const entities=new Map(doc.entities.map(entity=>[entity.id,entity]));
      const glyphCanvas=document.createElement('canvas');
      await document.fonts?.ready;
      drawing.entities=[...drawing.entities,...texts.flatMap(text=>
        TextGeometry.vectorize(text,entities,cadTextMeasure,glyphCanvas,Formats.millimeters[doc.units]))];
      if(!Formats.hasExportGeometry(drawing,includeConstruction)) throw Error('Aucun tracé à exporter avec ces options.');
    }
    const content=await format.write(drawing,{includeConstruction});
    if(handle) {
      if(!handle.name.toLowerCase().endsWith(extension)) throw Error(I18n.t('Utilisez l’extension ')+extension+'.');
      const output=await handle.createWritable();
      try {await output.write(content);await output.close();}
      catch(error) {await output.abort().catch(()=>{});throw error;}
      message(I18n.t('Export enregistré · ')+handle.name);
    } else {
      download(content,name,format.mime);
      message(I18n.t('Téléchargement demandé · ')+name);
    }
    exportDialog.close();
  } catch(error) {
    if(error.name!=='AbortError') {
      $('exportNotice').hidden=false;
      $('exportNotice').textContent=I18n.t('Export impossible · ')+I18n.t(error.message);
    }
  } finally {
    exporting=false;
    $('confirmExport').disabled=false;
    $('cancelExport').disabled=false;
  }
};
function saveCursorPreferences() {
  try {localStorage.setItem('velocivector-cursors',JSON.stringify(cursorPreferences));} catch {}
  cursorInputs=[];
  updateToolIcons();
  requestDraw();
}
function saveSnapPreferences() {
  try {localStorage.setItem('velocivector-snap-indicators',JSON.stringify(snapPreferences));} catch {}
  previousSnapCorner=null;
  requestDraw();
}
function showSnapPreferences() {
  $('snapIndicatorCorner').value=snapPreferences.corner;
  $('snapIndicatorOptions').replaceChildren();
  for(const [kind,title] of Object.entries(SnapIndicators.labels)) {
    const row=document.createElement('label'), image=document.createElement('img'), check=document.createElement('input');
    row.className='cursor-preference';
    image.width=24;image.height=24;image.alt='';image.src=SnapIndicators.image(kind,cursorPreferences.colors.select);
    check.type='checkbox';check.checked=snapPreferences.enabled[kind];
    check.onchange=()=>{snapPreferences.enabled[kind]=check.checked;saveSnapPreferences();};
    row.append(image,document.createTextNode(I18n.t(title)),check);$('snapIndicatorOptions').append(row);
  }
}
function showCursorPreferences() {
  $('cursorMode').value=cursorPreferences.mode;
  $('classicCursorOptions').hidden=cursorPreferences.mode!=='classic';
  $('cursorShapes').replaceChildren();
  $('cursorColors').replaceChildren();
  for(const [key,[title,...choices]] of Object.entries(CursorProfiles.profiles)) {
    const row=document.createElement('label'), preview=document.createElement('img'), select=document.createElement('select');
    row.className='cursor-preference';
    preview.alt='';preview.width=32;preview.height=32;
    for(const shape of choices) select.add(new Option(I18n.t(CursorProfiles.icons[shape][0]),shape));
    select.value=cursorPreferences.shapes[key];
    function show() {
      preview.src=CursorProfiles.image(select.value,cursorPreferences.colors.select).src;
      row.style.cursor=CursorProfiles.css(key,'select',0,cursorPreferences,'default');
    }
    select.onchange=()=>{cursorPreferences.shapes[key]=select.value;saveCursorPreferences();show();};
    show();row.append(preview,document.createTextNode(I18n.t(title)),select);$('cursorShapes').append(row);
  }
  for(const [key,[title]] of Object.entries(CursorProfiles.tools)) {
    const row=document.createElement('label'), preview=document.createElement('img'), color=document.createElement('input');
    row.className='cursor-preference color-preference';
    preview.alt='';preview.width=32;preview.height=32;
    color.type='color';color.value=cursorPreferences.colors[key];
    function show() {preview.src=CursorProfiles.image(cursorPreferences.mode==='precision'&&key!=='text'?'precision':cursorPreferences.shapes.select,color.value).src;}
    color.oninput=()=>{cursorPreferences.colors[key]=color.value;saveCursorPreferences();show();};
    show();row.append(preview,document.createTextNode(I18n.t(title)),color);$('cursorColors').append(row);
  }
  showSnapPreferences();
}
function renderShortcuts() {
  const list=$('shortcutList'), feedback=$('shortcutFeedback');
  list.replaceChildren();
  const section=(title)=>{
    const group=document.createElement('fieldset'), heading=document.createElement('legend');
    heading.textContent=I18n.t(title);group.append(heading);list.append(group);return group;
  };
  const row=(group,label)=>{
    const entry=document.createElement('div'), title=document.createElement('span');
    entry.className='shortcut-row';title.textContent=I18n.t(label);entry.append(title);group.append(entry);return entry;
  };
  for(const [category,actions] of Object.entries(shortcutCatalog)) {
    const group=section(category);
    for(const [id,[label]] of Object.entries(actions)) {
      const entry=row(group,shortcutCaption(id,label)), change=document.createElement('button'), clear=document.createElement('button');
      change.type=clear.type='button';
      change.textContent=shortcutText(shortcuts[id]);change.setAttribute('aria-label',I18n.t('Modifier ')+shortcutCaption(id,label));
      change.onclick=()=>{change.textContent=I18n.t('Appuyez sur les touches');change.dataset.capture='true';};
      change.onblur=()=>{delete change.dataset.capture;change.textContent=shortcutText(shortcuts[id]);};
      change.onkeydown=e=>{
        if(!change.dataset.capture) return;
        e.preventDefault();e.stopPropagation();
        const chord=keyboardChord(e);
        if(!chord||e.repeat) return;
        const conflict=Object.keys(shortcuts).find(other=>other!==id&&shortcuts[other]===chord);
        if(conflict) {
          const action=Object.values(shortcutCatalog).find(category=>category[conflict])[conflict][0];
          feedback.textContent=shortcutText(chord)+I18n.t(' est déjà utilisé pour « ')+shortcutCaption(conflict,action)+I18n.t(' ».');
          return;
        }
        shortcuts[id]=chord;
        delete change.dataset.capture;change.textContent=shortcutText(chord);feedback.textContent='';
        saveShortcuts();
      };
      clear.textContent=I18n.t('Effacer');clear.setAttribute('aria-label',I18n.t('Effacer le raccourci ')+shortcutCaption(id,label));
      clear.onclick=()=>{shortcuts[id]='';change.textContent=I18n.t('Aucun');feedback.textContent='';saveShortcuts();};
      entry.append(change,clear);
    }
  }
  const gestures=section(I18n.t('Touches maintenues pendant un geste'));
  for(const [id,[label]] of Object.entries(gestureDefaults)) {
    const entry=row(gestures,label), select=document.createElement('select');
    select.setAttribute('aria-label',I18n.t(label));
    for(const [key,text] of Object.entries(modifierLabels)) select.add(new Option(I18n.t(text),key));
    select.value=gestureKeys[id];
    select.onchange=()=>{
      const conflict=Object.keys(gestureKeys).find(other=>other!==id&&gestureKeys[other]===select.value);
      if(conflict) {
        feedback.textContent=I18n.t(modifierLabels[select.value])+I18n.t(' est déjà utilisé pour « ')+I18n.t(gestureDefaults[conflict][0])+I18n.t(' ».');
        select.value=gestureKeys[id];return;
      }
      gestureKeys[id]=select.value;feedback.textContent='';saveShortcuts();
    };
    entry.append(select);
  }
}
for(const button of document.querySelectorAll('[data-preference-page]')) button.onclick=()=>{
  for(const tab of document.querySelectorAll('[data-preference-page]')) {
    const active=tab===button;
    $(tab.dataset.preferencePage).hidden=!active;
    tab.classList.toggle('active',active);
    if(active) tab.setAttribute('aria-current','page');else tab.removeAttribute('aria-current');
  }
};
$('resetShortcuts').onclick=()=>{
  shortcuts={...defaultShortcuts};
  gestureKeys=Object.fromEntries(Object.entries(gestureDefaults).map(([id,[,key]])=>[id,key]));
  $('shortcutFeedback').textContent=I18n.t('Raccourcis d’origine rétablis.');
  saveShortcuts();renderShortcuts();
};
menuAction($('preferences'),()=>{showCursorPreferences();renderShortcuts();renderToolDefaults();$('preferencesDialog').showModal();});
$('resetCursorShapes').onclick=()=>{
  cursorPreferences.shapes=CursorProfiles.normalize().shapes;saveCursorPreferences();showCursorPreferences();
};
$('resetCursorColors').onclick=()=>{
  cursorPreferences.colors=CursorProfiles.normalize().colors;saveCursorPreferences();showCursorPreferences();
};
$('cursorMode').onchange=()=>{
  cursorPreferences.mode=$('cursorMode').value;
  saveCursorPreferences();
  showCursorPreferences();
};
$('snapIndicatorCorner').onchange=()=>{
  snapPreferences.corner=$('snapIndicatorCorner').value;
  saveSnapPreferences();
};
$('resetSnapIndicators').onclick=()=>{
  snapPreferences=SnapIndicators.normalize();saveSnapPreferences();showSnapPreferences();
};
$('fit').onclick=fit;
$('panel').onclick=()=>{$('options').hidden=!$('options').hidden;};
$('undo').onclick=()=>history(true);
$('redo').onclick=()=>history(false);
const toolMiniatures={
  tangentPoly:{outline:'M3 17h7a9 9 0 0 0 9-9',guide:'M10 17h9',points:[[3,17],[10,17],[19,8]]},
  poly:{outline:'M4 9 11 4 21 8 19 20 7 20z',points:[[4,9],[11,4],[21,8],[19,20],[7,20]]},
  rect:{outline:'M4 6h16v12H4z',points:[[4,6],[20,18]]},
  rectCenter:{outline:'M4 6h16v12H4z',guide:'M12 12l8 6',points:[[12,12],[20,18]]},
  circle:{outline:'M20 12a8 8 0 1 0-16 0 8 8 0 1 0 16 0z',guide:'M12 12h8',points:[[12,12],[20,12]]},
  arc:{outline:'M3 14A8 8 0 0 1 11 6',guide:'M3 14h8V6',points:[[11,14],[3,14],[11,6]]},
  arcThree:{outline:'M4 16A8 8 0 0 1 20 16',guide:'M4 16h16',points:[[4,16],[20,16],[12,8]]},
  polygon:{outline:'M8 4h8l5 8-5 8H8l-5-8z',guide:'M12 12h9',points:[[12,12],[21,12]]},
  ellipse:{outline:'M21 12a9 6 0 1 0-18 0 9 6 0 1 0 18 0z',guide:'M21 12H12V6',points:[[12,12],[21,12],[12,6]]},
  slot:{outline:'M8 7h8a5 5 0 0 1 0 10H8A5 5 0 0 1 8 7z',guide:'M8 12h8m-8 0V7',points:[[8,12],[16,12],[8,7]]},
  bezier:{outline:'M3 18C6 18 7 6 11 7S17 19 21 9',points:[[3,18],[11,7],[21,9]]},
  origin:{outline:'M12 3v18M3 12h18M18 12a6 6 0 1 0-12 0 6 6 0 1 0 12 0',points:[[12,12]]},
  point:{outline:'M6 12h12M12 6v12',points:[[12,12]]},
  offset:{outline:'M4 19V5h15M8 19V9h11m-6 7 4-4m-4 0h4v4',points:[]},
  dimension:{outline:'M4 5v14m16-14v14M4 9h16M8 6 4 9l4 3m8-6 4 3-4 3',points:[[4,17],[20,17]]}
};
function toolIconSource(id,method=toolMethod(id)) {
  id=toolForMethod(id,method);
  const cursorColor=cursorPreferences.colors[id]??cursorPreferences.colors.select;
  const color='#'+cursorColor.slice(1).match(/../g).map(channel=>
    Math.round(Number.parseInt(channel,16)/2).toString(16).padStart(2,'0')).join('');
  if(id==='select') return CursorProfiles.image(cursorPreferences.mode==='precision'?'precision':cursorPreferences.shapes.select,color).src;
  if(id==='text') return 'data:image/svg+xml,'+encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><text x="12" y="19" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" fill="'+color+'">A</text></svg>');
  const key=id==='arc'&&method==='three'?'arcThree':id==='rect'&&method==='center'?'rectCenter':id;
  const {outline,guide,points}=toolMiniatures[key];
  const marks=points.map(([x,y])=>'<rect x="'+(x-1.4)+'" y="'+(y-1.4)+'" width="2.8" height="2.8" fill="'+color+'" stroke="none"/>').join('');
  return 'data:image/svg+xml,'+encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="'+color+'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+
    (guide?'<path d="'+guide+'" stroke-width=".9" stroke-dasharray="2 1.5"/>':'')+'<path d="'+outline+'"/>'+marks+'</svg>');
}
function updateToolIcons() {
  for(const button of $('tools').children) {
    const id=button.dataset.tool, image=button.querySelector('img');
    if(image) image.src=toolIconSource(id);
  }
  for(const menu of toolPopups()) for(const option of menu.querySelectorAll('[data-tool-method]')) {
    const image=option.querySelector('img');
    if(image) image.src=toolIconSource(menu.dataset.toolPopup,option.dataset.toolMethod);
  }
  for(const button of $('drawingMenu').querySelectorAll('[data-menu-drawing]'))
    button.querySelector('img').src=toolIconSource(button.dataset.menuDrawing);
}
function bindToolOptions(button,id) {
  const menu=$(toolPopupIds[id]);
  let timer=null, held=false;
  button.classList.add('has-variants');
  button.setAttribute('aria-expanded','false');
  button.setAttribute('aria-controls',toolPopupIds[id]);
  function show() {
    closeToolPopups();
    const box=button.getBoundingClientRect();
    menu.style.left=box.right+6+'px';
    menu.style.top=box.top+'px';
    menu.hidden=false;
    button.setAttribute('aria-expanded','true');
    const current=toolMethod(id);
    for(const option of menu.querySelectorAll('[data-tool-method]'))
      option.classList.toggle('active',option.dataset.toolMethod===current);
  }
  for(const option of menu.querySelectorAll('[data-tool-method]')) {
    const image=document.createElement('img');image.alt='';
    image.src=toolIconSource(id,option.dataset.toolMethod);
    option.prepend(image);
    option.onclick=()=>{
      if(id==='arc') arcMethod=option.dataset.toolMethod;
      if(id==='rect') rectangleMethod=option.dataset.toolMethod;
      hideToolPopup(menu);
      choose(toolForMethod(id,option.dataset.toolMethod));
      updateToolIcons();
    };
  }
  const hovered=e=>document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-tool-method]');
  button.addEventListener('pointerdown',e=>{
    if(e.button!==0) return;
    held=false;
    button.setPointerCapture(e.pointerId);
    timer=setTimeout(()=>{held=true;show();},350);
  });
  button.addEventListener('pointermove',e=>{
    if(!held) return;
    const over=hovered(e);
    for(const item of menu.querySelectorAll('button')) item.classList.toggle('active',item===over);
  });
  button.addEventListener('pointerup',e=>{
    clearTimeout(timer);
    if(!held) return;
    const option=hovered(e);
    if(option&&menu.contains(option)) option.click();
  });
  button.addEventListener('pointercancel',()=>{clearTimeout(timer);held=false;hideToolPopup(menu);});
  button.addEventListener('lostpointercapture',()=>clearTimeout(timer));
  button.addEventListener('keydown',e=>{
    if(e.key==='ArrowDown') {e.preventDefault();e.stopPropagation();show();menu.querySelector('button').focus();}
  });
  button.addEventListener('contextmenu',e=>{e.preventDefault();show();});
  button.onclick=e=>{
    if(!held) {
      const box=button.getBoundingClientRect();
      if(e.detail&&e.clientX>=box.right-13&&e.clientY>=box.bottom-13) {
        if(menu.hidden) show();else hideToolPopup(menu);
      } else choose(toolForMethod(id));
    }
    held=false;
  };
}
for(const [id,[,label]] of Object.entries(definitions)) {
  if(id==='tangentPoly') continue;
  const button=document.createElement('button');
  button.type='button';button.dataset.tool=id;
  button.setAttribute('aria-label',label);
  button.onclick=()=>choose(id);
  const image=document.createElement('img');image.alt='';
  image.src=toolIconSource(id);
  button.append(image);
  if(Object.hasOwn(toolPopupIds,id)) bindToolOptions(button,id);
  $('tools').append(button);
}
const modificationIcons={
  transform:'M8 4h8m-4 0v16m-4-4 4 4 4-4m-4-12-4 4m4-4 4 4M4 12h16m-4-4 4 4-4 4M8 8l-4 4 4 4',
  auto:'M12 3v6m-3-3h6m-9 6v8h12v-8m-12 4H3m15 0h3',
  move:'M3 12h18m-5-5 5 5-5 5M8 7l-5 5 5 5',
  scale:'M4 5h10v10H4zM11 11h9v9h-9zM15 5h5v5m-3-2 3-3',
  rotate:'M19 9a7 7 0 1 0 0 6m-5-7 5 1 1-5',
  mirror:'M12 3v4m0 3v4m0 3v4M8 5 3 18h5zm8 0 5 13h-5z',
  reverse:'M4 8h15m-4-4 4 4-4 4m5 4H5m4-4-4 4 4 4',
  explode:'M4 4h6v6H4zM14 14h6v6h-6zM14 4h6m0 0v6m-3-3 3-3M4 14v6h6m-3-3-3 3',
  close:'M4 10V5h16v14H4v-4m0 0v-5m-3 2 3-2 3 2',
  autoClose:'M3 17l7-7m4 0 7 7M10 10l2-2 2 2-2 2zM3 15v4m18-4v4',
  fillet:'M4 4v8m8 8h8M4 12a8 8 0 0 0 8 8m-8-8v8h8',
  scissors:'M9 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM8 8l12 12M8 16l12-12'
};
const toolVisibilityRefresh=[];
function toolVisibilityMenu(menuId,storageKey,entries) {
  const menu=$(menuId), hidden=new Set(), refresh=[];
  try {
    for(const id of JSON.parse(localStorage.getItem(storageKey)??'[]')) hidden.add(id);
  } catch {}
  for(const {id,label,toolbar,command,action} of entries) {
    const row=document.createElement('div');row.className='constraint-row';
    labelToolMenuCommand(command,label);
    const eye=document.createElement('button');eye.type='button';
    const icon=document.createElement('span');icon.className='eye-icon';icon.setAttribute('aria-hidden','true');
    eye.append(icon);row.append(command,eye);menu.append(row);
    const sync=()=>{
      const shown=!hidden.has(id);
      toolbar.hidden=!shown;
      eye.setAttribute('aria-pressed',String(shown));
      eye.title=(shown?I18n.t('Masquer '):I18n.t('Afficher '))+I18n.t(label)+I18n.t(' dans la barre d’outils');
      eye.setAttribute('aria-label',eye.title);
    };
    eye.onclick=()=>{
      if(hidden.has(id)) hidden.delete(id);else hidden.add(id);
      try {localStorage.setItem(storageKey,JSON.stringify([...hidden]));} catch {}
      sync();requestDraw();
    };
    menuAction(command,action);
    refresh.push(sync);toolVisibilityRefresh.push(sync);sync();
  }
  const reset=document.createElement('button');
  reset.type='button';
  I18n.text(reset,'Par défaut');
  I18n.attribute(reset,'title','Réafficher tous les outils de ce menu');
  reset.onclick=()=>{
    hidden.clear();
    try {localStorage.removeItem(storageKey);} catch {}
    for(const sync of refresh) sync();
    requestDraw();
  };
  menu.append(reset);
}
function setModificationIcon(button,operation,label) {
  const ns='http://www.w3.org/2000/svg', icon=document.createElementNS(ns,'svg'), path=document.createElementNS(ns,'path');
  icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');icon.classList.add('command-icon');
  path.setAttribute('d',modificationIcons[operation]);icon.append(path);
  button.type='button';
  button.replaceChildren(icon);
  button.classList.add('modification-command');
  I18n.attribute(button,'title',label);
  I18n.attribute(button,'aria-label',label);
}
const modificationEntries=[];
for(const b of document.querySelectorAll('[data-operation]')) {
  const operation=b.dataset.operation;
  const label=operation==='transform'?'Transformer':modificationNames[operation];
  setModificationIcon(b,operation,label);
  b.onclick=()=>operate(operation);
  const command=document.createElement('button');
  setModificationIcon(command,operation,label);
  modificationEntries.push({id:operation,label,toolbar:b,command,action:()=>operate(operation)});
}
toolVisibilityMenu('modificationMenu','velocivector-hidden-modification-tools',modificationEntries);
toolVisibilityMenu('drawingMenu','velocivector-hidden-drawing-tools',[...$('tools').children].map(toolbar=>{
  const id=toolbar.dataset.tool, command=document.createElement('button');
  command.dataset.menuDrawing=id;
  command.append(toolbar.querySelector('img').cloneNode(true));
  return {id,label:definitions[id][1],toolbar,command,action:()=>choose(toolForMethod(id))};
}));
const helpSections={
  draw:'select poly tangentPoly rect rectCenter circle arc arcThree polygon ellipse slot bezier point origin offset text dimension dimensionTable transmissions workshopBuilder'.split(' '),
  constraints:'constraintWorkflow horizontal vertical coincident midpoint parallel collinear radial perpendicular equal tangent symmetry locked'.split(' '),
  modify:'transform move scale rotate mirror reverse explode close autoClose fillet scissors'.split(' '),
  workspace:'shortcutPanel layers groups construction precision rasterLayer calibrateRaster rotateRaster alignRasterOrigin'.split(' '),
  vector:'vectorPreview recognition autoConstraints junction overlaps vectorApply'.split(' '),
  image:'imagePreview brightness colors scan crop perspective straighten'.split(' '),
  files:'native exportVector exportRaster preferences'.split(' '),
};
const helpGlyphs={dimensionTable:'▤',shortcutPanel:'⌨',
  constraintWorkflow:'◇',layers:'▤',groups:'▣',construction:'┄',rasterLayer:'▧',vectorPreview:'▱',
  recognition:'⌁',autoConstraints:'⊥',junction:'⋈',overlaps:'▣',vectorApply:'↳',
  imagePreview:'▧',brightness:'☼',colors:'◐',scan:'▦',crop:'⌗',perspective:'⏢',
  straighten:'∠',native:'▤',exportVector:'↗',exportRaster:'↗',preferences:'⚙',transmissions:'⚙',workshopBuilder:'⚙'
};
let activeHelpSection='draw';
const helpShortcutCommands={
  poly:['polyAlternate','tool:poly'],tangentPoly:['tool:tangentPoly','tool:poly'],
  rectCenter:['tool:rect'],arcThree:['tool:arc'],
  move:['transform:move'],scale:['transform:scale'],rotate:['transform:rotate'],
  transform:['operation:transform','transform:auto'],
  construction:['construction'],layers:['selectLayer'],groups:['group','ungroup'],constraintWorkflow:['remove'],
  precision:['cycleSnap','suspendSnap'],native:['open','save','saveAs']
};
function helpShortcuts(id) {
  const commands=helpShortcutCommands[id]??(
    Object.hasOwn(definitions,id)?['tool:'+id]:
    Object.hasOwn(shortcuts,'constraint:'+id)?['constraint:'+id]:
    Object.hasOwn(shortcuts,'operation:'+id)?['operation:'+id]:[]);
  const row=document.createElement('p');
  row.className='help-shortcuts';
  row.append(I18n.t('Raccourcis clavier'),' · ');
  if(!commands.length) row.append(I18n.t('Aucun raccourci dédié'));
  for(const command of commands) {
    if(command!==commands[0]) row.append(' · ');
    if(Object.hasOwn(helpShortcutCommands,id)&&id!=='construction') {
      const label=Object.values(shortcutCatalog).find(group=>Object.hasOwn(group,command))?.[command][0];
      if(label) row.append(I18n.t(label),' ');
    }
    const key=document.createElement(shortcuts[command]?'kbd':'span');
    key.textContent=shortcutText(shortcuts[command]);
    row.append(key);
  }
  return row;
}
function helpIcon(id) {
  if(Object.hasOwn(constraintSymbols,id)) return constraintIcon(id);
  const control=id==='construction'?$('constructionToggle'):$(id)??
    modificationEntries.find(entry=>entry.id===id)?.toolbar??
    $('transformModes').querySelector('[data-transform-mode="'+id+'"]');
  const existing=control?.querySelector('svg');
  if(existing) return existing.cloneNode(true);
  if(id==='precision') return $('precisionIcons').querySelector('img').cloneNode(true);
  if(Object.hasOwn(definitions,id)||id==='arcThree'||id==='rectCenter') {
    const image=document.createElement('img');
    image.alt='';
    const toolId=id==='arcThree'?'arc':id==='rectCenter'?'rect':id;
    const method={arcThree:'three',arc:'center',rectCenter:'center',rect:'corners',poly:'classic',tangentPoly:'tangent'}[id];
    image.src=toolIconSource(toolId,method);
    return image;
  }
  const glyph=document.createElement('span');
  glyph.textContent=helpGlyphs[id];
  return glyph;
}
function showHelpSection(section) {
  activeHelpSection=section;
  const keys={
    finish:shortcutText(shortcuts.finish),
    exit:shortcutText(shortcuts.exit),
    remove:shortcutText(shortcuts.remove),
    undo:shortcutText(shortcuts.undo),
    construction:shortcutText(shortcuts.construction),
    localEdit:I18n.t(modifierLabels[gestureKeys.ctrlKey]),
    alignment:I18n.t(modifierLabels[gestureKeys.shiftKey])
  };
  for(const button of $('helpSections').children)
    button.setAttribute('aria-pressed',String(button.dataset.helpSection===section));
  $('helpSectionTitle').textContent=I18n.t('help.section.'+section);
  $('helpCards').replaceChildren(...helpSections[section].map(id=>{
    const card=document.createElement('li'), icon=document.createElement('span');
    const text=document.createElement('div'), title=document.createElement('h4'), effect=document.createElement('p');
    icon.className='help-icon';
    icon.setAttribute('aria-hidden','true');
    icon.append(helpIcon(id));
    title.textContent=I18n.t('help.'+id+'.title');
    effect.textContent=I18n.t('help.'+id+'.effect',keys);
    text.append(title,helpShortcuts(id),effect);
    card.append(icon,text);
    return card;
  }));
  $('helpContent').scrollTop=0;
}
for(const section of Object.keys(helpSections)) {
  const tab=document.createElement('button');
  tab.type='button';
  tab.dataset.helpSection=section;
  I18n.text(tab,'help.section.'+section);
  tab.onclick=()=>showHelpSection(section);
  $('helpSections').append(tab);
}
menuAction($('openHelp'),()=>{
  showHelpSection(activeHelpSection);
  $('helpDialog').showModal();
});
menuAction($('openAbout'),()=>$('aboutDialog').showModal());
for(const b of $('transformModes').querySelectorAll('[data-transform-mode]')) {
  const mode=b.dataset.transformMode;
  setModificationIcon(b,mode,mode==='auto'?'Transformation automatique':'Verrouiller · '+modificationNames[mode]);
  b.onclick=()=>openTransformation(mode,modification?.protected??!modification?.transform);
}
let offsetCache=null;
function offsetSides() {
  return [$('offsetInside').checked&&'inside',$('offsetOutside').checked&&'outside'].filter(Boolean);
}
function offsetProposal() {
  const selectedItems=selected(), ids=selectionSignature(selectedItems), items=selectionRuns(selectedItems);
  const sides=offsetSides(), side=sides.join(',');
  const millimeters=Formats.millimeters[doc.units], distance=$('offsetDistance').valueAsNumber/millimeters;
  if(offsetCache?.doc===doc&&offsetCache.ids===ids&&offsetCache.side===side&&Object.is(offsetCache.distance,distance)) return offsetCache;
  const entities=[];
  let skipped=0;
  if(distance>0&&Number.isFinite(distance)) for(const entity of items) {
    for(const direction of sides) {
      if(entity.type==='point') {skipped++;continue;}
      const result=Edit.offsetTrace(entity,distance,direction,.02/millimeters);
      if(result&&G.serial(result)&&Edit.valid(result)) entities.push(result);
      else skipped++;
    }
  }
  return offsetCache={doc,ids,side,distance,entities,skipped};
}
function applyOffset() {
  if(tool!=='offset') return;
  const {entities,skipped}=offsetProposal();
  if(!entities.length) {message(I18n.t('Aucun décalage valide à cette distance.'));return;}
  if(!doc.layers.some(l=>l.name===activeLayer&&l.visible&&!l.raster)) {message(I18n.t('Choisissez un calque vectoriel visible pour créer le décalage.'));return;}
  const added=entities.map(e=>identity({...styledDraft(e),layer:activeLayer}));
  if(!commit(d=>({...d,entities:[...d.entities,...added]}),false,false,true)) return;
  if($('offsetSelectResult').checked) pick(added.map(e=>e.id),{});
  message(added.length+I18n.t(' tracé(s) décalé(s) créé(s).')+(skipped?' '+skipped+I18n.t(' décalage(s) impossible(s).'):''));
}
$('offsetOptions').onsubmit=e=>{e.preventDefault();applyOffset();};
$('offsetDistance').oninput=requestDraw;
for(const id of ['offsetInside','offsetOutside']) $(id).onchange=()=>{
  $('applyOffset').disabled=!selected().length||!offsetSides().length;
  requestDraw();
};
$('applyModification').onclick=()=>applyModification();
$('cancelModification').onclick=exitTool;
$('pickPivot').onclick=()=>{if(modification) {modification.phase='pivot';update();}};
$('pickMirrorAxis').onclick=()=>{if(modification) {modification.phase='axis';update();}};
for(const id of ['mirrorHorizontal','mirrorVertical','mirrorSegment']) $(id).onchange=()=>{
  if(modification) {modification.phase=null;modification.applied=false;}
  update();
};
for(const id of ['transformWidth','transformHeight']) {
  $(id).onchange=$(id).onblur=event=>setTransformSize(event.target);
}
$('transformSize').addEventListener('keydown',event=>{
  if(event.key!=='Enter'||event.isComposing||!event.target.matches('input')) return;
  event.preventDefault();
  event.stopPropagation();
  if(event.repeat) return;
  setTransformSize(event.target);
  event.target.blur();
},true);
$('scaleLock').onclick=$('transformSizeLock').onclick=()=>{
  if(!modification) return;
  modification.locked=!modification.locked;
  modification.applied=false;
  if(modification.locked) $('scaleY').value=$('scaleValue').value;
  update();
};
for(const id of ['pivotX','pivotY']) $(id).oninput=()=>{
  if(modification) {modification.pivot=modificationPivot();modification.applied=false;}
  requestDraw();
};
for(const id of ['rotateValue','scaleValue','scaleY','moveX','moveY']) $(id).oninput=()=>{
  if(modification) modification.applied=false;
  requestDraw();
};
$('moveMode').onchange=()=>{
  if(!modification) return;
  setMoveDestination($('moveMode').value==='absolute'?modificationPivot()??[0,0]:[0,0]);
  modification.applied=false;
  requestDraw();
};
$('filletRadius').oninput=requestDraw;
$('resetFilletRadius').onclick=()=>{
  $('filletRadius').value=5;
  requestDraw();
};
try {
  const saved=localStorage.getItem('velocivector-scissors-tolerance');
  if(saved!==null&&Number.isFinite(Number(saved))&&Number(saved)>=0) $('scissorsTolerance').value=saved;
} catch {}
$('scissorsTolerance').oninput=()=>{
  if(scissorsToleranceWorld()===null) return;
  try {localStorage.setItem('velocivector-scissors-tolerance',$('scissorsTolerance').value);} catch {}
  requestDraw();
};
$('resetScissors').onclick=()=>{
  $('scissorsTolerance').value=.05;
  $('scissorsAlong').checked=true;
  $('scissorsCoincidence').checked=true;
  try {localStorage.removeItem('velocivector-scissors-tolerance');} catch {}
  requestDraw();
};
$('scissorsAlong').onchange=()=>requestDraw();
$('closeTolerance').oninput=()=>{
  const value=$('closeTolerance').valueAsNumber;
  if(!Number.isFinite(value)||value<0) return;
  closeTolerance=value;
  try {localStorage.setItem('velocivector-close-tolerance',String(value));} catch {}
};
$('resetCloseTolerance').onclick=()=>{
  closeTolerance=.1;$('closeTolerance').value=closeTolerance;
  try {localStorage.removeItem('velocivector-close-tolerance');} catch {}
};
$('autoCloseTolerance').oninput=()=>{
  const input=$('autoCloseTolerance');
  if(input.checkValidity()&&Number.isFinite(input.valueAsNumber)) {
    try {localStorage.setItem('velocivector-auto-close-tolerance',input.value);} catch {}
  }
  update();
};
$('autoCloseMethod').onchange=update;
$('resetAutoCloseTolerance').onclick=()=>{
  $('autoCloseTolerance').value=.1;
  try {localStorage.removeItem('velocivector-auto-close-tolerance');} catch {}
  update();
};
for(const [i,unit] of Formats.units.entries()) $('units').add(new Option(I18n.t(unit),i));
$('units').onchange=()=>commit(d=>({...d,units:Number($('units').value)}));
$('addLayer').onsubmit=e=>{
  e.preventDefault();const name=$('layerName').value.trim();
  if(!canCreateLayer(name)) {message(I18n.t('Ce nom de calque est vide ou déjà utilisé.'));return;}
  const fields=captureCoordinateFields();
  activeLayer=name;
  restoreCoordinateFields(fields);
  commit(d=>({...d,layers:[...d.layers,{name,color:nextLayerColor(),visible:true}]}));
  $('layerName').value='';
};
$('activeOrigin').onchange=()=>{
  const name=$('activeOrigin').value;
  if(name===workingOrigin().name||!layerOrigins(activeLayer).some(o=>o.name===name)) return;
  const fields=captureCoordinateFields();
  const apply=state=>({...state,layers:state.layers.map(layer=>layer.name===activeLayer?
    {...layer,activeOrigin:layerOrigins(activeLayer,state).some(o=>o.name===name)?name:'POA'}:layer)});
  doc=apply(doc);undo=undo.map(apply);redo=redo.map(apply);
  dirty=true;
  restoreCoordinateFields(fields);
  update();
  if(lastPointer) refreshPointer(lastPointer);
};
$('originDialogForm').onsubmit=e=>{
  e.preventDefault();
  const target=originPosition('originDialog');
  if(!pendingOrigin||!target) return;
  const {layer:layerName,name}=pendingOrigin;
  const layer=doc.layers.find(l=>l.name===layerName&&l.visible);
  if(!layer) return;
  pendingOrigin=null;
  $('originDialog').close();
  editLayer(layerName,{origins:[...(layer.origins??[]),{name,target}]});
  message(name+I18n.t(' créé sur le calque ')+layerName+'.');
};
$('cancelOrigin').onclick=()=>$('originDialog').close();
$('originDialog').addEventListener('close',()=>{pendingOrigin=null;requestDraw();});
for(const id of ['originDialogX','originDialogY']) $(id).oninput=()=>{
  const p=originPosition('originDialog');
  if(pendingOrigin&&p) {pendingOrigin.target=p;requestDraw();}
};
$('selectedOriginForm').onsubmit=e=>{
  e.preventDefault();
  const origin=editableOrigin(), target=originPosition('selectedOrigin');
  if(origin&&target&&!moveWorkOrigin(origin,target)) updateOriginEditor();
};
$('point').onsubmit=e=>{
  e.preventDefault();
  const p=[$('x').valueAsNumber,$('y').valueAsNumber];
  place(tool==='origin'?p:fromWork(p),angleHeld);
};
for(const id of ['snap','grid','spacing','gridSnap','sides','overall']) $(id).addEventListener('input',()=>lastPointer?refreshPointer(lastPointer):requestDraw());
$('splineTension').oninput=()=>{
  const value=$('splineTension').valueAsNumber/100;
  if(!(value>=0&&value<=G.maxSplineRatio)) return;
  splineTension=value;
  try {localStorage.setItem('velocivector-spline-tension',String(value));} catch {}
  requestDraw();
};
$('splineTension').onchange=()=>{$('splineTension').value=splineTension*100;};
$('resetSplineTension').onclick=()=>{
  splineTension=1.38;$('splineTension').value=138;
  try {localStorage.removeItem('velocivector-spline-tension');} catch {}
  requestDraw();
};
for(const [id,arm] of [['incomingRatio',0],['knotRatio',1]]) $(id).onchange=()=>{
  const knot=focusedKnot(), value=$(id).valueAsNumber/100;
  if(knot&&value>=0) {
    const {setting}=curveKnotHandle(knot.entity,knot.index);
    if(value>curveRatioLimit(knot.entity,setting)) {update();return;}
    applyChanges(knotChanges(knot,handleSetting(setting,arm,value,arm===0?setting.inAngle:setting.outAngle)));
  } else update();
};
$('toggleKnotSymmetry').onclick=()=>{
  const knot=focusedKnot();
  if(!knot) return;
  const {setting}=curveKnotHandle(knot.entity,knot.index);
  applyChanges(knotChanges(knot,setting.split
    ?{...setting,split:false,inRatio:setting.outRatio}:{...setting,split:true}));
};
$('toggleKnotAngles').onclick=()=>{
  const knot=focusedKnot();
  if(!knot) return;
  const {setting}=curveKnotHandle(knot.entity,knot.index);
  applyChanges(knotChanges(knot,setting.splitAngles
    ?{...setting,splitAngles:false,inAngle:setting.outAngle}:{...setting,splitAngles:true}));
};
$('linearDimensionMode').onchange=requestDraw;
$('constructionToggle').onclick=toggleConstruction;
$('frameCoordinates').onclick=()=>{
  absoluteFrameReadout=!absoluteFrameReadout;
  $('frameCoordinates').setAttribute('aria-pressed',String(absoluteFrameReadout));
  $('frameCoordinates').title=absoluteFrameReadout?I18n.t('Afficher le déplacement relatif'):I18n.t('Afficher les coordonnées absolues');
  requestDraw();
};
$('frameCoordinates').title=I18n.t('Afficher les coordonnées absolues');
$('constructionStyle').onchange=()=>restyleConstruction($('constructionStyle').value);
$('constructionOpacity').oninput=()=>{
  constructionOpacity=Number($('constructionOpacity').value);
  $('constructionOpacityValue').textContent=constructionOpacity+' %';
  saveConstructionPreferences();
  requestDraw();
};
$('resetConstructionOpacity').onclick=()=>{
  constructionOpacity=80;
  updateConstructionOptions();
  saveConstructionPreferences();
  requestDraw();
};
$('dimensionOpacity').oninput=()=>{
  dimensionOpacity=Number($('dimensionOpacity').value);
  $('dimensionOpacityValue').textContent=dimensionOpacity+' %';
  try {localStorage.setItem('velocivector-dimension-opacity',String(dimensionOpacity));} catch {}
  update();
};
$('resetDimensionOpacity').onclick=()=>{
  dimensionOpacity=60;$('dimensionOpacity').value=60;$('dimensionOpacityValue').textContent='60 %';
  try {localStorage.removeItem('velocivector-dimension-opacity');} catch {}
  update();
};
$('resetKnot').onclick=()=>{
  const knot=focusedKnot();
  if(knot) applyChanges(knotChanges(knot,null));
};
let parameterEdit=null;
const parameterSelector='input[data-numeric-expression], input[type="text"], input:not([type]), input[type="range"], textarea:not(#cadInlineEditor), select';
document.addEventListener('focusin',event=>{
  const field=event.target;
  parameterEdit=field.matches?.(parameterSelector)?{field,value:field.value}:null;
});
document.addEventListener('focusout',event=>{
  const field=event.target, edit=parameterEdit;
  if(edit?.field!==field) return;
  parameterEdit=null;
  if(field.value===edit.value||event.relatedTarget?.closest('[data-cancel-edit]')) return;
  if(field.hasAttribute('data-numeric-expression')&&field.value.trim()&&!Number.isFinite(field.valueAsNumber)) {
    field.value=edit.value;
    field.dispatchEvent(new Event('input',{bubbles:true}));
    message(I18n.t('Saisissez une valeur valide avant d’appliquer la modification.'));
    return;
  }
  const form=field.form;
  if(!form||form.closest('dialog:not([open])')||event.relatedTarget?.form===form&&event.relatedTarget.type==='submit') return;
  if(form.id==='textOptions'&&textDraft?.p&&$('cadTextContent').value.trim()) {
    const text=cadTextValues();
    if(cadTextValid(text)&&(text.pathMode!=='linked'||text.pathId)&&
      (text.pathMode!=='arc'||text.radius>0)) applyCadText();
  } else if(['rasterOptions','selectedOriginForm','renameLayerForm','addLayer'].includes(form.id)&&form.checkValidity()) {
    form.requestSubmit();
  }
});
window.addEventListener('keydown',e=>{
  if(BrandPreview.isOpen()) return;
  if(rasterRotation&&e.key===gestureKeys.shiftKey) updateRasterRotation(e);
  if(Object.hasOwn(modifierLabels,e.key)) updateGestureModifiers(e);
  if($('dimensionTableDialog').open||$('pluginDialog').open||$('helpDialog').open||$('aboutDialog').open||$('preferencesDialog').open||$('originDialog').open||$('importDialog').open||$('transferLayerDialog').open||$('removeLayerDialog').open||$('renameLayerDialog').open||$('calibrateRasterDialog').open||rasterImportDialog.open||exportDialog.open) return;
  const chord=keyboardChord(e);
  const command=chord&&Object.keys(shortcuts).find(id=>shortcuts[id]===chord);
  if(command==='save'||command==='saveAs') {e.preventDefault();save(command==='saveAs');return;}
  if(command==='open') {e.preventDefault();openProjectPicker();return;}
  if(e.defaultPrevented) return;
  if(command==='finish'&&modification) {
    e.preventDefault();
    if(e.repeat) return;
    if(e.target.matches?.('#modifyOptions input[data-numeric-expression], #modifyOptions select')) {
      if(!e.target.reportValidity()||e.target.hasAttribute('data-numeric-expression')&&!Number.isFinite(e.target.valueAsNumber)) {
        message(I18n.t('Saisissez une valeur valide avant d’appliquer la modification.'));
        return;
      }
      e.target.blur();
      requestDraw();
    } else applyModification();
    return;
  }
  const input=e.target.tagName==='INPUT'&&!['checkbox','radio','range','button'].includes(e.target.type);
  if((input||/^(SELECT|TEXTAREA)$/.test(e.target.tagName)||e.target.isContentEditable)&&command!=='exit') return;
  if(Object.hasOwn(nudgeBindings,command)&&!drag&&
    !e.target.closest?.('input,select,textarea,[contenteditable],.app-menu[open],dialog')) {
    const items=selected();
    if(items.length) {
      e.preventDefault();
      nudgeSelection(items,nudgeBindings[command],e);
    }
    return;
  }
  if(e.key==='Tab'&&!e.ctrlKey&&!e.altKey&&!e.metaKey&&canRoundDrawing()) {
    e.preventDefault();
    metricSnapStep=e.shiftKey?10:1;
    updateGestureModifiers(e);
    return;
  }
  if(['copy','cut','paste'].includes(command)) {
    e.preventDefault();
    if(command==='paste') pasteGeometry();else copyGeometry(command==='cut');
    return;
  }
  if(['undo','redo','redoAlternate'].includes(command)) {e.preventDefault();history(command==='undo');return;}
  if(command==='exit') {
    if(dimensionEdit) {e.preventDefault();closeDimensionEditor();requestDraw();return;}
    if(e.target.matches?.(parameterSelector)) {
      e.preventDefault();
      if(parameterEdit?.field===e.target&&e.target.value!==parameterEdit.value) {
        e.target.value=parameterEdit.value;
        e.target.dispatchEvent(new Event(e.target.tagName==='SELECT'?'change':'input',{bubbles:true}));
      }
      parameterEdit=null;
      e.target.blur();
      return;
    }
    if(rasterMode) {setRasterMode();update();return;}
    if(!$('layerPalette').hidden) {$('layerPalette').hidden=true;return;}
    if(closeToolPopups()) return;
    if(!angleContext.hidden) {angleContext.hidden=true;return;}
    const menu=menus.find(menu=>menu.open);
    if(menu) {
      menu.open=false;menu.querySelector('summary').focus();return;
    }
    if(tool!=='select'||modification||constraintMode!==null||drag) exitTool();
    else pick([],e);
    if(document.activeElement instanceof HTMLElement) document.activeElement.blur();
    return;
  }
  if(command==='finish'&&tool==='text') {e.preventDefault();if(!e.repeat) applyCadText();return;}
  if(command==='finish'&&tool==='offset') {e.preventDefault();if(!e.repeat) applyOffset();return;}
  if(command==='finish' && polylineTool()) {e.preventDefault();finishPolyline();return;}
  if(command==='finish' && tool==='bezier') {e.preventDefault();finishBezier();return;}
  if(command==='cycleSnap' && lastPointer && tool!=='select' && marker) {e.preventDefault();snapIndex++;refreshPointer(lastPointer);return;}
  if(command==='suspendSnap' && e.target===document.body&&!e.repeat) {
    e.preventDefault();suspendKey=e.key;suspended=true;refreshSnapPreview();return;
  }
  if(command==='fit') {e.preventDefault();fit();return;}
  if(command==='construction'&&!e.repeat) {e.preventDefault();toggleConstruction();return;}
  if(['group','ungroup'].includes(command)&&!e.repeat&&tool==='select'&&!modification&&!constraintMode) {
    e.preventDefault();groupVectors(command==='group');return;
  }
  if(command==='selectLayer') {
    e.preventDefault();
    if(!e.repeat&&(tool==='select'&&!modification&&!constraintMode||choose('select'))) {
      pick(doc.entities.filter(entity=>entity.layer===activeLayer&&visible(entity)).map(entity=>entity.id),{});
    }
    return;
  }
  if((e.key==='Delete'||command==='remove')&&e.target.matches?.('.layer-grip')) {
    e.preventDefault();
    if(!e.repeat) askRemoveLayer(e.target.closest('.layer').dataset.layer);
    return;
  }
  if(command==='remove'&&!e.repeat) {e.preventDefault();if(tool==='text'||tool==='select'&&textSelection&&!modification&&!constraintMode) deleteCadText();else operate('remove');return;}
  if(command==='polyAlternate'&&!e.repeat) {e.preventDefault();if(tool!=='poly') choose('poly');return;}
  if(command?.startsWith('constraint:')||command?.startsWith('operation:')||command?.startsWith('transform:')) {
    e.preventDefault();
    if(e.repeat||drag) return;
    const [family,key]=command.split(':');
    if(family==='constraint') useConstraint(key);
    else if(family==='operation') operate(key);
    else openTransformation(key,modification?.protected??!modification?.transform);
    return;
  }
  if(command?.startsWith('tool:')&&!e.repeat) {e.preventDefault();choose(toolForMethod(command.slice(5)));}
});
function canRoundDrawing() {
  if(tool==='select') return ['scaleGesture','edit','radialResize'].includes(drag?.kind);
  return Boolean(cursorPoint&&(points.length||drag?.kind==='point')&&
    (['rect','circle','ellipse','slot'].includes(tool)||polylineTool()&&!tangentMode()));
}
function updateGestureModifiers(e) {
  if(metricSnapStep) metricSnapStep=e.shiftKey?10:1;
  const mod=drawingModifiers(e), p=cursorPoint??drag?.start;
  angleHeld=mod.shiftKey;tangentHeld=mod.ctrlKey;
  if(drag&&p) {
    switchSelectionDrag(mod,p);
    drag.shiftKey=mod.shiftKey;
    if(drag.kind==='rotateGesture'&&drag.aim) changeRotation(drag,p);
    else if(drag.kind==='scaleGesture'&&G.dist(drag.start,p)>2) changeScale(drag,p);
  }
  refreshSnapPreview();
}
function refreshSnapPreview() {
  if(!lastPointer) return;
  if(drag&&geometryDrags.has(drag.kind)) drag.previewPoint=lastPointer;
  refreshPointer(lastPointer);
}
let suspendKey=null;
function resumeSnap() {suspendKey=null;suspended=false;refreshSnapPreview();}
window.addEventListener('keyup',e=>{
  if(e.key===keyboardMovement?.key) keyboardMovement=null;
  if(e.key==='Tab'&&metricSnapStep) {metricSnapStep=0;updateGestureModifiers(e);}
  if(rasterRotation&&e.key===gestureKeys.shiftKey) updateRasterRotation(e);
  if(Object.hasOwn(modifierLabels,e.key)) updateGestureModifiers(e);
  if(suspended&&e.key===suspendKey) resumeSnap();
});
window.addEventListener('blur',()=>{
  keyboardMovement=null;
  angleHeld=false;tangentHeld=false;metricSnapStep=0;
  if(drag) drag.shiftKey=false;
  if(suspended) resumeSnap();
  else refreshSnapPreview();
});
window.addEventListener('beforeunload',e=>{if(dirty||tool==='bezier'&&points.length){e.preventDefault();e.returnValue='';}});
function refreshInterfaceLanguage() {
  showRecentProjects();
  if(typeof VelocivectorPlugins!=='undefined') VelocivectorPlugins.refresh();
  if($('helpDialog').open) showHelpSection(activeHelpSection);
  renderedLayers=null;
  $('toolName').textContent=I18n.t(definitions[tool][1]);
  $('help').textContent=toolHint(tool);
  $('frameCoordinates').title=absoluteFrameReadout?I18n.t('Afficher le déplacement relatif'):I18n.t('Afficher les coordonnées absolues');
  $('shortcutFeedback').textContent='';
  message(I18n.t('Prêt'));
  showCadFonts(cadFontChoices);
  updateCadFontRefresh(Boolean(cadLocalFonts.size||readSavedCadFonts().length));
  for(const [i,unit] of Formats.units.entries()) $('units').options[i].text=I18n.t(unit);
  for(const refresh of [...constraintVisibility,...toolVisibilityRefresh]) refresh();
  updateShortcutTitles();
  applyTheme();
  showCursorPreferences();
  renderShortcuts();
  if($('preferencesDialog').open) renderToolDefaults();
  update();
}
const languageSelect=$('interfaceLanguage');
for(const {code,name,dir} of I18n.options) {
  const option=new Option(name,code);
  option.lang=code;
  option.dir=dir;
  languageSelect.add(option);
}
languageSelect.value=I18n.preference;
$('interfaceLanguage').onchange=event=>{
  I18n.setPreference(event.target.value).then(refreshInterfaceLanguage);
};
window.addEventListener('languagechange',()=>{
  if(I18n.preference!=='auto') return;
  I18n.refresh().then(refreshInterfaceLanguage);
});
const startupLanguage=I18n.language;
I18n.ready.then(()=>{if(I18n.language!==startupLanguage) refreshInterfaceLanguage();});
const defaultOffsetFields=['offsetDistance','offsetInside','offsetOutside','offsetSelectResult'];
const defaultTextFields=[...Object.values(cadTextFields),'cadTextOrientation','cadTextSide','cadTextReverse'];
const modificationDefaultFields={
  move:['moveMode','moveX','moveY','rotateValue','scaleValue','scaleY','scaleDimensions'],
  rotate:['rotateValue'],scale:['scaleValue','scaleY','scaleDimensions'],
  mirror:['mirrorHorizontal','mirrorVertical','mirrorSegment','mirrorCopy'],
  close:['closeTolerance'],autoClose:['autoCloseMethod','autoCloseTolerance'],
  fillet:['filletRadius'],scissors:['scissorsAlong','scissorsTolerance','scissorsCoincidence']
};
const globalDefaultFields=['snap','autoCoincidence','grid','gridSnap','spacing','constructionStyle',
  'constructionOpacity','dimensionOpacity','splineTension'];
const toolDefaultsKey='velocivector-tool-defaults';
let toolDefaults={};
try {
  const value=JSON.parse(localStorage.getItem(toolDefaultsKey)??'{}');
  if(value&&typeof value==='object'&&!Array.isArray(value)) toolDefaults=value;
} catch {}
function toolDefault(id,fallback) {
  return Object.hasOwn(toolDefaults,id)?toolDefaults[id]:fallback;
}
function applyToolDefaults(ids) {
  let applied=false;
  for(const id of ids) {
    if(!Object.hasOwn(toolDefaults,id)) continue;
    const field=$(id), value=toolDefaults[id];
    if(!field) continue;
    if(['radio','checkbox'].includes(field.type)) field.checked=Boolean(value);
    else if(field.tagName!=='SELECT'||[...field.options].some(option=>option.value===String(value))) field.value=value;
    applied=true;
  }
  return applied;
}
function applyModificationDefaults(type) {
  applyToolDefaults(modificationDefaultFields[type]??[]);
  if(type==='close') closeTolerance=$('closeTolerance').valueAsNumber;
  if(['move','rotate','scale'].includes(type)) modification.locked=toolDefault('transformProportions',modification.protected);
}
const variants={
  polyDefault:['poly','tangent'],rectDefault:['rect','corners'],arcDefault:['arc','center']
};
function syncGlobalToolDefaults(ids=globalDefaultFields) {
  applyToolDefaults(ids.filter(id=>globalDefaultFields.includes(id)));
  if(ids.includes('constructionStyle')) constructionStyle=toolDefault('constructionStyle',constructionStyle);
  if(ids.includes('constructionOpacity')) constructionOpacity=Number(toolDefault('constructionOpacity',constructionOpacity));
  if(ids.includes('dimensionOpacity')) dimensionOpacity=Number(toolDefault('dimensionOpacity',dimensionOpacity));
  $('dimensionOpacityValue').textContent=dimensionOpacity+' %';
  if(ids.includes('splineTension')) splineTension=$('splineTension').valueAsNumber/100;
  if(ids.includes('drawConstructionDefault')) drawConstruction=toolDefault('drawConstructionDefault',false);
  if(ids.includes('absoluteFrameDefault')) absoluteFrameReadout=toolDefault('absoluteFrameDefault',false);
  $('frameCoordinates').setAttribute('aria-pressed',String(absoluteFrameReadout));
  $('frameCoordinates').title=I18n.t(absoluteFrameReadout?'Afficher le déplacement relatif':'Afficher les coordonnées absolues');
  if(ids.includes('polyDefault')) polylineMethod=toolDefault('polyDefault','tangent');
  if(ids.includes('rectDefault')) rectangleMethod=toolDefault('rectDefault','corners');
  if(ids.includes('arcDefault')) arcMethod=toolDefault('arcDefault','center');
  updateToolIcons();updateShortcutTitles();update();
}
function factoryFieldValue(field) {
  if(['checkbox','radio'].includes(field.type)) return field.defaultChecked;
  if(field.tagName==='SELECT') return [...field.options].find(option=>option.defaultSelected)?.value??field.options[0]?.value??'';
  return field.defaultValue;
}
const initialGlobalFields=new Map(globalDefaultFields.map(id=>[$(id).id,['checkbox','radio'].includes($(id).type)?$(id).checked:$(id).value]));
initialGlobalFields.set('constructionStyle',constructionStyle);
initialGlobalFields.set('constructionOpacity',constructionOpacity);
function newDefaultSelect(choices) {
  const select=document.createElement('select');
  for(const [value,label] of choices) select.add(new Option(label,value));
  return select;
}
function defaultPreferenceControl(id) {
  if(variants[id]) {
    const [tool,factory]=variants[id];
    const choices=[...$(toolPopupIds[tool]).querySelectorAll('[data-tool-method]')]
      .map(button=>[button.dataset.toolMethod,button.textContent.trim()]);
    return {control:newDefaultSelect(choices),label:I18n.t(definitions[tool][1]),factory};
  }
  const choices={
    mirrorAxisDefault:[['mirrorHorizontal','Horizontal'],['mirrorVertical','Vertical'],['mirrorSegment','Segment']],
    transformModeDefault:[['auto','Automatique'],['move','Déplacer'],['scale','Échelle'],['rotate','Tourner']],
    exportScopeDefault:[['auto','Automatique'],['selection','Sélection en cours'],['layers','Par calque'],['all','Tout le dessin']]
  };
  if(choices[id]) {
    const label={mirrorAxisDefault:'Axe',transformModeDefault:'Mode de transformation',exportScopeDefault:'Tracés à exporter'}[id];
    const options=choices[id];
    const current=options.find(([key])=>toolDefault(key,false))?.[0]??options[0][0];
    return {control:newDefaultSelect(options.map(([value,name])=>[value,I18n.t(name)])),label:I18n.t(label),
      factory:options[0][0],current};
  }
  if(id==='exportFormat') return {
    control:newDefaultSelect([['','Automatique'],...Object.entries(exportFormats).map(([value,format])=>[value,format.label])]
      .map(([value,label])=>[value,I18n.t(label)])),label:I18n.t('Format'),factory:''
  };
  const synthetic={drawConstructionDefault:['Trait de construction',false],absoluteFrameDefault:['Coordonnées absolues du cadre',false],
    transformProportions:['🔒 Proportions',false]};
  if(synthetic[id]) {
    const [label,factory]=synthetic[id], control=document.createElement('input');
    control.type='checkbox';return {control,label:I18n.t(label),factory};
  }
  const field=$(id);
  const control=field.cloneNode(true);
  for(const name of ['id','name','form','list','autofocus','aria-describedby','hidden']) control.removeAttribute(name);
  control.disabled=false;
  if(field.hasAttribute('data-numeric-expression')) {
    control.removeAttribute('data-numeric-expression');
    control.type='number';Numeric.install(control);
  }
  const nativeLabel=field.labels?.[0], labelContents=nativeLabel?.cloneNode(true);
  labelContents?.querySelectorAll('input,select,textarea,output,button').forEach(element=>element.remove());
  const label=labelContents?.textContent.trim()||field.getAttribute('aria-label')||id;
  const raster={rasterAngle:0,rasterScale:100,rasterActiveOpacity:80,rasterInactiveOpacity:35};
  const factory=raster[id]??(id==='units'?Formats.empty().units:factoryFieldValue(field));
  return {control,label,factory,current:initialGlobalFields.get(id)};
}
function saveToolDefaultSettings(ids) {
  try {localStorage.setItem(toolDefaultsKey,JSON.stringify(toolDefaults));} catch {}
  syncGlobalToolDefaults(ids);
}
function toolDefaultCategories() {
  const drawingByTool={select:['absoluteFrameDefault'],poly:['polyDefault'],rect:['rectDefault'],arc:['arcDefault'],
    polygon:['sides'],slot:['overall'],bezier:['splineTension'],offset:defaultOffsetFields,
    text:defaultTextFields,dimension:['linearDimensionMode']};
  const drawing=[...$('tools').children].map(button=>[definitions[button.dataset.tool][1],drawingByTool[button.dataset.tool]])
    .filter(([,fields])=>fields);
  return [
    ['Fichier',[
      ['Atelier d’importation',Object.values(importFields).filter(id=>id!=='importLayer')],
      ['Atelier d’importation d’image',Object.keys(rasterImportDefaults)],
      ['Export rapide',['exportFormat','exportScopeDefault','exportConstruction','exportText']]
    ]],
    ['Modification',[
      ['Transformer',['transformModeDefault','moveMode','moveX','moveY','rotateValue','scaleValue','scaleY','transformProportions','scaleDimensions']],
      ['Miroir',['mirrorAxisDefault','mirrorCopy']],['Fermer',modificationDefaultFields.close],
      ['Fermeture automatique',modificationDefaultFields.autoClose],['Congé',modificationDefaultFields.fillet],
      ['Ciseaux',modificationDefaultFields.scissors]
    ]],
    ['Grille et aimantation',[['Grille et aimantation',['snap','autoCoincidence','grid','gridSnap','spacing','units']],
      ['Trait de construction',['drawConstructionDefault','constructionStyle']]]],
    ['Dessin',drawing],
    ['Calques',[['Image matricielle',['rasterAngle','rasterScale','rasterActiveOpacity','rasterInactiveOpacity']],
      ['Calques',['constructionOpacity','dimensionOpacity']]]]
  ];
}
function renderToolDefaults() {
  const categories=toolDefaultCategories();
  const list=$('toolDefaultsList');
  list.replaceChildren();
  for(const [category,groups] of categories) {
    const heading=document.createElement('h3');
    heading.textContent=I18n.t(category);list.append(heading);
    for(const [name,ids] of groups) {
      const details=document.createElement('details'), summary=document.createElement('summary');
      summary.textContent=I18n.t(name);details.append(summary);list.append(details);
      for(const id of ids) {
        const {control,label,factory,current}=defaultPreferenceControl(id);
        const row=document.createElement('label');
        row.append(document.createTextNode(label),control);details.append(row);
        const value=toolDefault(id,current??factory);
        if(control.type==='checkbox') control.checked=Boolean(value);else control.value=value;
        control.onchange=()=>{
          if(!control.checkValidity()||control.hasAttribute('data-numeric-expression')&&!Number.isFinite(control.valueAsNumber)) return;
          const next=control.type==='checkbox'?control.checked:control.value;
          if(id==='mirrorAxisDefault') for(const key of ['mirrorHorizontal','mirrorVertical','mirrorSegment']) toolDefaults[key]=key===next;
          else toolDefaults[id]=next;
          saveToolDefaultSettings([id]);
        };
      }
      const reset=document.createElement('button');
      reset.type='button';reset.textContent=I18n.t('Par défaut');
      reset.onclick=()=>{
        for(const id of ids) {
          if(id==='checkImportOverlaps') delete toolDefaults[id];
          else toolDefaults[id]=defaultPreferenceControl(id).factory;
        }
        if(ids.includes('mirrorAxisDefault')) for(const key of modificationDefaultFields.mirror.slice(0,3)) delete toolDefaults[key];
        saveToolDefaultSettings(ids);renderToolDefaults();
      };
      details.append(reset);
    }
  }
}
$('resetToolDefaults').onclick=()=>{
  toolDefaults=Object.fromEntries(toolDefaultCategories().flatMap(([,groups])=>groups.flatMap(([,ids])=>
    ids.filter(id=>id!=='checkImportOverlaps').map(id=>[id,defaultPreferenceControl(id).factory]))));
  saveToolDefaultSettings(Object.keys(toolDefaults));renderToolDefaults();
};
doc.units=Number(toolDefault('units',doc.units));
applyTheme();syncGlobalToolDefaults([...globalDefaultFields,...Object.keys(toolDefaults)]);choose(tool);updateShortcutTitles();





