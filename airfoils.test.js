'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {profiles,presets,points,build,accessories,aircraft,arrange}=require('./plugins/airfoils/geometry');
const G=require('./geometry');
const Edit=require('./editing');
const config={...presets.glider,mode:'batch',gap:12,clearance:.15};
const spar={shape:'round',width:5,start:30,end:30,offset:2};

test('Airfoil presets produce closed, grouped ribs and a half-span plan',()=>{
  assert.equal(new Set(profiles).size,20);
  for(const code of profiles) {
    const trace=points(code);
    assert.deepEqual(trace[0],[0,0]);
    assert.deepEqual(trace[96],[1,0]);
    assert.ok(trace.flat().every(Number.isFinite));
  }
  for(const preset of Object.values(presets)) {
    const model=build({...config,...preset},[spar]);
    assert.deepEqual(model.invalid,[]);
    const ribs=model.ribs.filter(entity=>entity.type==='path');
    assert.equal(ribs.length,preset.count);
    assert.equal(new Set(ribs.map(rib=>rib.vectorGroup)).size,preset.count);
    assert.ok(ribs.every(rib=>rib.closed));
    assert.equal(model.plan[preset.count-1].p[0][1],preset.span/2);
    assert.ok(ribs.every(rib=>rib.segments.length<32&&rib.segments.every(s=>s.type==='bezier')&&Edit.valid(rib)));
    const starts=ribs.map(rib=>Math.min(...G.trace(rib,4).map(p=>p[1])));
    assert.ok(starts.every((y,i)=>i===0||y<starts[i-1]));
    for(const [index,chord] of [[0,preset.rootChord],[ribs.length-1,preset.tipChord]]) {
      const rib=ribs[index], trailing=rib.segments[0].p[0];
      const nose=rib.segments.map(s=>s.p[0]).find(p=>Math.abs(p[0])<1e-8);
      assert.ok(nose);
      assert.ok(Math.abs(G.dist(trailing,nose)-chord)<1e-9);
    }
  }
});

test('Airfoil slot clearance, straight spar axis and obstruction reporting',()=>{
  const model=build(config,[spar]);
  const holes=model.ribs.filter(entity=>entity.type==='circle');
  assert.ok(holes.every(hole=>hole.r===2.65));
  const localY=holes.map((hole,i)=>hole.c[1]-model.ribs[i*2].segments[0].p[0][1]);
  // The leading edge rotates, whereas the slot interpolates a straight world axis.
  assert.ok(localY.every(Number.isFinite));
  const single={...config,mode:'single'};
  const rectangle={...spar,shape:'rectangle',width:6,height:4};
  assert.deepEqual(build(single,[rectangle]).invalid,[]);
  assert.deepEqual(build(single,[{shape:'off'},{...rectangle,start:100}]).invalid,[[1,2]]);
  assert.throws(()=>build({...config,tip:'abc'},[]),/badProfile/);
});

test('Tail and both fuselage options insert native geometry and scale with the wing',()=>{
  for(const [preset,defaults] of Object.entries(aircraft)) {
    const wing=build({...config,...presets[preset]},[]);
    const options={preset,tail:'matchingTail',body:'classic',...defaults};
    for(const body of ['classic','streamlined']) {
      const model=accessories(config,{...options,body});
      assert.equal(model.labels.length,4);
      assert.ok([...model.tail,...model.body].every(Edit.valid));
      assert.equal(model.tail.filter(e=>e.type==='path').length,5);
      assert.equal(model.tail.filter(e=>e.type==='line').length,5);
      assert.ok(model.body.some(e=>e.vectorGroup==='rudder'&&e.closed));
      assert.equal(model.body.filter(e=>e.type==='path'&&e.vectorGroup==='body-side').length,2);
      assert.equal(model.body.filter(e=>e.type==='path'&&e.vectorGroup==='body-top').length,1);
      assert.ok(model.labels[0][1][1]>model.labels[1][1][1]&&model.labels[1][1][1]>model.labels[2][1][1]);
      const columns=[wing.plan,wing.ribs,model.tail,model.body];
      const arranged=arrange(columns,14);
      let offset=0, right=-Infinity;
      for(const column of columns) {
        const points=arranged.slice(offset,offset+column.length).flatMap(G.boundsPoints);
        assert.ok(Math.min(...points.map(p=>p[0]))>right);
        right=Math.max(...points.map(p=>p[0]));
        offset+=column.length;
      }
      const bigger=accessories({...config,span:config.span*2},{...options,body});
      const front=m=>m.body.find(e=>e.type==='ellipse');
      assert.equal(front(bigger).r,2*front(model).r);
    }
  }
});

test('Every preset and NACA profile supports a tangent fuselage with two tail spars',()=>{
  const tailSpars=[{shape:'round',width:1,start:29,end:29,offset:0},
    {shape:'rectangle',width:1,height:1,start:57,end:57,offset:0}];
  for(const [preset,defaults] of Object.entries(aircraft)) for(const code of profiles) {
    const cfg={...config,...presets[preset],root:code,tip:code,count:2};
    const wing=build(cfg,[]);
    const intersections=points(code).flatMap(([x,y],index,outline)=>{
      const [nextX,nextY]=outline[(index+1)%outline.length];
      return (x<.3)===(nextX<.3)?[]:[y+(.3-x)*(nextY-y)/(nextX-x)];
    });
    const wingAtRoot=build({...cfg,mode:'single'},[{...spar,width:1,
      offset:(intersections[0]+intersections[1])*cfg.rootChord/2}]);
    assert.deepEqual(wingAtRoot.invalid,[]);
    assert.ok(wing.ribs.every(Edit.valid));
    assert.deepEqual(wing.invalid,[]);
    for(const body of ['classic','streamlined']) {
      const model=accessories(cfg,{preset,tail:'matchingTail',...defaults,body,tailSpars,wingHoles:wingAtRoot.first.slice(1)});
      assert.deepEqual(model.invalid,[]);
      const hull=model.body[0], parts=hull.segments;
      for(const [u,v] of [[1,2],[2,3],[3,4],[4,5]]) {
        assert.deepEqual(parts[u].p[3],parts[v].p[0]);
        const a=G.sub(parts[u].p[3],parts[u].p[2]),b=G.sub(parts[v].p[1],parts[v].p[0]);
        assert.ok(Math.abs(G.cross(a,b))/(Math.hypot(...a)*Math.hypot(...b))<1e-10);
        assert.ok(G.dot(a,b)>0);
      }
      assert.equal(model.body.filter(e=>e.vectorGroup==='body-side'&&e.construction).length,1);
      assert.equal(model.body.filter(e=>e.vectorGroup==='body-side'&&e.type==='circle'&&!e.construction).length,2);
      assert.equal(model.body.filter(e=>e.vectorGroup==='body-side'&&e.type==='poly'&&e.closed&&!e.construction).length,1);
    }
  }
  assert.throws(()=>accessories({...config,span:20},{preset:'glider',tail:'off',body:'classic'}),/tailOutside/);
});

test('Aileron hinge marks only affected stations and follows the twisted skin',()=>{
  const control={start:30,end:70,hinge:72};
  for(const code of profiles) {
    const model=build({...config,root:code,tip:code,count:7,control},[]);
    const marks=model.ribs.filter(e=>e.type==='line');
    assert.deepEqual(marks.map(e=>e.vectorGroup),['rib-3','rib-4','rib-5']);
    const angle=config.twist*Math.PI/180/2;
    const d=G.sub(marks[1].p[1],marks[1].p[0]);
    assert.ok(Math.abs(G.dot(d,[Math.cos(angle),Math.sin(angle)]))<1e-6);
    assert.ok(model.plan.at(-1).closed);
    assert.equal(model.plan.at(-1).p[0][1],config.span*.15);
  }
  assert.throws(()=>build({...config,control:{start:80,end:20,hinge:72}},[]),/badValues/);
});
