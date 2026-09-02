(() => {
  'use strict';
  const HIGH = 82;
  const LANGS = ['עברית','אנגלית','ספרדית','פורטוגזית','איטלקית','צרפתית','ערבית','רוסית','יוונית','יפנית','קוריאנית'];
  const $id = id => document.getElementById(id);

  function normalizeLyricsText(text){
    return String(text||'').normalize('NFKC').replace(/\[[^\]]*\]/g,' ').replace(/[^\p{L}\p{M}'’]+/gu,' ').toLowerCase().trim();
  }
  function scriptLanguages(text){
    const counts={עברית:0,ערבית:0,רוסית:0,יוונית:0,יפנית:0,קוריאנית:0}; let total=0;
    for(const ch of String(text||'')){
      if(!/\p{L}/u.test(ch)) continue;
      total++; const cp=ch.codePointAt(0);
      if(cp>=0x0590&&cp<=0x05FF) counts['עברית']++;
      else if((cp>=0x0600&&cp<=0x06FF)||(cp>=0x0750&&cp<=0x077F)) counts['ערבית']++;
      else if(cp>=0x0400&&cp<=0x04FF) counts['רוסית']++;
      else if(cp>=0x0370&&cp<=0x03FF) counts['יוונית']++;
      else if((cp>=0x3040&&cp<=0x30FF)||(cp>=0x4E00&&cp<=0x9FFF)) counts['יפנית']++;
      else if(cp>=0xAC00&&cp<=0xD7AF) counts['קוריאנית']++;
    }
    if(total<20) return [];
    return Object.entries(counts).map(([name,n])=>({name,confidence:Math.round(n/total*100),matches:n})).filter(x=>x.matches>=12&&x.confidence>=HIGH).sort((a,b)=>b.confidence-a.confidence).slice(0,2);
  }
  const markers={
    'אנגלית':['the','and','you','your','i','me','my','we','our','is','are','to','of','in','on','for','with','this','that','love','dont','not','be','it','all','can','will','when'],
    'ספרדית':['el','la','los','las','de','del','que','y','en','un','una','yo','tu','mi','me','te','por','para','con','como','pero','amor','no','es','soy','eres','cuando','porque','quiero'],
    'פורטוגזית':['o','a','os','as','de','do','da','que','e','em','um','uma','eu','tu','meu','minha','me','te','por','para','com','como','mas','amor','não','nao','é','sou','quando','porque','quero'],
    'איטלקית':['il','lo','la','i','gli','le','di','del','della','che','e','in','un','una','io','tu','mio','mia','mi','ti','per','con','come','ma','amore','non','è','sono','quando','perché','perche','voglio'],
    'צרפתית':['le','la','les','de','du','des','que','et','en','un','une','je','tu','mon','ma','mes','me','te','pour','avec','comme','mais','amour','ne','pas','est','suis','quand','parce','veux']
  };
  function latinLanguages(text){
    const words=normalizeLyricsText(text).split(/\s+/).filter(Boolean); if(words.length<30) return [];
    const scores=Object.entries(markers).map(([name,list])=>{const set=new Set(list);let hits=0;for(const w of words)if(set.has(w))hits++;return {name,hits};}).sort((a,b)=>b.hits-a.hits);
    const total=scores.reduce((n,x)=>n+x.hits,0); if(total<8||scores[0].hits<6) return [];
    const top=scores[0], second=scores[1], topShare=top.hits/total, out=[];
    const topConf=Math.min(99,Math.round(72+Math.min(27,(top.hits-6)*2.5)+(topShare-.45)*25));
    if(topConf>=HIGH&&topShare>=.45) out.push({name:top.name,confidence:topConf,matches:top.hits});
    const secondShare=second.hits/total;
    if(second.hits>=6&&secondShare>=.24&&top.hits/second.hits<=2.2){
      const c=Math.min(95,Math.round(78+(second.hits-6)*2+secondShare*20));
      if(c>=HIGH) out.push({name:second.name,confidence:c,matches:second.hits});
    }
    return out.slice(0,2);
  }
  function detectLanguages(text){const s=scriptLanguages(text);return s.length?s:latinLanguages(text);}

  function ensureAIFields(){
    if($id('aiLanguage1')) return;
    const bpm=$id('aiBpm'); if(!bpm) return;
    const host=bpm.closest('div');
    const options=LANGS.map(x=>`<option>${x}</option>`).join('');
    const d1=document.createElement('div'); d1.innerHTML=`<label>שפה מזוהה 1</label><select id="aiLanguage1"><option value="">לא זוהה בביטחון גבוה</option>${options}</select>`;
    const d2=document.createElement('div'); d2.innerHTML=`<label>שפה מזוהה 2</label><select id="aiLanguage2"><option value="">ללא שפה שנייה</option>${options}</select>`;
    host.insertAdjacentElement('afterend',d2); host.insertAdjacentElement('afterend',d1);
    const note=document.querySelector('.ai-result-note');
    if(note) note.textContent='הניתוח המקומי מזהה BPM, מהירות, אנרגיה, סדירות קצב ונקודת שיא. לזיהוי שפה נשלחים ל־LRCLIB רק שם השיר, המבצע, האלבום והמשך — קובץ המוזיקה אינו נשלח. השפה מוצגת רק בביטחון גבוה, וניתן לזהות עד שתי שפות.';
  }
  function languageNames(ai){return (ai?.languages||[]).map(v=>typeof v==='string'?v:(v?.name||'')).filter(Boolean).slice(0,2);}
  async function lookupLanguage(trackIndex){
    if(trackIndex<0||!window.electronAPI?.lookupLyrics||typeof ann!=='function') return [];
    const t=state.tracks[trackIndex], a=ann(trackIndex); if(!t) return [];
    const title=(a.title||clean(t.file?.name||t.name||'')).trim();
    const artist=(a.artist||artistOf(trackIndex)||'').trim();
    if(!title||!artist||artist==='מבצע לא ידוע') return [];
    const album=(a.album||'').trim(), duration=Math.round(Number(t.duration)||Number(a.autoAnalysis?.duration)||0);
    const lyr=await window.electronAPI.lookupLyrics({trackName:title,artistName:artist,albumName:album,duration});
    if(!lyr||lyr.rateLimited||lyr.instrumental||!lyr.plainLyrics) return [];
    return detectLanguages(lyr.plainLyrics).filter(x=>x.confidence>=HIGH).slice(0,2);
  }
  async function detectAndSave(trackIndex, force=false){
    if(trackIndex<0||typeof ann!=='function') return;
    const a=ann(trackIndex), ai=a.autoAnalysis||(a.autoAnalysis={});
    if(!force&&languageNames(ai).length) return;
    if(!force&&ai.languageCheckedAt&&Date.now()-Date.parse(ai.languageCheckedAt)<30*86400000) return;
    ai.languageCheckedAt=new Date().toISOString();
    try{
      const languages=await lookupLanguage(trackIndex);
      if(languages.length){ai.languages=languages;ai.languageSource='lrclib-lyrics-local-detection';ai.source=ai.source?ai.source+'+language-high-confidence':'language-high-confidence';}
      if(typeof saveData==='function') saveData();
      if(state.active===trackIndex){renderSummary();if(typeof renderExportMatches==='function')renderExportMatches();}
    }catch(e){console.warn('Language detection failed',e);}
  }
  function renderSummary(){
    const box=$id('aiAnalysisBadges'); if(!box||state.active<0) return;
    const ai=ann(state.active).autoAnalysis||{}, items=[];
    if(ai.artistType)items.push(`סוג מבצע: ${escapeHtml(ai.artistType)}`);
    if(ai.voice)items.push(`קולות: ${escapeHtml(ai.voice)}`);
    if(ai.leadInstrument)items.push(`כלי מוביל: ${escapeHtml(ai.leadInstrument)}`);
    if(ai.bpm)items.push(`${escapeHtml(ai.bpm)} BPM`);
    const langs=languageNames(ai); if(langs.length)items.push(`שפה: ${langs.map(escapeHtml).join(' + ')}`);
    if(ai.tempo)items.push(`מהירות: ${escapeHtml(ai.tempo)}`);
    if(ai.rhythmCharacter)items.push(`קצב: ${escapeHtml(ai.rhythmCharacter)}`);
    if(ai.energy)items.push(`אנרגיה: ${escapeHtml(ai.energy)}`);
    if(ai.peakTime!==''&&ai.peakTime!=null)items.push(`שיא: ${fmt(Number(ai.peakTime)||0)}`);
    box.innerHTML=items.length?items.map(x=>`<span class="badge ai-auto-badge">${x}</span>`).join(''):'<span class="small">השיר עדיין לא נותח.</span>';
    const edit=$id('editAIResults'); if(edit)edit.disabled=!items.length;
  }

  const originalFill=typeof fillAIModal==='function'?fillAIModal:null;
  if(originalFill) window.fillAIModal=function(ai={}){ensureAIFields();originalFill(ai);const l=languageNames(ai);$id('aiLanguage1').value=l[0]||'';$id('aiLanguage2').value=l[1]||'';};
  if(typeof renderAIAnalysisSummary==='function') window.renderAIAnalysisSummary=renderSummary;

  ensureAIFields();
  const save=$id('saveAIResults');
  if(save){
    const oldSave=save.onclick;
    save.onclick=()=>{
      if(state.active>=0){const a=ann(state.active),ai=a.autoAnalysis||(a.autoAnalysis={});const names=[$id('aiLanguage1')?.value,$id('aiLanguage2')?.value].filter((v,i,x)=>v&&x.indexOf(v)===i);ai.languages=names.map(name=>({name,confidence:100,manualReviewed:true}));ai.languageSource='reviewed';}
      if(oldSave) oldSave();
    };
  }
  const originalRun=typeof runAIAnalysis==='function'?runAIAnalysis:null;
  if(originalRun){
    const wrapped=async()=>{await originalRun();ensureAIFields();if(state.active>=0){const languages=await lookupLanguage(state.active);if(languages.length){$id('aiLanguage1').value=languages[0]?.name||'';$id('aiLanguage2').value=languages[1]?.name||'';}}};
    const a=$id('analyzeCurrentAI'), b=$id('analyzeCurrentAIInline'), c=$id('rerunAIAnalysis'); if(a)a.onclick=wrapped;if(b)b.onclick=wrapped;if(c)c.onclick=wrapped;
  }
  if(typeof audio!=='undefined'&&audio) audio.addEventListener('play',()=>{if(state.active>=0)detectAndSave(state.active,false);});

  if(typeof exportFilterRowHtml==='function'){
    const oldHtml=exportFilterRowHtml;
    window.exportFilterRowHtml=function(rowId){
      const html=oldHtml(rowId), options=LANGS.map(x=>`<option>${x}</option>`).join('');
      return html.replace('<div class="export-filter-field">\n     <label>דירוג מינימלי</label>',`<div class="export-filter-field"><label>שפה</label><select class="export-language"><option value="">כל השפות</option>${options}</select></div><div class="export-filter-field">\n     <label>דירוג מינימלי</label>`);
    };
    const oldCriteria=exportRowCriteria;
    window.exportRowCriteria=function(row){const c=oldCriteria(row);c.language=row.querySelector('.export-language')?.value||'';return c;};
    const oldMatch=matchesExportCriteria;
    window.matchesExportCriteria=function(x,c){if(c.language&&!languageNames(x.a.autoAnalysis).includes(c.language))return false;return oldMatch(x,c);};
    if(typeof fillExportTaxonomy==='function') fillExportTaxonomy();
  }
  document.title=document.title.replace(/5\.2/g,'5.3');
})();
