(() => {
  function byId(id){ return document.getElementById(id); }
  function setStatus(text, bad=false){
    const el = byId('electronLibraryStatus') || byId('loadStatus');
    if(el){ el.textContent = text; el.style.color = bad ? '#b42318' : ''; }
  }
  async function applyPayload(payload){
    if(!payload || payload.canceled) return;
    const loader = window.__biodanzaLoadElectronLibrary;
    if(typeof loader === 'function'){
      loader(payload);
      return;
    }
    setStatus('שגיאה: פונקציית טעינת הספרייה אינה זמינה.', true);
    alert('חלון בחירת התיקייה פעל, אך טעינת הספרייה אינה זמינה.');
  }
  async function choose(){
    try{
      if(!window.electronAPI?.chooseMusicFolder) throw new Error('Electron bridge unavailable');
      setStatus('פותח חלון לבחירת תיקיית מוזיקה…');
      const payload = await window.electronAPI.chooseMusicFolder();
      if(payload?.canceled){ setStatus('בחירת התיקייה בוטלה.'); return; }
      await applyPayload(payload);
    }catch(err){
      console.error('folder choose failed', err);
      setStatus('שגיאה בחיבור ל־Electron: ' + (err?.message || err), true);
      alert('לא ניתן לפתוח את חלון בחירת התיקייה.\n\n' + (err?.message || err));
    }
  }
  async function reopen(){
    try{
      if(!window.electronAPI?.reopenMusicFolder) throw new Error('Electron bridge unavailable');
      setStatus('פותח את תיקיית המוזיקה הקודמת…');
      const payload = await window.electronAPI.reopenMusicFolder();
      await applyPayload(payload);
    }catch(err){
      console.error('folder reopen failed', err);
      setStatus('שגיאה בחיבור ל־Electron: ' + (err?.message || err), true);
      alert('לא ניתן לפתוח את תיקיית המוזיקה הקודמת.\n\n' + (err?.message || err));
    }
  }
  function prepare(){
    const chooseBtn=byId('choosePersistentFolder');
    const reopenBtn=byId('reopenPreviousFolder');
    if(chooseBtn) chooseBtn.disabled=false;
    if(reopenBtn) reopenBtn.disabled=false;
    if(window.electronAPI?.isElectron){
      setStatus('Electron מחובר — בחירת תיקייה פעילה.');
    }else{
      setStatus('Electron לא מחובר — preload לא נטען.', true);
    }
  }

  // Delegated capture handler: runs before target-level handlers in the main app.
  document.addEventListener('click', (e) => {
    const target = e.target?.closest?.('#choosePersistentFolder,#reopenPreviousFolder');
    if(!target) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if(target.id === 'choosePersistentFolder') choose();
    else reopen();
  }, true);

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', prepare, {once:true});
  else prepare();
})();
