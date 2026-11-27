'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {sizes,boards,defaults,build}=require('./plugins/drone/geometry');
const Edit=require('./editing');
const config=(prop,count,board='F405 V4')=>{
  const [fcX,fcY,fcHole]=boards[board];
  return {...defaults(prop,count),prop,count,fcX,fcY,fcHole,spacer:25,spacerHole:3.2,screws:4,density:1.55};
};

test('All rotor and propeller combinations yield two valid plates with matching spacer holes',()=>{
  for(const count of [4,6,8]) for(const prop of sizes) for(const board of Object.keys(boards)) {
    const c=config(prop,count,board), model=build(c);
    assert.equal(model.motors.length,count);
    assert.equal(model.propRadius*2,prop*25.4);
    assert.ok(model.clearance>=c.gap);
    assert.ok([...model.base.entities,...model.lid.entities,...model.side].every(Edit.valid));
    assert.deepEqual(model.base.entities.slice(1+count*4,5+count*4).map(h=>h.c),model.lid.entities.slice(1).map(h=>h.c));
    assert.equal(model.side[2].p[2][1]-model.side[2].p[0][1],c.spacer);
    assert.ok(Math.abs(model.mass-(model.base.net*c.bottom+model.lid.net*c.top)*c.density/1000)<1e-10);
  }
});

test('Motor screw count, optional component mounts and geometric conflicts',()=>{
  const c=config(5,4), model=build(c);
  const alternate=build({...c,screws:2},[
    {enabled:true,panel:'bottom',x:0,y:-c.core*.46,dx:19,dy:0,hole:2.2},
    {enabled:true,panel:'top',x:0,y:0,dx:20,dy:20,hole:2.2},
    {enabled:true,panel:'top',x:0,y:c.core*.46,dx:12,dy:0,hole:2.2}
  ]);
  assert.equal(alternate.base.entities.length,model.base.entities.length-2*c.count+2);
  assert.equal(alternate.lid.entities.length,model.lid.entities.length+6);
  assert.throws(()=>build({...c,hub:20}),/propConflict/);
  assert.throws(()=>build({...c,arm:3}),/armConflict/);
  assert.throws(()=>build(c,[{enabled:true,panel:'top',x:99,y:0,dx:20,dy:20,hole:2}]),/holeConflict/);
});
