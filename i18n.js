'use strict';
const I18n=(()=>{
  const storageKey='velocivector-language';
  const languages={
    en:{name:'English',locale:'en-US',messages:{...englishMessages,...helpEN}},
    es:{name:'Español',locale:'es-ES'},
    de:{name:'Deutsch',locale:'de-DE'},
    ja:{name:'日本語',locale:'ja-JP'},
    fr:{name:'Français',locale:'fr-FR',messages:helpFR},
    pt:{name:'Português',locale:'pt-BR'},
    ru:{name:'Русский',locale:'ru-RU'},
    it:{name:'Italiano',locale:'it-IT'},
    nl:{name:'Nederlands',locale:'nl-NL'},
    pl:{name:'Polski',locale:'pl-PL'},
    tr:{name:'Türkçe',locale:'tr-TR'},
    id:{name:'Bahasa Indonesia',locale:'id-ID'},
    zh:{name:'中文（简体）',locale:'zh-CN'},
    fa:{name:'فارسی',locale:'fa-IR',dir:'rtl'},
    cs:{name:'Čeština',locale:'cs-CZ'}
  };
  const options=Object.entries(languages).map(([code,{name,dir}])=>({code,name,dir:dir??'ltr'}));
  const valid=code=>Object.hasOwn(languages,code);
  let preference='auto';
  try {
    const saved=localStorage.getItem(storageKey);
    if(valid(saved)) preference=saved;
  } catch {}
  const browserLanguage=()=>[...(navigator.languages??[]),navigator.language]
    .map(tag=>tag?.toLowerCase().split('-')[0]).find(valid)??'fr';
  let active='fr', revision=0;
  const loading=new Map();
  function register(code,messages) {
    if(valid(code)&&!languages[code].messages) languages[code].messages=Object.freeze(messages);
  }
  function load(code) {
    if(!loading.has(code)) {
      const script=document.createElement('script');
      script.src='locales/'+code+'.js';
      const pending=new Promise(resolve=>{
        const finish=()=>{
          script.remove();
          loading.delete(code);
          resolve(Boolean(languages[code].messages));
        };
        script.onload=script.onerror=finish;
        document.head.append(script);
      });
      loading.set(code,pending);
    }
    return loading.get(code);
  }
  function t(source,values) {
    if(typeof source!=='string') return source;
    const messages=languages[active].messages;
    const fallback=Object.hasOwn(helpFR,source)?helpFR[source]:source;
    const text=Object.hasOwn(messages,source)?messages[source]:
      Object.hasOwn(messages,fallback)?messages[fallback]:fallback;
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
        if(!source) continue;
        bind(()=>item.data,text=>{item.data=value.replace(source,()=>text);},source);
      } else for(const name of ['title','aria-label','aria-description','placeholder','alt']) {
        const source=item.getAttribute(name);
        if(!source) continue;
        bind(()=>item.getAttribute(name),text=>item.setAttribute(name,text),source);
      }
    }
  }
  function refresh() {
    const requested=preference==='auto'?browserLanguage():preference;
    const request=++revision;
    const apply=code=>{
      if(request!==revision) return;
      active=code;
      document.documentElement.lang=code;
      document.documentElement.dir=languages[code].dir??'ltr';
      for(const binding of bindings) translate(binding);
    };
    if(languages[requested].messages) {
      apply(requested);
      return Promise.resolve();
    }
    return load(requested).then(loaded=>apply(loaded?requested:'fr'));
  }
  function setPreference(code) {
    preference=valid(code)?code:'auto';
    try {
      if(preference==='auto') localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey,preference);
    } catch {}
    return refresh();
  }
  const text=(node,source)=>bind(()=>node.textContent,value=>{node.textContent=value;},source);
  const attribute=(node,name,source)=>bind(()=>node.getAttribute(name),value=>node.setAttribute(name,value),source);
  staticText(document.body);
  const ready=refresh();
  return {t,text,attribute,staticText,setPreference,refresh,register,options,ready,
    get preference(){return preference;},get language(){return active;},get locale(){return languages[active].locale;}};
})();
