(() => {
  const $id = id => document.getElementById(id);
  const headerToolbar = document.querySelector('#topCard header .toolbar');
  if (!headerToolbar || typeof state === 'undefined') return;

  const exportBtn = document.createElement('button');
  exportBtn.className = 'good';
  exportBtn.id = 'exportTransferPackage';
  exportBtn.textContent = '📦 צור חבילת העברה';

  const importLabel = document.createElement('label');
  importLabel.className = 'buttonlike secondary';
  importLabel.htmlFor = 'importTransferPackage';
  importLabel.textContent = '📥 ייבא חבילת העברה';

  const importInput = document.createElement('input');
  importInput.id = 'importTransferPackage';
  importInput.type = 'file';
  importInput.hidden = true;
  importInput.accept = '.json,application/json';

  const first = headerToolbar.firstElementChild;
  if (first) first.after(exportBtn, importLabel, importInput); else headerToolbar.append(exportBtn, importLabel, importInput);

  const topCard = $id('topCard');
  const relinkPanel = document.createElement('div');
  relinkPanel.id = 'relinkPanel';
  relinkPanel.className = 'backup-loaded-notice';
  relinkPanel.style.display = 'none';
  relinkPanel.style.marginTop = '12px';
  relinkPanel.innerHTML = '<strong id="relinkSummary">ממתין לשיוך מחדש.</strong><div class="small" id="relinkDetails" style="margin-top:5px"></div><div id="relinkIssues" style="margin-top:10px;max-height:280px;overflow:auto"></div>';
  topCard.appendChild(relinkPanel);

  const versionTag = document.querySelector('#topCard h1 span');
  if (versionTag) versionTag.textContent = 'Electron 5.4';

  function norm(v='') {
    return String(v || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/\b(remaster(?:ed)?|version|edit|radio edit|official|audio|video|feat\.?|ft\.?)\b/g, ' ')
      .replace(/[()[\]{}]/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
  }

  function similarity(a,b) {
    a = norm(a); b = norm(b);
    if (!a || !b) return 0;
    if (a === b) return 1;
    const A = new Set(a.split(' ')), B = new Set(b.split(' '));
    let inter = 0; A.forEach(x => B.has(x) && inter++);
    const jac = inter / Math.max(1, new Set([...A, ...B]).size);
    const m=a.length,n=b.length,prev=Array.from({length:n+1},(_,i)=>i),cur=new Array(n+1);
    for(let i=1;i<=m;i++){
      cur[0]=i;
      for(let j=1;j<=n;j++) cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
      for(let j=0;j<=n;j++) prev[j]=cur[j];
    }
    const lev = 1 - prev[n] / Math.max(m,n);
    return Math.max(jac, lev);
  }

  async function fingerprint(file) {
    try {
      const size = Number(file?.size) || 0;
      if (!size || !file?.slice || !crypto?.subtle) return '';
      const chunk = 32768;
      const starts = [0, Math.max(0, Math.floor(size/2)-chunk/2), Math.max(0,size-chunk)];
      const parts=[];
      for (const st of starts) parts.push(new Uint8Array(await file.slice(st,Math.min(size,st+chunk)).arrayBuffer()));
      const total=parts.reduce((n,x)=>n+x.length,0), buf=new Uint8Array(total+8);
      new DataView(buf.buffer).setBigUint64(0,BigInt(size),true);
      let off=8; for(const x of parts){buf.set(x,off);off+=x.length;}
      const hash=await crypto.subtle.digest('SHA-256',buf);
      return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');
    } catch { return ''; }
  }

  function fallbackName(key='') {
    if (typeof fileNameFromAnnotationKey === 'function') return fileNameFromAnnotationKey(key);
    return String(key).split('|')[0] || '';
  }

  function profileForTrack(t,i) {
    const a = ann(i) || {};
    return {
      oldKey:t.key,
      title:a.title || clean(t.file.name),
      artist:a.artist || artistOf(i) || '',
      album:a.album || '',
      year:a.year || '',
      duration:Number(t.duration || a.duration) || 0,
      size:Number(t.file?.size || a.fileSize) || 0,
      ext:(t.file?.name || '').split('.').pop().toLowerCase(),
      relativePath:t.file?.webkitRelativePath || '',
      fileName:t.file?.name || '',
      fingerprint:''
    };
  }

  async function buildProfiles() {
    const profiles={};
    const entries=Object.entries(state.annotations||{}).filter(([,a])=>typeof isCharacterizedAnnotation==='function'?isCharacterizedAnnotation(a):true);
    const wanted=new Set(entries.map(([k])=>k));
    let done=0;
    for(let i=0;i<state.tracks.length;i++){
      const t=state.tracks[i];
      if(!wanted.has(t.key)) continue;
      const p=profileForTrack(t,i);
      p.fingerprint=await fingerprint(t.file);
      profiles[t.key]=p;
      const a=state.annotations[t.key];
      if(a){a.relinkProfile=p;a.duration=p.duration;a.fileSize=p.size;a.fileExt=p.ext;}
      done++;
      if(done%10===0 && typeof showToast==='function') showToast(`מכין חבילת העברה: ${done}`);
    }
    for(const [key,a] of entries){
      if(profiles[key]) continue;
      profiles[key]=a.relinkProfile || {
        oldKey:key,title:a.title||fallbackName(key),artist:a.artist||'',album:a.album||'',year:a.year||'',
        duration:Number(a.duration)||0,size:Number(a.fileSize)||0,ext:a.fileExt||'',fileName:fallbackName(key),fingerprint:''
      };
    }
    if(typeof saveData==='function') saveData();
    return profiles;
  }

  exportBtn.onclick = async () => {
    try {
      exportBtn.disabled=true;
      if(typeof showToast==='function') showToast('מכין חבילת העברה…');
      const profiles=await buildProfiles();
      const payload={type:'biodanza-transfer-package',version:1,appVersion:'5.4.0',createdAt:new Date().toISOString(),annotations:state.annotations||{},chosen:state.chosen||[],playlistName:state.playlistName||'',exportSequence:state.exportSequence||[],profiles};
      download('Biodanza_Transfer_'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(payload,null,2),'application/json;charset=utf-8');
      if(typeof showToast==='function') showToast(`חבילת העברה נוצרה: ${Object.keys(profiles).length} אפיונים`);
    } catch(e) {
      console.error(e); alert('לא ניתן ליצור את חבילת ההעברה.');
    } finally { exportBtn.disabled=false; }
  };

  function baseScore(p,t,i) {
    const a=ann(i)||{}, duration=Number(t.duration)||0;
    let score=0; const reasons=[];
    const dd=Math.abs((Number(p.duration)||0)-duration);
    if(p.duration&&duration){
      if(dd<=1){score+=35;reasons.push('משך כמעט זהה');}
      else if(dd<=2){score+=32;reasons.push('משך קרוב מאוד');}
      else if(dd<=3){score+=28;reasons.push('משך קרוב');}
      else if(dd<=5) score+=20; else if(dd<=8) score+=10; else if(dd>20) score-=20;
    }
    const as=similarity(p.artist,a.artist||artistOf(i)||''); if(p.artist&&as){score+=25*as;if(as>.85)reasons.push('מבצע תואם');}
    const ts=similarity(p.title,a.title||clean(t.file.name)); if(p.title&&ts){score+=18*ts;if(ts>.82)reasons.push('שם שיר דומה');}
    const als=similarity(p.album,a.album||''); if(p.album&&als) score+=8*als;
    if(p.year&&a.year&&String(p.year).slice(0,4)===String(a.year).slice(0,4)) score+=3;
    if(p.size&&t.file?.size){const r=Math.abs(p.size-t.file.size)/Math.max(p.size,t.file.size);if(r<.005){score+=7;reasons.push('גודל כמעט זהה');}else if(r<.02)score+=4;}
    if(p.ext&&p.ext===(t.file?.name||'').split('.').pop().toLowerCase()) score+=2;
    return {score,reasons};
  }

  async function relinkPackage(pkg) {
    if(!pkg || !state.tracks.length) return;
    const profiles=pkg.profiles||{}, used=new Set(), results=[];
    let auto=0,review=0,missing=0;
    for(const [oldKey,p] of Object.entries(profiles)){
      let ranked=state.tracks.map((t,i)=>({i,t,...baseScore(p,t,i)})).filter(x=>!used.has(x.t.key)).sort((a,b)=>b.score-a.score).slice(0,4);
      if(p.fingerprint){
        for(const x of ranked){
          if(x.score<35) continue;
          x.fp=await fingerprint(x.t.file);
          if(x.fp&&x.fp===p.fingerprint){x.score=100;x.reasons.unshift('טביעת אצבע זהה');break;}
        }
        ranked.sort((a,b)=>b.score-a.score);
      }
      const best=ranked[0], second=ranked[1];
      const ambiguous=best&&second&&(best.score-second.score<6)&&best.score<96;
      let status='missing';
      if(best&&best.score>=82&&!ambiguous) status='auto'; else if(best&&best.score>=62) status='review';
      if(status==='auto'){
        const newKey=best.t.key, src=state.annotations[oldKey]||pkg.annotations?.[oldKey];
        if(src){
          state.annotations[newKey]=src;
          src.lastKnownPath=best.t.nativePath||src.lastKnownPath;
          src.lastKnownRelativePath=best.t.file?.webkitRelativePath||src.lastKnownRelativePath;
          src.relinkedAt=new Date().toISOString(); src.relinkScore=Math.round(best.score);
          if(newKey!==oldKey) delete state.annotations[oldKey];
          state.chosen=state.chosen.map(k=>k===oldKey?newKey:k); used.add(newKey); auto++;
        }
      } else if(status==='review') review++; else missing++;
      results.push({oldKey,p,status,best:best?{key:best.t.key,name:best.t.file.name,score:Math.round(best.score),reasons:best.reasons}:null});
    }
    state.lastRelinkResults=results;
    if(typeof saveData==='function') saveData();
    if(typeof renderRows==='function') renderRows();
    if(typeof renderChosen==='function') renderChosen();
    if(typeof renderActiveLibrary==='function') renderActiveLibrary();
    if(typeof renderExportMatches==='function') renderExportMatches();
    renderRelinkPanel(auto,review,missing);
  }

  function renderRelinkPanel(auto,review,missing){
    relinkPanel.style.display='block';
    $id('relinkSummary').textContent=`שיוך מחדש הסתיים: ${auto} שויכו אוטומטית · ${review} לבדיקה · ${missing} לא נמצאו`;
    $id('relinkDetails').textContent='התאמות ודאיות הועברו אוטומטית. התאמות גבוליות דורשות אישור ידני.';
    const issues=(state.lastRelinkResults||[]).filter(r=>r.status!=='auto');
    $id('relinkIssues').innerHTML=issues.length?`<table class="characterized-db-table"><thead><tr><th>שיר מהמאגר</th><th>מועמד</th><th>ציון</th><th>פעולה</th></tr></thead><tbody>${issues.map(r=>{const n=state.lastRelinkResults.indexOf(r);return `<tr><td>${escapeHtml(r.p.title||r.p.fileName||fallbackName(r.oldKey))}</td><td>${escapeHtml(r.best?.name||'לא נמצא')}</td><td>${r.best?.score??'—'}</td><td>${r.best?`<button class="good approve-relink" data-n="${n}">אשר שיוך</button>`:'—'}</td></tr>`}).join('')}</tbody></table>`:'<div class="small">כל השירים שויכו בוודאות גבוהה.</div>';
    document.querySelectorAll('.approve-relink').forEach(b=>b.onclick=()=>approveManual(Number(b.dataset.n)));
  }

  function approveManual(n){
    const r=state.lastRelinkResults?.[n]; if(!r?.best) return;
    const src=state.annotations[r.oldKey]; if(!src) return;
    const newKey=r.best.key; state.annotations[newKey]=src; if(newKey!==r.oldKey) delete state.annotations[r.oldKey];
    state.chosen=state.chosen.map(k=>k===r.oldKey?newKey:k); src.relinkedAt=new Date().toISOString(); src.relinkScore=r.best.score; r.status='manual';
    if(typeof saveData==='function') saveData();
    const left=state.lastRelinkResults.filter(x=>x.status==='review'||x.status==='missing').length;
    $id('relinkSummary').textContent=`בדיקה ידנית: נותרו ${left} רשומות`;
    const row=document.querySelector(`.approve-relink[data-n="${n}"]`)?.closest('tr'); if(row) row.remove();
    if(typeof renderRows==='function') renderRows(); if(typeof renderChosen==='function') renderChosen(); if(typeof renderActiveLibrary==='function') renderActiveLibrary(); if(typeof renderExportMatches==='function') renderExportMatches();
  }

  importInput.onchange=async e=>{
    const f=e.target.files?.[0]; if(!f) return;
    try{
      const pkg=JSON.parse(await f.text());
      if(pkg.type!=='biodanza-transfer-package'||!pkg.annotations||!pkg.profiles) throw new Error('bad package');
      state.annotations=pkg.annotations; state.chosen=Array.isArray(pkg.chosen)?pkg.chosen:[]; state.playlistName=pkg.playlistName||''; state.exportSequence=Array.isArray(pkg.exportSequence)?pkg.exportSequence:[];
      state.pendingRelinkPackage=pkg;
      if(typeof saveData==='function') saveData();
      alert(`חבילת ההעברה נטענה: ${Object.keys(pkg.profiles).length} רשומות.\n\nכעת בחר את תיקיית המוזיקה במחשב החדש. לאחר הסריקה יתבצע שיוך מחדש אוטומטי.`);
      if(state.tracks.length) setTimeout(()=>relinkPackage(pkg),500);
    }catch(err){console.error(err);alert('קובץ חבילת ההעברה אינו תקין.');}
    finally{e.target.value='';}
  };

  const originalProbe = typeof probeDurations==='function' ? probeDurations : null;
  if(originalProbe){
    window.probeDurations = async function(){
      await originalProbe();
      for(const t of state.tracks){const a=state.annotations[t.key];if(a){a.duration=Number(t.duration)||a.duration||0;a.fileSize=t.file?.size||a.fileSize||0;a.fileExt=(t.file?.name||'').split('.').pop().toLowerCase();}}
      if(typeof saveData==='function') saveData();
      if(state.pendingRelinkPackage){const pkg=state.pendingRelinkPackage;state.pendingRelinkPackage=null;setTimeout(()=>relinkPackage(pkg),700);}
    };
  }
})();
