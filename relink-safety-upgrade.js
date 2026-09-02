// Injected inside the main renderer IIFE after relink-upgrade.js.
// Conservative relinking with semantic filename comparison and file/audio property evidence.
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
    const sb=new Set(B);
    const common=A.filter(x=>sb.has(x)).length;
    const union=new Set([...A,...B]).size;
    const jaccard=common/Math.max(1,union);
    const containment=common/Math.max(1,Math.min(A.length,B.length));
    return {similarity:Math.max(jaccard,containment),common,a:A,b:B};
  }

  function oldSizeFromProfile(p){
    return Number(p?.size) || Number(String(p?.oldKey||'').split('|')[1]) || 0;
  }

  function fileEvidence(p,t){
    const oldName=String(p?.fileName || fallbackName(p?.oldKey || '') || '');
    const newName=String(t?.file?.name || '');
    const nameSim=similarity(oldName,newName);
    const semantic=semanticNameEvidence(oldName,newName);
    const oldSize=oldSizeFromProfile(p);
    const newSize=Number(t?.file?.size) || 0;
    const sizeRatio=oldSize&&newSize ? Math.abs(oldSize-newSize)/Math.max(oldSize,newSize) : 1;
    const exactName=!!oldName && !!newName && norm(oldName)===norm(newName);
    return {oldName,newName,nameSim,semantic,oldSize,newSize,sizeRatio,exactName};
  }

  function mediaProps(p,t,i){
    const a=ann(i)||{};
    const oldDuration=Number(p?.duration)||0;
    const newDuration=Number(t?.duration||a.duration)||0;
    const durationDiff=oldDuration&&newDuration ? Math.abs(oldDuration-newDuration) : Infinity;
    const oldSize=oldSizeFromProfile(p);
    const newSize=Number(t?.file?.size||a.fileSize)||0;
    const oldBitrate=Number(p?.bitrate)||((oldSize&&oldDuration)?(oldSize*8/oldDuration/1000):0);
    const newBitrate=Number(a.bitrate)||((newSize&&newDuration)?(newSize*8/newDuration/1000):0);
    const bitrateDiff=oldBitrate&&newBitrate ? Math.abs(oldBitrate-newBitrate)/Math.max(oldBitrate,newBitrate) : Infinity;
    const oldSampleRate=Number(p?.sampleRate)||0;
    const newSampleRate=Number(a.sampleRate)||0;
    const oldChannels=Number(p?.channels)||0;
    const newChannels=Number(a.channels)||0;
    const oldExt=String(p?.ext||'').toLowerCase();
    const newExt=String((t?.file?.name||'').split('.').pop()||'').toLowerCase();
    return {oldDuration,newDuration,durationDiff,oldSize,newSize,oldBitrate,newBitrate,bitrateDiff,oldSampleRate,newSampleRate,oldChannels,newChannels,oldExt,newExt};
  }

  function propertyEvidence(p,t,i){
    const m=mediaProps(p,t,i);
    let bonus=0; const reasons=[]; let strongCount=0;
    if(m.oldDuration&&m.newDuration){
      if(m.durationDiff<=1){bonus+=34;strongCount++;reasons.push('משך זהה כמעט לחלוטין');}
      else if(m.durationDiff<=2){bonus+=30;strongCount++;reasons.push('משך תואם עד 2 שניות');}
      else if(m.durationDiff<=3){bonus+=24;strongCount++;reasons.push('משך תואם עד 3 שניות');}
      else if(m.durationDiff<=5){bonus+=12;reasons.push('משך קרוב');}
      else if(m.durationDiff>20){bonus-=20;reasons.push('משך שונה משמעותית');}
    }
    if(m.oldSize&&m.newSize){
      const r=Math.abs(m.oldSize-m.newSize)/Math.max(m.oldSize,m.newSize);
      if(r===0){bonus+=24;strongCount++;reasons.push('גודל קובץ זהה');}
      else if(r<=0.005){bonus+=20;strongCount++;reasons.push('גודל קובץ כמעט זהה');}
      else if(r<=0.02){bonus+=10;reasons.push('גודל קובץ קרוב');}
    }
    if(Number.isFinite(m.bitrateDiff)){
      if(m.bitrateDiff<=0.02){bonus+=14;strongCount++;reasons.push('bitrate תואם');}
      else if(m.bitrateDiff<=0.08){bonus+=7;reasons.push('bitrate קרוב');}
    }
    if(m.oldSampleRate&&m.newSampleRate&&m.oldSampleRate===m.newSampleRate){bonus+=5;reasons.push('קצב דגימת שמע זהה');}
    if(m.oldChannels&&m.newChannels&&m.oldChannels===m.newChannels){bonus+=4;reasons.push('מספר ערוצי שמע זהה');}
    if(m.oldExt&&m.newExt&&m.oldExt===m.newExt){bonus+=2;}
    return {bonus,reasons,strongCount,media:m};
  }

  function semanticBonus(p,t){
    const f=fileEvidence(p,t), s=f.semantic;
    let bonus=0; const reasons=[];
    if(s.common>=3 && s.similarity>=0.95){bonus=82;reasons.push(`כותרת/מבצע זהים בסדר שונה (${s.common} מילים)`);}
    else if(s.common>=3 && s.similarity>=0.80){bonus=68;reasons.push(`כותרת/מבצע דומים מאוד (${Math.round(s.similarity*100)}%)`);}
    else if(s.common>=2 && s.similarity>=0.90){bonus=58;reasons.push(`שם סמנטי קרוב מאוד (${Math.round(s.similarity*100)}%)`);}
    else if(s.common>=3 && s.similarity>=0.65){bonus=40;reasons.push(`שם סמנטי דומה (${Math.round(s.similarity*100)}%)`);}
    return {bonus,reasons,file:f};
  }

  function identityEvidence(p,t,i,fingerprintMatch=false){
    if(fingerprintMatch) return {strong:true,label:'טביעת אצבע זהה'};
    const f=fileEvidence(p,t);
    const props=propertyEvidence(p,t,i);
    if(f.exactName && f.oldSize && f.newSize && f.sizeRatio<=0.005) return {strong:true,label:'שם קובץ וגודל תואמים'};
    if(f.nameSim>=0.92 && f.oldSize && f.newSize && f.sizeRatio<=0.005) return {strong:true,label:`שם קובץ ${Math.round(f.nameSim*100)}% + גודל תואם`};
    if(f.semantic.common>=3 && f.semantic.similarity>=0.95) return {strong:true,label:`כותרת/מבצע תואמים ללא תלות בסדר (${f.semantic.common} מילים)`};
    if(f.semantic.common>=3 && f.semantic.similarity>=0.80 && props.strongCount>=1) return {strong:true,label:`כותרת/מבצע ${Math.round(f.semantic.similarity*100)}% + מאפיין קובץ תואם`};

    const a=ann(i)||{};
    const currentTitle=a.title || clean(t.file?.name||'');
    const titleSim=similarity(p?.title||'',currentTitle);
    if(titleSim>=0.92 && props.media.durationDiff<=3) return {strong:true,label:`שם שיר ${Math.round(titleSim*100)}% + משך תואם`};
    if(titleSim>=0.88 && props.strongCount>=2) return {strong:true,label:`שם שיר ${Math.round(titleSim*100)}% + שני מאפייני קובץ תואמים`};

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
        const props=propertyEvidence(p,t,i);
        return {i,t,score:base.score+sem.bonus+props.bonus,reasons:[...(sem.reasons||[]),...(props.reasons||[]),...(base.reasons||[])],fpMatch:false};
      }).filter(x=>!used.has(x.t.key)).sort((a,b)=>b.score-a.score).slice(0,10);

      if(p.fingerprint){
        for(const x of ranked){
          if(x.score<35) continue;
          x.fp=await fingerprint(x.t.file);
          if(x.fp&&x.fp===p.fingerprint){x.score=140;x.fpMatch=true;x.reasons.unshift('טביעת אצבע זהה');break;}
        }
        ranked.sort((a,b)=>b.score-a.score);
      }

      for(const x of ranked) x.identity=identityEvidence(p,x.t,x.i,x.fpMatch);

      const best=ranked[0], second=ranked[1];
      const ambiguous=best&&second&&(best.score-second.score<8)&&best.score<125;
      let status='missing';
      if(best && best.score>=95 && best.identity?.strong && !ambiguous) status='auto';
      else if(best && best.score>=72 && best.identity?.strong) status='review';

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
    $id('relinkDetails').textContent='ההשוואה משלבת כותרת/מבצע ללא תלות בסדר, משך, גודל קובץ, bitrate משוער ומאפייני אודיו זמינים. ציון לבדו אינו מספיק ללא ראיית זהות.';
    const issues=(state.lastRelinkResults||[]).filter(r=>r.status!=='auto');
    $id('relinkIssues').innerHTML=issues.length?`<table class="characterized-db-table"><thead><tr><th>שיר מהמאגר</th><th>מועמד</th><th>ציון</th><th>למה הוצע</th><th>פעולה</th></tr></thead><tbody>${issues.map(r=>{const n=state.lastRelinkResults.indexOf(r);const canApprove=r.status==='review'&&r.best;return `<tr><td>${escapeHtml(r.p.title||r.p.fileName||fallbackName(r.oldKey))}</td><td>${escapeHtml(r.best?.name||'לא נמצאה התאמה אמינה')}</td><td>${r.best?.score??'—'}</td><td>${escapeHtml((r.best?.reasons||[]).join(' · ')||'—')}</td><td>${canApprove?`<button class="good approve-relink" data-n="${n}">אשר שיוך</button>`:'—'}</td></tr>`}).join('')}</tbody></table>`:'<div class="small">כל הרשומות שויכו בוודאות גבוהה.</div>';
    document.querySelectorAll('.approve-relink').forEach(b=>b.onclick=()=>approveManual(Number(b.dataset.n)));
  };
})();
