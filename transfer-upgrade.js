// Biodanza 5.7.0 - safe transfer/import/export controller.
// Inject inside the main renderer IIFE. Import always MERGES; it never deletes the local database.
(() => {
  const $id=id=>document.getElementById(id);
  const host=$id('advancedHost') || document.querySelector('#topCard header .toolbar') || $id('topCard');
  if(!host || typeof state==='undefined') return;

  function plain(v){return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}
  function clone(v){try{return JSON.parse(JSON.stringify(v))}catch{return v}}
  function meaningful(v){
    if(Array.isArray(v))return v.length>0;
    if(v&&typeof v==='object')return Object.keys(v).length>0;
    return v!==''&&v!==null&&v!==undefined&&v!==false&&v!==0;
  }
  function mergeAnnotation(dst,src){
    if(!src||typeof src!=='object')return dst||{};
    if(!dst||typeof dst!=='object')return clone(src)||{};
    const out={...dst};
    for(const [k,v] of Object.entries(src)){
      if(Array.isArray(v)){
        const a=Array.isArray(out[k])?out[k]:[];
        out[k]=[...new Set([...a,...v].filter(x=>x!==''&&x!=null))];
      }else if(v&&typeof v==='object'){
        if(!out[k]||typeof out[k]!=='object'||Array.isArray(out[k]))out[k]=clone(v);
        else out[k]={...clone(v),...out[k]};
      }else if(!meaningful(out[k])&&meaningful(v)) out[k]=v;
    }
    if(Number(src.rating||0)>Number(out.rating||0))out.rating=Number(src.rating||0);
    return out;
  }
  function mergeDb(target,source){
    let added=0,merged=0;
    for(const [key,a] of Object.entries(plain(source))){
      if(!a||typeof a!=='object'||Array.isArray(a))continue;
      if(!target[key]){target[key]=clone(a);added++;}
      else{target[key]=mergeAnnotation(target[key],a);merged++;}
    }
    return {added,merged};
  }
  function fallback(key=''){
    try{if(typeof fileNameFromAnnotationKey==='function')return fileNameFromAnnotationKey(key)}catch{}
    return String(key).split('|')[0]||'';
  }
  function parseObject(raw){try{const v=JSON.parse(raw||'');return plain(v)}catch{return {}}}

  ['exportTransferPackage','importTransferPackage','importTransferPackageLabel','checkTransferMatches'].forEach(id=>{const el=$id(id);if(el)el.remove()});
  document.querySelectorAll('label[for="importTransferPackage"]').forEach(el=>el.remove());

  const wrap=document.createElement('div');
  wrap.id='transferControls570';
  wrap.style.cssText='display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0';
  const exportBtn=document.createElement('button');
  exportBtn.id='exportTransferPackage';exportBtn.className='good';exportBtn.textContent='📦 צור חבילת גיבוי/העברה';
  const importLabel=document.createElement('label');
  importLabel.id='importTransferPackageLabel';importLabel.className='buttonlike secondary';importLabel.htmlFor='importTransferPackage';importLabel.textContent='📥 ייבא חבילת גיבוי/העברה';
  const importInput=document.createElement('input');
  importInput.id='importTransferPackage';importInput.type='file';importInput.hidden=true;importInput.accept='.json,application/json';
  const checkBtn=document.createElement('button');
  checkBtn.id='checkTransferMatches';checkBtn.className='secondary';checkBtn.textContent='🔎 בדוק קבצים תואמים (אופציונלי)';checkBtn.style.display='none';
  wrap.append(exportBtn,importLabel,importInput,checkBtn);
  if(host.matches?.('header,.toolbar'))host.appendChild(wrap);else host.prepend(wrap);

  let panel=$id('relinkPanel');
  if(!panel){
    panel=document.createElement('div');panel.id='relinkPanel';panel.className='backup-loaded-notice';panel.style.cssText='display:none;margin-top:12px';
    panel.innerHTML='<strong id="relinkSummary"></strong><div class="small" id="relinkDetails" style="margin-top:5px"></div><div id="relinkIssues" style="margin-top:10px;max-height:280px;overflow:auto"></div>';
    host.parentElement?.appendChild(panel);
  }
  const setPanel=(summary,details='')=>{panel.style.display='block';if($id('relinkSummary'))$id('relinkSummary').textContent=summary;if($id('relinkDetails'))$id('relinkDetails').textContent=details;};

  function loadedTrackByAnyKey(key){
    const canonical=state.logicalAliases?.[key]||key;
    return (state.tracks||[]).find(t=>t.key===key||t.key===canonical||(t.alternateKeys||[]).includes(key)||(t.alternateKeys||[]).includes(canonical));
  }
  function profileFor(key,a){
    const t=loadedTrackByAnyKey(key);
    const file=t?.file;
    const old=a?.relinkProfile||{};
    const name=file?.name||old.fileName||fallback(key);
    return {
      oldKey:key,
      title:a?.title||old.title||String(name).replace(/\.[^.]+$/,''),
      artist:a?.artist||old.artist||'',album:a?.album||old.album||'',year:a?.year||old.year||'',
      duration:Number(t?.duration||a?.duration||old.duration)||0,
      size:Number(file?.size||a?.fileSize||old.size)||Number(String(key).split('|')[1])||0,
      ext:String(file?.name||a?.fileExt||old.ext||name).split('.').pop().toLowerCase(),
      relativePath:file?.webkitRelativePath||t?.nativePath||a?.lastKnownRelativePath||old.relativePath||'',
      fileName:name,fingerprint:old.fingerprint||''
    };
  }
  async function collectAnnotations(){
    const merged={};
    const sources=[plain(state.annotations)];
    try{sources.push(parseObject(localStorage.getItem('biodanzaPlayerAnnotationsV3')))}catch{}
    try{sources.push(parseObject(localStorage.getItem('biodanzaAnnotationsV4')))}catch{}
    if(window.electronAPI?.readPlayerData){
      try{const disk=await window.electronAPI.readPlayerData();if(disk?.ok)sources.push(plain(disk.annotations))}catch{}
    }
    for(const src of sources)mergeDb(merged,src);
    return merged;
  }
  exportBtn.onclick=async()=>{
    exportBtn.disabled=true;
    try{
      const annotations=await collectAnnotations();
      const keys=Object.keys(annotations);
      if(!keys.length){alert('לא נמצא מאגר אפיונים לייצוא. לא נוצר קובץ ריק.');return;}
      const profiles={};for(const key of keys)profiles[key]=profileFor(key,annotations[key]);
      let appVersion='5.7.0';try{if(window.electronAPI?.getAppVersion)appVersion=await window.electronAPI.getAppVersion()||appVersion}catch{}
      const payload={
        type:'biodanza-transfer-package',version:3,appVersion,createdAt:new Date().toISOString(),
        annotations,chosen:Array.isArray(state.chosen)?state.chosen:[],playlistName:state.playlistName||'',
        exportSequence:Array.isArray(state.exportSequence)?state.exportSequence:[],
        logicalAliases:plain(state.logicalAliases),logicalSongs:plain(state.logicalSongs),profiles
      };
      download('Biodanza_Transfer_'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(payload,null,2),'application/json;charset=utf-8');
      try{showToast(`חבילת גיבוי נוצרה: ${keys.length} רשומות`)}catch{}
    }catch(e){console.error(e);alert('יצירת חבילת הגיבוי נכשלה: '+(e?.message||e));}
    finally{exportBtn.disabled=false;}
  };

  async function importPackage(pkg){
    if(pkg?.type!=='biodanza-transfer-package'||!pkg.annotations||typeof pkg.annotations!=='object')throw new Error('קובץ אינו חבילת Biodanza תקינה');
    state.annotations=plain(state.annotations);
    const before=Object.keys(state.annotations).length;
    const stats=mergeDb(state.annotations,pkg.annotations);
    const incomingChosen=Array.isArray(pkg.chosen)?pkg.chosen:[];
    state.chosen=[...new Set([...(Array.isArray(state.chosen)?state.chosen:[]),...incomingChosen])];
    if(typeof pkg.playlistName==='string'&&pkg.playlistName)state.playlistName=pkg.playlistName;
    if(Array.isArray(pkg.exportSequence))state.exportSequence=[...new Set([...(Array.isArray(state.exportSequence)?state.exportSequence:[]),...pkg.exportSequence])];
    state.logicalAliases={...plain(pkg.logicalAliases),...plain(state.logicalAliases)};
    state.logicalSongs={...plain(pkg.logicalSongs),...plain(state.logicalSongs)};
    state.pendingRelinkPackage=pkg;
    if(typeof saveData==='function')saveData();
    try{if(typeof populateCharacterizedFilters==='function')populateCharacterizedFilters()}catch{}
    try{if(typeof renderCharacterizedDb==='function')renderCharacterizedDb()}catch{}
    try{if(typeof renderRows==='function')renderRows()}catch{}
    try{if(typeof renderChosen==='function')renderChosen()}catch{}
    try{if(typeof renderExportMatches==='function')renderExportMatches()}catch{}
    const after=Object.keys(state.annotations).length;
    setPanel(`הייבוא הסתיים: ${stats.added} נוספו · ${stats.merged} מוזגו · ${after} רשומות נשמרות במאגר`, 'שום רשומה מקומית לא נמחקה. קבצי מוזיקה שאינם זמינים נשארים במאגר ויוצגו כלא זמינים.');
    checkBtn.style.display=(state.tracks?.length&&Object.keys(pkg.profiles||{}).length)?'inline-block':'none';
    return {before,after,...stats};
  }
  importInput.onchange=async e=>{
    const f=e.target.files?.[0];if(!f)return;
    try{const pkg=JSON.parse(await f.text());const r=await importPackage(pkg);alert(`חבילת ההעברה יובאה בהצלחה.\n\nנוספו: ${r.added}\nמוזגו: ${r.merged}\nסה״כ במאגר: ${r.after}\n\nלא נמחקו אפיונים קיימים.`)}
    catch(err){console.error(err);alert('לא ניתן לייבא את החבילה: '+(err?.message||err));}
    finally{e.target.value='';}
  };

  function nrm(v=''){try{return norm(v||'')}catch{return String(v||'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim()}}
  function strip(v=''){return String(v||'').replace(/\.[A-Za-z0-9]{2,5}$/,' ').replace(/^\s*[A-Za-z]{1,8}\d{1,4}\s*[-_–—]+\s*\d{1,4}\s*[-_–—]+\s*/i,' ').replace(/^\s*\d{1,3}\s*[-_–—]+\s*/,' ').trim()}
  function candidateIndex(){
    const m=new Map();
    for(let i=0;i<(state.tracks||[]).length;i++){
      const t=state.tracks[i];
      const vals=[nrm(strip(t.file?.name||''))];
      let a={};try{a=ann(i)||{}}catch{}
      if(a.title)vals.push(nrm(a.title));
      for(const v of vals.filter(Boolean)){if(!m.has(v))m.set(v,[]);m.get(v).push(t)}
    }
    return m;
  }
  async function dryRun(pkg){
    const entries=Object.entries(pkg?.profiles||{});const idx=candidateIndex();let exact=0,sizeConfirmed=0,missing=0;
    setPanel(`בדיקת קבצים: 0 מתוך ${entries.length}`,'בדיקה בלבד — אין שינוי במאגר.');
    const issues=[];
    for(let i=0;i<entries.length;i++){
      const [key,p]=entries[i];const nk=nrm(strip(p.fileName||p.title||fallback(key)));const candidates=idx.get(nk)||[];
      let status='missing',name='—';
      if(candidates.length===1){
        const t=candidates[0];name=t.file?.name||'';const oldSize=Number(p.size)||Number(String(key).split('|')[1])||0;const newSize=Number(t.file?.size)||0;
        if(oldSize&&newSize&&Math.abs(oldSize-newSize)/Math.max(oldSize,newSize)<=.005){status='confirmed';sizeConfirmed++;}else{status='name';exact++;}
      }else missing++;
      if(status==='missing')issues.push({old:p.title||p.fileName||fallback(key),candidate:name});
      if(i%10===0||i===entries.length-1){setPanel(`בדיקת קבצים: ${i+1} מתוך ${entries.length}`,'בדיקה בלבד — אין שינוי במאגר.');await new Promise(r=>setTimeout(r,0));}
    }
    setPanel(`בדיקה הסתיימה: ${sizeConfirmed} שם+גודל · ${exact} שם בלבד · ${missing} ללא התאמה חד-משמעית`,'לא בוצע שום שינוי במאגר. זוהי בדיקה אופציונלית בלבד.');
    const issuesHost=$id('relinkIssues');if(issuesHost)issuesHost.innerHTML=issues.slice(0,100).map(x=>`<div class="small">${escapeHtml(x.old)} — לא נמצאה התאמה חד-משמעית</div>`).join('');
  }
  checkBtn.onclick=()=>{if(state.pendingRelinkPackage)dryRun(state.pendingRelinkPackage)};

  window.__biodanzaTransfer={importPackage,exportVersion:3,dryRun,mergeDb,version:'5.7.0'};
})();
