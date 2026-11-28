'use strict';
const ProjectHistory=(()=>{
  const limit=20, arrays=['layers','entities','constraints','texts'];
  const fields=state=>Object.keys(state).filter(key=>!arrays.includes(key)&&key!=='history'&&key!=='dimensionTableCsv');
  function pack(current,undo) {
    const rasters=[], rasterIds=new Map();
    function entry(key,item) {
      if(key!=='layers'||!item.raster) return item;
      const property=typeof item.raster.png==='string'?'png':typeof item.raster.source==='string'?'source':null;
      if(!property) return item;
      const content=item.raster[property];
      if(!rasterIds.has(content)) {rasterIds.set(content,rasters.length);rasters.push(content);}
      return {...item,raster:{...item.raster,[property]:rasterIds.get(content)}};
    }
    const steps=[];
    let newer=current;
    for(const older of undo.slice(-limit).reverse()) {
      const values=Object.fromEntries(fields(older).filter(key=>older[key]!==newer[key]).map(key=>[key,older[key]]));
      const remove=fields(newer).filter(key=>!Object.hasOwn(older,key));
      const lists={};
      for(const key of arrays) {
        const from=newer[key],to=older[key];
        if(from===to) continue;
        if(!Array.isArray(to)) {lists[key]=null;continue;}
        const changes=to.flatMap((item,i)=>item===from?.[i]?[]:[[i,entry(key,item)]]);
        lists[key]={length:to.length,changes};
      }
      steps.push({values,remove,lists});
      newer=older;
    }
    return steps.length?{version:1,steps,rasters}:undefined;
  }
  function unpack(current,history,validate) {
    if(history?.version!==1||!Array.isArray(history.steps)||!Array.isArray(history.rasters)) return [];
    const snapshots=[];
    let newer=current;
    for(const step of history.steps.slice(0,limit)) {
      try {
        if(!step||!step.values||!Array.isArray(step.remove)||!step.lists||
          Object.keys(step.lists).some(key=>!arrays.includes(key))||
          fields(step.values).length!==Object.keys(step.values).length||
          step.remove.some(key=>arrays.includes(key)||key==='history'||key==='dimensionTableCsv')) break;
        const older={...newer,...step.values};
        for(const key of step.remove) {
          if(typeof key!=='string') throw Error('Invalid history field.');
          delete older[key];
        }
        for(const [key,patch] of Object.entries(step.lists)) {
          if(patch===null) {delete older[key];continue;}
          const source=older[key]??[];
          const {length,changes}=patch;
          if(!Number.isSafeInteger(length)||length<0||!Array.isArray(changes)||
            length>source.length+changes.length) throw Error('Invalid history list.');
          const items=source.slice(0,length);
          const seen=new Set();
          for(const [index,row] of changes) {
            if(!Number.isSafeInteger(index)||index<0||index>=length||seen.has(index)) throw Error('Invalid history index.');
            seen.add(index);
            let item=row;
            if(key==='layers'&&row?.raster) {
              const property=Number.isSafeInteger(row.raster.png)?'png':Number.isSafeInteger(row.raster.source)?'source':null;
              if(property) {
                const content=history.rasters[row.raster[property]];
                if(typeof content!=='string') throw Error('Invalid history image.');
                item={...row,raster:{...row.raster,[property]:content}};
              }
            }
            items[index]=item;
          }
          if(items.length!==length||Object.keys(items).length!==length) throw Error('Incomplete history list.');
          older[key]=items;
        }
        delete older.history;delete older.dimensionTableCsv;
        newer=validate(older);
        snapshots.push(newer);
      } catch {break;}
    }
    return snapshots.reverse();
  }
  return {pack,unpack,limit};
})();
if(typeof module!=='undefined') module.exports=ProjectHistory;
