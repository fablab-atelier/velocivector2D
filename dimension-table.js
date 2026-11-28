'use strict';
const DimensionTable=(()=>{
  const N=typeof module==='undefined'?Numeric:require('./numeric.js');
  const F=typeof module==='undefined'?Formal:require('./constraints.js');
  const CAD=typeof module==='undefined'?G:require('./geometry.js');
  const E=typeof module==='undefined'?Edit:require('./editing.js');
  const normalize=name=>String(name??'').toUpperCase();
  const validName=name=>/^[A-Za-z_][A-Za-z_0-9]{0,63}$/.test(name??'');
  const validValue=(c,v)=>Number.isFinite(v)&&v>=0&&(c.mode!=='angle'||v>0&&v<180)&&
    (!['radius','diameter','aligned'].includes(c.mode)||v>CAD.eps);
  const take=doc=>(doc.constraints??[]).filter(F.isDimension);
  function assign(doc) {
    if(!doc.constraints?.some(F.isDimension)) return doc;
    const names=new Set(), ids=new Set(), used=new Set();
    for(const c of take(doc)) if(validName(c.dimensionName)) used.add(normalize(c.dimensionName));
    let next=Number.isSafeInteger(doc.nextDimensionNumber)&&doc.nextDimensionNumber>0?doc.nextDimensionNumber:1;
    let changed=false;
    const constraints=doc.constraints.map(c=>{
      if(!F.isDimension(c)) return c;
      let id=c.dimensionId,name=c.dimensionName;
      if(typeof id!=='string'||!/^C[1-9]\d*$/.test(id)||ids.has(id)) {
        do {id='C'+next++;} while(ids.has(id)||used.has(id));
      }
      if(!validName(name)||names.has(normalize(name))) {
        name=id;
        while(names.has(normalize(name))||used.has(normalize(name))) name='C'+next++;
      }
      ids.add(id);names.add(normalize(name));
      if(id===c.dimensionId&&name===c.dimensionName) return c;
      changed=true;return {...c,dimensionId:id,dimensionName:name};
    });
    return changed||next!==doc.nextDimensionNumber?{...doc,constraints,nextDimensionNumber:next}:doc;
  }
  function rows(doc) {
    const entities=new Map(doc.entities.map(e=>[e.id,e]));
    return take(doc).map(c=>({id:c.dimensionId,name:c.dimensionName,value:c.driven?F.dimensionValue(entities,c)??c.value:c.value,
      expression:c.expression??'',constraint:c}));
  }
  function values(doc) {return new Map(rows(doc).map(row=>[normalize(row.name),row.value]));}
  function compute(constraints,items) {
    const map=new Map(items.map(entity=>[entity.id,entity]));
    const index=new Map(constraints.filter(F.isDimension).map(c=>[normalize(c.dimensionName),c]));
    const visiting=new Set(), results=new Map();
    function evaluate(name) {
      const key=normalize(name), c=index.get(key);
      if(!c) throw Error('Référence de cote inconnue.');
      if(results.has(key)) return results.get(key);
      if(visiting.has(key)) throw Error('Référence circulaire entre les cotes.');
      visiting.add(key);
      for(const ref of c.driven?[]:N.references(c.expression??'')) evaluate(ref);
      const value=c.driven?F.dimensionValue(map,c)??c.value:c.expression?N.evaluate(c.expression,evaluate):c.value;
      if(!validValue(c,value)) throw Error('Saisissez une valeur de cote valide.');
      visiting.delete(key);results.set(key,value);return value;
    }
    return constraints.map(c=>{
      if(!F.isDimension(c)) return c;
      const value=evaluate(c.dimensionName);
      return Math.abs(value-c.value)<=1e-10*Math.max(1,Math.abs(value))?c:{...c,value};
    });
  }
  function reconcile(doc,staged=[]) {
    doc=assign(doc);
    if(!doc.constraints?.some(F.isDimension)) return doc;
    let items=doc.entities, constraints=doc.constraints;
    const forced=new Set(staged);
    for(let pass=0;pass<12;pass++) {
      const computed=compute(constraints,items);
      const targets=computed.filter((c,i)=>F.isDimension(c)&&!c.driven&&(c!==constraints[i]||forced.has(c.dimensionId)));
      if(!targets.length) return computed.some((c,i)=>c!==constraints[i])||constraints!==doc.constraints||items!==doc.entities
        ?{...doc,entities:items,constraints:computed}:doc;
      const related=F.connected(computed,targets.flatMap(c=>c.refs.map(ref=>ref.id)));
      const solved=F.solveResize(items,related,targets);
      if(!solved||!F.preservesContourOrientation(items,solved,related)||
        solved.some(e=>!CAD.serial(e)||!E.valid(e))) throw Error('Cette valeur est incompatible avec les contraintes du dessin.');
      items=solved;constraints=computed;forced.clear();
    }
    throw Error('Référence circulaire entre les cotes.');
  }
  function restoreMissing(before,next) {
    const present=new Set(take(next).map(c=>normalize(c.dimensionName)));
    const removed=take(before).filter(c=>!present.has(normalize(c.dimensionName)));
    if(!removed.length) return next;
    const old=values(before);
    const constraints=next.constraints?.map(c=>{
      if(!F.isDimension(c)||!c.expression||!N.references(c.expression).some(name=>!present.has(normalize(name))&&old.has(normalize(name)))) return c;
      return {...c,expression:N.rewrite(c.expression,name=>!present.has(normalize(name))&&old.has(normalize(name))?
        '('+old.get(normalize(name))+')':name)};
    });
    return constraints&&constraints.some((c,i)=>c!==next.constraints[i])?{...next,constraints}:next;
  }
  function edit(doc,edits) {
    doc=assign(doc);
    if(!doc.constraints?.length) return doc;
    const byId=new Map(edits.map(edit=>[edit.id,edit]));
    const names=new Set(), renames=new Map();
    for(const c of take(doc)) {
      const name=(byId.get(c.dimensionId)?.name??c.dimensionName).trim(), key=normalize(name);
      if(!validName(name)||names.has(key)) throw Error('Les identifiants de cote doivent être uniques et sans espace.');
      names.add(key);renames.set(normalize(c.dimensionName),name);
    }
    const constraints=doc.constraints.map(c=>{
      if(!F.isDimension(c)) return c;
      const change=byId.get(c.dimensionId);
      const input=change?.expression??c.expression;
      if(change?.expression!==undefined&&!change.expression.trim()) throw Error('Saisissez une valeur de cote valide.');
      const expression=input&&N.references(input).some(n=>renames.has(normalize(n))&&renames.get(normalize(n))!==n)?
        N.rewrite(input,n=>renames.get(normalize(n))??n):input;
      const name=renames.get(normalize(c.dimensionName));
      return name!==c.dimensionName||expression!==c.expression?{...c,dimensionName:name,expression}:c;
    });
    return constraints.some((c,i)=>c!==doc.constraints[i])?reconcile({...doc,constraints}):doc;
  }
  function rebase(incoming,existing,factor=1) {
    const byName=new Map(incoming.filter(F.isDimension).map(c=>[normalize(c.dimensionName),c]));
    const names=new Set(take(existing).map(c=>normalize(c.dimensionName)));
    const ids=new Set(take(existing).map(c=>c.dimensionId));
    const renamed=new Map();
    let next=existing.nextDimensionNumber??1;
    const result=incoming.map(c=>{
      if(!F.isDimension(c)) return c;
      let id,name=c.dimensionName;
      do {id='C'+next++;} while(ids.has(id)||names.has(id));
      if(!validName(name)||names.has(normalize(name))) name=id;
      ids.add(id);names.add(normalize(name));
      if(c.dimensionName) renamed.set(normalize(c.dimensionName),name);
      return {...c,dimensionId:id,dimensionName:name};
    });
    return result.map(c=>{
      if(!F.isDimension(c)||!c.expression) return c;
      if(N.isLiteral(c.expression)) return factor===1||c.mode==='angle'?c:{...c,expression:String(c.value)};
      const expression=N.rewrite(c.expression,n=>{
        const key=normalize(n), source=byName.get(key), name=renamed.get(key);
        if(!name) return n;
        return factor!==1&&source?.mode!=='angle'?'('+name+' / '+factor+')':name;
      });
      const converted=factor!==1&&c.mode!=='angle'?'('+expression+') * '+factor:expression;
      return {...c,expression:converted.length<=512?converted:String(c.value)};
    });
  }
  const headers=['Cle','Identifiant','Valeur','Calcul'];
  const CSV=value=>'"'+String(value).replaceAll('"','""')+'"';
  const csv=doc=>[headers.join(','),...rows(doc).map(r=>
    [r.id,r.name,r.value,/^[=+@-]/.test(r.expression)?"'"+r.expression:r.expression].map(CSV).join(','))].join('\r\n')+'\r\n';
  function readCsv(raw) {
    const text=raw.replace(/^\uFEFF/,''), separator=text.split(/\r?\n/,1)[0].includes(';')?';':',';
    const data=[];let row=[],cell='',quoted=false;
    for(let i=0;i<text.length;i++) {
      const char=text[i];
      if(char==='"'&&quoted&&text[i+1]==='"') {cell+='"';i++;}
      else if(char==='"') quoted=!quoted;
      else if(!quoted&&char===separator) {row.push(cell);cell='';}
      else if(!quoted&&(char==='\n'||char==='\r')) {
        if(char==='\r'&&text[i+1]==='\n') i++;
        row.push(cell);if(row.some(Boolean)) data.push(row);row=[];cell='';
      } else cell+=char;
    }
    if(quoted) throw Error('Tableau de cotes CSV invalide.');
    row.push(cell);if(row.some(Boolean)) data.push(row);
    const [head,...records]=data;
    if(!head||head.join(',')!==headers.join(',')||records.some(r=>r.length!==headers.length)||
      new Set(records.map(r=>r[0])).size!==records.length) throw Error('Tableau de cotes CSV invalide.');
    return records.map(([id,name,value,formula])=>({id,name,value,expression:formula.replace(/^'(?=[=+@-])/,'')}));
  }
  return {assign,rows,values,edit,reconcile,restoreMissing,rebase,csv,readCsv,validValue};
})();
if(typeof module!=='undefined') module.exports=DimensionTable;
