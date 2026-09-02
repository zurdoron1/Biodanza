// Injected inside the main renderer IIFE after relink-upgrade.js.
// Conservative relinking with semantic filename comparison for renamed/reordered music files.
(() => {
  function semanticTokens(v=''){
    let s=String(v||'').replace(/\.[A-Za-z0-9]{2,5}$/,' ');
    // Remove common Biodanza catalogue / track prefixes such as IBFC20 - 03 -, HLB07 - 09 -, BA61-10 -.
    s=s.replace(/^\s*[A-Za-z]{1,8}\d{1,4}(?:[-_ ]\d{1,4})?\s*[-_–—]+\s*/i,' ');
    s=s.replace(/^\s*\d{1,3}\s*[-_–—]+\s*/,' ');
    const tokens=norm(s).split(' ').filter(Boolean).filter(x=>
      !/^(the|a|an|track|cd|disc|disk|audio|official|music|video)$/i.test(x) &&
      !/^\d+$/.test(x) && !/^[a-z]{1,8}\d{1,4}$/i.test(x)
    );
    return [...new Set(tokens)];
  }

  function semanticNameEvidence(oldName,newName){
    const A=semanticTokens(oldName), B=semanticTokens(newName);
    if(!A.length||!B.length) return {similarity:0,common:0,a:A,b:B};
    const sa=new Set(A), sb=new Set(B);
    const common=A.filter(x=>sb.has(x)).length;
    const union=new Set([...A,...B]).size;
    const jaccard=common/Math.max(1,union);
    const containment=common/Math.max(1,Math.min(A.length,B.length));
    return {similarity:Math.max(jaccard,containment),common,a:A,b:B};
  }

  function fileEvidence(p,t){
    const oldName=String(p?.fileName || fallbackName(p?.oldKey || '') || '');
    const newName=String(t?.file?.name || '');
    const nameSim=similarity(oldName,newName);
    const semantic=semanticNameEvidence(oldName,newName);
    const oldSize=Number(p?.size) || Number(String(p?.oldKey||'').split('|')[1]) || 0;
    const newSize=Number(t?.file?.size) || 0;
    const sizeRatio=oldSize&&newSize ? Math.abs(oldSize-newSize)/Math.max(oldSize,newSize) : 1;
    const exactName=!!oldName && !!newName && norm(oldName)===norm(newName);
    return {oldName,newName,nameSim,semantic,oldSize,newSize,sizeRatio,exactName};
  }

  function semanticBonus(p,t){
    const f=fileEvidence(p,t), s=f.semantic;
    let bonus=0; const reasons=[];
    if(s.common>=3 && s.similarity>=0.95){bonus=82;reasons.push(`כותרת/מבצע זהים בסדר שונה (${s.common} מילים)`);}
    else if(s.common>=3 && s.similarity>=0.80){bonus=68;reasons.push(`כותרת/מבצע דומים מאוד (${Math.round(s.similarity*100)}%)`);}
    else if(s.common>=2 && s.similarity>=0.90){bonus=58;reasons.push(`שם סמנטי קרוב מאוד (${Math.round(s.similarity*100)}%)`);}
    else if(s.common>=3 && s.similarity>=0.65){bonus=40;reasons.push(`שם סמנטי דומה (${Math.round(s.similarity*100)}%)`);}
    if(f.oldSize&&f.newSize){
      if(f.sizeRatio<=0.005){bonus+=18;reasons.push('גודל קובץ תואם');}
      else if(f.sizeRatio<=0.02){bonus+=8;}
    }
    return {bonus,reasons,file:f};
  }

  function identityEvidence(p,t,i,reasons=[],fingerprintMatch=false){
    if(fingerprintMatch) return {strong:true,label:'טביעת אצבע זהה'};
    const f=fileEvidence(p,t);
    if(f.exactName && f.oldSize && f.newSize && f.sizeRatio<=0.005) return {strong:true,label:'שם קובץ וגודל תואמים'};
    if(f.nameSim>=0.92 && f.oldSize && f.newSize && f.sizeRatio<=0.005) return {strong:true,label:`שם קובץ ${Math.round(f.nameSim*100)}% + גודל תואם`};
    if(f.semantic.common>=3 && f.semantic.similarity>=0.95) return {strong:true,label:`כותרת/מבצע תואמים ללא תלות בסדר (${f.semantic.common} מילים)`};
    if(f.semantic.common>=3 && f.semantic.similarity>=0.80 && f.oldSize && f.newSize && f.sizeRatio<=0.02) return {strong:true,label:`כותרת/מבצע ${Math.round(f.semantic.similarity*100)}% + גודל קרוב`};

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
      let ranked=state.tracks.map((t,i)=>{
        const base=baseScore(p,t,i);
        const sem=semanticBonus(p,t);
        return {i,t,score:base.score+sem.bonus,reasons:[...(sem.reasons||[]),...(base.reasons||[])],fpMatch:false};
      }).filter(x=>!used.has(x.t.key)).sort((a,b)=>b.score-a.score).slice(0,8);

      if(p.fingerprint){
        for(const x of ranked){
          if(x.score<35) continue;
          x.fp=await fingerprint(x.t.file);
          if(x.fp&&x.fp===p.fingerprint){x.score=120;x.fpMatch=true;x.reasons.unshift('טביעת אצבע זהה');break;}
        }
        ranked.sort((a,b)=>b.score-a.score);
      }

      for(const x of ranked) x.identity=identityEvidence(p,x.t,x.i,x.reasons,x.fpMatch);

      const best=ranked[0], second=ranked[1];
      const ambiguous=best&&second&&(best.score-second.score<8)&&best.score<110;
      let status='missing';
      if(best && best.score>=90 && best.identity?.strong && !ambiguous) status='auto';
      else if(best && best.score>=70 && best.identity?.strong) status='review';

      if(status==='auto'){
        const newKey=best.t.key, src=state.annotations[oldKey]||pkg.annotations?.[oldKey];
        if(src){
          state.annotations[newKey]={...(state.annotations[newKey]||{}),...src};
          const saved=state.annotations[newKey];
          saved.lastKnownPath=best.t.nativePath||saved.lastKnownPath;
          saved.lastKnownRelativePath=best.t.file?.webkitRelativePath||saved.lastKnownRelativePath;
          saved.relinkedAt=new Date().toISOString(); saved.relinkScore=Math.round(best.score);
          saved.relinkReason=best.identity.label;
          if(newKey!==oldKey) delete state.annotations[oldKey];
          state.chosen=state.chosen.map(k=>k===oldKey?newKey:k); used.add(newKey); auto++;
        } else { status='missing'; missing++; }
      } else if(status==='review') review++; else missing++;

      const shownBest=status==='missing'?null:best;
      results.push({oldKey,p,status,best:shownBest?{
        key:shownBest.t.key,name:shownBest.t.file.name,score:Math.round(shownBest.score),
        reasons:[shownBest.identity?.label,...(shownBest.reasons||[])].filter(Boolean)
      }:null});
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
    $id('relinkDetails').textContent='ההשוואה מתחשבת גם בכותרת ובמבצע ללא תלות בסדר המילים, ומסירה קידומות קטלוגיות ומספרי רצועה.';
    const issues=(state.lastRelinkResults||[]).filter(r=>r.status!=='auto');
    $id('relinkIssues').innerHTML=issues.length?`<table class="characterized-db-table"><thead><tr><th>שיר מהמאגר</th><th>מועמד</th><th>ציון</th><th>למה הוצע</th><th>פעולה</th></tr></thead><tbody>${issues.map(r=>{const n=state.lastRelinkResults.indexOf(r);const canApprove=r.status==='review'&&r.best;return `<tr><td>${escapeHtml(r.p.title||r.p.fileName||fallbackName(r.oldKey))}</td><td>${escapeHtml(r.best?.name||'לא נמצאה התאמה אמינה')}</td><td>${r.best?.score??'—'}</td><td>${escapeHtml((r.best?.reasons||[]).join(' · ')||'—')}</td><td>${canApprove?`<button class="good approve-relink" data-n="${n}">אשר שיוך</button>`:'—'}</td></tr>`}).join('')}</tbody></table>`:'<div class="small">כל הרשומות שויכו בוודאות גבוהה.</div>';
    document.querySelectorAll('.approve-relink').forEach(b=>b.onclick=()=>approveManual(Number(b.dataset.n)));
  };
})();
