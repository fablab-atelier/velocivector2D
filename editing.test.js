'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const G=require('./geometry.js');
const E=require('./editing.js');
const F=require('./formats.js');
const line=(id,a,b)=>({id,type:'line',p:[a,b],layer:'0'});
const assertPoint=(actual,expected)=>assert.ok(G.dist(actual,expected)<1e-8, JSON.stringify({actual,expected}));

test('dragging a straight edge translates it and reshapes adjacent edges',()=>{
  const poly={id:1,type:'poly',p:[[0,0],[4,0],[4,4]],closed:false};
  const joined=line(2,[4,0],[8,0]);
  const result=E.drag([poly,joined],poly.p.slice(0,2),[1,2]);
  assert.deepEqual(result.get(1).p,[[1,2],[5,2],[4,4]]);
  assert.deepEqual(result.get(2).p,[[5,2],[8,0]]);
});

test('dragging a shared vertex keeps both opposite endpoints fixed',()=>{
  const a=line(1,[0,0],[2,0]), b=line(2,[2,0],[4,0]);
  const result=E.drag([a,b],[[2,0]],[0,3]);
  assert.deepEqual(result.get(1).p,[[0,0],[2,3]]);
  assert.deepEqual(result.get(2).p,[[2,3],[4,0]]);
  assert.equal(E.drag([a,b],[[2,0]],[-2,0]),null);
});

test('a crossing rectangle selects only the visible portions it touches in a joined contour',()=>{
  const shape={id:1,type:'poly',p:[[0,0],[10,0],[10,8],[0,8]],closed:false,layer:'0'};
  assert.deepEqual(E.crossingParts(shape,[3,-1],[6,1],10),[0]);
  assert.deepEqual(E.crossingParts(shape,[9,-1],[11,4],10),[0,1]);
  const hidden=G.withConstruction(shape,'dashed',1);
  assert.deepEqual(E.crossingParts(hidden,[9,-1],[11,4],10,false),[0]);
  assert.deepEqual(E.selectedRuns(shape,new Set([1])),[line(1,[10,0],[10,8])]);
  const [segment]=E.selectedRuns(hidden,new Set([1]));
  assert.equal(segment.construction,'dashed');
});

test('automatic closure pairs nearby endpoints on one layer and merges the result into a closed contour',()=>{
  const a={id:1,type:'poly',layer:'0',closed:false,p:[[0,0],[10,0],[10,10]]};
  const b={id:2,type:'poly',layer:'0',closed:false,p:[[10,10.04],[0,10],[0,.06]]};
  const other={...line(3,[0,0],[0,20]),layer:'Autre'};
  const circle={id:4,type:'circle',c:[20,20],r:5,layer:'0'};
  assert.equal(E.isClosed(circle),true);
  assert.equal(E.closurePairs([a,b,other,circle],.03).length,0);
  const pairs=E.closurePairs([a,b,other,circle],.1);
  assert.equal(pairs.length,2);
  const result=E.closeConnections([a,b,other,circle],pairs);
  assert.equal(result.entities.length,3);
  const closed=result.entities.find(e=>e.type==='path');
  assert.ok(closed&&E.isClosed(closed));
  assert.equal(closed.segments.length,4);
  for(const segment of closed.segments) assert.ok(Number.isFinite(G.trace(segment)[0][0]));
  assert.ok(result.entities.includes(other));
  assert.ok(result.entities.includes(circle));
});

test('contact closure reaches the intersection without shearing the original supports',()=>{
  const a=line(1,[0,0],[9.96,0]), b=line(2,[10,.04],[10,10]);
  const [intersection]=E.closurePairs([a,b],.1,'contact');
  assertPoint(intersection.target,[10,0]);
  const result=E.closeConnections([a,b],[intersection]);
  assert.equal(result.entities.length,1);
  assert.equal(result.entities[0].closed,false);
  assert.deepEqual(result.adjusted[0].p,[[0,0],[10,0]]);
  assert.deepEqual(result.adjusted[1].p,[[10,0],[10,10]]);
  const parallel=line(3,[10,.04],[20,.04]);
  assert.deepEqual(E.closurePairs([a,parallel],.1,'contact'),[]);
});

test('automatic closure trims a Bezier on its original polynomial and bridges the gap in segment mode',()=>{
  const a={id:1,type:'bezier',layer:'0',p:[[0,0],[3,4],[7,-1],[10,0]]};
  const b=line(2,[9.96,-.04],[9.96,-4]);
  const [junction]=E.closurePairs([a,b],.1,'contact');
  assert.ok(junction);
  const parameter=junction.parameters[junction.a.entity.id===a.id?0:1];
  const [trimmed]=E.closeConnections([a,b],[junction]).adjusted;
  for(const t of [0,.25,.5,.75,1]) assertPoint(G.traceAt(trimmed,t),G.traceAt(a,parameter*t));
  const pairs=E.closurePairs([a,b],.1,'segment');
  const result=E.closeConnections([a,b],pairs,part=>({...part,id:3}));
  assert.equal(result.adjusted[0],a);
  assert.equal(result.adjusted[1],b);
  assert.equal(result.entities.length,1);
  assert.deepEqual(result.entities[0].segments.map(e=>e.type),['line','line','bezier']);
});

test('a transformed contour portion moves exactly and keeps its shared endpoints connected',()=>{
  const curve=G.arc([0,0],[4,4],[8,0]);
  const shape={id:1,type:'path',closed:false,segments:[curve,line(2,[8,0],[18,0]),line(3,[18,0],[18,10])]};
  const move=([x,y])=>[x+2,y+3];
  const result=E.transformParts(shape,new Set([0]),part=>G.transform(part,move));
  assert.ok(result);
  assertPoint(result.segments[0].c,move(curve.c));
  assertPoint(E.ends(result.segments[1])[0],move([8,0]));
  assertPoint(E.ends(result.segments[1])[1],[18,0]);
  assert.deepEqual(result.segments[2],shape.segments[2]);
});

test('moving a chain linked by current orientation constraints preserves its junctions',()=>{
  const first=line(1,[0,0],[4,0]), middle=line(2,[4,0],[4,3]), last=line(3,[4,3],[9,3]);
  const separate=line(4,[10,3],[12,3]), entities=[last,separate,middle,first];
  const refs=entities.map(e=>({id:e.id,kind:'edge',index:0}));
  const points=E.translationVertices(entities,first,0,refs);
  const moved=E.drag(entities,points,[3,2]);
  for(const e of [first,middle,last]) assert.deepEqual(moved.get(e.id).p,e.p.map(p=>G.add(p,[3,2])));
  assert.equal(moved.has(separate.id),false);
});

test('the VCV reader still accepts valid former angle presets and rejects inconsistent ones',()=>{
  const geometry=line(1,[0,0],[0,4]);
  for(const legacy of [90,{division:4,degrees:90}]) {
    const source={...F.empty(),entities:[{...geometry,angles:{0:legacy}}]};
    const [opened]=F.native(JSON.stringify(source)).entities;
    assert.deepEqual(opened.p,geometry.p);
    assert.deepEqual(opened.angles,{0:legacy});
    assert.throws(()=>F.native(JSON.stringify({...source,entities:[{...opened,angles:{0:0}}]})),/invalide/);
  }
});

test('dragging a mixed polyline vertex preserves arc sweep and shared endpoint',()=>{
  const curve=G.arc([0,0],[2,2],[4,0]);
  const path={id:1,type:'path',segments:[curve,line(2,[4,0],[8,0])],closed:false};
  const result=E.drag([path],[[4,0]],[1,1]).get(1);
  const [a,b]=result.segments;
  assertPoint(E.ends(a)[0],[0,0]);
  assertPoint(E.ends(a)[1],b.p[0]);
  assert.deepEqual(b.p,[[5,1],[8,0]]);
  assert.ok(Math.abs(a.s-curve.s)<1e-8);
});

test('a single straight endpoint drag changes length and orientation at once',()=>{
  const a=line(1,[0,0],[4,0]);
  const result=E.drag([a],[[4,0]],[-4,7]).get(1);
  assertPoint(result.p[0],[0,0]);
  assertPoint(result.p[1],[0,7]);
  assert.equal(G.dist(...result.p),7);
});

test('a line drawn between both ends of an arc creates one closed contour',()=>{
  const arc={...G.arc([0,0],[5,5],[10,0]),id:1,layer:'0'};
  const bridge=line(2,[0,0],[10,0]);
  const {entities,remap}=E.joinContours([arc,bridge],[2]);
  assert.equal(entities.length,1);
  const [joined]=entities;
  assert.equal(joined.closed,true);
  assert.deepEqual(joined.segments.map(e=>e.type),['line','arc']);
  assert.ok(E.valid(joined));
  assertPoint(E.ends(joined.segments[1])[1],joined.segments[0].p[0]);
  assert.equal(remap.get(1),2);
  const doc={...F.empty(),entities};
  const reloaded=F.read(F.write(doc)).doc.entities[0];
  assert.equal(reloaded.closed,true);
  assert.ok(reloaded.segments.some(e=>e.type==='arc'));
});

test('moving open ends together merges a Bézier with a line, without merging branches or other layers',()=>{
  const spline={id:1,type:'spline',p:[[0,0],[5,3],[10,0]],closed:false,layer:'0'};
  const tail=line(2,[11,0],[15,0]);
  const moved=E.drag([spline,tail],tail.p,[-1,0],true).get(2);
  const result=E.joinContours([spline,moved],[2]);
  assert.equal(result.entities.length,1);
  const joined=result.entities[0];
  assert.equal(joined.closed,false);
  assert.equal(joined.segments.filter(e=>e.type==='bezier').length,2);
  const doc={...F.empty(),entities:[joined]};
  assert.deepEqual(F.native(JSON.stringify(doc)),doc);
  assert.equal(F.read(F.write(doc)).doc.entities.filter(e=>e.type==='bezier').length,2);
  assert.equal(F.read(F.write(doc,true)).doc.entities[0].type,'poly');
  const branch=line(3,[10,0],[10,7]);
  assert.equal(E.joinContours([spline,moved,branch],[2]).entities.length,3);
  assert.equal(E.joinContours([spline,{...moved,layer:'autre'}],[2]).entities.length,2);
});

test('a polyline corner follows a diagonal drag while other vertices stay in place',()=>{
  const poly={id:2,type:'poly',closed:true,p:[[0,0],[10,0],[10,8],[0,8]]};
  const moved=E.drag([poly],[poly.p[1]],[5,3]).get(2);
  assert.deepEqual(moved.p,[[0,0],[15,3],[10,8],[0,8]]);
  assert.equal(moved.closed,true);
});

test('automatic joins and endpoint edits keep construction styles on the original strokes',()=>{
  const normal=line(1,[0,0],[10,0]);
  const guide=G.withConstruction(line(2,[20,0],[10,0]),'dashDot');
  const joined=E.joinContours([normal,guide],[1]);
  assert.equal(joined.entities.length,1);
  const [path]=joined.entities;
  assert.equal(G.constructionAt(path,0),null);
  assert.equal(G.constructionAt(path,1),'dashDot');
  const modified=E.changedVertices([path],[[[10,0],[10,3]]]).get(path.id);
  assert.equal(G.constructionAt(modified,1),'dashDot');
  assertPoint(E.ends(modified.segments[0])[1],E.ends(modified.segments[1])[0]);
});

test('removing a single edge opens a closed contour and preserves styles on the surviving edges',()=>{
  const rectangle={...G.shape('rect',[[0,0],[10,6]]),id:1,layer:'0'};
  const source=G.withConstruction(rectangle,'dotted',3);
  const [open]=E.removeSegments(source,new Set([0]));
  assert.equal(open.closed,false);
  assert.deepEqual(open.p,[[10,0],[10,6],[0,6],[0,0]]);
  assert.equal(G.constructionAt(open,2),'dotted');
  assert.equal(E.removeSegments(source,new Set([0,1,2,3])).length,0);
});

test('removing a middle edge separates an open mixed contour without approximating its arc',()=>{
  const arc=G.arc([0,0],[5,5],[10,0]);
  const source={id:1,type:'path',layer:'0',closed:false,segments:[
    arc,line(2,[10,0],[15,0]),line(3,[15,0],[20,5])
  ]};
  const [first,last]=E.removeSegments(source,new Set([1]));
  assert.deepEqual(first,arc);
  assert.deepEqual(last.p,[[15,0],[20,5]]);
});


test('trimming a cubic removes the clicked interval and preserves both remaining curves exactly',()=>{
  const curve={type:'bezier',p:[[0,0],[2,8],[8,-3],[10,4]]};
  const from=.27,to=.63,[left,right]=E.trimContours(curve,[{index:0,from,to}]);
  for(let i=0;i<=20;i++) {
    const u=i/20;
    assertPoint(G.controls(left,u),G.controls(curve,from*u));
    assertPoint(G.controls(right,u),G.controls(curve,to+(1-to)*u));
  }
});

test('trimming removes the clicked circular interval across the parameter seam',()=>{
  const circle={type:'circle',c:[0,0],r:10};
  const [from,to]=E.trimBounds(.05,[.25,.75],true);
  assert.deepEqual([from,to],[-.25,.25]);
  const [remaining]=E.trimContours(circle,[{index:0,from,to}]);
  assert.equal(remaining.type,'arc');
  assertPoint(E.ends(remaining)[0],[0,10]);
  assertPoint(E.ends(remaining)[1],[0,-10]);
  assert.equal(remaining.s,Math.PI);
});

test('trimming uses intersections on both sides and leaves a cut contour open',()=>{
  const horizontal={type:'line',p:[[-5,0],[5,0]]};
  const circle={type:'circle',c:[0,0],r:2};
  const hits=E.curveIntersections(horizontal,circle);
  const [from,to]=E.trimBounds(.5,hits,false);
  const [left,right]=E.trimContours(horizontal,[{index:0,from,to}]);
  assertPoint(left.p[1],[-2,0]);assertPoint(right.p[0],[2,0]);
  const shape={type:'poly',p:[[0,0],[4,0],[4,3],[0,3],[0,.02]],closed:true};
  const [open]=E.trimContours(shape,[{index:4,from:0,to:1}]);
  assert.equal(open.closed,false);
  assert.equal(open.segments.length,4);
  assertPoint(open.segments.at(-1).p[1],[0,.02]);
});

test('sweeping scissors remove overlapping and disjoint intervals in one pass',()=>{
  const source={type:'line',p:[[0,0],[20,0]]};
  const result=E.trimContours(source,[
    {index:0,from:.1,to:.3},{index:0,from:.2,to:.4},{index:0,from:.6,to:.7}
  ]);
  assert.equal(result.length,3);
  for(const [i,p] of [[0,2],[8,12],[14,20]].entries()) {
    assertPoint(result[i].p[0],[p[0],0]);assertPoint(result[i].p[1],[p[1],0]);
  }
});

test('trace offset preserves exact line, circle and arc geometry',()=>{
  const straight=line(1,[0,0],[8,0]);
  assert.deepEqual(E.offsetTrace(straight,2,'inside').p,[[0,2],[8,2]]);
  assert.deepEqual(E.offsetTrace(straight,2,'outside').p,[[0,-2],[8,-2]]);
  const circle={type:'circle',c:[1,2],r:9};
  assert.deepEqual(E.offsetTrace(circle,3,'inside'),{...circle,r:6});
  assert.equal(E.offsetTrace(circle,9,'inside'),null);
  const arc=G.arc([0,0],[5,5],[10,0]);
  assert.deepEqual(E.offsetTrace(arc,2,'outside'),{...arc,r:7});
});

test('closed contour offsets are winding-independent and reject a collapsed interior',()=>{
  const rect=G.shape('rect',[[0,0],[12,8]]);
  const inner=E.offsetTrace(rect,2,'inside'), outer=E.offsetTrace(rect,2,'outside');
  assert.deepEqual(inner.p,[[2,2],[10,2],[10,6],[2,6]]);
  assert.deepEqual(outer.p,[[-2,-2],[14,-2],[14,10],[-2,10]]);
  assert.deepEqual(E.offsetTrace(G.reverse(rect),2,'inside').p,inner.p.toReversed());
  assert.equal(E.offsetTrace(rect,4,'inside'),null);
});

test('a sketch fillet trims both sides and creates a tangent arc of the requested radius',()=>{
  const first={part:line(1,[-12,0],[0,0]),end:1};
  const second={part:line(2,[0,0],[0,8]),end:0};
  const result=E.filletLines(first,second,3);
  assert.equal(result.arc.r,3);
  assertPoint(result.arc.c,[-3,3]);
  assertPoint(E.ends(result.arc)[0],[-3,0]);
  assertPoint(E.ends(result.arc)[1],[0,3]);
  assertPoint(result.lines[0].p[1],[-3,0]);
  assertPoint(result.lines[1].p[0],[0,3]);
  assert.ok(Math.abs(G.cross(G.traceDerivative(result.arc,0),[1,0]))<1e-8);
  assert.ok(Math.abs(G.cross(G.traceDerivative(result.arc,1),[0,1]))<1e-8);
  assert.equal(E.filletLines(first,second,8),null);
  assert.equal(E.filletLines(first,{part:line(3,[0,0],[9,0]),end:0},3),null);
});

test('an exact fillet can consume a contour side without producing a zero-length segment',()=>{
  const first={part:line(1,[-11,0],[0,0]),end:1};
  const second={part:line(2,[0,0],[0,5]),end:0};
  assert.equal(E.filletLines(first,second,5),null);
  const result=E.filletLines(first,second,5,true);
  assert.ok(result.lines[0]);
  assert.equal(result.lines[1],null);
  assertPoint(E.ends(result.arc)[1],[0,5]);
  assert.equal(E.filletLines(first,second,5.01,true),null);
});
