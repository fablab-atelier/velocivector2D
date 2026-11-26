'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('./cursors.js');

test('every cursor behavior has three valid shapes and every tool can keep its own color',()=>{
  for(const [key,[,defaultShape,...otherShapes]] of Object.entries(C.profiles)) {
    const choices=[defaultShape,...otherShapes];
    assert.equal(new Set(choices).size,3,key);
    for(const shape of choices) assert.ok(C.icons[shape],key);
  }
  const settings=C.normalize({shapes:{select:'pointerCorner',draw:'pointer'},colors:{rotate:'#123ABC',scale:'red'}});
  assert.equal(settings.shapes.select,'pointerCorner');
  assert.equal(settings.shapes.draw,'cross');
  assert.equal(settings.colors.rotate,'#123ABC');
  assert.equal(settings.colors.scale,C.tools.scale[1]);
  assert.notEqual(C.css('select','rotate',0,settings,'default'),C.css('select','scale',0,settings,'default'));
});

test('scale cursor keeps its center and changes from hover to directional drag',()=>{
  const settings=C.normalize();
  const hover=C.css('scaleReady','scale',90,settings,'ns-resize');
  const drag=C.css('scaleDrag','scale',90,settings,'ns-resize');
  assert.notEqual(hover,drag);
  assert.ok(drag.endsWith('16 16, ns-resize'));
  assert.match(decodeURIComponent(drag),/rotate\(90 16 16\)/);
});

test('snap indicators prefer the upper-right corner until the drawing occupies it',()=>{
  const S=C.SnapIndicators;
  assert.equal(S.normalize().corner,'ne');
  assert.equal(S.placement([100,100],[400,300],[],1,'ne').corner,'ne');
  const geometry=[{a:[100,100],b:[180,25],weight:3}];
  assert.notEqual(S.placement([100,100],[400,300],geometry,1,'ne','ne').corner,'ne');
  assert.equal(S.placement([393,7],[400,300],[],1,'ne').corner,'sw');
  assert.match(decodeURIComponent(S.image('point','#123ABC')),/#e83949/);
  assert.match(decodeURIComponent(S.image('coincidence','#123ABC')),/#123ABC/);
});
