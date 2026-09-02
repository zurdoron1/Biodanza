// Injected inside the main renderer IIFE.
// Makes the central database show every saved annotation record, including partial/legacy records.

function __allSavedAnnotationRows(){
  const loadedByKey=new Map(state.tracks.map((t,i)=>[t.key,{t,i}]));
  return Object.entries(state.annotations||{}).map(([key,a])=>{
    const loaded=loadedByKey.get(key)||null;
    const fallbackName=typeof fileNameFromAnnotationKey==='function'?fileNameFromAnnotationKey(key):String(key).split('|')[0]||'';
    return {
      key,
      a:a||{},
      t:loaded?.t||null,
      i:loaded?.i??-1,
      available:Boolean(loaded),
      fallbackName
    };
  });
}

characterizedRows = function(){
  return __allSavedAnnotationRows();
};

countCharacterizedLoadedTracks = function(){
  return state.tracks.reduce((count,t)=>count+(state.annotations && state.annotations[t.key]?1:0),0);
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
    if(count && !q && !main && !sub){
      count.textContent=`${all.length} רשומות במאגר · ${detailed} עם אפיון מפורט · ${available} זמינות כעת להשמעה`;
    }
  }catch(error){ console.warn('Database count enhancement failed',error); }
};

// Refresh immediately if data was already restored/imported before this patch ran.
try{ populateCharacterizedFilters(); }catch{}
try{ renderCharacterizedDb(); }catch{}
try{ if(typeof renderExportMatches==='function') renderExportMatches(); }catch{}
