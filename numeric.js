'use strict';
const Numeric=(()=>{
  function evaluate(text) {
    const input=String(text).trim().replace(/,/g,'.');
    if(!input||input.length>512) return NaN;
    const tokens=input.match(/(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?|\*\*|[+*/()-]|\S/gi);
    let i=0;
    const take=token=>tokens[i]===token&&(i++,true);
    const checked=value=>{if(!Number.isFinite(value)) throw Error();return value;};
    function atom() {
      if(take('(')) {
        const value=sum();
        if(!take(')')) throw Error();
        return value;
      }
      const token=tokens[i++];
      if(!/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(token??'')) throw Error();
      return checked(Number(token));
    }
    function unary() {
      if(take('+')) return unary();
      if(take('-')) return -unary();
      const value=atom();
      return take('**')?checked(value**unary()):value;
    }
    function product() {
      let value=unary();
      while(tokens[i]==='*'||tokens[i]==='/') {
        const operation=tokens[i++], next=unary();
        value=checked(operation==='*'?value*next:value/next);
      }
      return value;
    }
    function sum() {
      let value=product();
      while(tokens[i]==='+'||tokens[i]==='-') {
        const operation=tokens[i++], next=product();
        value=checked(operation==='+'?value+next:value-next);
      }
      return value;
    }
    try {
      const result=sum();
      if(i!==tokens.length) return NaN;
      return tokens.length===1||(tokens.length===2&&['+','-'].includes(tokens[0]))?result:Number(result.toPrecision(15));
    } catch {return NaN;}
  }

  function install(input) {
    input.type='text';
    input.inputMode='text';
    input.spellcheck=false;
    input.dataset.numericExpression='';
    const value=()=>{
      const number=evaluate(input.value);
      const min=input.getAttribute('min'),max=input.getAttribute('max');
      return min!==null&&number<Number(min)||max!==null&&number>Number(max)?NaN:number;
    };
    Object.defineProperty(input,'valueAsNumber',{get:value});
    function validate(normalize=false) {
      const number=value(), blank=!input.value.trim();
      input.setCustomValidity(!blank&&!Number.isFinite(number)?(typeof I18n==='undefined'?'Saisissez un calcul valide dans les limites du champ.':I18n.t('Saisissez un calcul valide dans les limites du champ.')):'');
      if(normalize&&Number.isFinite(number)) input.value=String(number);
      return Number.isFinite(number);
    }
    const descriptor=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
    Object.defineProperty(input,'value',{
      get:()=>descriptor.get.call(input),
      set:text=>{descriptor.set.call(input,text);validate();}
    });
    input.addEventListener('input',()=>validate(),true);
    input.addEventListener('change',()=>validate(true),true);
    input.addEventListener('keydown',event=>{
      if(event.key!=='Enter'||event.isComposing||event.ctrlKey||event.altKey||event.metaKey) return;
      if(!validate(true)&&input.value.trim()) {
        event.preventDefault();
        input.reportValidity();
      } else if(!input.form&&!input.closest('#modifyOptions')) input.blur();
    },true);
  }
  return {evaluate,install};
})();
if(typeof module!=='undefined') module.exports=Numeric;
