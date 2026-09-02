(() => {
  function byId(id){ return document.getElementById(id); }
  const map = {
    main: 'mainWorkspace',
    active: 'activeWorkspace',
    export: 'exportWorkspace',
    advanced: 'advancedWorkspace'
  };

  function showWorkspace(name){
    for (const [key,id] of Object.entries(map)) {
      const el = byId(id);
      if (!el) continue;
      const show = key === name;
      el.classList.toggle('hidden', !show);
      el.style.setProperty('display', show ? 'block' : 'none', 'important');
    }
    document.querySelectorAll('.workspace-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.workspace === name);
    });
  }

  document.addEventListener('click', (event) => {
    const btn = event.target.closest('.workspace-tab');
    if (!btn) return;
    const name = btn.dataset.workspace;
    if (!map[name]) return;
    setTimeout(() => showWorkspace(name), 0);
  }, true);

  window.__biodanzaShowWorkspace = showWorkspace;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => showWorkspace('main'), {once:true});
  } else {
    showWorkspace('main');
  }
})();
