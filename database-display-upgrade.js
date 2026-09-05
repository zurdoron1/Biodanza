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
function __dbRowsFiltered(){
  const q=String(document.getElementById('characterizedDbSearch')?.value||'').trim().toLowerCase();
  const main=String(document.getElementById('characterizedDbMain')?.value||'');
  const sub=String(document.getElementById('characterizedDbSub')?.value||'');
  return __allSavedAnnotationRows().filter(({t,a,i,fallbackName})=>{
    if(main&&!(a.exerciseMains||[]).includes(main))return false;
    if(sub&&!(a.exerciseSubs||[]).includes(sub))return false;
    if(q){
      const title=a.title||clean(t?.file?.name||fallbackName);
      const artist=a.artist||(i>=0?artistOf(i):inferArtist(fallbackName));
      const hay=[title,artist,a.album||'',a.genre||'',...(a.exerciseMains||[]),...(a.exerciseSubs||[]),...(a.categories||[])].join(' ').toLowerCase();
      if(!hay.includes(q))return false;
    }
    return true;
  });
}
renderCharacterizedDb = function(){
  const box=document.getElementById('characterizedDbContent');
  const count=document.getElementById('characterizedDbCount');
  if(!box)return;
  const rows=__dbRowsFiltered();
  const all=__allSavedAnnotationRows();
  const available=rows.filter(x=>x.available).length;
  const detailed=all.filter(x=>typeof isCharacterizedAnnotation==='function'&&isCharacterizedAnnotation(x.a)).length;
  const hasFilter=Boolean(String(document.getElementById('characterizedDbSearch')?.value||'').trim()||document.getElementById('characterizedDbMain')?.value||document.getElementById('characterizedDbSub')?.value);
  if(count) count.textContent=hasFilter?`${rows.length} תוצאות · ${available} זמינות כעת להשמעה`:`${all.length} שירים במאגר · ${detailed} עם אפיון מפורט · ${all.filter(x=>x.available).length} זמינים כעת להשמעה`;
  if(!rows.length){box.innerHTML='<div class="characterized-db-empty">לא נמצאו שירים במאגר לפי הסינון הנוכחי.</div>';return;}
  box.innerHTML=`<table class="characterized-db-table"><thead><tr><th>האזנה</th><th>עריכה</th><th>שם השיר</th><th>מבצע</th><th>כוכבים</th><th>קטגוריה</th><th>תת־קטגוריה</th><th>אנרגיה</th><th>קצב</th><th>עומק רגרסיה</th></tr></thead><tbody>${rows.map(({key,t,i,a,available,fallbackName})=>`<tr data-db-key="${escapeHtml(key)}" class="${available?'':'db-unavailable'}"><td><button type="button" class="${available?'db-play secondary':'db-missing-play ghost'}" ${available?`data-i="${i}"`:`data-db-key="${escapeHtml(key)}"`} title="${available?'נגן':'האפיון שמור; קובץ השמע אינו זמין כרגע'}">${available?'▶':'▶ לא זמין'}</button></td><td>${available?`<button type="button" class="edit-pencil db-edit" data-i="${i}">✎</button>`:'<span class="small" title="האפיון נשמר, אך עריכה מלאה דורשת קובץ פעיל">—</span>'}</td><td>${escapeHtml(a.title||clean(t?.file?.name||fallbackName))}</td><td>${escapeHtml(a.artist||(i>=0?artistOf(i):inferArtist(fallbackName))||'—')}</td><td>${'★'.repeat(a.rating||0)||'—'}</td><td>${escapeHtml((a.exerciseMains||[]).join(', ')||'—')}</td><td>${escapeHtml((a.exerciseSubs||[]).join(', ')||'—')}</td><td>${a.energy||'—'}</td><td>${escapeHtml((a.rhythms||[]).join(', ')||a.rhythm||'—')}</td><td>${escapeHtml(a.regressionDepth||'—')}</td></tr>`).join('')}</tbody></table>`;
  box.querySelectorAll('.db-play').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.i);state.playlistMode=false;buildOrder(i);playTrack(i)});
  box.querySelectorAll('.db-edit').forEach(b=>b.onclick=()=>openSongEditModal(Number(b.dataset.i)));
  box.querySelectorAll('.db-missing-play').forEach(b=>b.onclick=()=>{
    const key=b.dataset.dbKey;const row=__allSavedAnnotationRows().find(x=>x.key===key||x.sourceKey===key);
    if(row&&typeof showUnavailableSongError==='function')showUnavailableSongError(row);
    else alert('השיר שמור במאגר, אך קובץ המוזיקה אינו זמין בתיקייה הפעילה.');
  });
};

try{ populateCharacterizedFilters(); }catch{}
try{ renderCharacterizedDb(); }catch{}
try{ if(typeof renderExportMatches==='function') renderExportMatches(); }catch{}
