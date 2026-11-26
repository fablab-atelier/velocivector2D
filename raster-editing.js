'use strict';
const RasterEditing=(()=>{
  function enhance(source,{brightness=0,contrast=0,opacity=100,colors=[],tolerance=5}={}) {
    const result=new Uint8ClampedArray(source);
    const slope=2**(contrast/50);
    const lookup=Float32Array.from({length:256},(_,value)=>(value-128)*slope+128+brightness*2.55);
    const threshold=3*(tolerance*255/100)**2;
    const opacityFactor=opacity/100;
    for(let offset=0;offset<source.length;offset+=4) {
      const alpha=source[offset+3];
      if(!alpha) continue;
      const r=source[offset], g=source[offset+1], b=source[offset+2];
      result[offset]=lookup[r];result[offset+1]=lookup[g];result[offset+2]=lookup[b];
      if(opacityFactor===1) continue;
      const protectedColor=colors.some(([red,green,blue])=>(r-red)**2+(g-green)**2+(b-blue)**2<=threshold);
      if(!protectedColor) result[offset+3]=alpha*opacityFactor;
    }
    return result;
  }

  function apply(context,width,height,settings) {
    const stripeHeight=Math.max(1,Math.min(128,Math.floor(1_000_000/width)));
    for(let y=0;y<height;y+=stripeHeight) {
      const count=Math.min(stripeHeight,height-y);
      const source=context.getImageData(0,y,width,count);
      const result=enhance(source.data,settings);
      context.putImageData(new ImageData(result,width,count),0,y);
    }
  }

  function createWorker() {
    const source=`"use strict";
      const enhance=${enhance};
      const apply=${apply};
      self.onmessage=async ({data:{file,width,height,settings}})=>{
        try {
          const bitmap=await createImageBitmap(file);
          const canvas=new OffscreenCanvas(width,height), context=canvas.getContext('2d',{willReadFrequently:true});
          try {context.drawImage(bitmap,0,0,width,height);}
          finally {bitmap.close();}
          apply(context,width,height,settings);
          self.postMessage({blob:await canvas.convertToBlob({type:'image/png'})});
        } catch {
          self.postMessage({error:true});
        }
      };`;
    const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
    try {return new Worker(url);}
    finally {URL.revokeObjectURL(url);}
  }

  return {enhance,apply,createWorker};
})();
if(typeof module!=='undefined') module.exports=RasterEditing;
