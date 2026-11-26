'use strict';
const I18n=(()=>{
  const storageKey='velocivector-language';
  const languages={fr:{locale:'fr-FR',messages:{}},en:{locale:'en-US',messages:englishMessages}};
  const valid=code=>Object.hasOwn(languages,code);
  let preference='auto';
  try {
    const saved=localStorage.getItem(storageKey);
    if(valid(saved)) preference=saved;
  } catch {}
  const browserLanguage=()=>[...(navigator.languages??[]),navigator.language]
    .map(tag=>tag?.toLowerCase().split('-')[0]).find(valid)??'fr';
  let active=preference==='auto'?browserLanguage():preference;
  function t(source,values) {
    if(typeof source!=='string') return source;
    const messages=languages[active].messages;
    const text=Object.hasOwn(messages,source)?messages[source]:source;
    return values?text.replace(/\{(\w+)\}/g,(key,name)=>Object.hasOwn(values,name)?values[name]:key):text;
  }
  const bindings=[];
  function bind(read,write,source) {
    const binding={read,write,source,last:read()};
    bindings.push(binding);
    translate(binding);
  }
  function translate(binding) {
    const previous=binding.read(), translated=t(binding.source);
    if(previous!==binding.last) return;
    binding.write(translated);
    binding.last=binding.read();
  }
  function staticText(root) {
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);
    for(let node=walker.nextNode();node;node=walker.nextNode()) {
      const item=node;
      if(item.nodeType===Node.TEXT_NODE) {
        if(item.parentElement?.closest('script, style, [lang]:not(html)')) continue;
        const value=item.data, source=value.trim();
        if(!source || !Object.values(languages).some(language=>Object.hasOwn(language.messages,source))) continue;
        bind(()=>item.data,text=>{item.data=value.replace(source,text);},source);
      } else for(const name of ['title','aria-label','placeholder']) {
        const source=item.getAttribute(name);
        if(!source||!Object.values(languages).some(language=>Object.hasOwn(language.messages,source))) continue;
        bind(()=>item.getAttribute(name),text=>item.setAttribute(name,text),source);
      }
    }
  }
  function refresh() {
    active=preference==='auto'?browserLanguage():preference;
    document.documentElement.lang=active;
    for(const binding of bindings) translate(binding);
  }
  function setPreference(code) {
    preference=valid(code)?code:'auto';
    try {
      if(preference==='auto') localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey,preference);
    } catch {}
    refresh();
  }
  const text=(node,source)=>bind(()=>node.textContent,value=>{node.textContent=value;},source);
  const attribute=(node,name,source)=>bind(()=>node.getAttribute(name),value=>node.setAttribute(name,value),source);
  staticText(document.body);
  refresh();
  return {t,text,attribute,staticText,setPreference,refresh,get preference(){return preference;},get locale(){return languages[active].locale;}};
})();
