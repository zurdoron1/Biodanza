// Biodanza 5.6.1 - indexed, read-only relink dry-run.
// Inject INSIDE the renderer IIFE, after logical-song-upgrade.js.
(() => {
  const $q=id=>document.getElementById(id);
  const badMeta=v=>/^(artist|album|genre|unknown|undefined|null|n\/a|na|track)$/i.test(String(v||'').trim());
  const cleanMeta=v=>badMeta(v)?'':String(v||'').trim();
  const nrm=v=>{ try{return norm(v||'');}catch{return String(v||'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();} };
  const tokens=v=>new Set(nrm(v).split(/\s+/).filter(x=>x&&x.length>1&&!/^(the|a|an)$/i.test(x)));
  const overlap=(a,b)=>{const A=tokens(a),B=tokens(b);if(!A.size||!B.size)return 0;let n=0;A.forEach(x=>B.has(x)&&n++);return n/Math.max(A.size,B.size);};
  const oldSize=p=>Number(p?.size)||Number(String(p?.oldKey||'').split('|')[1])||0;
  const fileName=p=>String(p?.fileName||fallbackName(p?.oldKey||'')||'');
  const strip=v=>String(v||'').replace(/\.[A-Za-z0-9]{2,5}$/,' ').replace(/^\s*[A-Za-z]{1,8}\d{1,4}\s*[-_–—]+\s*\d{1,4}\s*[-_–—]+\s*/i,' ').replace(/^\s*[A-Za-z]{1,8}\d{1,4}\s*[-_–—]+\s*/i,' ').replace(/^\s*\d{1,3}\s*[-_–—]+\s*/,' ').trim();

  function trackInfo(t,i){
    const a=ann(i)||{};
    const title=cleanMeta(a.title)||strip(t.file?.name||'');
    const artist=cleanMeta(a.artist)||cleanMeta(typeof artistOf==='function'?artistOf(i):'');
    const name=String(t.file?.name||'');
    return {t,i,title,artist,name,nTitle:nrm(title),nArtist:nrm(artist),nName:nrm(strip(name)),size:Number(t.file?.size)||0,duration:Number(t.duration||a.duration)||0};
  }

  function buildIndex(){
    const rows=state.tracks.map(trackInfo);
    const exact=new Map(), tok=new Map();
    const add=(m,k,r)=>{if(!k)return;if(!m.has(k))m.set(k,[]);m.get(k).push(r);};
    for(const r of rows){
      add(exact,r.nTitle,r); add(exact,r.nName,r);
      for(const x of new Set([...tokens(r.title),...tokens(r.name)])) add(tok,x,r);
    }
    return {rows,exact,tok};
  }

  function candidateSet(p,index){
    const title=cleanMeta(p?.title)||strip(fileName(p));
    const artist=cleanMeta(p?.artist);
    const keys=[nrm(title),nrm(strip(fileName(p)))].filter(Boolean);
    const out=new Map();
    for(const k of keys) for(const r of index.exact.get(k)||[]) out.set(r.t.key,r);
    const wanted=[...tokens(`${title} ${artist} ${fileName(p)}`)];
    for(const w of wanted){for(const r of index.tok.get(w)||[]) out.set(r.t.key,r);}
    let arr=[...out.values()];
    if(arr.length>80){
      arr=arr.map(r=>({r,q:Math.max(overlap(title,r.title),overlap(fileName(p),r.name))})).sort((a,b)=>b.q-a.q).slice(0,80).map(x=>x.r);
    }
    return arr;
  }

  function evidence(p,r){
    const pt=cleanMeta(p?.title)||strip(fileName(p));
    const pa=cleanMeta(p?.artist);
    const titleSim=similarity(pt,r.title);
    const nameSemantic=overlap(strip(fileName(p)),strip(r.name));
    const artistSim=pa&&r.artist?similarity(pa,r.artist):0;
    const os=oldSize(p), ns=r.size;
    const sizeRatio=os&&ns?Math.abs(os-ns)/Math.max(os,ns):1;
    const pd=Number(p?.duration)||0, nd=r.duration;
    const dd=pd&&nd?Math.abs(pd-nd):9999;
    const reasons=[];
    let score=0,strong=0,corroborators=0;
    if(titleSim>=.96){score+=42;strong++;reasons.push('כותרת כמעט זהה');} else if(titleSim>=.86){score+=28;reasons.push('כותרת דומה');}
    if(nameSemantic>=.96){score+=30;strong++;reasons.push('שם קובץ/מילים כמעט זהים');} else if(nameSemantic>=.80){score+=18;reasons.push('מילים מרכזיות בשם תואמות');}
    if(pa&&r.artist){if(artistSim>=.92){score+=28;strong++;corroborators++;reasons.push('מבצע תואם');}else if(artistSim>=.75){score+=12;reasons.push('מבצע דומה');}else if(artistSim<.30){score-=18;reasons.push('מבצע שונה');}}
    if(os&&ns){if(os===ns){score+=24;strong++;corroborators++;reasons.push('גודל זהה');}else if(sizeRatio<=.005){score+=20;strong++;corroborators++;reasons.push('גודל כמעט זהה');}else if(sizeRatio<=.02){score+=8;}}
    if(pd&&nd){if(dd<=2){score+=30;strong++;corroborators++;reasons.push('משך תואם');}else if(dd<=4){score+=22;strong++;corroborators++;reasons.push('משך קרוב');}else if(dd>15){score-=20;reasons.push('משך שונה');}}
    const semantic=Math.max(overlap(pt,r.title),nameSemantic);
    if(semantic>=.8){score+=18;reasons.push('מילים מרכזיות תואמות');}
    const reliable = strong>=1 && score>=60;
    return {score:Math.round(score),strong,corroborators,reliable,reasons,titleSim,artistSim,nameSemantic};
  }

  async function dryRun(pkg){
    const profiles=pkg?.profiles||{};
    const entries=Object.entries(profiles);
    const panel=$q('relinkPanel'); if(panel) panel.style.display='block';
    const summary=$q('relinkSummary'),details=$q('relinkDetails'),issues=$q('relinkIssues');
    if(summary) summary.textContent=`בדיקת שיוך: 0 מתוך ${entries.length}`;
    if(details) details.textContent='מצב בדיקה בלבד — המאגר אינו משתנה.';
    if(issues) issues.innerHTML='';
    try{ if(window.__biodanzaLogicalSongs?.collapse) window.__biodanzaLogicalSongs.collapse(); }catch{}
    const index=buildIndex();
    const results=[]; let safe=0,review=0,missing=0;
    for(let n=0;n<entries.length;n++){
      const [oldKey,p0]=entries[n],p={...p0,oldKey:p0?.oldKey||oldKey};
      const candidates=candidateSet(p,index).map(r=>({...r,...evidence(p,r)})).sort((a,b)=>b.score-a.score).slice(0,5);
      const best=candidates[0],second=candidates[1];
      const sameLogical=best&&second&&best.t.logicalSongId&&best.t.logicalSongId===second.t.logicalSongId;
      const ambiguous=best&&second&&!sameLogical&&Math.abs(best.score-second.score)<10;
      let status='missing';
      if(best&&best.reliable&&best.corroborators>=2&&best.score>=70&&!ambiguous) status='safe';
      else if(best&&best.reliable&&best.corroborators>=1&&best.score>=72&&!ambiguous) status='safe';
      else if(best&&best.reliable&&best.score>=60) status='review';
      if(status==='safe')safe++;else if(status==='review')review++;else missing++;
      results.push({oldKey,p,status,best:best?{key:best.t.key,name:best.name,title:best.title,artist:best.artist,score:best.score,reasons:best.reasons,copies:1+(best.t.alternateFiles?.length||0)}:null});
      if(n%4===0||n===entries.length-1){
        if(summary) summary.textContent=`בדיקת שיוך: ${n+1} מתוך ${entries.length}`;
        await new Promise(r=>setTimeout(r,0));
      }
    }
    state.lastRelinkDryRun=results;
    if(summary) summary.textContent=`בדיקת שיוך הסתיימה: ${safe} התאמות בטוחות · ${review} לבדיקה · ${missing} ללא התאמה`;
    if(details) details.textContent=`נבדקו ${entries.length} רשומות מול ${index.rows.length} שירים ייחודיים. לא בוצע שום שינוי במאגר.`;
    if(issues){
      issues.innerHTML=`<table class="characterized-db-table"><thead><tr><th>שיר ישן</th><th>מועמד</th><th>מבצע</th><th>ציון</th><th>עותקים</th><th>החלטה</th><th>למה</th></tr></thead><tbody>${results.map(r=>`<tr><td>${escapeHtml(r.p.title||r.p.fileName||fallbackName(r.oldKey))}</td><td>${escapeHtml(r.best?.name||'—')}</td><td>${escapeHtml(r.best?.artist||'')}</td><td>${r.best?.score??'—'}</td><td>${r.best?.copies??'—'}</td><td>${r.status==='safe'?'בטוחה':r.status==='review'?'לבדיקה':'אין התאמה'}</td><td>${escapeHtml((r.best?.reasons||[]).join(' · '))}</td></tr>`).join('')}</tbody></table>`;
    }
    return results;
  }

  relinkPackage=dryRun;
  if(typeof importInput!=='undefined'&&importInput){
    importInput.onchange=async e=>{
      const f=e.target.files?.[0]; if(!f)return;
      try{
        const pkg=JSON.parse(await f.text());
        if(pkg.type!=='biodanza-transfer-package'||!pkg.profiles) throw new Error('bad package');
        state.pendingRelinkPackage=pkg;
        if(!state.tracks.length){alert(`חבילת ההעברה נקראה: ${Object.keys(pkg.profiles).length} רשומות.\nטען את תיקיית המוזיקה ואז הפעל שוב את בדיקת חבילת ההעברה.`);return;}
        await dryRun(pkg);
      }catch(err){console.error(err);alert('קובץ חבילת ההעברה אינו תקין.');}
      finally{e.target.value='';}
    };
    try{ if(importLabel) importLabel.textContent='🧪 בדוק חבילת העברה — ללא שינוי במאגר'; }catch{}
  }
  window.__biodanzaRelinkDryRun={run:dryRun,version:'5.6.1',readOnly:true};
})();
