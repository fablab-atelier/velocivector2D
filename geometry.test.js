'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const G=require('./geometry.js');
const F=require('./formats.js');
const near=(a,b)=>assert.ok(G.dist(a,b)<1e-8, JSON.stringify({a,b}));
const withLayer=e=>({...e,layer:'0'});

test('SVG exports native paths and physical size while omitting construction geometry',()=>{
  const doc=F.empty();
  doc.layers[0].name='Pièce & contour';
  doc.entities=[
    {type:'line',p:[[0,0],[20,0]]},
    {type:'arc',c:[10,5],r:5,a:0,s:Math.PI},
    {type:'ellipse',c:[10,5],r:6,ry:3,a:0,t:0,s:-Math.PI/2},
    {type:'bezier',p:[[0,0],[0,4],[10,4],[10,0]]},
    {type:'circle',c:[10,5],r:2},
    {type:'line',p:[[100,100],[200,200]],construction:'dashed'},
    {type:'point',p:[[300,300]]}
  ].map(e=>({...e,layer:doc.layers[0].name}));
  const svg=F.writeSVG(doc);
  assert.match(svg,/width="20\.075mm"/);
  assert.match(svg,/label="Pièce &amp; contour"/);
  assert.match(svg,/M 0 10\.075 L 20 10\.075/);
  assert.match(svg,/A 5 5 0 0 0/);
  assert.match(svg,/A 6 3 0 0 1/);
  assert.match(svg,/C 0 6\.[\d]+ 10 6\.[\d]+ 10 10\.075/);
  assert.match(svg,/<circle cx="10" cy="5\.[\d]+" r="2"/);
  assert.doesNotMatch(svg,/transform=/);
  assert.doesNotMatch(svg,/100|200 200|300 300/);
});

test('DXF model space has valid ownership handles and Windows-1252 layer names',()=>{
  const doc=F.empty(), name='Pièce € / 測試';
  doc.layers=[{name,color:'#113355',visible:true}];
  doc.entities=[{type:'line',layer:name,p:[[-27,19],[40,-68]]}];
  const bytes=F.dxfBytes(F.write(doc)), text=F.decodeDXF(bytes);
  assert.match(text,/\$INSBASE\r\n10\r\n0\r\n20\r\n0\r\n30\r\n0/);
  assert.match(text,/\$DWGCODEPAGE\r\n3\r\nANSI_1252/);
  const modelSpace=text.match(/0\r\nBLOCK_RECORD\r\n5\r\n([0-9A-F]+)[\s\S]*?\r\n2\r\n\*Model_Space/)[1];
  assert.match(text,new RegExp('0\r\nLINE\r\n5\r\n[0-9A-F]+\r\n330\r\n'+modelSpace+'\r\n'));
  const [line]=F.read(text).doc.entities;
  assert.deepEqual(line.p,doc.entities[0].p);
  assert.equal(line.layer,'Pièce € _ 測試');
});

test('DXF R12 and R14 identify their versions and export physical coordinates in millimeters',()=>{
  const doc=F.empty();doc.units=5;
  doc.entities=[
    withLayer({type:'line',p:[[30,20],[50,60]]}),
    withLayer({type:'bezier',p:[[0,0],[1,3],[4,5],[7,6]]})
  ];
  const r12=F.write(doc,'r12'), r14=F.write(doc,'r14');
  assert.match(r12,/\$ACADVER\r\n1\r\nAC1009/);
  assert.match(r14,/\$ACADVER\r\n1\r\nAC1014/);
  for(const raw of [r12,r14]) assert.deepEqual(F.read(raw).doc.entities[0].p,[[300,200],[500,600]]);
  assert.equal(F.read(r12).doc.entities[1].type,'poly');
  assert.equal(F.read(r14).doc.entities[1].type,'bezier');
});

test('export scope can isolate selected segments or layers and include construction in either format',()=>{
  const doc=F.empty();
  doc.layers.push({name:'Gabarit',color:'#335577',visible:false});
  doc.entities=[
    G.withConstruction({id:1,type:'poly',p:[[0,0],[10,0],[10,15]],closed:false,layer:'0'},'dashDot',1),
    {id:2,type:'line',p:[[40,0],[45,0]],layer:'Gabarit'},
    {id:3,type:'point',p:[[0,0]],layer:'0'}
  ];
  const selected=F.exportSubset(doc,{selectedIds:new Set([1,3]),selectedSegments:new Map([[1,new Set([1])]])});
  assert.deepEqual(selected.layers.map(layer=>layer.name),['0']);
  assert.deepEqual(selected.entities,[{type:'line',p:[[10,0],[10,15]],construction:'dashDot',layer:'0'}]);
  assert.equal(F.hasExportGeometry(selected,false),false);
  assert.equal(F.hasExportGeometry(selected,true),true);
  assert.match(F.writeSVG(selected,{includeConstruction:true}),/stroke-dasharray="8 3 1 3".*M 10 15\.075 L 10 0\.[\d]+/);
  const dxf=F.write(selected,false,{includeConstruction:true});
  assert.match(dxf,/6\r\nVCV_TIRET_POINT\r\n/);
  assert.equal(F.read(dxf).doc.entities.length,1);
  assert.doesNotMatch(F.write(selected),/VCV_TIRET_POINT/);
  const byLayer=F.exportSubset(doc,{layerNames:new Set(['Gabarit'])});
  assert.deepEqual(byLayer.entities,[doc.entities[1]]);
  assert.deepEqual(byLayer.layers,[doc.layers[1]]);
  assert.deepEqual(F.exportSubset(doc).entities,[doc.entities[0],doc.entities[1]]);
});

test('arc through three points keeps traversal direction',()=>{
  const a=G.arc([1,0],[0,-1],[-1,0]);
  near(a.c,[0,0]);
  assert.equal(a.s,-Math.PI);
  near(G.trace(a).at(-1),[-1,0]);
  assert.equal(G.arc([0,0],[1,0],[2,0]),null);
});

test('slot preserves overall length and joins lines to semicircles',()=>{
  const slot=G.shape('slot',[[0,0],[25,0],[12,3]],6,true);
  assert.equal(slot.closed,true);
  assert.equal(slot.segments.filter(e=>e.type==='arc').length,2);
  for(let i=0;i<slot.segments.length;i++) {
    near(G.trace(slot.segments[i]).at(-1),G.trace(slot.segments[(i+1)%4])[0]);
  }
  near(G.snapFeatures(slot).find(({q})=>G.dist(q,[25,0])<1e-8).q,[25,0]);
});

test('uniform transformations preserve arc radius and scaled ellipse axes',()=>{
  const arc=G.arc([1,0],[0,1],[-1,0]);
  const flipped=G.transform(arc,([x,y])=>[2*x,-2*y],0,2,true);
  assert.equal(flipped.r,2);
  assert.equal(flipped.s,-arc.s);
  const ellipse=G.shape('ellipse',[[0,0],[3,0],[0,8]],6);
  assert.equal(G.transform(ellipse,p=>G.mul(p,2),0,2).ry,16);
});

test('native format round-trips and validates geometry and layer references',()=>{
  const doc=F.empty();doc.entities.push(withLayer(G.shape('circle',[[2,3],[4,3]],6)));
  assert.deepEqual(F.native(JSON.stringify(doc)),doc);
  assert.throws(()=>F.native(JSON.stringify({...doc,version:2})),/incompatible/);
  doc.entities[0].layer='absent';
  assert.throws(()=>F.native(JSON.stringify(doc)),/invalide/);
});

test('DXF 2000 round-trip preserves mixed paths, ellipse shape and cubic control points',()=>{
  const doc=F.empty();
  for(const [name,points] of [
    ['line',[[0,0],[2,3]]],['circle',[[1,2],[4,2]]],['arc',[[1,0],[0,-1],[-1,0]]],
    ['rect',[[0,0],[10,10]]],['ellipse',[[0,0],[3,0],[0,8]]],
    ['slot',[[0,0],[10,0],[5,2]]],['bezier',[[0,0],[2,5],[4,5],[6,0]]]
  ]) doc.entities.push(withLayer(G.shape(name,points,6)));
  const result=F.read(F.write(doc));
  assert.deepEqual(result.skipped,[]);
  assert.equal(result.doc.units,4);
  assert.deepEqual(result.doc.entities.map(e=>e.type),doc.entities.map(e=>e.type));
  const [, ,arc,,ellipse,slot,bezier]=result.doc.entities;
  near(arc.c,[0,0]);
  assert.ok(Math.abs(arc.s-Math.PI)<1e-8);
  assert.equal(ellipse.r,8);
  assert.equal(ellipse.ry,3);
  assert.equal(slot.closed,true);
  near(slot.segments[1].c,[10,0]);
  assert.deepEqual(bezier.p,doc.entities.at(-1).p);
});

test('R12 round-trip keeps circular segments and approximates non-circular curves',()=>{
  const doc=F.empty();
  doc.entities=[withLayer(G.shape('slot',[[0,0],[10,0],[5,2]],6)),withLayer(G.shape('ellipse',[[0,0],[3,0],[0,8]],6))];
  const output=F.write(doc,true);
  assert.match(output,/AC1009/);
  const result=F.read(output);
  assert.equal(result.unitKnown,false);
  assert.deepEqual(result.skipped,[]);
  assert.equal(result.doc.entities[0].segments[1].type,'arc');
  assert.equal(result.doc.entities[1].type,'poly');
});

test('DXF rejects truncated files and counts unsupported entities',()=>{
  assert.throws(()=>F.read('0\nSECTION\n2\nENTITIES'),/manquantes/);
  const raw='0\nSECTION\n2\nENTITIES\n0\nTEXT\n8\n0\n1\nHello\n0\nENDSEC\n0\nEOF\n';
  assert.deepEqual(F.read(raw).skipped,[['TEXT',1]]);
});


test('segment intersection excludes parallel edges and extensions',()=>{
  near(G.intersection([0,0],[4,0],[2,-1],[2,1]),[2,0]);
  assert.equal(G.intersection([0,0],[1,0],[2,-1],[2,1]),null);
  assert.equal(G.intersection([0,0],[4,0],[2,0],[6,0]),null);
});

test('the Bézier pen interpolates waypoints with shared, distance-scaled tangents',()=>{
  const spline={type:'spline',p:[[0,0],[10,0],[10,3],[15,3],[20,8]],closed:false,layer:'0'};
  const spans=G.splineSpans(spline);
  assert.equal(spans.length,4);
  spans.forEach((span,i)=>{
    near(span.p[0],spline.p[i]);near(span.p[3],spline.p[i+1]);
    if(i) near(G.sub(span.p[1],span.p[0]),G.sub(spans[i-1].p[3],spans[i-1].p[2]));
  });
  assert.ok(G.dist(spans[0].p[2],spline.p[1])<=1);
  const scaled=G.splineSpans(G.transform(spline,p=>G.mul(p,4)));
  near(scaled[0].p[2],G.mul(spans[0].p[2],4));
  const straight=G.splineSpans({p:[[0,0],[10,0],[20,0]],closed:false});
  const sharp=G.splineSpans({p:[[0,0],[10,0],[5,1]],closed:false});
  assert.ok(G.dist(sharp[0].p[2],sharp[0].p[3])<G.dist(straight[0].p[2],straight[0].p[3]));
});

test('closed Bézier pen curves preserve the seam and export in both DXF versions',()=>{
  const spline={type:'spline',p:[[0,0],[10,0],[10,4],[0,4]],closed:true,layer:'0'};
  const spans=G.splineSpans(spline), doc={...F.empty(),entities:[spline]};
  near(spans.at(-1).p[3],spans[0].p[0]);
  near(G.sub(spans.at(-1).p[3],spans.at(-1).p[2]),G.sub(spans[0].p[1],spans[0].p[0]));
  assert.deepEqual(F.native(JSON.stringify(doc)),doc);
  assert.deepEqual(F.read(F.write(doc)).doc.entities,spans.map(e=>({...e,layer:'0'})));
  const legacy=F.read(F.write(doc,true)).doc.entities;
  assert.equal(legacy.length,1);
  assert.equal(legacy[0].closed,true);
});

test('Bézier handle settings scale locally and preserve symmetry through save and reverse',()=>{
  const spline={type:'spline',closed:false,p:[[0,0],[9,0],[9,6],[13,10]],tension:1.5,handles:{1:.8},layer:'0'};
  const auto={...spline,handles:undefined};
  const manual=G.splineHandle(spline,1);
  assert.equal(manual.reference,2);
  assert.equal(manual.length,1.6);
  assert.ok(G.splineHandle(auto,1).length>G.splineHandle({...auto,tension:1},1).length);
  const spans=G.splineSpans(spline);
  near(G.sub(spans[1].p[1],spline.p[1]),G.sub(spline.p[1],spans[0].p[2]));
  const scaled=G.transform(spline,p=>G.mul(p,3));
  assert.ok(Math.abs(G.splineHandle(scaled,1).length-3*manual.length)<1e-8);
  const reversed=G.reverse(spline);
  assert.deepEqual(reversed.handles,{2:.8});
  near(G.splineSpans(reversed)[2].p[1],spans[0].p[2]);
  const doc={...F.empty(),entities:[spline]};
  assert.deepEqual(F.native(JSON.stringify(doc)),doc);
  assert.equal(G.serial({...spline,handles:{1:5.01}}),false);
});

test('Bézier arm lengths and angles can be unlocked separately up to 500 percent',()=>{
  const spline={type:'spline',closed:false,p:[[0,0],[9,2],[14,8]],tension:5};
  const base={split:true,splitAngles:false,inRatio:2.5,outRatio:5,inAngle:.3,outAngle:.3};
  const lengths={...spline,handles:{1:base}};
  assert.equal(G.serial(lengths),true);
  const {arms:[incoming,outgoing]}=G.splineHandle(lengths,1);
  near(G.mul(incoming,-2),outgoing);
  const angles={...spline,handles:{1:{...base,split:false,splitAngles:true,inRatio:5,inAngle:-.3}}};
  assert.equal(G.serial(angles),true);
  const {arms:[a,b]}=G.splineHandle(angles,1);
  assert.ok(Math.abs(G.cross(a,b))>1);
  assert.ok(Math.abs(Math.hypot(...a)-Math.hypot(...b))<1e-8);
  assert.equal(G.serial({...angles,handles:{1:{...angles.handles[1],splitAngles:false}}}),false);
});

test('split Bézier arms survive save and follow reverse and mirror independently',()=>{
  const custom={split:true,inRatio:.7,outRatio:1.4,inAngle:-.25,outAngle:.6};
  const spline={type:'spline',closed:false,p:[[0,0],[9,2],[14,8]],tension:1.38,handles:{1:custom},layer:'0'};
  const spans=G.splineSpans(spline);
  const a=G.sub(spans[0].p[2],spline.p[1]), b=G.sub(spans[1].p[1],spline.p[1]);
  assert.ok(Math.abs(G.cross(a,b))>.1);
  assert.ok(G.dist([0,0],a)<G.dist([0,0],b));
  const reversed=G.splineSpans(G.reverse(spline));
  near(reversed[0].p[2],spans[1].p[1]);
  near(reversed[1].p[1],spans[0].p[2]);
  const mirror=([x,y])=>[x,-y];
  const mirrored=G.splineSpans(G.transform(spline,mirror,0,1,true));
  near(mirrored[0].p[2],mirror(spans[0].p[2]));
  near(mirrored[1].p[1],mirror(spans[1].p[1]));
  const doc={...F.empty(),entities:[spline]};
  assert.deepEqual(F.native(JSON.stringify(doc)),doc);
  assert.equal(G.serial({...spline,handles:{1:{...custom,split:false}}}),false);
});

test('nonuniform scale maps circular and elliptic arcs exactly, including through DXF 2000',()=>{
  const map=([x,y])=>[4+2*x,8+3*y];
  const arc={type:'arc',c:[3,1],r:6,a:-1.2,s:2.4,layer:'0'};
  const scaled=G.scaleAxes(arc,map,2,3);
  assert.equal(scaled.type,'ellipse');
  assert.ok(G.serial(scaled));
  for(const f of [0,.25,.5,.75,1]) near(G.controls(scaled,scaled.t+f*scaled.s),map(G.controls(arc,arc.a+f*arc.s)));
  const doc={...F.empty(),entities:[scaled]};
  const imported=F.read(F.write(doc)).doc.entities[0];
  for(const f of [0,.5,1]) near(G.controls(imported,imported.t+f*imported.s),G.controls(scaled,scaled.t+f*scaled.s));
  assert.equal(F.read(F.write(doc,true)).doc.entities[0].closed,false);
  const ellipse={type:'ellipse',c:[0,0],r:8,ry:3,a:.7,t:.2,s:-1.2};
  const deformed=G.scaleAxes(ellipse,map,2,3);
  for(const f of [0,.3,1]) near(G.controls(deformed,deformed.t+f*deformed.s),map(G.controls(ellipse,ellipse.t+f*ellipse.s)));
});

test('reversing a full circle or ellipse changes traversal without changing the shape',()=>{
  for(const shape of [{type:'circle',c:[0,0],r:10},{type:'ellipse',c:[1,2],r:10,ry:4,a:.4}]) {
    const reversed=G.reverse(shape);
    assert.ok(reversed.reversed);
    const forward=G.trace(shape), backward=G.trace(reversed);
    for(const [i,p] of forward.entries()) near(p,backward[backward.length-1-i]);
    assert.equal(G.reverse(reversed).reversed,false);
  }
});

test('center-first arcs use the start radius and follow a mouse sweep past 180 degrees',()=>{
  const center=[1,2], start=[6,2];
  let tracking=null;
  const at=degrees=>G.polar(center,8,degrees*Math.PI/180);
  for(const angle of [45,90,135,180,225,270]) tracking=G.arcProgress(center,start,at(angle),tracking);
  const arc=G.arcFromCenter(center,start,at(270),tracking);
  assert.equal(arc.r,5);
  assert.ok(Math.abs(arc.s-3*Math.PI/2)<1e-8);
  near(G.trace(arc).at(-1),[1,-3]);
  const clockwise=G.arcFromCenter(center,start,at(-80),null);
  assert.ok(clockwise.s<0);
  assert.equal(G.arcFromCenter(center,start,start),null);
});

test('construction strokes persist per edge and follow their geometry when reversed',()=>{
  const rect=withLayer({id:1,...G.shape('rect',[[0,0],[10,6]])});
  const mixed=G.withConstruction(G.withConstruction(rect,'dashDot'),null,2);
  assert.equal(G.constructionAt(mixed,2),null);
  assert.equal(G.constructionAt(mixed,3),'dashDot');
  const reversed=G.reverse(mixed);
  assert.equal(G.constructionAt(reversed,0),null);
  assert.deepEqual(G.reverse(reversed),mixed);
  const doc={...F.empty(),layers:[{...F.empty().layers[0],constructionVisible:false}],entities:[mixed]};
  assert.deepEqual(F.native(JSON.stringify(doc)),doc);
  assert.throws(()=>F.native(JSON.stringify({...doc,entities:[{...mixed,constructionParts:{4:'dotted'}}]})));
});

test('both DXF formats omit construction by default and keep the remaining contour open',()=>{
  const rect=withLayer(G.shape('rect',[[0,0],[10,6]]));
  const mixed=G.withConstruction(rect,'dotted',1);
  const guide=withLayer(G.withConstruction({type:'circle',c:[30,40],r:5},'dashed'));
  const doc={...F.empty(),entities:[mixed,guide]};
  for(const legacy of [false,true]) {
    const normal=F.write(doc,legacy);
    assert.doesNotMatch(normal,/VCV_POINTS|VCV_TIRETS/);
    const [outline]=F.read(normal).doc.entities;
    assert.equal(outline.closed,false);
    const trace=G.trace(outline);
    assert.equal(trace.length,4);
    near(trace[0],[10,6]);
    near(trace.at(-1),[10,0]);
    const all=F.write(doc,legacy,{includeConstruction:true});
    assert.match(all,/6\r\nVCV_POINTS\r\n/);
    assert.match(all,/6\r\nVCV_TIRETS\r\n/);
    assert.equal(F.read(all).doc.entities.length,3);
  }
});

test('center-first rectangles use the exact opposite corner and reject a zero side',()=>{
  const center=[7,-3], corner=[2,5];
  const shape=G.shape('rectCenter',[center,corner]);
  assert.equal(shape.closed,true);
  near(shape.p[0],[12,-11]);
  near(shape.p[2],corner);
  near(G.mid(shape.p[0],shape.p[2]),center);
  assert.equal(G.shape('rectCenter',[center,[7,5]]),null);
});

function dxfSpline(points,degree,knots,weights,flags=4) {
  const fields=[0,'SECTION',2,'ENTITIES',0,'SPLINE',8,'Courbes',70,flags,71,degree,72,knots.length,73,points.length,74,0];
  for(const t of knots) fields.push(40,t);
  for(const w of weights) fields.push(41,w);
  for(const [x,y] of points) fields.push(10,x,20,y,30,0);
  return fields.concat(0,'ENDSEC',0,'EOF').join('\n');
}

test('DXF imports degree-five splines with interior knots and preserves their endpoints',()=>{
  const p=[[0,0],[4,6],[6,12],[18,13],[25,4],[31,-1],[33,0]];
  const knots=[0,0,0,0,0,0,.4,1,1,1,1,1,1];
  const result=F.read(dxfSpline(p,5,knots,p.map(()=>1)));
  const [curve]=result.doc.entities;
  assert.deepEqual(result.skipped,[]);
  assert.equal(result.sampledSplines,1);
  assert.equal(curve.layer,'Courbes');
  assert.ok(curve.p.length>7);
  near(curve.p[0],p[0]);near(curve.p.at(-1),p.at(-1));
});

test('DXF rational spline weights are used when sampling a circular quarter arc',()=>{
  const raw=dxfSpline([[10,0],[10,10],[0,10]],2,[0,0,0,1,1,1],[1,Math.SQRT1_2,1]);
  const result=F.read(raw), [curve]=result.doc.entities;
  assert.deepEqual(result.skipped,[]);
  assert.ok(curve.p.length>8);
  assert.ok(curve.p.every(p=>Math.abs(Math.hypot(...p)-10)<1e-8));
});

test('editable Bézier junctions support independent lengths with linked or independent angles',()=>{
  const entity={type:'path',closed:false,segments:[
    {type:'bezier',p:[[0,0],[2,2],[4,2],[6,2]]},
    {type:'bezier',p:[[6,2],[7,2],[9,3],[12,6]]}
  ]};
  const knot=G.bezierKnot(entity,1);
  assert.equal(knot.setting.split,true);
  assert.equal(knot.setting.splitAngles,false);
  const setting={...knot.setting,outRatio:knot.setting.outRatio*2};
  const edited=G.withBezierKnot(entity,1,setting);
  near(edited.segments[0].p[2],[4,2]);
  near(edited.segments[1].p[1],[8,2]);
  const broken=G.withBezierKnot(edited,1,{...setting,splitAngles:true,outAngle:setting.outAngle+.25});
  assert.equal(G.bezierKnot(broken,1).setting.splitAngles,true);
  near(broken.segments[0].p[2],[4,2]);
  assert.notDeepEqual(broken.segments[1].p[1],edited.segments[1].p[1]);
  assert.deepEqual(G.reverse(G.reverse(broken)),broken);
});

test('VCV projects preserve embedded PNG layers and keep them out of vector exports',()=>{
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFoQAAAAASUVORK5CYII=';
  const raster={png,width:1,height:1,center:[3,4],pixelSize:25.4/96,scale:2,angle:45,
    activeOpacity:75,inactiveOpacity:30};
  const doc=F.empty();
  doc.layers.push({name:'ReperePNG',color:'#000000',visible:true,raster});
  doc.entities.push({type:'line',p:[[0,0],[5,1]],layer:'0'});
  assert.deepEqual(F.pngSize(png),[1,1]);
  assert.deepEqual(F.native(JSON.stringify(doc)),doc);
  assert.equal(F.exportSubset(doc).layers.length,1);
  assert.doesNotMatch(F.writeSVG(doc),/ReperePNG|data:image|<image/);
  assert.doesNotMatch(F.write(doc),/ReperePNG|data:image/);
  assert.throws(()=>F.native(JSON.stringify({...doc,entities:[{...doc.entities[0],layer:'ReperePNG'}]})),/calque invalide/);
  raster.width=2;
  assert.throws(()=>F.native(JSON.stringify(doc)),/image matricielle invalide/);
});

test('raster calibration and rotation preserve the selected anchor and image hit region',()=>{
  const image={width:100,height:40,center:[50,20],pixelSize:1,scale:1,angle:0,activeOpacity:80,inactiveOpacity:35};
  const first=[10,5], second=[30,5], realDistance=50;
  const calibrated=F.transformRaster(image,first,realDistance/G.dist(first,second));
  near(calibrated.center,[110,42.5]);
  assert.equal(calibrated.scale,2.5);
  assert.ok(F.rasterContains(calibrated,first));
  assert.ok(F.rasterContains(calibrated,[60,5]));
  const rotated=F.transformRaster(image,first,1,90);
  near(rotated.center,[-5,45]);
  assert.equal(rotated.angle,90);
  assert.ok(F.rasterContains(rotated,[10,25]));
  assert.equal(F.rasterContains(rotated,[30,5]),false);
});
