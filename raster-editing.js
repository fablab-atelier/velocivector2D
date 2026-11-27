'use strict';
const RasterEditing=(()=>{
  function enhance(source,{brightness=0,contrast=0,opacity=100,colors=[],erase=[],tolerance=5}={}) {
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
      const matches=([red,green,blue])=>(r-red)**2+(g-green)**2+(b-blue)**2<=threshold;
      if(erase.length&&!colors.some(matches)&&erase.some(matches)) result[offset+3]=0;
      else if(opacityFactor!==1&&!colors.some(matches)) result[offset+3]=alpha*opacityFactor;
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

  function plan(width,height,{crop,quad,angle=0}={}) {
    let w=width,h=height,map=(x,y)=>[x,y],orientation=0;
    if(quad) {
      const [a,b,c,d]=quad.map(([x,y])=>[x*width,y*height]);
      const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
      w=Math.max(dist(a,b),dist(d,c));h=Math.max(dist(a,d),dist(b,c));
      const [x0,y0]=a,[x1,y1]=b,[x2,y2]=c,[x3,y3]=d;
      orientation=Math.atan2(y1-y0,x1-x0);
      const dx1=x1-x2,dx2=x3-x2,dx3=x0-x1+x2-x3,dy1=y1-y2,dy2=y3-y2,dy3=y0-y1+y2-y3;
      const det=dx1*dy2-dx2*dy1;
      const g=(dx3*dy2-dx2*dy3)/det, k=(dx1*dy3-dx3*dy1)/det;
      map=(x,y)=>{
        const u=x/w,v=y/h,z=1+g*u+k*v;
        return [(x0+(x1-x0+g*x1)*u+(x3-x0+k*x3)*v)/z,(y0+(y1-y0+g*y1)*u+(y3-y0+k*y3)*v)/z];
      };
    }
    const a=orientation+angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
    const outW=Math.max(1,Math.ceil(Math.abs(w*c)+Math.abs(h*s)-1e-9)),outH=Math.max(1,Math.ceil(Math.abs(w*s)+Math.abs(h*c)-1e-9));
    const [left,top,right,bottom]=crop??[0,0,1,1];
    return {width:Math.max(1,Math.round((right-left)*outW)),height:Math.max(1,Math.round((bottom-top)*outH)),map:(x,y)=>{
      const i=x+(left-.5)*outW,j=y+(top-.5)*outH, u=w/2+i*c+j*s,v=h/2-i*s+j*c;
      return u>=0&&v>=0&&u<w&&v<h?map(u,v):null;
    }};
  }

  function validQuad(points) {
    if(points.length!==4) return false;
    const turns=points.map(([x,y],i)=>{
      const [a,b]=points[(i+1)%4],[c,d]=points[(i+2)%4];
      return (a-x)*(d-b)-(b-y)*(c-a);
    });
    return turns.every(t=>t>1e-6)||turns.every(t=>t< -1e-6);
  }

  function rectified(source,width,height,shape) {
    if(!shape?.crop&&!shape?.quad&&!shape?.angle) return {data:source,width,height};
    const target=plan(width,height,shape), data=new Uint8ClampedArray(target.width*target.height*4);
    for(let y=0;y<target.height;y++) for(let x=0;x<target.width;x++) {
      const p=target.map(x+.5,y+.5);
      if(!p) continue;
      const [u,v]=p.map(Math.floor);
      if(u>=0&&v>=0&&u<width&&v<height) {
        const from=(v*width+u)*4,to=(y*target.width+x)*4;
        for(let channel=0;channel<4;channel++) data[to+channel]=source[from+channel];
      }
    }
    return {data,width:target.width,height:target.height};
  }

  function binaryCleanup(data,width,height,options,ratio=1) {
    const {threshold=160,adaptive=false,shadowRadius=30,background=true}=options;
    const gray=Uint8Array.from({length:width*height},(_,i)=>{
      const k=i*4;
      return data[k+3]?Math.round(.2126*data[k]+.7152*data[k+1]+.0722*data[k+2]):255;
    });
    const stride=width+1, sum=adaptive?new Float64Array(stride*(height+1)):null;
    if(sum) for(let y=0;y<height;y++) {
      let row=0;
      for(let x=0;x<width;x++) {
        row+=gray[y*width+x];
        sum[(y+1)*stride+x+1]=sum[y*stride+x+1]+row;
      }
    }
    let mask=new Uint8Array(gray.length);
    const radius=Math.max(1,Math.round(shadowRadius*ratio));
    for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
      const i=y*width+x;
      let limit=threshold;
      if(sum) {
        const l=Math.max(0,x-radius),r=Math.min(width,x+radius+1),t=Math.max(0,y-radius),b=Math.min(height,y+radius+1);
        const average=(sum[b*stride+r]-sum[b*stride+l]-sum[t*stride+r]+sum[t*stride+l])/((r-l)*(b-t));
        limit=average+(threshold-180)*.5-5;
      }
      mask[i]=data[i*4+3]&&gray[i]<=limit?1:0;
    }
    const maximum=Math.round(options.specks*ratio*ratio);
    if(maximum>0) {
      const visited=new Uint8Array(mask.length), queue=new Int32Array(mask.length);
      for(let root=0;root<mask.length;root++) if(mask[root]&&!visited[root]) {
        let count=1;
        queue[0]=root;visited[root]=1;
        for(let k=0;k<count;k++) {
          const i=queue[k],x=i%width,y=Math.floor(i/width);
          for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) {
            const j=i+dy*width+dx;
            if(x+dx<0||x+dx>=width||y+dy<0||y+dy>=height||!mask[j]||visited[j]) continue;
            visited[j]=1;queue[count++]=j;
          }
        }
        if(count<=maximum) for(let k=0;k<count;k++) mask[queue[k]]=0;
      }
    }
    const gap=Math.round(options.gap*ratio);
    if(gap>0) {
      const filled=mask.slice();
      const connect=(start,step,count)=>{
        let previous=-1;
        for(let i=0;i<count;i++) if(mask[start+i*step]) {
          if(previous>=0&&i-previous<=gap+1)
            for(let j=previous+1;j<i;j++) filled[start+j*step]=1;
          previous=i;
        }
      };
      for(let y=0;y<height;y++) connect(y*width,1,width);
      for(let x=0;x<width;x++) connect(x,width,height);
      for(let x=0;x<width;x++) {connect(x,width+1,Math.min(width-x,height));connect(x,width-1,Math.min(x+1,height));}
      for(let y=1;y<height;y++) {
        connect(y*width,width+1,Math.min(width,height-y));
        connect(y*width+width-1,width-1,Math.min(width,height-y));
      }
      mask=filled;
    }
    const thickness=Math.round(options.thickness*ratio), thick=thickness>0;
    for(let pass=0;pass<Math.abs(thickness);pass++) {
      const next=mask.slice();
      for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
        const i=y*width+x;
        if(mask[i]===Number(thick)) continue;
        if([x>0?mask[i-1]:0,x+1<width?mask[i+1]:0,y>0?mask[i-width]:0,y+1<height?mask[i+width]:0]
          .some(value=>value===Number(thick))) next[i]=Number(thick);
      }
      mask=next;
    }
    for(let i=0;i<mask.length;i++) {
      const k=i*4;
      data[k]=data[k+1]=data[k+2]=mask[i]?0:255;
      if(!mask[i]&&background) data[k+3]=0;
      else if(mask[i]&&!data[k+3]) data[k+3]=255;
    }
  }

  function processPixels(source,width,height,settings,ratio=1) {
    const styled=enhance(source,settings);
    if(settings.scan?.enabled) binaryCleanup(styled,width,height,settings.scan,ratio);
    return rectified(styled,width,height,settings.shape);
  }

  function createWorker() {
    const source=`"use strict";
      const enhance=${enhance};
      const apply=${apply};
      const plan=${plan};
      const rectified=${rectified};
      const binaryCleanup=${binaryCleanup};
      const processPixels=${processPixels};
      self.onmessage=async ({data:{file,width,height,settings}})=>{
        try {
          const bitmap=await createImageBitmap(file);
          const canvas=new OffscreenCanvas(width,height), context=canvas.getContext('2d',{willReadFrequently:true});
          try {context.drawImage(bitmap,0,0,width,height);}
          finally {bitmap.close();}
          let output=canvas;
          if(settings.scan.enabled||settings.shape.crop||settings.shape.quad||settings.shape.angle) {
            const result=processPixels(context.getImageData(0,0,width,height).data,width,height,settings);
            output=new OffscreenCanvas(result.width,result.height);
            output.getContext('2d').putImageData(new ImageData(result.data,result.width,result.height),0,0);
          } else apply(context,width,height,settings);
          self.postMessage({blob:await output.convertToBlob({type:'image/png'})});
        } catch {
          self.postMessage({error:true});
        }
      };`;
    const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
    try {return new Worker(url);}
    finally {URL.revokeObjectURL(url);}
  }

  return {enhance,apply,plan,validQuad,processPixels,createWorker};
})();
if(typeof module!=='undefined') module.exports=RasterEditing;
