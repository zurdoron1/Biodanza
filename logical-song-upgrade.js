// Biodanza 5.6.0 - logical song identity layer.
// A song is one logical record that may have several physical files/paths.
// Inject this file INSIDE the main renderer IIFE so it can use state/ann/render* directly.
(() => {
  function songNorm(v=''){
    try { return norm(String(v||'')); }
    catch { return String(v||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\u0590-\u05ff]+/g,' ').trim(); }
  }

  function stripCataloguePrefix(name=''){
    let s=String(name||'').replace(/\.[A-Za-z0-9]{2,5}$/,' ');
    s=s.replace(/^\s*[A-Za-z]{1,8}\d{1,4}(?:[-_ ]\d{1,4})?\s*[-_–—]+\s*/i,' ');
    s=s.replace(/^\s*\d{1,3}\s*[-_–—]+\s*/,' ');
    return s.trim();
  }

  function semanticTokens(name=''){
    const s=songNorm(stripCataloguePrefix(name));
    return [...new Set(s.split(/\s+/).filter(Boolean).filter(x=>
      !/^(the|a|an|track|cd|disc|disk|audio|official|video)$/i.test(x) &&
      !/^\d+$/.test(x) && !/^[a-z]{1,8}\d{1,4}$/i.test(x)
    ))];
  }

  function logicalIdentityForTrack(t,i){
    const a=(typeof ann==='function' ? ann(i) : (state.annotations?.[t?.key]||{})) || {};
    const title=songNorm(a.title||'');
    const artist=songNorm(a.artist||'');
    // Best identity: metadata title + artist, Access-style central SongList semantics.
    if(title && artist) return `meta:${artist}|${title}`;

    const name=String(t?.file?.name||'');
    const exact=songNorm(stripCataloguePrefix(name));
    const tokens=semanticTokens(name);
    // Sort tokens so "The Beatles - All Together Now" and "All together now-beatles" converge.
    if(tokens.length>=3) return `tokens:${[...tokens].sort().join('|')}`;
    return `name:${exact}`;
  }

  function mergeAnnotationValues(target,source){
    if(!source) return target||{};
    const out={...(target||{})};
    const arrayFields=['categories','groupLevels','exerciseMains','exerciseSubs','extensions','customExtensions','vivenciaLines'];
    for(const k of arrayFields){
      const A=Array.isArray(out[k])?out[k]:[];
      const B=Array.isArray(source[k])?source[k]:[];
      if(A.length||B.length) out[k]=[...new Set([...A,...B])];
    }
    for(const [k,v] of Object.entries(source)){
      if(arrayFields.includes(k)) continue;
      const empty=out[k]===undefined || out[k]===null || out[k]==='' || out[k]===0 || out[k]===false;
      if(empty && v!==undefined && v!==null && v!=='') out[k]=v;
    }
    if(Number(source.rating||0)>Number(out.rating||0)) out.rating=Number(source.rating||0);
    return out;
  }

  function collapseLogicalDuplicates(){
    if(!state?.tracks?.length) return {unique:0,duplicates:0};
    const groups=new Map();
    state.tracks.forEach((t,i)=>{
      const id=logicalIdentityForTrack(t,i);
      if(!groups.has(id)) groups.set(id,[]);
      groups.get(id).push({t,i});
    });

    let duplicateCount=0;
    const newTracks=[];
    const keyMap=new Map();
    for(const [logicalId,members] of groups){
      const primary=members[0].t;
      primary.logicalSongId=logicalId;
      primary.alternateFiles=[];
      primary.alternatePaths=[];
      primary.alternateKeys=[];

      let merged=state.annotations?.[primary.key]||null;
      for(let n=1;n<members.length;n++){
        const d=members[n].t;
        duplicateCount++;
        primary.alternateFiles.push(d.file);
        primary.alternatePaths.push(d.nativePath||d.file?.webkitRelativePath||d.file?.name||'');
        primary.alternateKeys.push(d.key);
        keyMap.set(d.key,primary.key);
        merged=mergeAnnotationValues(merged,state.annotations?.[d.key]);
        try{ if(d.url) URL.revokeObjectURL(d.url); }catch{}
      }
      if(merged) state.annotations[primary.key]=merged;
      for(const oldKey of primary.alternateKeys){
        if(oldKey!==primary.key && state.annotations?.[oldKey]) delete state.annotations[oldKey];
      }
      newTracks.push(primary);
    }

    if(duplicateCount){
      state.tracks=newTracks.map((t,i)=>({...t,index:i}));
      if(Array.isArray(state.chosen)) state.chosen=[...new Set(state.chosen.map(k=>keyMap.get(k)||k))];
      state.active=Math.min(state.active,state.tracks.length-1);
      try{ buildOrder(Math.max(0,state.active)); }catch{}
      try{ populateFolders(); }catch{}
      try{ renderRows(); }catch{}
      try{ renderChosen(); }catch{}
      try{ renderActiveLibrary(); }catch{}
      try{ renderCharacterizedDb(); }catch{}
      try{ renderExportMatches(); }catch{}
      try{ saveData(); }catch{}
    }

    // Always expose a compact diagnostic/status so we can verify the logical-song layer on Windows.
    try{
      const el=document.getElementById('loadStatus');
      if(el){
        const characterized=typeof countCharacterizedLoadedTracks==='function'?countCharacterizedLoadedTracks():0;
        el.textContent=`${state.tracks.length} שירים ייחודיים נטענו · ${duplicateCount} עותקים כפולים אוחדו · ${characterized} כבר משויכים למאגר`;
      }
    }catch{}
    return {unique:state.tracks.length,duplicates:duplicateCount};
  }

  // Make duplicate copies of the same logical song a single candidate before relinking.
  if(typeof relinkPackage==='function'){
    const originalRelinkPackage=relinkPackage;
    relinkPackage=async function(pkg){
      collapseLogicalDuplicates();
      return await originalRelinkPackage(pkg);
    };
  }

  // Collapse immediately after the Electron folder loader finishes.
  const originalElectronLoader=window.__biodanzaLoadElectronLibrary;
  if(typeof originalElectronLoader==='function'){
    window.__biodanzaLoadElectronLibrary=async function(...args){
      const result=await originalElectronLoader(...args);
      collapseLogicalDuplicates();
      return result;
    };
  }

  // Metadata (Title/Artist) can reveal additional duplicates that filenames alone did not.
  if(typeof importFileMetadata==='function'){
    const originalImportFileMetadata=importFileMetadata;
    importFileMetadata=async function(...args){
      const result=await originalImportFileMetadata(...args);
      collapseLogicalDuplicates();
      return result;
    };
  }

  window.__biodanzaLogicalSongs={
    collapse:collapseLogicalDuplicates,
    identity:logicalIdentityForTrack,
    version:'5.6.0'
  };

  // If a library is already loaded when the upgrade is injected, normalize it now.
  try{ if(state?.tracks?.length) collapseLogicalDuplicates(); }catch(error){ console.warn('Logical song grouping failed',error); }
})();
