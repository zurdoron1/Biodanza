// Injected inside the main renderer IIFE. Recovery-only transfer exporter for 5.4.8.
(async () => {
  const btn = document.getElementById('exportTransferPackage');
  if (!btn || typeof state === 'undefined') return;

  function parseObject(raw){
    try { const v=JSON.parse(raw||''); return v && typeof v==='object' && !Array.isArray(v) ? v : {}; }
    catch { return {}; }
  }
  function meaningful(v){
    if (Array.isArray(v)) return v.length>0;
    if (v && typeof v==='object') return Object.keys(v).length>0;
    return v!=='' && v!==null && v!==undefined && v!==false && v!==0;
  }
  function richness(a){
    if(!a || typeof a!=='object') return 0;
    return Object.entries(a).reduce((n,[k,v])=>n+(meaningful(v)?1:0),0);
  }
  function mergeAnnotation(dst,src){
    if(!src || typeof src!=='object') return dst||{};
    if(!dst || typeof dst!=='object') return JSON.parse(JSON.stringify(src));
    const out={...dst};
    for(const [k,v] of Object.entries(src)){
      if(Array.isArray(v)){
        const a=Array.isArray(out[k])?out[k]:[];
        out[k]=[...new Set([...a,...v].filter(x=>x!==''&&x!=null))];
      }else if(v && typeof v==='object'){
        if(!out[k] || typeof out[k]!=='object' || Array.isArray(out[k])) out[k]=v;
        else out[k]={...v,...out[k]};
      }else if(!meaningful(out[k]) && meaningful(v)) out[k]=v;
    }
    return out;
  }
  function mergeDb(target,source){
    if(!source || typeof source!=='object') return;
    for(const [key,a] of Object.entries(source)){
      if(!a || typeof a!=='object' || Array.isArray(a)) continue;
      if(!target[key]) target[key]=JSON.parse(JSON.stringify(a));
      else target[key]=mergeAnnotation(target[key],a);
    }
  }
  function annotationLooksUseful(a){
    if(!a || typeof a!=='object') return false;
    if(typeof isCharacterizedAnnotation==='function' && isCharacterizedAnnotation(a)) return true;
    const keys=['rating','categories','groupLevels','exerciseMains','exerciseSubs','extensions','customExtensions','energy','rhythms','rhythm','regressionDepth','endings','ending','notes','biography','anecdotes','lines','vivenciaLines','status','exerciseMain','exerciseSub','exercise'];
    return keys.some(k=>meaningful(a[k]));
  }
  function fallbackName(key=''){
    if(typeof fileNameFromAnnotationKey==='function') return fileNameFromAnnotationKey(key);
    return String(key).split('|')[0]||'';
  }
  function profileFor(key,a,track){
    const file=track?.file;
    const name=file?.name||fallbackName(key);
    return {
      oldKey:key,
      title:a.title||name.replace(/\.[^.]+$/,''),
      artist:a.artist||'', album:a.album||'', year:a.year||'',
      duration:Number(track?.duration||a.duration)||0,
      size:Number(file?.size||a.fileSize)||0,
      ext:(file?.name||a.fileExt||name).split('.').pop().toLowerCase(),
      relativePath:file?.webkitRelativePath||a.lastKnownRelativePath||'',
      fileName:name,
      fingerprint:a.relinkProfile?.fingerprint||''
    };
  }
  async function collectSources(){
    const sources=[];
    const current=(state.annotations&&typeof state.annotations==='object')?state.annotations:{};
    sources.push({name:'המאגר הפעיל',db:current});
    const legacyV3=parseObject(localStorage.getItem('biodanzaPlayerAnnotationsV3'));
    sources.push({name:'אחסון ישן V3',db:legacyV3});
    const legacyV4=parseObject(localStorage.getItem('biodanzaAnnotationsV4'));
    sources.push({name:'אחסון ישן V4',db:legacyV4});
    if(window.electronAPI?.readPlayerData){
      try{
        const disk=await window.electronAPI.readPlayerData();
        if(disk?.ok && disk.annotations && typeof disk.annotations==='object') sources.push({name:'קובץ הנתונים',db:disk.annotations});
      }catch(e){console.warn('Recovery disk read failed',e)}
    }
    return sources;
  }

  btn.textContent='📦 צור חבילת העברה בטוחה';
  btn.onclick=async()=>{
    btn.disabled=true;
    try{
      const sources=await collectSources();
      const merged={};
      // Merge richer sources first, then fill missing fields from the others.
      sources.sort((x,y)=>Object.keys(y.db||{}).length-Object.keys(x.db||{}).length);
      for(const s of sources) mergeDb(merged,s.db);
      const allEntries=Object.entries(merged);
      const usefulEntries=allEntries.filter(([,a])=>annotationLooksUseful(a));
      const counts=sources.map(s=>`${s.name}: ${Object.keys(s.db||{}).length}`).join('\n');
      if(!allEntries.length){
        alert(`לא נמצא מאגר אפיונים לייצוא.\n\nמקורות שנבדקו:\n${counts}\n\nלא נוצר קובץ מעבר ריק.`);
        return;
      }
      if(!usefulEntries.length){
        alert(`נמצאו ${allEntries.length} רשומות, אבל אף אחת אינה מכילה אפיון מזוהה.\n\n${counts}\n\nלא נוצר קובץ מעבר כדי למנוע אובדן מידע.`);
        return;
      }
      const ok=confirm(`נמצאו ${usefulEntries.length} שירים מאופיינים (${allEntries.length} רשומות בסך הכול).\n\n${counts}\n\nליצור חבילת מעבר?`);
      if(!ok) return;
      const byKey=new Map((state.tracks||[]).map(t=>[t.key,t]));
      const profiles={};
      for(const [key,a] of usefulEntries) profiles[key]=profileFor(key,a,byKey.get(key));
      const payload={
        type:'biodanza-transfer-package',version:2,appVersion:'5.4.8-recovery',createdAt:new Date().toISOString(),
        annotations:merged,
        chosen:Array.isArray(state.chosen)?state.chosen:[],
        playlistName:state.playlistName||'',
        exportSequence:Array.isArray(state.exportSequence)?state.exportSequence:[],
        profiles,
        recoveryInfo:{sourceCounts:Object.fromEntries(sources.map(s=>[s.name,Object.keys(s.db||{}).length])),totalRecords:allEntries.length,characterizedRecords:usefulEntries.length}
      };
      download('Biodanza_Transfer_RECOVERED_'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(payload,null,2),'application/json;charset=utf-8');
      alert(`חבילת המעבר נוצרה בהצלחה.\n\nשירים מאופיינים: ${usefulEntries.length}\nכל הרשומות שנשמרו: ${allEntries.length}\n\nבמחשב החדש יש לייבא את הקובץ שמתחיל ב־Biodanza_Transfer_RECOVERED_.`);
    }catch(e){
      console.error(e);
      alert('יצירת חבילת החילוץ נכשלה: '+(e?.message||e));
    }finally{btn.disabled=false;}
  };
})();
