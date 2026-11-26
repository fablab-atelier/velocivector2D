'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {runInNewContext}=require('node:vm');
const source=['locale-en.js','i18n.js'].map(file=>readFileSync(require('node:path').join(__dirname,file),'utf8')).join('\n');

function launch(languages,storage=new Map()) {
  const documentElement={};
  const menu={nodeType:3,data:' Fichier '};
  const document={body:{},documentElement,createTreeWalker(){
    let next=menu;
    return {nextNode(){const node=next;next=null;return node;}};
  }};
  const localStorage={
    getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)
  };
  const i18n=runInNewContext(source+'\nI18n',{document,localStorage,navigator:{languages},
    Node:{TEXT_NODE:3},NodeFilter:{SHOW_ELEMENT:1,SHOW_TEXT:4}});
  return {i18n,documentElement,menu};
}

test('interface follows the first supported browser language and falls back to French',()=>{
  assert.equal(launch(['de-DE','en-GB']).documentElement.lang,'en');
  assert.equal(launch(['de-DE']).documentElement.lang,'fr');
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

