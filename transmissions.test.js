'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const G=require('./geometry.js');
const Formal=require('./constraints.js');
const Transmissions=require('./plugins/transmissions/plugin.js');
const defaults={module:2,pressure:20,pitch:2,distance:55,planets:3};

test('each layout produces valid geometry and satisfied primitive references',()=>{
  const cases={gear:[24],rack:[12],internal:[20,60],series:[20,30,40],branch:[30,20,20],planetary:[24,18],belt:[20,40]};
  for(const [mode,teeth] of Object.entries(cases)) {
    const result=Transmissions.build({...defaults,mode,teeth});
    assert.ok(result.entities.every(G.serial),mode);
    const entities=result.entities.map((entity,i)=>({...entity,id:i+1,layer:'0'}));
    const ids=new Map(entities.map(({key,id})=>[key,id]));
    const constraints=result.constraints.map(c=>({...c,refs:c.refs.map(({key,...ref})=>({...ref,id:ids.get(key)}))}));
    const map=new Map(entities.map(entity=>[entity.id,entity]));
    assert.ok(Formal.valid(entities,constraints),mode);
    assert.ok(constraints.every(c=>Formal.satisfied(map,c)),mode);
  }
});

test('series, planetary and GT2 layouts calculate their pitch dimensions and speed ratios',()=>{
  const series=Transmissions.build({...defaults,mode:'series',teeth:[20,30,40]});
  assert.deepEqual(series.diameters,[40,60,80]);
  assert.equal(series.ratio,.5);
  const planetary=Transmissions.build({...defaults,mode:'planetary',teeth:[24,18]});
  assert.deepEqual(planetary.diameters,[48,120,36,36,36]);
  assert.equal(planetary.ratio,24/84);
  const belt=Transmissions.build({...defaults,mode:'belt',teeth:[20,20]});
  assert.ok(Math.abs(belt.diameters[0]-40/Math.PI)<1e-10);
  assert.equal(belt.beltLength,150);
  assert.throws(()=>Transmissions.build({...defaults,planets:5,mode:'planetary',teeth:[24,18]}),/planetError/);
  assert.throws(()=>Transmissions.build({...defaults,distance:2,mode:'belt',teeth:[20,40]}),/spacing/);
});
