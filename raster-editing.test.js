'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const F=require('./formats.js');
const {enhance,apply}=require('./raster-editing.js');

test('retouch adjusts brightness and contrast without changing alpha or the original buffer',()=>{
  const pixels=Uint8ClampedArray.of(80,128,170,125,10,20,30,0);
  assert.deepEqual(enhance(pixels),pixels);
  const brighter=enhance(pixels,{brightness:10});
  assert.ok(brighter[0]>80&&brighter[2]>170);
  assert.equal(brighter[3],125);
  assert.deepEqual(brighter.slice(4),pixels.slice(4));
  assert.equal(pixels[0],80);
  const contrast=enhance(pixels,{contrast:50});
  assert.ok(contrast[0]<80&&contrast[2]>170);
  assert.equal(contrast[1],128);
});

test('multiple original colors keep their alpha while the remaining pixels become transparent',()=>{
  const pixels=Uint8ClampedArray.of(250,10,10,255,12,220,12,128,251,11,12,100,23,45,190,200,10,20,30,0);
  const colors=[[250,10,10],[12,220,12]];
  const exact=enhance(pixels,{colors,tolerance:0,opacity:25,brightness:10});
  assert.deepEqual([...exact].filter((_,i)=>i%4===3),[255,128,25,50,0]);
  assert.ok(exact[1]>pixels[1]);
  const nearby=enhance(pixels,{colors,tolerance:5,opacity:0});
  assert.deepEqual([...nearby].filter((_,i)=>i%4===3),[255,128,100,0,0]);
  assert.equal(enhance(pixels,{opacity:50})[3],128);
});

test('raster signatures and VCV image sources distinguish JPEG/JFIF, GIF, WebP and AVIF',()=>{
  const samples=[
    ['image/jpeg',Buffer.from('ffd8ffe000104a4649460001','hex')],
    ['image/gif',Buffer.from('GIF89a\x01\x00\x01\x00\x80\x00','ascii')],
    ['image/webp',Buffer.from('RIFF\x06\x00\x00\x00WEBPVP8L','ascii')],
    ['image/avif',Buffer.from('\x00\x00\x00\x18ftypmif1\x00\x00\x00\x00avifmif1','ascii')]
  ];
  for(const [mime,bytes] of samples) {
    assert.equal(F.rasterMime(bytes),mime);
    const source='data:'+mime+';base64,'+bytes.toString('base64');
    const raster={source,width:1,height:1,center:[0,0],pixelSize:1,scale:1,angle:0,activeOpacity:80,inactiveOpacity:35};
    const doc=F.empty();
    doc.layers.push({name:'Image 1',color:'#000000',visible:true,raster});
    assert.equal(F.rasterSource(F.native(JSON.stringify(doc)).layers[1].raster),source);
    raster.source=source.replace(mime,'image/png');
    assert.throws(()=>F.native(JSON.stringify(doc)),/image matricielle invalide/);
  }
  assert.equal(F.rasterMime(Buffer.from('<svg></svg>')),null);
});

test('full-resolution processing matches the same color protection applied to a single buffer',()=>{
  const width=4,height=260,row=width*4;
  const source=new Uint8ClampedArray(row*height);
  for(let i=0;i<source.length;i+=4) {
    source[i]=i%179;
    source[i+1]=i%193;
    source[i+2]=i%167;
    source[i+3]=255;
  }
  const canvas=source.slice();
  const context={
    getImageData(x,y,w,h) {return {data:canvas.slice(y*row,(y+h)*row)};},
    putImageData(image,x,y) {
      canvas.set(image.data,y*row);
    }
  };
  const settings={brightness:4,contrast:12,opacity:25,colors:[[109,82,130]],tolerance:40};
  const browserImageData=global.ImageData;
  global.ImageData=class {constructor(data) {this.data=data;}};
  try {apply(context,width,height,settings);}
  finally {if(browserImageData) global.ImageData=browserImageData;else delete global.ImageData;}
  assert.deepEqual(canvas,enhance(source,settings));
});
