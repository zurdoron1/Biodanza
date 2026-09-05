// Biodanza 5.7.0 - one logical song may have several physical files.
// Inject inside the main renderer IIFE.
(() => {
  const badMeta = v => /^(artist|album|genre|unknown|undefined|null|n\/a|na|track|מבצע לא ידוע)$/i.test(String(v||'').trim());
  function songNorm(v=''){
    try { return norm(String(v||'')); }
    catch { return String(v||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim(); }
  }
  function stripCataloguePrefix(name=''){
    let s=String(name||'').replace(/\.[A-Za-z0-9]{2,5}$/,' ');
    s=s.replace(/^\s*[A-Za-z]{1,8}\d{1,4}\s*[-_–—]+\s*\d{1,4}\s*[-_–—]+\s*/i,' ');
    s=s.replace(/^\s*[A-Za-z]{1,8}\d{1,4}(?:[-_ ]\d{1,4})?\s*[-_–—]+\s*/i,' ');
    s=s.replace(/^\s*\d{1,3}\s*[-_–—]+\s*/,' ');
    return s.trim();
  }
  function semanticTokens(name=''){
    const s=songNorm(stripCataloguePrefix(name));
    return [...new Set(s.split(/\s+/).filter(Boolean).filter(x=>
      !/^(the|a|an|track|cd|disc|disk|audio|official|video|music)$/i.test(x) &&
      !/^\d+$/.test(x) && !/^[a-z]{1,8}\d{1,4}$/i.test(x)
    ))];
  }
  function logicalIdentityForTrack(t,i){
    const a=(typeof ann==='function' ? ann(i) : (state.annotations?.[t?.key]||{})) || {};
    const title=songNorm(badMeta(a.title)?'':a.title||'');
    const artist=songNorm(badMeta(a.artist)?'':a.artist||'');
    if(title && artist) return `meta:${artist}|${title}`;
    const name=String(t?.file?.name||'');
    const exact=songNorm(stripCataloguePrefix(name));
    const tokens=semanticTokens(name);
    if(tokens.length>=3) return `tokens:${[...tokens].sort().join('|')}`;
    return `name:${exact}`;
  }
  function mergeAnnotationValues(target,source){
    if(!source) return target||{};
    const out={...(target||{})};
    const arrayFields=['categories','groupLevels','exerciseMains','exerciseSubs','extensions','customExtensions','vivenciaLines','rhythms','endings'];
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
    state.logicalAliases = state.logicalAliases && typeof state.logicalAliases==='object' ? state.logicalAliases : {};
    state.logicalSongs = state.logicalSongs && typeof state.logicalSongs==='object' ? state.logicalSongs : {};
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
      const storedCanonical=state.logicalSongs?.[logicalId]?.canonicalKey;
      const chosenPrimary=members.find(m=>m.t.key===storedCanonical) || members[0];
      const primary=chosenPrimary.t;
      const others=members.filter(m=>m!==chosenPrimary);
      primary.logicalSongId=logicalId;
      primary.alternateFiles=[];
      primary.alternatePaths=[];
      primary.alternateKeys=[];
      let merged=state.annotations?.[primary.key]||null;
      const allKeys=[primary.key];
      for(const m of others){
        const d=m.t;
        duplicateCount++;
        allKeys.push(d.key);
        primary.alternateFiles.push(d.file);
        primary.alternatePaths.push(d.nativePath||d.file?.webkitRelativePath||d.file?.name||'');
        primary.alternateKeys.push(d.key);
        keyMap.set(d.key,primary.key);
        state.logicalAliases[d.key]=primary.key;
        merged=mergeAnnotationValues(merged,state.annotations?.[d.key]);
        try{ if(d.url) URL.revokeObjectURL(d.url); }catch{}
      }
      delete state.logicalAliases[primary.key];
      if(merged) state.annotations[primary.key]=merged;
      state.logicalSongs[logicalId]={
        canonicalKey:primary.key,
        keys:[...new Set(allKeys)],
        paths:[...new Set([primary.nativePath||primary.file?.webkitRelativePath||primary.file?.name||'',...primary.alternatePaths].filter(Boolean))],
        updatedAt:new Date().toISOString()
      };
      newTracks.push(primary);
    }
    if(duplicateCount){
      state.tracks=newTracks.map((t,i)=>({...t,index:i}));
      if(Array.isArray(state.chosen)) state.chosen=[...new Set(state.chosen.map(k=>keyMap.get(k)||state.logicalAliases?.[k]||k))];
      state.active=Math.min(state.active,state.tracks.length-1);
      try{ buildOrder(Math.max(0,state.active)); }catch{}
      try{ if(typeof populateFolders==='function')populateFolders(); }catch{}
      try{ if(typeof renderRows==='function')renderRows(); }catch{}
      try{ if(typeof renderChosen==='function')renderChosen(); }catch{}
      try{ if(typeof renderActiveLibrary==='function')renderActiveLibrary(); }catch{}
      try{ if(typeof renderCharacterizedDb==='function')renderCharacterizedDb(); }catch{}
      try{ if(typeof renderExportMatches==='function')renderExportMatches(); }catch{}
      try{ if(typeof saveData==='function')saveData(); }catch{}
    }
    try{
      const el=document.getElementById('loadStatus');
      if(el){
        const characterized=typeof countCharacterizedLoadedTracks==='function'?countCharacterizedLoadedTracks():0;
        el.textContent=`${state.tracks.length} שירים ייחודיים נטענו · ${duplicateCount} עותקים כפולים אוחדו · ${characterized} כבר משויכים למאגר`;
      }
    }catch{}
    return {unique:state.tracks.length,duplicates:duplicateCount};
  }

  const originalElectronLoader=window.__biodanzaLoadElectronLibrary;
  if(typeof originalElectronLoader==='function'){
    window.__biodanzaLoadElectronLibrary=async function(...args){
      const result=await originalElectronLoader(...args);
      collapseLogicalDuplicates();
      return result;
    };
  }
  if(typeof importFileMetadata==='function'){
    const originalImportFileMetadata=importFileMetadata;
    importFileMetadata=async function(...args){
      const result=await originalImportFileMetadata(...args);
      collapseLogicalDuplicates();
      return result;
    };
  }
  window.__biodanzaLogicalSongs={collapse:collapseLogicalDuplicates,identity:logicalIdentityForTrack,mergeAnnotationValues,version:'5.7.0'};
  try{ if(state?.tracks?.length) collapseLogicalDuplicates(); }catch(error){ console.warn('Logical song grouping failed',error); }
})();
