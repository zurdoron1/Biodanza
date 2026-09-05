// Biodanza 5.7.0 - central saved database, independent of the currently loaded folder.
// Inject inside the main renderer IIFE.
function __allSavedAnnotationRows(){
  const aliases=(state.logicalAliases&&typeof state.logicalAliases==='object')?state.logicalAliases:{};
  const loadedByKey=new Map();
  state.tracks.forEach((t,i)=>{
    loadedByKey.set(t.key,{t,i});
    for(const k of t.alternateKeys||[]) loadedByKey.set(k,{t,i});
  });
  const rows=[];
  for(const [key,a0] of Object.entries(state.annotations||{})){
    const canonical=aliases[key]||key;
    if(canonical!==key && state.annotations?.[canonical]) continue;
    const loaded=loadedByKey.get(key)||loadedByKey.get(canonical)||null;
    const fallbackName=typeof fileNameFromAnnotationKey==='function'?fileNameFromAnnotationKey(key):String(key).split('|')[0]||'';
    rows.push({key:canonical,a:a0||{},t:loaded?.t||null,i:loaded?.i??-1,available:Boolean(loaded),fallbackName,sourceKey:key});
  }
  return rows;
}
characterizedRows = function(){ return __allSavedAnnotationRows(); };
countCharacterizedLoadedTracks = function(){
  const aliases=(state.logicalAliases&&typeof state.logicalAliases==='object')?state.logicalAliases:{};
  const seen=new Set();
  for(const t of state.tracks){
    const keys=[t.key,...(t.alternateKeys||[])];
    const hit=keys.find(k=>state.annotations?.[k] || state.annotations?.[aliases[k]]);
    if(hit) seen.add(aliases[hit]||hit);
  }
  return seen.size;
};

const __originalRenderCharacterizedDb = renderCharacterizedDb;
renderCharacterizedDb = function(){
  __originalRenderCharacterizedDb();
  try{
    const all=__allSavedAnnotationRows();
    const detailed=all.filter(x=>typeof isCharacterizedAnnotation==='function' && isCharacterizedAnnotation(x.a)).length;
    const available=all.filter(x=>x.available).length;
    const count=document.getElementById('characterizedDbCount');
    const q=String(document.getElementById('characterizedDbSearch')?.value||'').trim();
    const main=String(document.getElementById('characterizedDbMain')?.value||'');
    const sub=String(document.getElementById('characterizedDbSub')?.value||'');
    if(count && !q && !main && !sub) count.textContent=`${all.length} שירים במאגר · ${detailed} עם אפיון מפורט · ${available} זמינים כעת להשמעה`;
  }catch(error){ console.warn('Database count enhancement failed',error); }
};

document.addEventListener('click',e=>{
  const target=e.target?.closest?.('[data-db-key]');
  if(!target) return;
  const key=target.dataset.dbKey;
  if(!key) return;
  const row=__allSavedAnnotationRows().find(x=>x.key===key||x.sourceKey===key);
  if(row && !row.available && (target.matches('button,a') || target.closest('button,a'))){
    e.preventDefault();
    e.stopPropagation();
    try{ showToast('השיר שמור במאגר, אך קובץ המוזיקה אינו זמין בתיקייה הפעילה.'); }catch{ alert('השיר שמור במאגר, אך קובץ המוזיקה אינו זמין בתיקייה הפעילה.'); }
  }
},true);

try{ populateCharacterizedFilters(); }catch{}
try{ renderCharacterizedDb(); }catch{}
try{ if(typeof renderExportMatches==='function') renderExportMatches(); }catch{}
