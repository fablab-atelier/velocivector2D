'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('./geometry.js'),C=require('./constraints.js'),F=require('./formats.js');
const point=(id,index=0)=>({id,kind:'point',index});
const edge=(id,index=0)=>({id,kind:'edge',index});
const line=(id,a,b)=>({id,type:'line',p:[a,b],layer:'0'});
const circle=(id,c,r)=>({id,type:'circle',c,r,layer:'0'});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,JSON.stringify([a,b]));
const near=(a,b)=>close(G.dist(a,b),0);
function apply(type,refs,items,fixed=[]){
  const constraint=C.make(type,refs,items);
  assert.ok(constraint,type);
  const solved=C.solve(items,[constraint],new Set(fixed));
  assert.ok(solved,type);
  return solved;
}
test('horizontal and vertical orientations act on straight edges',()=>{
  const items=[line(1,[0,0],[5,2])];
  const [horizontal]=apply('horizontal',[edge(1)],items);
  close(horizontal.p[0][1],horizontal.p[1][1]);
  const [vertical]=apply('vertical',[edge(1)],items);
  close(vertical.p[0][0],vertical.p[1][0]);
});
test('parallel and equal constraints preserve the reference and resolve the second segment',()=>{
  const items=[line(1,[0,0],[5,0]),line(2,[2,4],[9,7])];
  const [ref,parallel]=apply('parallel',[edge(1),edge(2)],items,[1]);
  assert.equal(ref,items[0]);close(parallel.p[0][1],parallel.p[1][1]);
  const [,equal]=apply('equal',[edge(1),edge(2)],items,[1]);close(G.dist(...equal.p),5);
});
test('tangency supports straight and circular elements, and equal supports radii',()=>{
  const items=[line(1,[0,0],[10,0]),circle(2,[5,5],2)];
  const [,tangent]=apply('tangent',[edge(1),edge(2)],items,[1]);
  close(tangent.c[1],tangent.r);
  const circles=[circle(1,[0,0],3),circle(2,[9,0],2)];
  const [,equal]=apply('equal',[edge(1),edge(2)],circles,[1]);
  close(equal.r,3);
  const [,touching]=apply('tangent',[edge(1),edge(2)],circles,[1]);
  close(G.dist(circles[0].c,touching.c),circles[0].r+touching.r);
});
test('symmetry reflects two points about a segment and locking rejects movement',()=>{
  const entities=[line(1,[0,0],[10,0]),line(2,[1,3],[1,5]),line(3,[4,-1],[4,-4])];
  const result=apply('symmetry',[edge(1),point(2),point(3)],entities,[1,2]);
  near(result[2].p[0],[1,-3]);
  const locked=C.make('locked',[edge(1)],entities);
  assert.equal(C.solve([line(1,[1,0],[11,0]),...entities.slice(1)],[locked]),null);
});
test('automatic coincidence binds a rectangle corner to a separate vertex and persists in VCV',()=>{
  const first=line(1,[0,0],[4,0]);
  const rectangle={id:2,type:'poly',p:[[4,0],[7,0],[7,3],[4,3]],closed:true,layer:'0'};
  const items=[first,rectangle];
  const constraints=C.automatic([first],items,[]);
  assert.equal(constraints.length,1);
  assert.equal(constraints[0].type,'coincident');
  const doc={...F.empty(),entities:items,constraints};
  assert.deepEqual(F.native(JSON.stringify(doc)),doc);
  const moved=line(1,[1,1],[5,1]);
  const solved=C.solve([moved,rectangle],constraints,new Set([1]));
  near(solved[1].p[0],[5,1]);
  assert.equal(solved[1].closed,true);
});

test('preview resolution respects a time budget without mutating the drawing',()=>{
  const items=[line(1,[0,0],[5,0]),line(2,[5,0],[10,0]),line(3,[30,0],[35,0])];
  const coincidence=C.make('coincident',[point(1,1),point(2,0)],items);
  const unrelated=C.make('horizontal',[edge(3)],items);
  const constraints=C.connected([unrelated,coincidence],[1]);
  assert.deepEqual(constraints,[coincidence]);
  const desired=[line(1,[0,3],[5,3]),items[1]];
  assert.equal(C.solve(desired,constraints,new Set([1]),{deadline:performance.now()-1}),null);
  const preview=C.solve(desired,constraints,new Set([1]),{maxPasses:5,epsilon:.01});
  near(preview[1].p[0],[5,3]);
  near(items[1].p[0],[5,0]);
});

test('smart placement chooses aligned length or the horizontal and vertical projections',()=>{
  const a=[0,0], b=[35,35];
  assert.equal(C.linearDimensionMode(a,b,[18,17],4),'aligned');
  assert.equal(C.linearDimensionMode(a,b,[17,45],4),'width');
  assert.equal(C.linearDimensionMode(a,b,[48,17],4),'height');
  assert.equal(C.linearDimensionMode(a,[35,0],[17,1],4),'aligned');
});

test('driving dimensions keep the chosen measurement as the segment changes angle',()=>{
  const changed=[line(1,[0,0],[40,30])];
  for(const [mode,value] of [['aligned',42],['width',31],['height',24]]) {
    const dimension={type:'dimension',mode,value,offset:[10,0],refs:[edge(1)]};
    const result=C.solve(changed,[dimension]);
    assert.ok(result,mode);
    close(C.dimensionValue(new Map([[1,result[0]]]),dimension),value);
    if(mode!=='aligned') assert.notEqual(G.dist(...result[0].p),50);
  }
  const vertical=[line(1,[0,0],[0,30])];
  const width={type:'dimension',mode:'width',value:10,offset:[10,0],refs:[edge(1)]};
  const solved=C.solve(vertical,[width]);
  close(Math.abs(solved[0].p[0][0]-solved[0].p[1][0]),10);
});

test('circles accept radial dimensions and construction points persist outside DXF',()=>{
  const entities=[circle(1,[5,5],2),{id:2,type:'point',p:[[4,6]],layer:'0'}];
  for(const [mode,value] of [['radius',4],['diameter',8]]) {
    const dimension={type:'dimension',mode,value,offset:[20,0],refs:[edge(1)],layer:'0'};
    const result=C.solve(entities,[dimension]);
    close(result[0].r,4);
    const doc={...F.empty(),entities:result,constraints:[dimension]};
    assert.deepEqual(F.native(JSON.stringify(doc)),doc);
    for(const r12 of [true,false]) assert.deepEqual(F.read(F.write(doc,r12)).doc.entities.map(e=>e.type),['circle']);
  }
});

test('drag orientation guard accepts translation and rejects a reflected or collapsed sized triangle',()=>{
  const triangle={id:1,type:'poly',closed:true,p:[[0,0],[10,0],[4,7]]};
  const constraints=[{type:'dimension',mode:'aligned',refs:[edge(1,0)],value:10,offset:[12,0]}];
  const translated=G.transform(triangle,p=>G.add(p,[8,4]));
  const mirrored={...triangle,p:[[0,0],[10,0],[4,-7]]};
  const collapsed={...triangle,p:[[0,0],[10,0],[4,0]]};
  assert.equal(C.preservesContourOrientation([triangle],[translated],constraints),true);
  assert.equal(C.preservesContourOrientation([triangle],[mirrored],constraints),false);
  assert.equal(C.preservesContourOrientation([triangle],[collapsed],constraints),false);
});

test('dependent dimensions can be detected and driven dimensions stay outside the solver',()=>{
  const items=[line(1,[0,0],[10,0])];
  const length={type:'dimension',mode:'aligned',refs:[edge(1)],offset:[4,0],value:10};
  const width={...length,mode:'width'};
  const horizontal=C.make('horizontal',[edge(1)],items);
  assert.equal(C.dimensionCanDrive(items,[],length),true);
  assert.equal(C.dimensionCanDrive(items,[length],length),false);
  assert.equal(C.dimensionCanDrive(items,[length,horizontal],width),false);
  const driven={...width,driven:true};
  const changed=[line(1,[0,0],[12,0])];
  assert.deepEqual(C.connected([driven],[1]),[]);
  assert.equal(C.solve(changed,[driven]),changed);
  close(C.dimensionValue(new Map([[1,changed[0]]]),driven),12);
  const doc={...F.empty(),entities:items,constraints:[length,driven]};
  assert.deepEqual(F.native(JSON.stringify(doc)),doc);
});

test('smart angle respects the placement sector and drives a pair of nonparallel segments',()=>{
  const entities=[line(1,[0,0],[20,0]),line(2,[0,0],[10,10])];
  const map=new Map(entities.map(e=>[e.id,e]));
  assert.equal(C.segmentPairMode(...entities),'angle');
  const dim={type:'dimension',mode:'angle',refs:[edge(1),edge(2)],offset:[12,0]};
  const geometry=C.dimensionGeometry(map,dim);
  const acute={...dim,rays:C.angleRays(geometry,[8,3])};
  const obtuse={...dim,rays:C.angleRays(geometry,[-3,8])};
  close(C.dimensionValue(map,acute),45);
  close(C.dimensionValue(map,obtuse),135);
  const sized={...acute,value:65};
  const solved=C.solve(entities,[sized],new Set([1]));
  assert.ok(solved);
  close(C.dimensionValue(new Map(solved.map(e=>[e.id,e])),sized),65);
  const doc={...F.empty(),entities:solved,constraints:[sized]};
  assert.deepEqual(F.native(JSON.stringify(doc)),doc);
});

test('parallel segments and point-to-line distances drive the perpendicular gap',()=>{
  const axis=line(1,[0,0],[10,0]), second=line(2,[12,5],[2,5]);
  const entities=[axis,second];
  assert.equal(C.segmentPairMode(...entities),'parallelDistance');
  const gap={type:'dimension',mode:'parallelDistance',value:8,refs:[edge(1),edge(2)],offset:[0,0]};
  const solved=C.solve(entities,[gap],new Set([1]));
  assert.ok(solved);
  close(C.dimensionValue(new Map(solved.map(e=>[e.id,e])),gap),8);
  assert.equal(C.segmentPairMode(...solved),'parallelDistance');
  const marker={id:3,type:'point',p:[[20,0]],layer:'0'};
  const distance={type:'dimension',mode:'pointDistance',value:7,refs:[point(3),edge(1)],offset:[0,0]};
  const result=C.solve([axis,marker],[distance],new Set([1]));
  assert.ok(result);
  near(result[1].p[0],[20,7]);
});

test('oblong defaults preserve equal sides and all four tangencies when translated or resized',()=>{
  const oblong={...G.shape('slot',[[0,0],[20,0],[10,3]],6),id:1,layer:'0'};
  const parts=G.slotParts(oblong);
  const constraints=C.slotConstraints(oblong);
  assert.deepEqual(constraints.map(c=>c.type),['equal','tangent','tangent','tangent','tangent','equal']);
  assert.ok(C.protectedSlot(oblong,constraints));
  assert.equal(C.protectedSlot(oblong,constraints.slice(1)),null);
  const moved=G.transform(oblong,p=>G.add(p,[8,4]));
  assert.ok(C.solve([moved],constraints,new Set([1])));
  const point=oblong.segments[0].p[1];
  const resized=G.stretchSlot(oblong,parts,point,[5,-2]);
  assert.ok(C.protectedSlot(resized,constraints));
  assert.ok(C.solve([resized],constraints,new Set([1])));
  close(resized.segments[1].r,5);
  close(resized.segments[3].r,5);
  close(G.dist(...resized.segments[0].p),25);
  close(G.dist(...resized.segments[2].p),25);
  const doc={...F.empty(),entities:[resized],constraints};
  assert.deepEqual(F.native(JSON.stringify(doc)),doc);
  assert.ok(G.slotParts(G.reverse(resized)));
});

test('an oblong can drive its straight length and width while keeping its built-in relations',()=>{
  const oblong={...G.shape('slot',[[0,0],[20,0],[10,3]],6),id:1,layer:'0'};
  const base=C.slotConstraints(oblong);
  const length={type:'dimension',mode:'aligned',refs:[edge(1,0)],offset:[8,0],value:20};
  const width={type:'dimension',mode:'parallelDistance',refs:[edge(1,0),edge(1,2)],offset:[5,0],value:6};
  const radius={type:'dimension',mode:'radius',refs:[edge(1,1)],offset:[5,0],value:3};
  assert.equal(C.dimensionCanDrive([oblong],base,length),true);
  assert.equal(C.dimensionCanDrive([oblong],[...base,length],width),true);
  assert.equal(C.dimensionCanDrive([oblong],[...base,length,width],radius),false);
  assert.equal(C.dimensionCanDrive([oblong],[...base,length],radius),true);
  const targets=[{...length,value:32},{...width,value:12}];
  const solved=C.solve([oblong],[...base,...targets]);
  assert.ok(solved);
  assert.ok(C.protectedSlot(solved[0],base));
  const map=new Map([[1,solved[0]]]);
  close(C.dimensionValue(map,length),32);
  close(C.dimensionValue(map,width),12);
  close(C.dimensionValue(map,radius),6);
  const smaller=C.solve(solved,[...base,{...targets[0],value:8},targets[1]]);
  assert.ok(C.protectedSlot(smaller[0],base));
  close(G.slotFrame(smaller[0],G.slotParts(smaller[0])).length,8);
});

const dimension=(mode,refs,value)=>({type:'dimension',mode,refs,value,offset:[0,0]});

test('collinearity aligns both the bearing and support line and round-trips in VCV',()=>{
  const reference=line(1,[0,0],[10,0]), segment=line(2,[12,3],[20,8]);
  const items=[reference,segment];
  const relation=C.make('collinear',[edge(1),edge(2)],items);
  assert.ok(relation);
  const solved=C.solve(items,[relation],new Set([1]));
  assert.ok(solved);
  for(const [,y] of solved[1].p) assert.ok(Math.abs(y)<1e-7);
  assert.deepEqual(solved[0],reference);
  const source={...F.empty(),entities:solved,constraints:[relation]};
  assert.deepEqual(F.native(JSON.stringify(source)),source);
});

test('automatic collinearity keeps segment length and only snaps forward below three degrees',()=>{
  const reference=line(1,[0,0],[10,0]), start=[10,0];
  const candidate=degrees=>G.polar(start,12,degrees*Math.PI/180);
  near(G.collinearLineEnd(reference,start,candidate(-2.9)),[22,0]);
  near(G.collinearLineEnd(reference,start,candidate(2.9)),[22,0]);
  for(const degrees of [-3,3,180]) assert.equal(G.collinearLineEnd(reference,start,candidate(degrees)),null);
});

test('tangent closure creates a circular fillet with two endpoint tangencies and a driving radius',()=>{
  const E=require('./editing');
  const a={id:1,type:'bezier',layer:'0',p:[[0,0],[3,1],[8,0],[9.96,0]]};
  const b={id:2,type:'ellipse',layer:'0',c:[5,.04],r:5,ry:3,a:0,t:0,s:Math.PI/2};
  const plan=E.closurePairs([a,b],.1,'arc');
  const result=E.closeConnections([a,b],plan,part=>({...part,id:3}));
  assert.equal(result.entities.length,1);
  const [attachment]=result.attachments;
  assert.ok(attachment);
  const arc=C.remapReference(result.adjusted,result.entities,result.remap,edge(3));
  const refs=attachment.refs.map(ref=>C.remapReference(result.adjusted,result.entities,result.remap,ref));
  const constraints=refs.map(ref=>C.make('tangent',[ref,arc],result.entities));
  const radius=dimension('radius',[arc],attachment.connector.r);
  assert.ok(constraints.every(c=>c?.contact));
  assert.equal(C.isDriving(radius),true);
  const entities=new Map(result.entities.map(e=>[e.id,e]));
  assert.ok([...constraints,radius].every(c=>C.satisfied(entities,c)));
  assert.ok(C.valid(result.entities,[...constraints,radius]));
});

test('editing rectangle side lengths preserves its original bearing and both export sizes',()=>{
  const initial={...G.shape('rect',[[.055,.41],[123.455,139.11]]),id:1,layer:'0'};
  const target=130;
  for(const angle of [0,Math.PI/7]) {
    const rotate=([x,y])=>[x*Math.cos(angle)-y*Math.sin(angle),x*Math.sin(angle)+y*Math.cos(angle)];
    let rectangle=G.transform(initial,rotate,angle);
    const constraints=C.shapeConstraints(rectangle,'rect');
    for(const index of [0,1]) {
      const size=dimension('aligned',[edge(1,index)],target);
      constraints.push(size);
      const result=C.solveDimension([rectangle],constraints,size);
      assert.ok(result);
      [rectangle]=result;
    }
    assert.ok(Math.abs(G.angle(rectangle.p[0],rectangle.p[1])-angle)<1e-8);
    for(const side of rectangle.p.map((p,i)=>G.dist(p,rectangle.p[(i+1)%4]))) assert.ok(Math.abs(side-target)<1e-5);
    if(angle!==0) continue;
    const doc={...F.empty(),entities:[rectangle]};
    const [dxf]=F.read(F.write(doc)).doc.entities;
    const d=F.writeSVG(doc).match(/<path d="([^"]+)"/)[1];
    const svgPoints=d.match(/-?[\d.]+(?:e[+-]?\d+)?/gi).map(Number);
    for(const i of [0,1]) {
      const values=dxf.p.map(p=>p[i]), svg=svgPoints.filter((_,j)=>j%2===i);
      assert.ok(Math.abs(Math.max(...values)-Math.min(...values)-target)<1e-5);
      assert.ok(Math.abs(Math.max(...svg)-Math.min(...svg)-target)<1e-5);
    }
  }
});

test('smart dimensions preserve a segment bearing unless the requested projection requires rotation',()=>{
  const segment=line(1,[0,0],[30,40]);
  const length=dimension('aligned',[edge(1)],130);
  const [longer]=C.solveDimension([segment],[length],length);
  assert.ok(Math.abs(G.angle(...longer.p)-G.angle(...segment.p))<1e-8);
  const heldLength=dimension('aligned',[edge(1)],50), width=dimension('width',[edge(1)],40);
  const [rotated]=C.solveDimension([segment],[heldLength,width],width);
  assert.ok(rotated);
  const entities=new Map([[1,rotated]]);
  assert.ok(C.satisfied(entities,heldLength));
  assert.ok(C.satisfied(entities,width));
  assert.ok(Math.abs(G.angle(...rotated.p)-G.angle(...segment.p))>.1);
});

function assertSolved(items,constraints,anchored=new Set()) {
  const snapshot=JSON.stringify(items);
  const solved=C.solve(items,constraints,anchored);
  assert.equal(JSON.stringify(items),snapshot);
  assert.ok(solved,'The sketch should have a solution');
  const map=new Map(solved.map(e=>[e.id,e]));
  for(const relation of constraints) assert.ok(C.satisfied(map,relation),JSON.stringify(relation));
  return solved;
}

test('editing the first length propagates through long chains of coincident dimensioned segments',()=>{
  for(const count of [18,64,100]) {
    const items=Array.from({length:count},(_,i)=>line(i+1,[i*10,0],[i*10+10,0]));
    const constraints=[C.make('locked',[point(1)],items)];
    for(const e of items) {
      constraints.push(C.make('horizontal',[edge(e.id)],items),dimension('aligned',[edge(e.id)],e.id===1?15:10));
      if(e.id>1) constraints.push(C.make('coincident',[point(e.id-1,1),point(e.id)],items));
    }
    const solved=assertSolved(items,constraints);
    assert.ok(G.dist(solved.at(-1).p[1],[count*10+5,0])<count*2e-7);
    const disconnected=circle(count+1,[1000,1000],2);
    const updated=assertSolved([...solved,disconnected],constraints);
    assert.equal(updated.at(-1),disconnected);
  }
});

test('a plate can resize while its holes retain margins and a shared diameter',()=>{
  const outline={id:1,type:'poly',p:[[0,0],[24,0],[24,14],[0,14]],closed:true,layer:'0'};
  const items=[outline,circle(2,[6,7],2),circle(3,[18,7],2)];
  const relations=[
    C.make('locked',[point(1)],items),
    ...['horizontal','vertical','horizontal','vertical'].map((type,i)=>C.make(type,[edge(1,i)],items)),
    C.make('equal',[edge(2),edge(3)],items),
    dimension('aligned',[edge(1)],40),dimension('aligned',[edge(1,1)],24),
    dimension('pointDistance',[point(2),edge(1,3)],10),
    dimension('pointDistance',[point(3),edge(1,1)],10),
    dimension('pointDistance',[point(2),edge(1)],12),
    dimension('pointDistance',[point(3),edge(1)],12),
    dimension('diameter',[edge(2)],6)
  ];
  const [plate,left,right]=assertSolved(items,relations);
  near(plate.p[2],[40,24]);
  near(left.c,[10,12]);near(right.c,[30,12]);
  close(left.r,3);close(right.r,3);
  assert.ok(C.preservesContourOrientation(items,[plate,left,right],relations));
  const redundant=dimension('width',[point(1),point(1,1)],40);
  assert.equal(C.dimensionCanDrive([plate,left,right],relations,redundant),false);
  const drivers=relations.filter(c=>c!==relations[7]);
  assert.equal(C.dimensionCanDrive([plate,left,right],drivers,dimension('aligned',[edge(1,1)],24)),true);
});

test('an arc with pinned ends can change radius without losing its direction',()=>{
  const arc={...G.arc([0,0],[5,5],[10,0]),id:1,layer:'0'};
  const items=[arc];
  const locks=[0,1].map(i=>C.make('locked',[point(1,i)],items));
  const [solved]=assertSolved(items,[...locks,dimension('radius',[edge(1)],7)]);
  C.vertices(solved).slice(0,2).forEach((p,i)=>near(p,C.vertices(arc)[i]));
  assert.equal(Math.sign(solved.s),Math.sign(arc.s));
  assert.equal(C.solve(items,[...locks,dimension('radius',[edge(1)],4)]),null);
});

test('a tangent contact beyond the supporting segment is brought onto the segment',()=>{
  const items=[line(1,[0,0],[10,0]),circle(2,[15,3],3)];
  const relation=C.make('tangent',[edge(1),edge(2)],items);
  const solved=assertSolved(items,[relation,dimension('radius',[edge(2)],3)],new Set([1]));
  assert.equal(solved[0],items[0]);
  near(solved[1].c,[10,3]);
});

test('a hinged link can change angle while preserving its length and shared pivot',()=>{
  const items=[line(1,[0,0],[12,0]),line(2,[0,0],[6,8])];
  const pivot=C.make('coincident',[point(1),point(2)],items);
  const angle={...dimension('angle',[edge(1),edge(2)],30),rays:[1,1]};
  const [base,link]=assertSolved(items,[pivot,angle,dimension('aligned',[edge(2)],10)],new Set([1]));
  assert.equal(base,items[0]);
  near(link.p[0],[0,0]);
  near(link.p[1],[5*Math.sqrt(3),5]);
  const blocked={...angle,value:60};
  assert.equal(C.solve([base,link],[pivot,angle,blocked],new Set([1,2])),null);
});

test('origin coincidences are fixed, persist in the drawing, and do not change DXF geometry',()=>{
  const base=F.empty(), target=[30,20];
  const layers=[{...base.layers[0],origins:[{name:'POT1',target}],activeOrigin:'POT1'},
    {name:'other',color:'#cbd9eb',visible:true}];
  const items=[line(1,[0,0],[10,0]),circle(2,target,4),{...line(3,target,[40,25]),layer:'other'}];
  const origins=layer=>[{name:'POA',target:[0,0]},...(layers.find(l=>l.name===layer).origins??[])];
  const constraints=C.automatic([],items,[],origins);
  assert.deepEqual(constraints.filter(c=>c.origin).map(c=>[c.origin,c.refs[0].id]),[['POA',1],['POT1',2]]);
  const project={...base,layers,entities:items,constraints};
  assert.deepEqual(F.native(JSON.stringify(project)),project);
  for(const legacy of [false,true]) {
    assert.equal(F.write(project,legacy),F.write({...project,layers:layers.map(({origins,activeOrigin,...layer})=>layer),constraints:[]},legacy));
  }
  const moved=[line(1,[3,0],[13,0]),items[1],items[2]];
  assert.equal(C.solve(moved,constraints,new Set([1,2,3])),null);
  const manual=C.make('coincident',[point(1),{kind:'origin',name:'POT1',target}],items);
  near(assertSolved(items,[manual])[0].p[0],target);
  const invalid={...project,constraints:[{...manual,target:[0,0]}]};
  assert.throws(()=>F.native(JSON.stringify(invalid)),/origine invalide/);
});

test('placing a rectangle center or moving a segment midpoint onto an origin binds the derived point',()=>{
  const rectangle={...G.shape('rectCenter',[[0,0],[5,3]]),id:1,layer:'0'};
  const previous=line(2,[11,20],[15,20]);
  const moved=line(2,[8,20],[12,20]);
  const origins=()=>[{name:'POA',target:[0,0]},{name:'POT1',target:[10,20]}];
  const constraints=C.automatic([previous],[rectangle,moved],[],origins).filter(c=>c.origin);
  assert.deepEqual(constraints.map(c=>c.origin),['POA','POT1']);
  assert.deepEqual(constraints[1].refs,[C.midpointRef(edge(2))]);
  const map=new Map([[1,rectangle],[2,moved]]);
  for(const constraint of constraints) assert.ok(C.satisfied(map,constraint));
  assert.equal(C.solve([rectangle,previous],constraints,new Set([1,2])),null);
  assert.equal(C.automatic([rectangle,moved],[rectangle,moved],constraints,origins).length,2);
});

test('the center of a circular arc can coincide with the absolute origin',()=>{
  const arc={...G.arc([-5,0],[0,5],[5,0]),id:1,layer:'0'};
  const [constraint]=C.automatic([],[arc],[],()=>[{name:'POA',target:[0,0]}]);
  assert.equal(constraint.origin,'POA');
  const [solved]=assertSolved([arc],[constraint,dimension('radius',[edge(1)],8)]);
  near(solved.c,[0,0]);
  close(solved.r,8);
});

test('a centered circle remains free to resize when its center coincides with another point',()=>{
  const items=[{id:1,type:'point',p:[[18,12]],layer:'0'},circle(2,[6,7],3)];
  const coincide=C.make('coincident',[point(1),point(2)],items);
  const [anchor,round]=assertSolved(items,[coincide,dimension('diameter',[edge(2)],12)],new Set([1]));
  assert.equal(anchor,items[0]);
  near(round.c,[18,12]);
  close(round.r,6);
});

test('an arc and a segment stay tangent at their junction while the arc radius changes',()=>{
  const items=[line(1,[-15,0],[0,0]),{...G.arc([0,0],[5,2],[10,10]),id:2,layer:'0'}];
  const tangent=C.make('tangent',[edge(1),edge(2)],items);
  assert.deepEqual(tangent.contact,[1,0]);
  const joined=C.make('coincident',[point(1,1),point(2)],items);
  const radius=dimension('radius',[edge(2)],8);
  const [base,arc]=assertSolved(items,[tangent,joined,radius],new Set([1]));
  assert.equal(base,items[0]);
  near(C.vertices(arc)[0],[0,0]);
  close(arc.c[0],0);
  const moved=[base,arc].map(e=>G.transform(e,p=>G.add(p,[12,19])));
  const constraints=[tangent,joined,radius];
  assertSolved(moved,constraints,new Set([1,2]));
  const doc={...F.empty(),entities:[base,arc],constraints};
  assert.deepEqual(F.native(JSON.stringify(doc)),doc);
});

test('a rectangle starts perpendicular and can be coted and moved as a group',()=>{
  const entity={...G.shape('rect',[[0,0],[16,8]]),id:1,layer:'0'};
  const defaults=C.shapeConstraints(entity,'rect');
  assert.equal(defaults.length,3);
  assert.ok(defaults.every(c=>c.type==='perpendicular'));
  const dims=[dimension('aligned',[edge(1)],25),dimension('aligned',[edge(1,1)],11)];
  const [sized]=assertSolved([entity],[...defaults,...dims]);
  close(G.dist(sized.p[0],sized.p[1]),25);
  close(G.dist(sized.p[1],sized.p[2]),11);
  const a=.4;
  const transformed=G.transform(sized,p=>[p[0]*Math.cos(a)-p[1]*Math.sin(a)+9,p[0]*Math.sin(a)+p[1]*Math.cos(a)-13],a);
  assertSolved([transformed],[...defaults,...dims],new Set([1]));
  const square=dimension('angle',[edge(1),edge(1,1)],90);
  assert.equal(C.dimensionCanDrive([sized],defaults,{...square,rays:[1,1]}),false);
});

test('a two-corner rectangle constrains the upper edge for each drawing direction',()=>{
  for(const x of [-12,12]) for(const y of [-8,8]) {
    const entity={...G.shape('rect',[[3,4],[3+x,4+y]]),id:1,layer:'0'};
    const constraints=C.shapeConstraints(entity,'rectCorners');
    assert.equal(constraints.filter(c=>c.type==='perpendicular').length,3);
    const [horizontal]=constraints.filter(c=>c.type==='horizontal');
    const entities=new Map([[1,entity]]);
    const top=C.resolve(entities,horizontal.refs[0]);
    assert.ok(top.p.every(p=>p[1]===Math.max(4,4+y)));
    assert.ok(constraints.every(c=>C.satisfied(entities,c)));
  }
});

test('a regular hexagon changes size while preserving equal edges and its 120 degree corners',()=>{
  const entity={...G.shape('polygon',[[10,12],[18,12]],6),id:1,layer:'0'};
  const shape=C.shapeConstraints(entity,'polygon');
  assert.equal(shape.filter(c=>c.type==='cornerAngle').length,6);
  assert.equal(shape.filter(c=>c.type==='equal').length,5);
  for(const c of shape.filter(c=>c.type==='cornerAngle')) close(Math.PI-Math.abs(c.value),2*Math.PI/3);
  const dim=dimension('aligned',[edge(1,2)],15);
  const [sized]=assertSolved([entity],[...shape,dim]);
  for(const p of sized.p.entries()) close(G.dist(p[1],sized.p[(p[0]+1)%6]),15);
  const moved=G.transform(sized,p=>G.add(p,[3,-8]));
  assertSolved([moved],[...shape,dim],new Set([1]));
  const doc={...F.empty(),entities:[moved],constraints:[...shape,dim]};
  assert.deepEqual(F.native(JSON.stringify(doc)),doc);
});

test('a derived center can drive a rectangle position without adding a construction entity',()=>{
  const rect={...G.shape('rect',[[5,4],[15,10]]),id:1,layer:'0'};
  const anchor={id:2,type:'point',p:[[30,20]],layer:'0'};
  const [center]=C.theoreticalReferences(rect);
  assert.equal(center.index,4);
  near(center.q,[10,7]);
  const contact=C.make('coincident',[point(1,center.index),point(2)], [rect,anchor]);
  const constraints=[...C.shapeConstraints(rect,'rect'),dimension('aligned',[edge(1)],10),
    dimension('aligned',[edge(1,1)],6),contact];
  const [solved]=assertSolved([rect,anchor],constraints,new Set([2]));
  near(C.resolve(new Map([[1,solved]]),point(1,center.index)),[30,20]);
  const doc={...F.empty(),entities:[solved,anchor],constraints};
  assert.deepEqual(F.native(JSON.stringify(doc)),doc);
  assert.equal(F.read(F.write(doc)).doc.entities.length,1);
});

test('a composite contour keeps references to its arc center through reversal',()=>{
  const arc=G.arc([0,0],[4,4],[8,0]);
  const path={id:1,type:'path',closed:true,segments:[arc,line(2,[8,0],[0,0])],layer:'0'};
  const [arcCenter,shapeCenter]=C.theoreticalReferences(path);
  assert.equal(arcCenter.part,0);
  assert.equal(shapeCenter.part,undefined);
  const lock=C.make('locked',[point(1,arcCenter.index)],[path]);
  const reversed=G.reverse(path), rebound=C.remap([path],[reversed],[lock],new Map([[1,1]]));
  const map=new Map([[1,reversed]]);
  assert.ok(rebound?.length);
  near(C.resolve(map,rebound[0].refs[0]),arc.c);
});

test('midpoint accepts point and segment in either order, with the segment anchored',()=>{
  const items=[line(1,[0,0],[12,8]),{id:2,type:'point',p:[[2,8]],layer:'0'}];
  for(const refs of [[point(2),edge(1)],[edge(1),point(2)]]) {
    const relation=C.make('midpoint',refs,items);
    const solved=assertSolved(items,[relation],new Set([1]));
    near(solved[1].p[0],[6,4]);
  }
  assert.equal(C.make('midpoint',[point(1),point(2)],items),null);
});
test('two segment midpoints are coincident and can be dimensioned as a derived point',()=>{
  const items=[line(1,[0,0],[10,0]),line(2,[2,-4],[2,4]),{id:3,type:'point',p:[[5,6]],layer:'0'}];
  const relation=C.make('midpoint',[edge(1),edge(2)],items);
  const span=dimension('height',[C.midpointRef(edge(2)),point(3)],6);
  const solved=assertSolved(items,[relation,span],new Set([1,3]));
  const map=new Map(solved.map(e=>[e.id,e]));
  near(C.resolve(map,C.midpointRef(edge(2))),[5,0]);
  const doc={...F.empty(),entities:solved,constraints:[relation,span]};
  assert.deepEqual(F.native(JSON.stringify(doc)),doc);
  assert.equal(F.read(F.write(doc)).doc.entities.length,2);
});

test('point-to-trace coincidence projects onto each supported curve without moving the support',()=>{
  const curves=[
    line(1,[0,0],[10,0]),
    circle(1,[0,0],7),
    {...G.arc([0,0],[5,5],[10,0]),id:1,layer:'0'},
    {id:1,type:'bezier',p:[[0,0],[0,10],[10,7],[10,0]],layer:'0'},
    {id:1,type:'ellipse',c:[0,0],r:9,ry:3,a:.5,layer:'0'},
    {id:1,type:'spline',p:[[0,0],[5,6],[10,0]],closed:false,layer:'0'}
  ];
  for(const curve of curves) {
    const p={id:2,type:'point',p:[[4,11]],layer:'0'};
    const items=[curve,p], segment=C.part(curve,0);
    for(const refs of [[point(2),edge(1)],[edge(1),point(2)]]) {
      const relation=C.make('coincident',refs,items);
      const [support,attached]=assertSolved(items,[relation],new Set([1]));
      assert.equal(support,curve);
      near(attached.p[0],G.nearestOnTrace(segment,attached.p[0]));
      const doc={...F.empty(),entities:[support,attached],constraints:[relation]};
      assert.deepEqual(F.native(JSON.stringify(doc)),doc);
    }
  }
});

test('point-on-segment and point-on-arc coincidence cannot leave the finite trace',()=>{
  const p={id:2,type:'point',p:[[14,-3]],layer:'0'};
  const segment=line(1,[0,0],[10,0]);
  let items=[segment,p];
  near(assertSolved(items,[C.make('coincident',[point(2),edge(1)],items)],new Set([1]))[1].p[0],[10,0]);
  const arc={...G.arc([0,0],[5,5],[10,0]),id:1,layer:'0'};
  items=[arc,p];
  near(assertSolved(items,[C.make('coincident',[edge(1),point(2)],items)],new Set([1]))[1].p[0],[10,0]);
  assert.equal(C.make('coincident',[edge(1),edge(2)],[segment,circle(2,[0,0],4)]),null);
});

test('an arc endpoint follows the pointer while retaining the other endpoint and radius when possible',()=>{
  const arc={...G.arc([0,0],[5,3],[10,0]),id:1,layer:'0'};
  const target=[9,2], [moved]=C.solveArcEndpoint([arc],[],arc,1,target);
  near(C.vertices(moved)[0],[0,0]);near(C.vertices(moved)[1],target);
  close(moved.r,arc.r);
  assert.equal(Math.sign(moved.s),Math.sign(arc.s));
  const [longer]=C.solveArcEndpoint([arc],[],arc,1,[30,0]);
  near(C.vertices(longer)[1],[30,0]);close(longer.r,15);
});

test('an arc with a locked center, a radius dimension and a linked endpoint follows its circle',()=>{
  const arc={...G.arc([0,0],[5,5],[10,0]),id:1,layer:'0'};
  const pointEntity={type:'point',p:[[0,0]],id:2,layer:'0'};
  const items=[arc,pointEntity];
  const relations=[C.make('locked',[point(1,2)],items),C.make('locked',[point(2)],items),
    C.make('coincident',[point(1),point(2)],items),dimension('radius',[edge(1)],5)];
  const solved=C.solveArcEndpoint(items,relations,arc,1,[9,8]);
  assert.ok(solved);
  const [moved,anchor]=solved;
  const projected=G.polar(arc.c,arc.r,G.angle(arc.c,[9,8]));
  near(C.vertices(moved)[1],projected);near(C.vertices(moved)[0],[0,0]);
  near(moved.c,arc.c);close(moved.r,arc.r);assert.equal(anchor,pointEntity);
  assert.ok(relations.every(c=>C.satisfied(new Map(solved.map(e=>[e.id,e])),c)));
});

test('a driving radius bounds an arc endpoint at the largest possible chord',()=>{
  const arc={...G.arc([0,0],[5,3],[10,0]),id:1,layer:'0'};
  const constraints=[C.make('locked',[point(1)],[arc]),dimension('radius',[edge(1)],arc.r)];
  const [moved]=C.solveArcEndpoint([arc],constraints,arc,1,[20,0]);
  close(moved.r,arc.r);near(C.vertices(moved)[0],[0,0]);
  near(C.vertices(moved)[1],[2*arc.r,0]);
});

test('a dimension formula is preserved alongside its solved value in the native project',()=>{
  const item=line(1,[0,0],[25,0]);
  const constraint={...dimension('aligned',[edge(1)],25),expression:'(3 + 2)**2'};
  const doc={...F.empty(),entities:[item],constraints:[constraint]};
  assert.deepEqual(F.native(JSON.stringify(doc)),doc);
  assert.equal(C.dimensionValue(new Map([[1,item]]),constraint),25);
});

test('a tangent polyline can chain a line and arcs, including two spans of one circle',()=>{
  const first=line(1,[-5,0],[0,0]);
  const a=G.tangentArc(first,[5,5]), b=G.tangentArc(a,[0,10]);
  assert.ok(a&&b);
  near(a.c,[0,5]);near(b.c,a.c);
  const entity={id:1,type:'path',segments:[first,a,b],closed:false,layer:'0'};
  const contacts=[C.make('tangent',[edge(1,0),edge(1,1)],[entity]),C.make('tangent',[edge(1,1),edge(1,2)],[entity])];
  assert.deepEqual(contacts.map(c=>c.contact),[[1,0],[1,0]]);
  assert.ok(contacts.every(c=>C.satisfied(new Map([[1,entity]]),c)));
  assert.equal(G.tangentArc(first,[10,0]),null);
  const doc={...F.empty(),entities:[entity],constraints:contacts};
  assert.deepEqual(F.native(JSON.stringify(doc)),doc);
});

test('a line leaving an arc snaps only within three degrees of its forward tangent',()=>{
  for(const sign of [-1,1]) {
    const arc={type:'arc',c:[0,0],r:5,a:-sign*Math.PI/2,s:sign*Math.PI/2};
    const start=[5,0], heading=sign*Math.PI/2;
    for(const offset of [-2.9,0,2.9]) {
      const end=G.tangentLineEnd(arc,start,G.polar(start,10,heading+offset*Math.PI/180));
      near(end,[5,sign*10]);
      const entity={id:1,type:'path',segments:[arc,line(1,start,end)],closed:false,layer:'0'};
      const contact=C.make('tangent',[edge(1,0),edge(1,1)],[entity]);
      assert.deepEqual(contact.contact,[1,0]);
      assert.ok(C.satisfied(new Map([[1,entity]]),contact));
    }
    for(const offset of [-3,3,3.1,180])
      assert.equal(G.tangentLineEnd(arc,start,G.polar(start,10,heading+offset*Math.PI/180)),null);
    assert.equal(G.tangentLineEnd(arc,start,start),null);
  }
});

test('equal selection solves separate length and radius groups in one batch',()=>{
  const items=[
    line(1,[0,0],[10,0]),line(2,[0,5],[7,5]),line(3,[0,9],[13,9]),
    {id:4,type:'circle',c:[30,0],r:6},
    {id:5,type:'arc',c:[50,0],r:4,a:0,s:Math.PI/2},
    {id:6,type:'circle',c:[70,0],r:9},
    {id:7,type:'ellipse',c:[90,0],rx:3,ry:2,a:0}
  ];
  const entities=new Map(items.map(e=>[e.id,e]));
  const refs=[edge(1),edge(4),edge(7),edge(2),edge(5),edge(1),edge(3),edge(6)];
  const constraints=C.equalSelection(entities,refs);
  assert.deepEqual(constraints.map(c=>c.refs.map(ref=>ref.id)),[[1,2],[4,5],[1,3],[4,6]]);
  const solved=C.solve(items,constraints,new Set([1,4]));
  assert.ok(solved);
  const result=new Map(solved.map(e=>[e.id,e]));
  assert.ok(constraints.every(c=>C.satisfied(result,c)));
  for(const id of [1,4,7]) assert.deepEqual(result.get(id),entities.get(id));
});

test('a construction centerline stays attached to both arc centers as the slot moves and changes length',()=>{
  const slot={...G.shape('slot',[[0,0],[20,0],[10,3]],6),id:1,layer:'0'};
  const axis=C.slotCenterline(slot,2,'dashed');
  assert.equal(G.constructionAt(axis.line),'dashed');
  const constraints=[...C.slotConstraints(slot),...axis.constraints];
  const doc={...F.empty(),entities:[slot,axis.line],constraints};
  assert.deepEqual(F.native(JSON.stringify(doc)),doc);
  const moved={...G.shape('slot',[[4,7],[34,7],[10,10]],6),id:1,layer:'0'};
  const solved=C.solve([moved,axis.line],constraints,new Set([slot.id]));
  assert.ok(solved);
  assert.deepEqual(solved[0],moved);
  near(solved[1].p[0],[34,7]);near(solved[1].p[1],[4,7]);
});

test('point-to-point dimensions measure and drive endpoints of straight and curved geometry',()=>{
  const items=[
    {id:1,type:'point',p:[[0,0]],construction:'dashed'},
    line(2,[2,1],[6,8]),
    {id:3,type:'arc',c:[6,3],r:5,a:0,s:Math.PI/2},
    {id:4,type:'bezier',p:[[2,1],[3,3],[5,6],[6,8]]},
    {id:5,type:'ellipse',c:[6,5],r:5,ry:3,a:0,t:0,s:Math.PI/2}
  ];
  const entities=new Map(items.map(e=>[e.id,e]));
  const a=[0,0], b=[60,80];
  assert.equal(C.linearDimensionMode(a,b,[30,40],1),'aligned');
  assert.equal(C.linearDimensionMode(a,b,[30,110],1),'width');
  assert.equal(C.linearDimensionMode(a,b,[95,40],1),'height');
  for(const item of items.slice(1)) for(const [mode,measurement] of [['aligned',10],['width',6],['height',8]]) {
    const initial=dimension(mode,[point(1),point(item.id,1)],measurement);
    close(C.dimensionValue(entities,initial),measurement);
    const edited={...initial,value:measurement+1};
    const solved=C.solve([items[0],item],[edited],new Set([1]));
    assert.ok(solved,item.type+' '+mode);
    assert.ok(C.satisfied(new Map(solved.map(e=>[e.id,e])),edited));
  }
});

test('dimensions resolve arc and ellipse centers and follow derived midpoints',()=>{
  const arc={id:1,type:'arc',c:[3,4],r:6,a:0,s:Math.PI};
  const ellipse={id:2,type:'ellipse',c:[13,4],r:6,ry:3,a:0,t:0,s:Math.PI};
  const entities=new Map([[1,arc],[2,ellipse]]);
  const centers=dimension('aligned',[point(1,2),point(2,2)],10);
  close(C.dimensionValue(entities,centers),10);
  const midpoint=C.midpointRef(edge(1));
  const rise=dimension('height',[point(1,2),midpoint],6);
  close(C.dimensionValue(entities,rise),6);
  entities.set(1,{...arc,r:8});
  close(C.dimensionValue(entities,rise),8);
  const flipped={...G.reverse(arc),id:3};
  assert.deepEqual(C.remapReference([arc],[flipped],new Map([[1,3]]),midpoint),C.midpointRef(edge(3)));
});

test('dimensions drive geometry from the POA or POT without treating origins as moving entities',()=>{
  const poa={kind:'origin',name:'POA',target:[0,0]};
  const pot={kind:'origin',name:'POT1',target:[3,4]};
  const item={id:1,type:'point',p:[[8,12]],layer:'0'};
  const other={id:2,type:'point',p:[[2,3]],layer:'0'};
  const fromPot={...dimension('width',[point(1),pot],7),layer:'0'};
  const fromPoa={...dimension('height',[poa,point(2)],3),layer:'0'};
  const between={...dimension('aligned',[poa,pot],5),layer:'0',driven:true};
  assert.deepEqual(C.connected([fromPot,fromPoa,between],[1]),[fromPot]);
  assert.equal(C.dimensionCanDrive([item,other],[],between),false);
  const solved=C.solve([item,other],[fromPot,fromPoa]);
  assert.ok(solved);
  near(solved[0].p[0],[10,12]);
  const doc=F.empty();
  doc.layers[0].origins=[{name:pot.name,target:pot.target}];
  doc.entities=solved;
  doc.constraints=[fromPot,fromPoa,between];
  assert.deepEqual(F.native(JSON.stringify(doc)),doc);
  assert.throws(()=>F.native(JSON.stringify({...doc,layers:F.empty().layers})),/Cote d’origine/);
});

test('movement records newly aligned axes, midpoint and perpendicular contacts without distant angles',()=>{
  const base=line(1,[0,0],[20,0]);
  const before=[base,line(2,[10,1],[12,6]),line(3,[30,12],[36,14]),line(4,[10,23],[20,24])];
  const moved=[base,line(2,[10,0],[10,6]),line(3,[30,12],[36,12]),line(4,[10,23],[10,24])];
  const relations=C.movementRelations(before,moved,[]);
  assert.deepEqual(relations.map(c=>c.type).sort(),['horizontal','midpoint','perpendicular','vertical','vertical']);
  const entities=new Map(moved.map(e=>[e.id,e]));
  assert.ok(relations.every(c=>C.satisfied(entities,c)));
  assert.equal(C.movementRelations(moved,moved,relations).length,relations.length);
  assert.equal(C.movementRelations(before,moved,[],()=>true,e=>e.id!==1).some(c=>c.type==='perpendicular'),false);
});
