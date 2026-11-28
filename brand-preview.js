'use strict';
const BrandPreview=(()=>{
  const brandPreview=document.getElementById('brandPreview'), brandPreviewTarget=document.getElementById('brandPreviewTarget');
  let completed=false, scale=1, lastFrameTime=0, frame=0;
  let animations=[], closedAt=-Infinity;
  function updateScale(time) {
    scale=Math.max(1,scale-(time-lastFrameTime)*.0006);
    lastFrameTime=time;
    brandPreviewTarget.style.setProperty('--logo-scale',scale);
  }
  function animate(time) {
    updateScale(time);
    frame=requestAnimationFrame(animate);
  }
  function open() {
    if(completed||brandPreview.open||document.querySelector('dialog[open]')) return;
    scale=1;
    lastFrameTime=performance.now();
    brandPreviewTarget.setAttribute('aria-label',I18n.t('Agrandir le logo'));
    document.getElementById('brandPreviewClose').setAttribute('aria-label',I18n.t('Fermer'));
    brandPreviewTarget.style.setProperty('--logo-scale',1);
    brandPreview.showModal();
    brandPreviewTarget.focus();
    frame=requestAnimationFrame(animate);
  }
  function close() {
    if(!brandPreview.open) return;
    closedAt=performance.now();
    cancelAnimationFrame(frame);
    for(const animation of animations) animation.cancel();
    animations=[];
    brandPreview.close();
  }
  document.getElementById('brandPreviewClose').onclick=close;
  brandPreview.addEventListener('cancel',event=>{event.preventDefault();close();});
  for(const type of ['pointerdown','pointerup','click','dblclick','contextmenu']) {
    window.addEventListener(type,event=>{
      const age=performance.now()-closedAt;
      if(age<(type==='dblclick'?550:300)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },true);
  }
  for(const type of ['dblclick','contextmenu']) {
    brandPreview.addEventListener(type,event=>{event.preventDefault();event.stopPropagation();});
  }
  brandPreviewTarget.onclick=async()=>{
    if(!brandPreview.open||completed) return;
    updateScale(performance.now());
    scale=Math.min(2,scale+.15);
    brandPreviewTarget.style.setProperty('--logo-scale',scale);
    if(scale<2) return;
    completed=true;
    cancelAnimationFrame(frame);
    document.getElementById('brandRecognition').hidden=false;
    document.title+=' 👑';
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const pieces=[...brandPreviewTarget.querySelectorAll('path')];
      animations=pieces.map((piece,index)=>{
        const {x,y,width,height}=piece.getBBox();
        const angle=Math.atan2(y+height/2-50,x+width/2-50), distance=55+index%4*16;
        return piece.animate([{transform:'none',opacity:1},{
          transform:`translate(${Math.cos(angle)*distance}px,${Math.sin(angle)*distance}px) rotate(${index%2?55:-55}deg)`,
          opacity:0
        }],{duration:520,easing:'ease-out',fill:'forwards'});
      });
      await Promise.allSettled(animations.map(animation=>animation.finished));
    }
    close();
  };
  function onTextApplied(content,previous) {
    if(completed||content===previous) return;
    const emphasis=content.trim().match(/^\*{2}([^*]+)\*{2}$/u);
    const brand=brandPreview.getAttribute('aria-label').toLowerCase();
    if(emphasis?.[1]===brand) queueMicrotask(open);
  }
  return Object.freeze({onTextApplied,isOpen:()=>brandPreview.open});
})();
