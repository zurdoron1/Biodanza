const assert=require('assert');
const nrm=v=>String(v||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
const strip=v=>String(v||'').replace(/\.[A-Za-z0-9]{2,5}$/,' ').replace(/^\s*[A-Za-z]{1,8}\d{1,4}\s*[-_–—]+\s*\d{1,4}\s*[-_–—]+\s*/i,' ').replace(/^\s*[A-Za-z]{1,8}\d{1,4}\s*[-_–—]+\s*/i,' ').replace(/^\s*\d{1,3}\s*[-_–—]+\s*/,' ').trim();
const toks=v=>new Set(nrm(v).split(/\s+/).filter(x=>x&&x.length>1&&!/^(the|a|an)$/i.test(x)));
const overlap=(a,b)=>{const A=toks(a),B=toks(b);let n=0;A.forEach(x=>B.has(x)&&n++);return n/Math.max(A.size,B.size,1)};
function jaccard(a,b){const A=toks(a),B=toks(b);let n=0;A.forEach(x=>B.has(x)&&n++);return n/Math.max(new Set([...A,...B]).size,1)}
function evidence(p,r){
 const title=p.title||strip(p.fileName), artist=p.artist||'';
 const titleSim=jaccard(title,r.title), nameSemantic=overlap(strip(p.fileName),strip(r.name)), artistSim=artist&&r.artist?jaccard(artist,r.artist):0;
 const os=p.size||0,ns=r.size||0,ratio=os&&ns?Math.abs(os-ns)/Math.max(os,ns):1;
 let score=0,strong=0,corroborators=0;
 if(titleSim>=.96){score+=42;strong++}else if(titleSim>=.86)score+=28;
 if(nameSemantic>=.96){score+=30;strong++}else if(nameSemantic>=.80)score+=18;
 if(artist&&r.artist){if(artistSim>=.92){score+=28;strong++;corroborators++}else if(artistSim>=.75)score+=12;else if(artistSim<.30)score-=18;}
 if(os&&ns){if(os===ns){score+=24;strong++;corroborators++}else if(ratio<=.005){score+=20;strong++;corroborators++}else if(ratio<=.02)score+=8;}
 if(Math.max(overlap(title,r.title),nameSemantic)>=.8)score+=18;
 return {score,strong,corroborators,reliable:strong>=1&&score>=60};
}
const safe=x=>x.reliable&&((x.corroborators>=2&&x.score>=70)||(x.corroborators>=1&&x.score>=72));

assert.strictEqual(strip('IBFC20 - 03 - The Beatles - All Together Now.mp3'),'The Beatles - All Together Now','catalog+track prefix must be removed');
const legacy={fileName:'IBFC20 - 03 - The Beatles - All Together Now.mp3',title:'The Beatles - All Together Now',artist:'The Beatles',size:5414912};
const current={name:'All together now-beatles.mp3',title:'All Together Now',artist:'The Beatles',size:5414912};
const good=evidence(legacy,current);
assert(safe(good),'All Together Now must be safe when semantic name evidence is corroborated by size/artist');

const wrong={name:'Viento del Arena.mp3',title:'Viento del Arena',artist:'Gipsy Kings',size:5414912};
const bad=evidence(legacy,wrong);
assert(!safe(bad),'Unrelated song must not become safe from file size alone');
assert(!bad.reliable || bad.score<60,'Unrelated song should not even become review from size alone');

const feelingOld={fileName:'01 Feeling Good.m4a',title:'Feeling Good',artist:'',size:0};
const feelingNew={name:'07 Feeling Good.mp3',title:'Feeling Good',artist:'Avicii y Maudra Mae',size:9000000};
const uncertain=evidence(feelingOld,feelingNew);
assert(!safe(uncertain),'Title/name-only same-name recording must never auto-match');
assert(uncertain.reliable,'Title/name-only same-name recording may be shown for manual review');

const dupA={logicalSongId:'meta:the beatles|all together now'};
const dupB={logicalSongId:'meta:the beatles|all together now'};
assert.strictEqual(dupA.logicalSongId,dupB.logicalSongId,'Duplicate copies must share one logical identity');
console.log('Relink dry-run regression tests passed');
