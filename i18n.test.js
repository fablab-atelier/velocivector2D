'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {runInNewContext}=require('node:vm');
const source=['locale-en.js','help-fr.js','help-en.js','i18n.js'].map(file=>readFileSync(require('node:path').join(__dirname,file),'utf8')).join('\n');

function launch(languages,storage=new Map()) {
  const documentElement={};
  const menu={nodeType:3,data:' Fichier '};
  const requested=[];
  let i18n;
  const document={body:{},documentElement,createElement(){return {remove(){}};},head:{append(script){
    requested.push(script.src);
    queueMicrotask(()=>{
      const catalog=readFileSync(require('node:path').join(__dirname,script.src),'utf8');
      runInNewContext(catalog,{I18n:i18n});
      script.onload();
    });
  }},createTreeWalker(){
    let next=menu;
    return {nextNode(){const node=next;next=null;return node;}};
  }};
  const localStorage={
    getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)
  };
  i18n=runInNewContext(source+'\nI18n',{document,localStorage,navigator:{languages},
    Node:{TEXT_NODE:3},NodeFilter:{SHOW_ELEMENT:1,SHOW_TEXT:4}});
  return {i18n,documentElement,menu,requested};
}

test('interface follows the first supported browser language and falls back to French',async()=>{
  assert.equal(launch(['sv-SE','en-GB']).documentElement.lang,'en');
  assert.equal(launch(['sv-SE']).documentElement.lang,'fr');
  const german=launch(['de-DE','en-GB']);
  await german.i18n.ready;
  assert.equal(german.documentElement.lang,'de');
});

test('manual language is applied live, persists, and can return to browser language',()=>{
  const storage=new Map();
  const {i18n,menu,documentElement}=launch(['en-US'],storage);
  assert.equal(menu.data,' File ');
  i18n.setPreference('fr');
  assert.equal(documentElement.lang,'fr');
  assert.equal(menu.data,' Fichier ');
  assert.equal(launch(['en-US'],storage).i18n.preference,'fr');
  i18n.setPreference('auto');
  assert.equal(menu.data,' File ');
  assert.equal(i18n.t('Calque « {name} » supprimé.',{name:'Fichier'}),'Layer “Fichier” deleted.');
  assert.equal(launch(['en-US'],storage).i18n.preference,'auto');
});

test('experimental catalogs load on demand and a later choice wins over a pending load',async()=>{
  const storage=new Map();
  const {i18n,documentElement,menu,requested}=launch(['en-US'],storage);
  assert.equal(i18n.options.length,15);
  assert.deepEqual(requested,[]);
  await i18n.setPreference('es');
  assert.equal(menu.data,' Archivo ');
  assert.deepEqual(requested,['locales/es.js']);
  const persian=i18n.setPreference('fa');
  await i18n.setPreference('fr');
  await persian;
  assert.equal(documentElement.lang,'fr');
  await i18n.setPreference('fa');
  assert.equal(documentElement.dir,'rtl');
  assert.equal(menu.data,' پرونده ');
  assert.equal(i18n.t('help.circle.title'),'دایره');
  assert.equal(launch(['fr-FR'],storage).i18n.preference,'fa');
});

test('every tool guide card has a title and effect in both supported languages',()=>{
  const {helpFR,helpEN}=runInNewContext(source.slice(0,source.indexOf('const I18n='))+'\n({helpFR,helpEN})');
  assert.deepEqual(Object.keys(helpFR),Object.keys(helpEN));
  const app=readFileSync(require('node:path').join(__dirname,'app.js'),'utf8');
  const catalog=app.match(/const helpSections=(\{[^}]+\});/)[1];
  const sections=runInNewContext('('+catalog+')');
  const keys=Object.entries(sections).flatMap(([section,cards])=>[
    'help.section.'+section,...cards.flatMap(id=>['help.'+id+'.title','help.'+id+'.effect'])
  ]);
  assert.deepEqual(Object.keys(helpFR).sort(),keys.sort());
  const placeholders=text=>[...text.matchAll(/\{(\w+)\}/g)].map(match=>match[1]).sort();
  for(const key of keys) assert.deepEqual(placeholders(helpFR[key]),placeholders(helpEN[key]),key);
  assert.notEqual(launch(['fr-FR']).i18n.t('help.transform.effect'),launch(['en-GB']).i18n.t('help.transform.effect'));
});

test('all labeled HTML buttons have a translation entry in every interface language',()=>{
  const html=readFileSync(require('node:path').join(__dirname,'index.html'),'utf8');
  const labels=new Set([...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)]
    .map(([,body])=>body.replace(/<kbd>[\s\S]*?<\/kbd>/g,'').replace(/<[^>]+>/g,'').trim())
    .filter(label=>/\p{L}/u.test(label)));
  const {i18n}=launch(['fr-FR']);
  const english=runInNewContext(source.slice(0,source.indexOf('const I18n='))+'\nenglishMessages');
  for(const {code} of i18n.options) {
    if(code==='fr') continue;
    let catalog=english;
    if(code!=='en') {
      const path=require('node:path').join(__dirname,'locales',code+'.js');
      runInNewContext(readFileSync(path,'utf8'),{I18n:{register:(id,messages)=>{catalog=messages;}}});
    }
    assert.deepEqual([...labels].filter(label=>!Object.hasOwn(catalog,label)),[],code);
  }
});

test('Chinese covers the whole guide, layer field and live shortcut text',async()=>{
  const {i18n}=launch(['zh-CN']);
  await i18n.ready;
  assert.equal(i18n.t('Nouveau calque'),'新建图层');
  assert.equal(i18n.t('Raccourcis de l’outil actif'),'当前工具快捷键');
  assert.equal(i18n.t('Terminer le tracé'),'结束绘制');
  const help=runInNewContext(source.slice(0,source.indexOf('const I18n='))+'\nhelpFR');
  for(const [key,french] of Object.entries(help)) {
    assert.notEqual(i18n.t(key),french,key);
    const tokens=text=>[...text.matchAll(/\{(\w+)\}/g)].map(match=>match[1]).sort();
    assert.deepEqual(tokens(i18n.t(key)),tokens(french),key);
  }
});

test('each additional language covers the interface and guide catalogs',async()=>{
  const {i18n}=launch(['fr-FR']);
  const {englishMessages,helpFR}=runInNewContext(
    source.slice(0,source.indexOf('const I18n='))+'\n({englishMessages,helpFR})');
  const tokens=text=>[...text.matchAll(/\{(\w+)\}/g)].map(match=>match[1]).sort();
  for(const {code} of i18n.options) {
    if(code==='fr'||code==='en') continue;
    const path=require('node:path').join(__dirname,'locales',code+'.js');
    let catalog;
    runInNewContext(readFileSync(path,'utf8'),{I18n:{register:(id,messages)=>{catalog=messages;}}});
    const missing=[];
    for(const [key,base] of Object.entries({...englishMessages,...helpFR})) {
      const translated=catalog[key]??catalog[helpFR[key]];
      if(!translated?.trim()&&base.trim()) {missing.push(key);continue;}
      if(translated) assert.deepEqual(tokens(translated),tokens(base),code+' '+key);
    }
    assert.deepEqual(missing,[],code);
  }
});

