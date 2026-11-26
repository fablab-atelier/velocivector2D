'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const G=require('./geometry'), F=require('./formats'), C=require('./constraints'), I=require('./importing');
const near=(a,b)=>assert.ok(G.dist(a,b)<1e-7,JSON.stringify([a,b]));
const line=(a,b,layer='Plans')=>({type:'line',p:[a,b],layer});

test('import reports attribute grouped segments, duplicate removal, recognition and constraints to their stages',()=>{
  const segments=[line([0,0],[5,0]),line([5,0],[10,0]),line([10,0],[5,0]),line([10,0],[10,8])];
  const proposal=I.propose(segments,{join:true,deduplicate:true,lineTolerance:.05,axes:true});
  assert.equal(proposal.report.duplicateLines,1);
  assert.equal(proposal.report.chains,1);
  assert.equal(proposal.report.lines,1);
  assert.equal(proposal.report.automatic.horizontal,1);
  assert.equal(proposal.report.automatic.vertical,1);
  const source=I.propose(segments,{join:false,deduplicate:false,axes:false});
  assert.equal(source.report.duplicateLines,0);
  assert.equal(source.report.chains,0);
  assert.equal(source.report.automatic.horizontal,0);
});

test('overlap detection clips partial segments by tolerance and never compares different layers',()=>{
  const reference=line([0,0],[10,0],'A');
  const reversed=line([7,.04],[3,.04],'A');
  const crossing=line([5,-1],[5,1],'A');
  const adjoining=line([10,0],[12,0],'A');
  const otherLayer={...reversed,layer:'B'};
  assert.deepEqual(I.overlappingTraces([reference,reversed,crossing,adjoining,otherLayer],.03),[]);
  assert.deepEqual(I.overlappingTraces([reference,reversed,crossing,adjoining,otherLayer],.05),
    [{layer:'A',traces:[[[3,0],[7,0]]]}]);
});

test('overlap detection handles partial arcs and reports duplicates in the source before optimization',()=>{
  const a={type:'arc',c:[0,0],r:10,a:0,s:Math.PI/2,layer:'A'};
  const b={...a,r:10.03,a:Math.PI/6,s:Math.PI/6};
  assert.equal(I.overlappingTraces([a,b],.02).length,0);
  const [overlap]=I.overlappingTraces([a,b],.05);
  assert.equal(overlap.layer,'A');
  const [run]=overlap.traces;
  const angles=run.map(p=>G.angle(a.c,p));
  assert.ok(Math.min(...angles)>=Math.PI/6-.001);
  assert.ok(Math.max(...angles)<=Math.PI/3+.001);
  const duplicated=[line([0,0],[10,0]),line([10,0],[0,0])];
  assert.equal(I.overlappingTraces(duplicated,.05).length,1);
  assert.equal(I.overlappingTraces(I.optimize(duplicated),.05).length,0);
});

test('DXF proposal closes contours by source layer before final layer consolidation',()=>{
  const segments=[
    line([0,0],[9.96,0],'A'),line([10,.04],[10,10],'A'),
    line([10,10],[0,10],'A'),line([0,10],[0,0],'A'),
    line([30,20],[39.96,20],'A'),line([40,20.04],[40,30],'B')
  ];
  const options={join:false,axes:true,coincident:true,tangent:true,junction:true,junctionMethod:'contact'};
  const narrow=I.propose(segments,{...options,junctionTolerance:.03});
  const result=I.propose(segments,{...options,junctionTolerance:.1});
  assert.equal(I.contourCounts(narrow.entities).get('A').closed,0);
  assert.deepEqual([...I.contourCounts(result.entities)],[['A',{open:1,closed:1}],['B',{open:1,closed:0}]]);
  assert.equal(result.junctions,4);
  const circle=result.entities.find(e=>e.closed);
  const sides=result.constraints.filter(c=>c.refs[0].id===circle.id&&['horizontal','vertical'].includes(c.type));
  assert.equal(sides.length,4);
  let next=100;
  const placed=I.placeProposal(result,e=>({...e,id:next++}),1,'Destination');
  assert.ok(placed.entities.every(e=>e.layer==='Destination'));
  assert.deepEqual(I.contourCounts(placed.entities).get('Destination'),{open:2,closed:1});
  assert.ok(C.valid(placed.entities,placed.constraints));
});

test('DXF tangent junctions retain driving radii and tangencies after unit and layer conversion',()=>{
  const segments=[line([0,0],[9.96,0],'A'),line([10,.04],[10,10],'A')];
  const proposal=I.propose(segments,{join:false,axes:true,junction:true,junctionTolerance:.1,junctionMethod:'arc'});
  assert.equal(proposal.junctions,1);
  assert.equal(proposal.constraints.filter(c=>c.type==='tangent').length,2);
  const radius=proposal.constraints.find(c=>c.mode==='radius');
  assert.equal(C.isDriving(radius),true);
  near([radius.value,0],[.04,0]);
  let next=5;
  const placed=I.placeProposal(proposal,e=>({...e,id:next++}),.1,'Destination');
  const placedRadius=placed.constraints.find(c=>c.mode==='radius');
  near([placedRadius.value,0],[.004,0]);
  assert.equal(placedRadius.layer,'Destination');
  const map=new Map(placed.entities.map(e=>[e.id,e]));
  assert.ok(placed.constraints.every(c=>C.satisfied(map,c)));
});

test('thousands of DXF segments are compacted into a line without crossing layers or branches',()=>{
  const fragments=Array.from({length:2200},(_,i)=>line([i/10,0],[(i+1)/10,0]));
  const source={...F.empty(),layers:[{name:'Plans',color:'#cbd9eb',visible:true}],entities:fragments};
  const imported=F.read(F.write(source)).doc;
  assert.equal(I.weight(imported.entities),2200);
  const result=I.optimize(imported.entities);
  assert.equal(I.weight(result),1);
  near(result[0].p[0],[0,0]);near(result[0].p[1],[220,0]);
  const tee=I.optimize([...fragments,line([100,0],[100,5]),line([0,0],[10,0],'Autre')]);
  assert.equal(tee.filter(e=>e.layer==='Plans').length,3);
  assert.equal(tee.filter(e=>e.layer==='Autre').length,1);
});

test('dense arcs, circles and straight runs are recognized within their vertex tolerances',()=>{
  const arcPoints=Array.from({length:601},(_,i)=>G.polar([10,20],30,i*Math.PI/600));
  const round=Array.from({length:120},(_,i)=>G.polar([25,-40],10+.03*Math.sin(i),i*G.tau/120));
  const [arc,circle]=I.optimize([
    {type:'poly',p:arcPoints,closed:false,layer:'Plans'},
    {type:'poly',p:round,closed:true,layer:'Plans'}
  ],{join:false});
  assert.equal(arc.type,'arc');assert.equal(circle.type,'circle');
  near(G.trace(arc)[0],arcPoints[0]);near(G.trace(arc).at(-1),arcPoints.at(-1));
  assert.ok(round.every(p=>Math.abs(G.dist(p,circle.c)-circle.r)<=.15));
  const polygon={type:'poly',p:[[0,0],[5,0],[10,0],[10,5],[0,5]],closed:true};
  const [clean]=I.optimize([polygon]);
  assert.equal(clean.type,'poly');assert.equal(clean.p.length,4);
  assert.notEqual(I.optimize([{type:'poly',p:round,closed:true}],{arcTolerance:0})[0].type,'circle');
});

test('SVG groups preserve layer names, physical units, native curves and rounded corners',()=>{
  const node=(localName,attrs={},children=[])=>({localName,children,getAttribute:key=>attrs[key]??null});
  const root=node('svg',{width:'100mm',height:'50mm',viewBox:'0 0 100 50'},[
    node('g',{'inkscape:label':'Contour',transform:'translate(10 0)'},[
      node('path',{d:'M 0 10 H 20 A 5 5 0 0130 10 C 33 12 38 4 40 10'}),
      node('rect',{x:5,y:15,width:20,height:10,rx:2}),
      node('ellipse',{cx:17,cy:37,rx:8,ry:3,transform:'rotate(15 17 37)'}),
      node('image')
    ])
  ]);
  const {doc,skipped}=I.readSVG('',()=>({documentElement:root,querySelector:()=>null}));
  assert.equal(doc.units,4);
  assert.deepEqual(doc.entities.map(e=>e.layer),['Contour','Contour','Contour']);
  const [path,rect,ellipse]=doc.entities;
  near(path.segments[0].p[0],[10,40]);
  assert.deepEqual(path.segments.map(e=>e.type),['line','arc','bezier']);
  assert.equal(rect.segments.filter(e=>e.type==='arc').length,4);
  assert.ok(rect.closed);
  assert.equal(ellipse.type,'ellipse');
  assert.deepEqual(skipped,[['image',1]]);
});

test('SVG export keeps the POA for displaced paths in both positive and negative coordinates',()=>{
  for(const points of [[[30,20],[50,60]],[[-30,-20],[50,60]]]) {
    const source=F.empty();
    source.entities=[line(...points,'0')];
    const svg=F.writeSVG(source);
    const attrs=Object.fromEntries([...svg.matchAll(/\s(width|height|viewBox|data-velocivector-poa|transform)="([^"]+)"/g)]
      .map(([,key,value])=>[key,value]));
    const [left,top,width,height]=attrs.viewBox.split(' ').map(Number);
    const [poaX,poaY]=attrs['data-velocivector-poa'].split(' ').map(Number);
    assert.equal(left,0);assert.equal(top,0);
    if(points[0][0]>0) {assert.equal(poaX,0);assert.equal(poaY,height);}
    else {assert.ok(poaX>-points[0][0]);assert.ok(height-poaY>-points[0][1]);}
    assert.ok(width>50);
    const node=(localName,attributes,children=[])=>({localName,children,getAttribute:key=>attributes[key]??null});
    const root=node('svg',attrs,[node('path',{d:svg.match(/<path d="([^"]+)"/)[1]})]);
    const {doc}=I.readSVG('',()=>({documentElement:root,querySelector:()=>null}));
    near(doc.entities[0].p[0],points[0]);near(doc.entities[0].p[1],points[1]);
  }
});

test('imported axes, shared points and tangencies are inferred without modifying existing entities',()=>{
  const before=[{...line([-5,0],[0,0]),id:1}];
  const arc={...G.arc([10,0],[15,5],[10,10]),layer:'Plans',id:3};
  const added=[{...line([0,0],[10,0]),id:2},arc];
  const items=[...before,...added], map=new Map(items.map(e=>[e.id,e]));
  const relations=I.relations(before,items,[],{coincident:true,tangent:true,axes:true});
  assert.ok(relations.some(c=>c.type==='horizontal'&&c.refs[0].id===2));
  assert.ok(relations.some(c=>c.type==='coincident'&&c.refs.some(r=>r.id===1)));
  assert.ok(relations.some(c=>c.type==='tangent'));
  assert.ok(relations.every(c=>C.satisfied(map,c)));
});

test('an S curve can be reconstructed with cubic Béziers within the requested tolerance',()=>{
  const curve={type:'bezier',p:[[0,0],[15,30],[35,-30],[50,0]]};
  const source={type:'poly',p:Array.from({length:401},(_,i)=>G.controls(curve,i/400)),closed:false,layer:'Plans'};
  const tolerance=.10;
  const output=I.optimize([source],{lineTolerance:.02,arcTolerance:.02,bezierTolerance:tolerance});
  const parts=output.flatMap(e=>e.segments??[e]);
  assert.ok(parts.some(e=>e.type==='bezier'));
  assert.ok(I.weight(output)<I.weight(I.optimize([source],{lineTolerance:.02,arcTolerance:.02,bezierTolerance:0})));
  near(G.trace(output[0])[0],source.p[0]);
  near(G.trace(output.at(-1)).at(-1),source.p.at(-1));
  for(const p of source.p) {
    const distance=Math.min(...parts.map(e=>G.dist(p,G.nearestOnTrace(e,p))));
    assert.ok(distance<=tolerance+1e-7,distance);
  }
});

test('a ring with widely spaced corners is kept polygonal when the arc would leave the source beyond tolerance',()=>{
  const source={type:'poly',p:Array.from({length:8},(_,i)=>G.polar([0,0],10,i*G.tau/8)),closed:true};
  const [output]=I.optimize([source],{lineTolerance:.1,arcTolerance:.15,bezierTolerance:0});
  assert.equal(output.type,'poly');
  assert.equal(output.p.length,8);
});

test('optimized adjacent Béziers use the same tangent on both sides of a smooth join',()=>{
  const p=Array.from({length:401},(_,i)=>[i/5,8*Math.sin(i/24)]);
  const [result]=I.optimize([{type:'poly',p,closed:false}],{lineTolerance:.04,arcTolerance:.04,bezierTolerance:.12});
  const joins=G.bezierJunctions(result).filter(k=>k?.incoming&&k.outgoing);
  assert.ok(joins.length>=3);
  for(const {index} of joins) assert.equal(G.bezierKnot(result,index).setting.splitAngles,false);
});

test('symmetric handles are optional and only used when both neighboring curves fit the tolerance',()=>{
  const entity={type:'path',closed:false,segments:[
    {type:'bezier',p:[[0,0],[2,2],[4,2],[6,2]]},
    {type:'bezier',p:[[6,2],[7,2],[9,3],[12,6]]}
  ]};
  const raw=I.optimize([entity],{symmetricHandles:false,bezierTolerance:.3});
  assert.deepEqual(raw,[entity]);
  assert.deepEqual(I.bezierHandleCounts(raw),{symmetric:0,asymmetric:1});
  const tight=I.optimize([entity],{bezierTolerance:.1});
  assert.deepEqual(I.bezierHandleCounts(tight),{symmetric:0,asymmetric:1});
  const loose=I.optimize([entity],{bezierTolerance:.3});
  assert.deepEqual(I.bezierHandleCounts(loose),{symmetric:1,asymmetric:0});
  const report=I.propose([entity],{bezierTolerance:.3}).report;
  assert.equal(report.symmetrized,1);
  assert.deepEqual(report.handles,{symmetric:1,asymmetric:0});
  near(loose[0].segments[0].p[3],entity.segments[0].p[3]);
  for(const [index,curve] of loose[0].segments.entries()) for(let i=0;i<=100;i++) {
    assert.ok(G.dist(G.controls(curve,i/100),G.controls(entity.segments[index],i/100))<=.3);
  }
  assert.equal(I.weight(loose),I.weight(raw));
});

test('import optimization and overlap diagnostics emit progress without changing the result',()=>{
  const entities=[line([0,0],[10,0]),line([3,.01],[7,.01])];
  const options={...I.importDefaults,junction:false}, phases=[];
  const proposal=I.propose(entities,options,(...update)=>phases.push(update));
  assert.deepEqual(proposal,I.propose(entities,options));
  assert.deepEqual(phases,[['recognition',0,2],['recognition',2,2],['relations']]);
  const scan=[];
  assert.deepEqual(I.overlappingTraces(entities,.05,(...update)=>scan.push(update)),I.overlappingTraces(entities,.05));
  assert.deepEqual(scan,[[0,2],[2,2]]);
});

test('overlap removal trims partial and repeated overlaps per layer and leaves crossings intact',()=>{
  const entities=[line([0,0],[6,0]),line([3,0],[8,0]),line([5,0],[9,0]),
    line([4,-2],[4,2]),line([0,0],[9,0],'Autre')];
  const options={...I.importDefaults,join:false,deduplicate:false,junction:false,removeOverlaps:true};
  const proposal=I.propose(entities,options);
  assert.equal(proposal.report.removedOverlaps,2);
  assert.equal(I.overlappingTraces(proposal.entities,.05).length,0);
  for(const [index,p] of [[[0,0],[6,0]],[[6,0],[8,0]],[[8,0],[9,0]]].entries()) {
    p.forEach((point,i)=>near(proposal.entities[index].p[i],point));
  }
  assert.deepEqual(proposal.entities.slice(3).map(({id,...e})=>e),entities.slice(3));
  assert.deepEqual(I.propose(entities,{...options,removeOverlaps:false}).entities.map(({id,...e})=>e),entities);
});

test('overlap removal retains one of two identical curves and builds constraints after trimming',()=>{
  const curve={type:'bezier',p:[[0,0],[3,5],[7,5],[10,0]],layer:'Plans'};
  const entities=[curve,{...curve,p:[...curve.p].reverse()},line([10,0],[11,0])];
  const proposal=I.propose(entities,{...I.importDefaults,junction:false,removeOverlaps:true});
  assert.equal(proposal.report.removedOverlaps,1);
  assert.equal(proposal.entities.length,2);
  assert.equal(proposal.report.automatic.coincident,1);
});
