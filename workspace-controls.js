(() => {
  const byId=id=>document.getElementById(id);
  const map={main:'mainWorkspace',active:'activeWorkspace',export:'exportWorkspace',advanced:'advancedWorkspace'};
  function showWorkspace(name){
    if(!map[name])name='main';
    for(const [key,id] of Object.entries(map)){
      const el=byId(id);if(!el)continue;const show=key===name;
      el.classList.toggle('hidden',!show);el.hidden=!show;
      if(show)el.style.removeProperty('display');else el.style.setProperty('display','none','important');
    }
    document.querySelectorAll('.workspace-tab').forEach(btn=>{const active=btn.dataset.workspace===name;btn.classList.toggle('active',active);btn.setAttribute('aria-selected',active?'true':'false')});
    try{sessionStorage.setItem('biodanzaWorkspace',name)}catch{}
  }
  document.addEventListener('click',event=>{
    const btn=event.target.closest?.('.workspace-tab');if(!btn)return;const name=btn.dataset.workspace;if(!map[name])return;
    event.preventDefault();setTimeout(()=>showWorkspace(name),0);
  },true);
  window.__biodanzaShowWorkspace=showWorkspace;
  const start=()=>{let wanted='main';try{const saved=sessionStorage.getItem('biodanzaWorkspace');if(map[saved])wanted=saved}catch{}showWorkspace(wanted)};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
