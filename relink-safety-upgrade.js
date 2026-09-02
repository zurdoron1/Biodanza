// Injected inside the main renderer IIFE after relink-upgrade.js.
// Tightens automatic/manual relinking so unrelated tracks are never offered merely because they have the highest weak score.
(() => {
  function fileEvidence(p,t){
    const oldName=String(p?.fileName || fallbackName(p?.oldKey || '') || '');
    const newName=String(t?.file?.name || '');
    const nameSim=similarity(oldName,newName);
    const oldSize=Number(p?.size) || Number(String(p?.oldKey||'').split('|')[1]) || 0;
    const newSize=Number(t?.file?.size) || 0;
    const sizeRatio=oldSize&&newSize ? Math.abs(oldSize-newSize)/Math.max(oldSize,newSize) : 1;
    const exactName=!!oldName && !!newName && norm(oldName)===norm(newName);
    return {oldName,newName,nameSim,oldSize,newSize,sizeRatio,exactName};
  }

  function identityEvidence(p,t,i,reasons=[],fingerprintMatch=false){
    if(fingerprintMatch) return {strong:true,label:'טביעת אצבע זהה'};
    const f=fileEvidence(p,t);
    if(f.exactName && f.oldSize && f.newSize && f.sizeRatio<=0.005) return {strong:true,label:'שם קובץ וגודל תואמים'};
    if(f.nameSim>=0.92 && f.oldSize && f.newSize && f.sizeRatio<=0.005) return {strong:true,label:`שם קובץ ${Math.round(f.nameSim*100)}% + גודל תואם`};

    const a=ann(i)||{};
    const currentTitle=a.title || clean(t.file?.name||'');
    const titleSim=similarity(p?.title||'',currentTitle);
    const oldDuration=Number(p?.duration)||0, newDuration=Number(t?.duration)||0;
    const durationDiff=oldDuration&&newDuration ? Math.abs(oldDuration-newDuration) : Infinity;
    if(titleSim>=0.92 && durationDiff<=3) return {strong:true,label:`שם שיר ${Math.round(titleSim*100)}% + משך תואם`};

    return {strong:false,label:''};
  }

  relinkPackage = async function(pkg){
    if(!pkg || !state.tracks.length) return;
    const profiles=pkg.profiles||{}, used=new Set(), results=[];
    let auto=0,review=0,missing=0;

    for(const [oldKey,pRaw] of Object.entries(profiles)){
      const p={...pRaw,oldKey:pRaw?.oldKey||oldKey};
      let ranked=state.tracks.map((t,i)=>({i,t,...baseScore(p,t,i),fpMatch:false}))
        .filter(x=>!used.has(x.t.key)).sort((a,b)=>b.score-a.score).slice(0,6);

      if(p.fingerprint){
        for(const x of ranked){
          if(x.score<35) continue;
          x.fp=await fingerprint(x.t.file);
          if(x.fp&&x.fp===p.fingerprint){x.score=100;x.fpMatch=true;x.reasons.unshift('טביעת אצבע זהה');break;}
        }
        ranked.sort((a,b)=>b.score-a.score);
      }

      for(const x of ranked){
        x.identity=identityEvidence(p,x.t,x.i,x.reasons,x.fpMatch);
      }

      const best=ranked[0], second=ranked[1];
      const ambiguous=best&&second&&(best.score-second.score<6)&&best.score<96;
      let status='missing';

      // A numeric score alone is never sufficient. Strong identity evidence is mandatory.
      if(best && best.score>=82 && best.identity?.strong && !ambiguous) status='auto';
      else if(best && best.score>=70 && best.identity?.strong) status='review';

      if(status==='auto'){
        const newKey=best.t.key, src=state.annotations[oldKey]||pkg.annotations?.[oldKey];
        if(src){
          state.annotations[newKey]=src;
          src.lastKnownPath=best.t.nativePath||src.lastKnownPath;
          src.lastKnownRelativePath=best.t.file?.webkitRelativePath||src.lastKnownRelativePath;
          src.relinkedAt=new Date().toISOString(); src.relinkScore=Math.round(best.score);
          src.relinkReason=best.identity.label;
          if(newKey!==oldKey) delete state.annotations[oldKey];
          state.chosen=state.chosen.map(k=>k===oldKey?newKey:k); used.add(newKey); auto++;
        } else { status='missing'; missing++; }
      } else if(status==='review') review++; else missing++;

      // Do not expose a random 'best of bad choices' candidate for missing records.
      const shownBest=status==='missing'?null:best;
      results.push({
        oldKey,p,status,
        best:shownBest?{
          key:shownBest.t.key,name:shownBest.t.file.name,score:Math.round(shownBest.score),
          reasons:[shownBest.identity?.label,...(shownBest.reasons||[])].filter(Boolean)
        }:null
      });
    }

    state.lastRelinkResults=results;
    if(typeof saveData==='function') saveData();
    if(typeof renderRows==='function') renderRows();
    if(typeof renderChosen==='function') renderChosen();
    if(typeof renderActiveLibrary==='function') renderActiveLibrary();
    if(typeof renderExportMatches==='function') renderExportMatches();
    if(typeof populateCharacterizedFilters==='function') populateCharacterizedFilters();
    if(typeof renderCharacterizedDb==='function') renderCharacterizedDb();
    renderRelinkPanel(auto,review,missing);
  };

  renderRelinkPanel = function(auto,review,missing){
    relinkPanel.style.display='block';
    $id('relinkSummary').textContent=`שיוך מחדש הסתיים: ${auto} שויכו אוטומטית · ${review} לבדיקה · ${missing} לא נמצאו`;
    $id('relinkDetails').textContent='מועמד מוצג רק כאשר קיימת ראיית זהות חזקה. ציון גבוה לבדו אינו מספיק.';
    const issues=(state.lastRelinkResults||[]).filter(r=>r.status!=='auto');
    $id('relinkIssues').innerHTML=issues.length?`<table class="characterized-db-table"><thead><tr><th>שיר מהמאגר</th><th>מועמד</th><th>ציון</th><th>למה הוצע</th><th>פעולה</th></tr></thead><tbody>${issues.map(r=>{const n=state.lastRelinkResults.indexOf(r);const canApprove=r.status==='review'&&r.best;return `<tr><td>${escapeHtml(r.p.title||r.p.fileName||fallbackName(r.oldKey))}</td><td>${escapeHtml(r.best?.name||'לא נמצאה התאמה אמינה')}</td><td>${r.best?.score??'—'}</td><td>${escapeHtml((r.best?.reasons||[]).join(' · ')||'—')}</td><td>${canApprove?`<button class="good approve-relink" data-n="${n}">אשר שיוך</button>`:'—'}</td></tr>`}).join('')}</tbody></table>`:'<div class="small">כל הרשומות שויכו בוודאות גבוהה.</div>';
    document.querySelectorAll('.approve-relink').forEach(b=>b.onclick=()=>approveManual(Number(b.dataset.n)));
  };
})();
