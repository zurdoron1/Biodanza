// Biodanza 5.7.0 - durable file-backed application state.
// Inject inside the main renderer IIFE.
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
  try { if (typeof updatePlaylistNameUI === 'function') updatePlaylistNameUI(); } catch {}
}
function __plainObject(v){ return v && typeof v==='object' && !Array.isArray(v) ? v : {}; }
function __readUiPreferences(){
  const values={};
  for(const id of ['previewMode','clipLength','startPercent','gap','speed','order','normalize']){
    const el=document.getElementById(id); if(!el) continue;
    values[id]=id==='normalize'?Boolean(el.checked):el.value;
  }
  let legacy={};
  try{ legacy=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')||{}; }catch{}
  return {...legacy,...values};
}
function __applyPreferences(preferences){
  const prefs=__plainObject(preferences);
  for(const [id,value] of Object.entries(prefs)){
    const el=document.getElementById(id); if(!el) continue;
    if(id==='normalize') el.checked=(value===true||value==='on'||value==='true'); else el.value=value;
  }
  try{ if(document.getElementById('startPercentValue')) document.getElementById('startPercentValue').textContent=(document.getElementById('startPercent')?.value||0)+'%'; }catch{}
  try{ if(typeof setNormalization==='function') setNormalization(); }catch{}
  try{ if(typeof audio!=='undefined'&&audio) audio.playbackRate=Number(document.getElementById('speed')?.value)||1; }catch{}
}
function __playerDataPayload(){
  state.preferences={...__plainObject(state.preferences),...__readUiPreferences()};
  return {
    annotations: __plainObject(state.annotations),
    chosen: Array.isArray(state.chosen) ? state.chosen : [],
    playlistName: typeof state.playlistName==='string' ? state.playlistName : '',
    exportSequence: Array.isArray(state.exportSequence) ? state.exportSequence : [],
    logicalAliases: __plainObject(state.logicalAliases),
    logicalSongs: __plainObject(state.logicalSongs),
    preferences: __plainObject(state.preferences)
  };
}
function __applyDiskState(disk){
  state.annotations = __plainObject(disk.annotations);
  state.chosen = Array.isArray(disk.chosen) ? disk.chosen : [];
  if(typeof disk.playlistName==='string') state.playlistName=disk.playlistName;
  if(Array.isArray(disk.exportSequence)) state.exportSequence=disk.exportSequence;
  state.logicalAliases=__plainObject(disk.logicalAliases);
  state.logicalSongs=__plainObject(disk.logicalSongs);
  state.preferences=__plainObject(disk.preferences);
  __applyPreferences(state.preferences);
  __lastKnownAnnotationCount = Object.keys(state.annotations || {}).length;
}
function __writePlayerDataNow(){
  if (!window.electronAPI?.writePlayerData) return Promise.resolve({ok:false,error:'Electron data API unavailable'});
  const payload=__playerDataPayload();
  __playerDataWriteQueue = __playerDataWriteQueue.catch(()=>{}).then(async () => {
    const result = await window.electronAPI.writePlayerData(payload);
    if (!result?.ok) throw new Error(result?.error || 'שמירת מאגר האפיונים נכשלה');
    try { localStorage.removeItem(DATA_KEY); } catch {}
    try { localStorage.setItem(CHOSEN_KEY, JSON.stringify(state.chosen || [])); } catch {}
    try { localStorage.setItem(SETTINGS_KEY,JSON.stringify(state.preferences||{})); } catch {}
    try { localStorage.setItem('biodanzaPlaylistNameV1',state.playlistName||''); } catch {}
    try { localStorage.setItem('biodanzaExportSequenceV1',JSON.stringify(state.exportSequence||[])); } catch {}
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

try{
  if(typeof saveSettings==='function'){
    const __legacySaveSettings=saveSettings;
    saveSettings=function(){ __legacySaveSettings(); state.preferences=__readUiPreferences(); saveData(); };
  }
}catch(error){console.warn('Could not hook settings persistence',error)}
try{
  if(typeof saveExportSequence==='function'){
    const __legacySaveExportSequence=saveExportSequence;
    saveExportSequence=function(){ __legacySaveExportSequence(); saveData(); };
  }
}catch(error){console.warn('Could not hook export sequence persistence',error)}
try{
  document.getElementById('savePlaylistName')?.addEventListener('click',()=>setTimeout(()=>saveData(),0));
}catch{}

async function __restorePlayerDataFromDisk(){
  if (!window.electronAPI?.readPlayerData || !window.electronAPI?.writePlayerData) return;
  try {
    const disk = await window.electronAPI.readPlayerData();
    if (!disk?.ok) throw new Error(disk?.error || 'קריאת מאגר האפיונים נכשלה');
    if (disk.exists) {
      __applyDiskState(disk);
      try { localStorage.removeItem(DATA_KEY); } catch {}
      try { localStorage.setItem(CHOSEN_KEY, JSON.stringify(state.chosen)); } catch {}
      __refreshAfterPlayerDataLoad();
      const characterized = typeof characterizedRows === 'function' ? characterizedRows().length : Object.keys(state.annotations || {}).length;
      try {
        if(disk.recoveredFromBackup) showToast(`מאגר האפיונים שוחזר אוטומטית מהגיבוי: ${characterized} רשומות`);
        else showToast(`מאגר האפיונים נטען: ${characterized} רשומות`);
      } catch {}
      if(Number(disk.version||1)<2 || disk.recoveredFromBackup) setTimeout(()=>__writePlayerDataNow(),50);
      return;
    }
    state.preferences={...__readUiPreferences(),...__plainObject(state.preferences)};
    const hasLegacy = Object.keys(state.annotations || {}).length > 0 || (state.chosen || []).length > 0 || Object.keys(state.preferences).length>0;
    if (hasLegacy) {
      const result = await window.electronAPI.writePlayerData(__playerDataPayload());
      if (!result?.ok) throw new Error(result?.error || 'העברת המאגר לאחסון החדש נכשלה');
      __lastKnownAnnotationCount = Object.keys(state.annotations || {}).length;
      try { localStorage.removeItem(DATA_KEY); } catch {}
      try { localStorage.setItem(CHOSEN_KEY, JSON.stringify(state.chosen || [])); } catch {}
      __refreshAfterPlayerDataLoad();
      try { showToast('המאגר וההגדרות הועברו לאחסון הקבוע.'); } catch {}
    }
  } catch (error) {
    console.error('Player data migration/load failed', error);
    try { showToast('שגיאה בטעינת מאגר האפיונים: ' + (error?.message || error)); } catch {}
  }
}
window.__biodanzaPlayerStore={flush:__writePlayerDataNow,payload:__playerDataPayload,restore:__restorePlayerDataFromDisk,version:2};
setTimeout(__restorePlayerDataFromDisk, 0);
