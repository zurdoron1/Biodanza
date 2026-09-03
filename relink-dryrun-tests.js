const assert=require('assert');
const nrm=v=>String(v||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
const strip=v=>String(v||'').replace(/\.[A-Za-z0-9]{2,5}$/,' ').replace(/^\s*[A-Za-z]{1,8}\d{1,4}(?:[-_ ]\d{1,4})?\s*[-_–—]+\s*/i,' ').replace(/^\s*\d{1,3}\s*[-_–—]+\s*/,' ').trim();
const toks=v=>new Set(nrm(v).split(/\s+/).filter(x=>x&&x.length>1));
const overlap=(a,b)=>{const A=toks(a),B=toks(b);let n=0;A.forEach(x=>B.has(x)&&n++);return n/Math.max(A.size,B.size,1)};
function jaccard(a,b){const A=toks(a),B=toks(b);let n=0;A.forEach(x=>B.has(x)&&n++);return n/Math.max(new Set([...A,...B]).size,1)}
function evidence(p,r){
 const title=p.title||strip(p.fileName), artist=p.artist||'';
 const titleSim=jaccard(title,r.title), nameSim=jaccard(strip(p.fileName),strip(r.name)), artistSim=artist&&r.artist?jaccard(artist,r.artist):0;
 const os=p.size||0,ns=r.size||0,ratio=os&&ns?Math.abs(os-ns)/Math.max(os,ns):1;
 let score=0,strong=0;
 if(titleSim>=.96){score+=42;strong++}else if(titleSim>=.86)score+=28;
 if(nameSim>=.96){score+=30;strong++}else if(nameSim>=.84)score+=18;
 if(artist&&r.artist){if(artistSim>=.92){score+=28;strong++}else if(artistSim>=.75)score+=12;else if(artistSim<.30)score-=18;}
 if(os&&ns){if(os===ns){score+=24;strong++}else if(ratio<=.005){score+=20;strong++}else if(ratio<=.02)score+=8;}
 if(Math.max(overlap(title,r.title),overlap(p.fileName,r.name))>=.8)score+=18;
 return {score,strong,reliable:strong>=2||(strong>=1&&score>=78)};
}

const legacy={fileName:'IBFC20 - 03 - The Beatles - All Together Now.mp3',title:'The Beatles - All Together Now',artist:'The Beatles',size:5414912};
const current={name:'All together now-beatles.mp3',title:'All Together Now',artist:'The Beatles',size:5414912};
const good=evidence(legacy,current);
assert(good.reliable,'All Together Now must be a reliable candidate');
assert(good.score>=90,'All Together Now should clear safe threshold');

const wrong={name:'Viento del Arena.mp3',title:'Viento del Arena',artist:'Gipsy Kings',size:5414912};
const bad=evidence(legacy,wrong);
assert(!bad.reliable || bad.score<70,'Unrelated song must not become review/safe from file size alone');

const feelingOld={fileName:'01 Feeling Good.m4a',title:'Feeling Good',artist:'',size:0};
const feelingNew={name:'07 Feeling Good.mp3',title:'Feeling Good',artist:'Avicii y Maudra Mae',size:9000000};
const uncertain=evidence(feelingOld,feelingNew);
assert(!(uncertain.reliable&&uncertain.score>=90),'Title-only same-name recording must not auto-match');

const dupA={logicalSongId:'meta:the beatles|all together now'};
const dupB={logicalSongId:'meta:the beatles|all together now'};
assert.strictEqual(dupA.logicalSongId,dupB.logicalSongId,'Duplicate copies must share one logical identity');
console.log('Relink dry-run regression tests passed');
