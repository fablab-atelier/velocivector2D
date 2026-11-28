'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const T=require('./dimension-table'),N=require('./numeric'),G=require('./geometry'),Formal=require('./constraints');
const line=(id,y,length)=>({id,type:'line',p:[[0,y],[length,y]],layer:'0'});
const dim=(id,value,expression)=>{
  const relation={type:'dimension',mode:'aligned',value,refs:[{id,kind:'edge',index:0}],offset:[0,1],layer:'0'};
  return expression?{...relation,expression}:relation;
};
const drawing=()=>T.assign({entities:[line(1,0,10),line(2,8,20),line(3,16,21)],
  constraints:[dim(1,10),dim(2,20,'C1*2'),dim(3,21,'C2+1')]});
const values=doc=>T.rows(doc).map(row=>row.value);
test('Cote names are incremental, calculable and propagate over several references',()=>{
  const source=drawing();
  assert.deepEqual(T.rows(source).map(r=>r.name),['C1','C2','C3']);
  const updated=T.edit(source,[{id:'C1',name:'Largeur',expression:'(3+4)*2'}]);
  assert.deepEqual(values(updated),[14,28,29]);
  assert.deepEqual(updated.entities.map(e=>Math.round(G.traceLength(e))),[14,28,29]);
  assert.deepEqual(N.references(updated.constraints[1].expression),['Largeur']);
  assert.deepEqual(T.readCsv(T.csv(updated)).map(r=>[r.id,r.name,Number(r.value)]),
    [['C1','Largeur',14],['C2','C2',28],['C3','C3',29]]);
  assert.equal(N.evaluate('Largeur/2',token=>T.values(updated).get(token.toUpperCase())),7);
  assert.throws(()=>T.edit(updated,[{id:'C1',expression:'C3'}]),/circulaire/);
  assert.throws(()=>T.edit(updated,[{id:'C1',name:'C2'}]),/uniques/);
  assert.throws(()=>T.edit(updated,[{id:'C1',expression:'inconnue'}]),/inconnue/);
});
test('Copied cote references stay internal and deleted dependencies preserve the last scalar',()=>{
  const source=drawing();
  const copy=T.rebase(source.constraints,source);
  assert.deepEqual(N.references(copy[1].expression),[copy[0].dimensionName]);
  assert.notEqual(copy[0].dimensionId,source.constraints[0].dimensionId);
  const removed=T.restoreMissing(source,{...source,entities:source.entities.slice(1),constraints:source.constraints.slice(1)});
  assert.deepEqual(values(T.reconcile(removed)),[20,21]);
});
test('A driven cote can feed a parameter without being edited directly',()=>{
  const source=drawing();
  source.constraints[0]={...source.constraints[0],driven:true};
  source.entities[0]=line(1,0,12);
  const solved=T.reconcile(source);
  assert.deepEqual(values(solved),[12,24,25]);
  assert.ok(Formal.satisfied(new Map(solved.entities.map(e=>[e.id,e])),solved.constraints[1]));
});
