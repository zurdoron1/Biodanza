(() => {
  function byId(id){ return document.getElementById(id); }
  function setStatus(text, bad=false){
    const el = byId('electronLibraryStatus') || byId('loadStatus');
    if(el){ el.textContent = text; el.style.color = bad ? '#b42318' : ''; }
  }
  async function applyPayload(payload){
    if(!payload || payload.canceled) return;
    if(typeof window.__biodanzaLoadElectronLibrary === 'function'){
      window.__biodanzaLoadElectronLibrary(payload);
      return;
    }
    setStatus('שגיאה: מנגנון טעינת הספרייה לא הושלם.', true);
    alert('בחירת התיקייה הצליחה, אך מנגנון טעינת השירים לא נטען.');
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
  function bind(){
    const chooseBtn=byId('choosePersistentFolder');
    const reopenBtn=byId('reopenPreviousFolder');
    if(chooseBtn){
      chooseBtn.disabled=false;
      chooseBtn.onclick=null;
      chooseBtn.addEventListener('click', e=>{e.preventDefault();e.stopImmediatePropagation();choose();}, true);
    }
    if(reopenBtn){
      reopenBtn.disabled=false;
      reopenBtn.onclick=null;
      reopenBtn.addEventListener('click', e=>{e.preventDefault();e.stopImmediatePropagation();reopen();}, true);
    }
    if(window.electronAPI?.isElectron){
      setStatus('Electron מחובר — אפשר לבחור תיקיית מוזיקה.');
    }else{
      setStatus('Electron לא מחובר — preload לא נטען.', true);
    }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', bind, {once:true});
  else bind();
})();
