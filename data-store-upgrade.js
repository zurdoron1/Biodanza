// This file is injected inside the main renderer IIFE by the Windows build workflow.
// It intentionally has access to state/saveData/render helpers from the original player.

let __playerDataSaveTimer = null;
let __playerDataWriteQueue = Promise.resolve();
let __lastKnownAnnotationCount = Object.keys(state.annotations || {}).length;

function __refreshAfterPlayerDataLoad(){
  try { if (typeof populateCharacterizedFilters === 'function') populateCharacterizedFilters(); } catch {}
  try { if (typeof renderCharacterizedDb === 'function') renderCharacterizedDb(); } catch {}
  try { if (typeof renderRows === 'function') renderRows(); } catch {}
  try { if (typeof renderChosen === 'function') renderChosen(); } catch {}
  try { if (typeof renderActiveLibrary === 'function') renderActiveLibrary(); } catch {}
  try { if (typeof renderExportMatches === 'function') renderExportMatches(); } catch {}
  try { if (typeof renderExportSequence === 'function') renderExportSequence(); } catch {}
}

function __writePlayerDataNow(){
  if (!window.electronAPI?.writePlayerData) return Promise.resolve({ok:false,error:'Electron data API unavailable'});
  const payload = { annotations: state.annotations || {}, chosen: Array.isArray(state.chosen) ? state.chosen : [] };
  __playerDataWriteQueue = __playerDataWriteQueue.catch(()=>{}).then(async () => {
    const result = await window.electronAPI.writePlayerData(payload);
    if (!result?.ok) throw new Error(result?.error || 'שמירת מאגר האפיונים נכשלה');
    try { localStorage.removeItem(DATA_KEY); } catch {}
    try { localStorage.setItem(CHOSEN_KEY, JSON.stringify(state.chosen || [])); } catch {}
    try { showSaveState('saved'); } catch {}
    return result;
  }).catch(error => {
    console.error('File-backed player data save failed', error);
    try { showToast('שמירת מאגר האפיונים נכשלה: ' + (error?.message || error)); } catch {}
    return {ok:false,error:String(error?.message || error)};
  });
  return __playerDataWriteQueue;
}

saveData = function(){
  try { showSaveState('saving'); } catch {}
  const currentCount = Object.keys(state.annotations || {}).length;
  if (currentCount !== __lastKnownAnnotationCount) {
    __lastKnownAnnotationCount = currentCount;
    __refreshAfterPlayerDataLoad();
    try {
      const characterized = typeof characterizedRows === 'function' ? characterizedRows().length : currentCount;
      if (characterized > 0) showToast(`מאגר האפיונים עודכן: ${characterized} שירים מאופיינים`);
    } catch {}
  }
  if (window.electronAPI?.writePlayerData) {
    clearTimeout(__playerDataSaveTimer);
    __playerDataSaveTimer = setTimeout(() => { __writePlayerDataNow(); }, 120);
    return;
  }
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(state.annotations || {}));
    localStorage.setItem(CHOSEN_KEY, JSON.stringify(state.chosen || []));
    requestAnimationFrame(() => { try { showSaveState('saved'); } catch {} });
  } catch (error) {
    console.error('Legacy localStorage save failed', error);
    try { showToast('אין מספיק מקום באחסון המקומי. יש להשתמש בגרסת Electron המעודכנת.'); } catch {}
  }
};

async function __restorePlayerDataFromDisk(){
  if (!window.electronAPI?.readPlayerData || !window.electronAPI?.writePlayerData) return;
  try {
    const disk = await window.electronAPI.readPlayerData();
    if (!disk?.ok) throw new Error(disk?.error || 'קריאת מאגר האפיונים נכשלה');

    if (disk.exists) {
      state.annotations = disk.annotations && typeof disk.annotations === 'object' ? disk.annotations : {};
      state.chosen = Array.isArray(disk.chosen) ? disk.chosen : [];
      __lastKnownAnnotationCount = Object.keys(state.annotations || {}).length;
      try { localStorage.removeItem(DATA_KEY); } catch {}
      try { localStorage.setItem(CHOSEN_KEY, JSON.stringify(state.chosen)); } catch {}
      __refreshAfterPlayerDataLoad();
      const characterized = typeof characterizedRows === 'function' ? characterizedRows().length : Object.keys(state.annotations || {}).length;
      try { showToast(`מאגר האפיונים נטען: ${characterized} שירים מאופיינים`); } catch {}
      return;
    }

    // First run after upgrading: migrate the old localStorage database to the file store.
    const hasLegacy = Object.keys(state.annotations || {}).length > 0 || (state.chosen || []).length > 0;
    if (hasLegacy) {
      const result = await window.electronAPI.writePlayerData({annotations:state.annotations || {},chosen:state.chosen || []});
      if (!result?.ok) throw new Error(result?.error || 'העברת המאגר לאחסון החדש נכשלה');
      __lastKnownAnnotationCount = Object.keys(state.annotations || {}).length;
      try { localStorage.removeItem(DATA_KEY); } catch {}
      try { localStorage.setItem(CHOSEN_KEY, JSON.stringify(state.chosen || [])); } catch {}
      __refreshAfterPlayerDataLoad();
      try { showToast('מאגר האפיונים הועבר לאחסון החדש ללא מגבלת localStorage.'); } catch {}
    }
  } catch (error) {
    console.error('Player data migration/load failed', error);
    try { showToast('שגיאה בטעינת מאגר האפיונים: ' + (error?.message || error)); } catch {}
  }
}

setTimeout(__restorePlayerDataFromDisk, 0);
