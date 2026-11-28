'use strict';
const Numeric=(()=>{
  let lookup=()=>NaN;
  const tokenize=text=>String(text).trim().replace(/,/g,'.')
    .match(/(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?|[A-Za-z_][A-Za-z_0-9]*|\*\*|[+*/()-]|\S/gi)??[];
  const identifier=/^[A-Za-z_][A-Za-z_0-9]*$/;
  const isLiteral=text=>/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(String(text).trim().replace(',','.'));
  const literalTerms=text=>tokenize(text).filter(isLiteral).map(Number);
  function replaceTerms(text,values) {
    let index=0;
    return tokenize(text).map(token=>{
      if(!isLiteral(token)) return token;
      const value=values[index++];
      return value===undefined?token:value<0?'('+value+')':String(value);
    }).join(' ');
  }
  const references=text=>tokenize(text).filter(token=>identifier.test(token));
  const rewrite=(text,replace)=>tokenize(text).map(token=>identifier.test(token)?replace(token):token).join(' ');
  function evaluate(text,resolve=lookup) {
    const input=String(text).trim().replace(/,/g,'.');
    if(!input||input.length>512) return NaN;
    const tokens=tokenize(input);
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
      if(identifier.test(token??'')) return checked(resolve(token));
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
      if(normalize&&Number.isFinite(number)&&!references(input.value).length) input.value=String(number);
      return Number.isFinite(number);
    }
    const descriptor=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
    Object.defineProperty(input,'value',{
      get:()=>descriptor.get.call(input),
      set:text=>{descriptor.set.call(input,text);validate();}
    });
    input.addEventListener('input',()=>validate(),true);
    input.addEventListener('change',()=>validate(true),true);
    input.addEventListener('blur',()=>validate(true),true);
    input.addEventListener('keydown',event=>{
      if(event.key!=='Enter'||event.isComposing||event.ctrlKey||event.altKey||event.metaKey) return;
      if(!validate(true)&&input.value.trim()) {
        event.preventDefault();
        input.reportValidity();
      } else if(!input.form&&!input.closest('#modifyOptions')) input.blur();
    },true);
  }
  return {evaluate,install,isLiteral,literalTerms,replaceTerms,references,rewrite,setResolver:resolve=>{lookup=resolve;}};
})();
if(typeof module!=='undefined') module.exports=Numeric;
