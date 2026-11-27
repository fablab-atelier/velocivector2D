'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Text=require('./text-geometry');
const G=require('./geometry');
const F=require('./formats');
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,JSON.stringify([a,b]));
const annotation={id:1,layer:'0',p:[0,0],content:'AB\nC',family:'Arial',height:10,width:100,angle:0,
  align:'left',letter:2,line:3,pathMode:'straight',fraction:0,radius:0,along:0,offset:0,reverse:false,inside:false,upright:false};
const measure={save(){},restore(){},measureText:()=>({width:40,actualBoundingBoxAscent:80,actualBoundingBoxDescent:3,
  actualBoundingBoxLeft:0,actualBoundingBoxRight:40})};

test('text alignment, dimensions and spacings use drawing units',()=>{
  const map=new Map(), straight=Text.layout(annotation,map,measure,1);
  close(straight[0].q[0],2.5);
  close(straight[1].q[0]-straight[0].q[0],7);
  close(straight[2].q[1],-13);
  const wide=Text.layout({...annotation,align:'center',width:200},map,measure,2);
  close(wide[0].q[0],-3);
  close(wide[2].q[1],-6.5);
});
test('linked circles support radius, direction, side and upright glyphs',()=>{
  const items=new Map([[3,{type:'circle',c:[2,3],r:50}]]);
  const text={...annotation,content:'A',align:'center',fraction:.25,pathMode:'linked',pathId:3,radius:30,offset:5};
  const [outer]=Text.layout(text,items,measure,1);
  close(G.dist(outer.q,[2,3]),35);
  const [inner]=Text.layout({...text,reverse:true,inside:true,upright:true,angle:35},items,measure,1);
  close(G.dist(inner.q,[2,3]),25);
  close(inner.angle,0);
  const [arcGlyph]=Text.layout({...text,pathMode:'arc',offset:0},items,measure,1);
  close(Math.cos(arcGlyph.angle),1);
  close(Math.sin(arcGlyph.angle),0);
});
test('outline extraction keeps holes and diagonal islands separate',()=>{
  const mask=Uint8Array.of(1,1,1,1,0,1,1,1,1);
  assert.deepEqual(Text.contours(mask,3,3).map(ring=>ring.length).sort(),[4,4]);
  assert.equal(Text.contours(Uint8Array.of(1,0,0,1),2,2).length,2);
});
test('projects keep text editable while SVG and DXF can use generated closed contours',()=>{
  const doc={...F.empty(),texts:[{...annotation,content:'O'}]};
  assert.deepEqual(F.native(JSON.stringify(doc)).texts,doc.texts);
  const canvas={getContext(){return {
    fillText(){},
    getImageData(){const pixels=new Uint8ClampedArray(canvas.width*canvas.height*4);
      for(let y=2;y<9;y++) for(let x=2;x<9;x++) if(x===2||x===8||y===2||y===8) pixels[(y*canvas.width+x)*4+3]=255;
      return {data:pixels};
    }
  };}};
  const entities=Text.vectorize(doc.texts[0],new Map(),measure,canvas,1);
  assert.equal(entities.length,2);
  assert.ok(entities.every(entity=>entity.closed&&G.serial(entity)));
  assert.match(F.writeSVG({...doc,entities}),/<path /);
  assert.equal(F.read(F.write({...doc,entities},'r14')).doc.entities.length,2);
});

test('glyphs retain source caret indices across spaces, combined letters and new lines',()=>{
  const glyphs=Text.layout({...annotation,content:'A e\u0301\nZ'},new Map(),measure,1);
  assert.deepEqual(glyphs.map(glyph=>[glyph.value,glyph.index]),[['A',0],['e\u0301',2],['Z',5]]);
});

test('inline carets follow whitespace, blank lines and tangent orientation on a path',()=>{
  const carets=[];
  Text.layout({...annotation,content:'A \n\nB'},new Map(),measure,1,carets);
  assert.deepEqual(carets.map(item=>item.index),[0,1,2,3,4,5]);
  assert.deepEqual(carets.filter(item=>item.index===3)[0].q,[0,-13]);
  const linked=[];
  Text.layout({...annotation,content:'A',pathMode:'linked',pathId:2,fraction:.25},
    new Map([[2,{type:'circle',c:[0,0],r:20}]]),measure,1,linked);
  close(linked[0].q[1],20);
  close(Math.cos(linked[0].angle),-1);
});

test('double-click word bounds respect accents, apostrophes and new lines',()=>{
  const text='Un été\nl’aube';
  assert.deepEqual(Text.wordRange(text,3),[3,6]);
  assert.deepEqual(Text.wordRange(text,9),[7,13]);
  assert.equal(Text.wordRange(text,6),null);
});
