'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Model=require('./plugins/workshop-builder/model');
const Formal=require('./constraints'), G=require('./geometry'), Formats=require('./formats');
const layers=['Base','Variante A','Variante B'].map(name=>({name,visible:true,color:'#000000'}));
const line=(id,layer,p)=>({id,layer,type:'line',p});
const edge=id=>({id,kind:'edge',index:0});
const entities=[line(1,'Base',[[0,0],[20,0]]),line(2,'Variante A',[[0,10],[20,10]]),
  line(3,'Variante B',[[0,20],[40,20]])];
const source={version:1,units:4,layers,entities,
  constraints:[Formal.make('horizontal',[edge(1)],entities),Formal.make('equal',[edge(1),edge(2)],entities),
    {type:'dimension',mode:'aligned',refs:[edge(1)],value:20,offset:[0,5],layer:'Base'}]};
const [dimension]=Model.dimensions(source);
const recipe={version:1,id:'exemple',name:'Exemple',layers:[{name:'Base',role:'object'},
  ...layers.slice(1).map(l=>({name:l.name,role:'variant'}))],
  parameters:[{key:dimension.key,label:'Longueur',min:5,max:100}]};

test('Generated workshops preserve driving dimensions and make variant dependencies explicit',()=>{
  const values=new Map([[dimension.key,35]]);
  const result=Model.build(source,Model.recipe(recipe),values,['Base','Variante A']).drawing;
  assert.equal(result.constraints.length,3);
  assert.ok(result.entities.every(e=>Math.abs(G.dist(...e.p)-35)<1e-6));
  assert.equal(Formats.native(JSON.stringify(result)).constraints.at(-1).value,35);
  const alternate=Model.build(source,recipe,values,['Base','Variante B']);
  assert.equal(alternate.skipped,1);
  assert.equal(alternate.drawing.entities.length,2);
  assert.ok(Math.abs(G.dist(...alternate.drawing.entities[1].p)-40)<1e-6);
  assert.throws(()=>Model.build(source,recipe,new Map([[dimension.key,-1]]),['Base']),/badValues/);
});

test('Workshop packages contain their editable VCV and configuration',async()=>{
  const files=Model.projectFiles(recipe,source);
  const saved=Formats.native(files['source.vcv']);
  assert.deepEqual(saved.entities,source.entities);
  assert.ok(saved.dimensionTableCsv.includes('C1'));
  assert.deepEqual(JSON.parse(files['workshop.json']),recipe);
  assert.match(files['plugin.js'],/source-data\.js/);
  const zip=new Uint8Array(await Model.zip(recipe.id,files).arrayBuffer());
  const end=new DataView(zip.buffer,zip.length-22);
  assert.equal(end.getUint32(0,true),0x06054b50);
  assert.equal(end.getUint16(10,true),4);
  assert.throws(()=>Model.recipe({...recipe,id:'../unsafe'}),/invalidRecipe/);
});

test('Workshop text-only layers keep editable text and honor each layer toggle',()=>{
  const title={id:20,layer:'Base',content:'Original',family:'Arial',align:'left',p:[0,0],
    height:5,width:100,angle:0,letter:0,line:2,radius:0,along:0,offset:0,fraction:0,
    pathMode:'straight',reverse:false,inside:false,upright:false};
  const textOnly={...source,entities:[],constraints:[],texts:[title]};
  const changes=new Map([[title.id,{content:'Pièce modifiée',family:'Verdana',height:8,align:'center'}]]);
  const edited=Model.build(textOnly,recipe,new Map(),['Base'],changes);
  assert.equal(edited.drawing.entities.length,0);
  assert.equal(edited.drawing.texts[0].content,'Pièce modifiée');
  assert.equal(edited.drawing.texts[0].family,'Verdana');
  assert.equal(edited.drawing.texts[0].height,8);
  assert.equal(edited.drawing.texts[0].width,title.width);
  assert.doesNotThrow(()=>Formats.native(JSON.stringify(edited.drawing)));
  assert.equal(title.content,'Original');
  const fixed={...recipe,layers:[{name:'Base',role:'object',textEditable:false}]};
  assert.equal(Model.build(textOnly,fixed,new Map(),['Base'],changes).drawing.texts[0],title);
  assert.throws(()=>Model.build(textOnly,recipe,new Map(),['Base'],new Map([[title.id,{height:-1}]])),/badValues/);
});

test('Workshop exposes direct aliases through their master and preserves calculated links',()=>{
  const T=require('./dimension-table'), Numeric=require('./numeric');
  const shapes=[line(1,'Base',[[0,0],[10,0]]),line(2,'Base',[[0,10],[22,10]]),
    line(3,'Base',[[0,20],[22,20]]),line(4,'Base',[[0,30],[22,30]])];
  const dims=shapes.map((shape,i)=>({type:'dimension',mode:'aligned',refs:[edge(shape.id)],
    value:[10,22,22,22][i],expression:['10','C1 * 2 + 2','C2','C3'][i],offset:[0,1],layer:'Base'}));
  const drawing=T.assign({...source,entities:shapes,constraints:dims});
  const drivers=Model.dimensionDrivers(drawing);
  const [base,master,alias,secondAlias]=drivers;
  assert.equal(master.followers,2);
  assert.equal(secondAlias.rootKey,master.key);
  const definition={...recipe,parameters:[{key:alias.key,label:'',min:null,max:null}]};
  assert.deepEqual(Model.parametersFor(drivers,definition).map(p=>p.key),[master.key]);
  const edited=Model.build(drawing,definition,new Map([[Model.operandKey(master.key,0),3]]),['Base']).drawing;
  assert.deepEqual(edited.constraints.map(c=>c.value),[10,32,32,32]);
  assert.deepEqual(Numeric.references(edited.constraints[1].expression),['C1']);
  assert.equal(edited.constraints[2].expression,'C2');
  assert.equal(edited.constraints[3].expression,'C3');
  const symbolOnly={...drawing,constraints:drawing.constraints.map((c,i)=>i===1?{...c,expression:'C1*C1'}:c)};
  assert.deepEqual(Model.parametersFor(Model.dimensionDrivers(symbolOnly),definition).map(p=>p.key),[master.key,base.key]);
});
