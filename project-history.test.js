'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const H=require('./project-history'),F=require('./formats');
const line=(id,length)=>({id,type:'line',p:[[0,0],[length,0]],layer:'0'});
test('Native projects restore the latest twenty undo states in stack order',()=>{
  const unchanged=line(1,1);
  const snapshots=Array.from({length:25},(_,i)=>({...F.empty(),entities:i===0?[unchanged]:[unchanged,line(2,i)],
    ...(i<10?{}:{nextDimensionNumber:3})}));
  const current=snapshots.at(-1), undo=snapshots.slice(0,-1);
  const packed=H.pack(current,undo);
  assert.equal(packed.steps.length,20);
  assert.deepEqual(packed.steps[0].lists.entities.changes.map(([i])=>i),[1]);
  const {history,persisted,...opened}=F.native(JSON.stringify({...current,history:packed}));
  assert.deepEqual(H.unpack(opened,history,F.validateNative),undo.slice(-20));
});
test('History preserves deleted rows and deduplicates unchanged image payloads',()=>{
  const image='image-content';
  const snapshot=offset=>({...F.empty(),layers:[{name:'Image',raster:{png:image,offset}}]});
  const undo=[snapshot(0),snapshot(1)], current=snapshot(2);
  const packed=H.pack(current,undo);
  assert.deepEqual(packed.rasters,[image]);
  assert.deepEqual(H.unpack(current,JSON.parse(JSON.stringify(packed)),state=>state),undo);
  const previous={...F.empty(),entities:[line(1,4)]}, empty=F.empty();
  const archive=H.pack(empty,[previous]);
  assert.deepEqual(H.unpack(empty,archive,F.validateNative),[previous]);
  archive.steps[0].lists.entities.changes[0][0]=9;
  assert.deepEqual(H.unpack(empty,archive,F.validateNative),[]);
});
