(function(){
  const PREFIX='pdw2027FeatureSeen:';

  function key(el){return el&&el.getAttribute('data-new-feature')||''}

  function sameFeature(name){
    return Array.from(document.querySelectorAll('[data-new-feature]'))
      .filter(el=>key(el)===name);
  }

  function apply(root){
    (root||document).querySelectorAll?.('[data-new-feature]').forEach(el=>{
      const name=key(el);
      if(!name)return;
      if(localStorage.getItem(PREFIX+name)==='1') el.classList.remove('new-feature');
      else el.classList.add('new-feature');
    });
  }

  document.addEventListener('click',e=>{
    const el=e.target.closest&&e.target.closest('[data-new-feature]');
    if(!el)return;
    const name=key(el);
    if(!name)return;
    localStorage.setItem(PREFIX+name,'1');
    sameFeature(name).forEach(x=>x.classList.remove('new-feature'));
  },true);

  document.addEventListener('focusin',e=>{
    const el=e.target.closest&&e.target.closest('input[data-new-feature],select[data-new-feature]');
    if(!el)return;
    const name=key(el);
    if(!name)return;
    localStorage.setItem(PREFIX+name,'1');
    sameFeature(name).forEach(x=>x.classList.remove('new-feature'));
  },true);

  window.refreshFeatureHighlights=()=>apply(document);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>apply(document));
  else apply(document);

  new MutationObserver(muts=>{
    muts.forEach(m=>m.addedNodes.forEach(n=>{
      if(n.nodeType!==1)return;
      if(n.matches&&n.matches('[data-new-feature]'))apply(n.parentElement||document);
      else apply(n);
    }));
  }).observe(document.documentElement,{childList:true,subtree:true});
})();