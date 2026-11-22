// Run against a local production server: GLOSS_TEST_URL=http://127.0.0.1:3115 node scripts/test-word-wise-reader.mjs
// Uses isolated browser storage and mocked definitions; never calls an AI provider.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const profile = await mkdtemp(join(tmpdir(), 'gloss-wise-reader-'));
const baseUrl = process.env.GLOSS_TEST_URL || 'http://127.0.0.1:3115';
const chrome=spawn(process.env.CHROMIUM_PATH || '/usr/bin/chromium',['--headless','--no-sandbox','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws;
try{
let port;for(let i=0;i<50;i++){try{port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break}catch{await sleep(100)}}
const tab=await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));let id=0;const waiting=new Map();ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(waiting.has(m.id)){waiting.get(m.id)(m);waiting.delete(m.id)}});
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;waiting.set(n,m=>m.error?reject(m.error):resolve(m.result));ws.send(JSON.stringify({id:n,method,params}))});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
await send('Emulation.setDeviceMetricsOverride',{width:820,height:1180,deviceScaleFactor:1,mobile:true});await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});await send('Page.enable');
await send('Page.addScriptToEvaluateOnNewDocument',{source:`
window.releaseWise=false;window.wiseWaiters=[];window.learnCalls=[];window.workerCount=0;
const NativeWorker=window.Worker;window.Worker=class extends NativeWorker {constructor(...args){super(...args);window.workerCount++}};
const originalFetch=window.fetch;
window.fetch=(url,opts)=>{
 if(String(url).includes('/api/word-wise'))return new Promise(resolve=>{const words=[{word:'intricate',meaning:'complex'},{word:'obscure',meaning:'unclear'}];const answer=()=>{const body=JSON.parse(opts.body);resolve(Response.json(Array.isArray(body.texts)?{passages:body.texts.map(()=>words)}:{words}))};if(window.releaseWise)answer();else window.wiseWaiters.push(answer)});
 if(String(url).includes('/api/learn')){const body=JSON.parse(opts.body);learnCalls.push(body);return Promise.resolve(Response.json({data:{word:body.text,partOfSpeech:'adjective',pronunciation:'/test/',english:'made of many connected details',native:'复杂的；由许多细节构成的'}}))}
 return originalFetch(url,opts);
};`});
const until=async expression=>{for(let i=0;i<150;i++){if(await evaluate(expression))return;await sleep(200)}throw Error('Timed out: '+expression)};
await send('Page.navigate',{url:baseUrl+'/robots.txt'});await until('document.readyState==="complete"');
await evaluate(`localStorage.setItem('gloss:doc:wise-test',JSON.stringify({id:'wise-test',title:'Stable Word Wise',origin:'file',blocks:Array.from({length:4000},(_,i)=>({id:'p'+i,type:i%40===0?'h2':'p',runs:[{text:i%40===0?'Chapter '+(i/40+1):'An intricate and obscure passage. '+ 'The reader follows the story without losing their place. '.repeat(4)}]}))}));localStorage.setItem('gloss:learning-settings',JSON.stringify({wordWise:true,level:'B1',highlight:true}));localStorage.setItem('gloss:word-wise:wise-test','1');localStorage.setItem('gloss:hinted','1');
new Promise((resolve,reject)=>{const r=indexedDB.open('gloss-learning',1);r.onupgradeneeded=()=>r.result.createObjectStore('vocabulary',{keyPath:'id'});r.onsuccess=()=>{const tx=r.result.transaction('vocabulary','readwrite');for(let i=0;i<10000;i++)tx.objectStore('vocabulary').put({id:'v'+i,word:i===0?'intricate':'vocabulary'+i,surface:i===0?'intricate':'vocabulary'+i,status:'new',english:'made of many connected details',native:'含义',sources:[],createdAt:1,updatedAt:1});tx.oncomplete=()=>{r.result.close();resolve()};tx.onerror=()=>reject(tx.error)}})`);
await evaluate(`localStorage.setItem('gloss:v1',JSON.stringify({glosses:{'wise-test':[
{id:'summary-explain',articleId:'wise-test',at:'p1',action:'explain',createdAt:1,turns:[{role:'assistant',content:'Background. ==The key explanation stays visible.== More details.',model:'test'}]},
{id:'summary-analyze',articleId:'wise-test',at:'p2',action:'simplify',createdAt:2,turns:[{role:'assistant',content:'',model:'test',analysis:{simplified:'The simplified meaning stays visible.',translation:'简化含义',backbone:'Subject and verb',chunks:[],grammar:[],vocabulary:[]}}]}
]},highlights:{},briefs:{},progress:{},library:[]}));`);
await send('Page.navigate',{url:baseUrl+'/read/wise-test'});await until('document.querySelectorAll("[data-block]").length===4000');
await evaluate('document.fonts.ready');await until('!!document.querySelector(".prose-read[data-wise-inline=true]")');await sleep(500);
const positions=`[...document.querySelectorAll('[data-block]')].slice(0,30).map(e=>{const r=e.getBoundingClientRect();return [r.top+scrollY,r.height]})`;
const before=await evaluate(positions);
await evaluate('releaseWise=true;wiseWaiters.splice(0).forEach(f=>f())');await until('!!document.querySelector(".word-wise-short[data-fit=true]")');await sleep(300);
assert.deepEqual(await evaluate(positions),before,'Async short hints must not move paragraphs or change line heights');
assert.equal(await evaluate('workerCount'),1,'Word Wise and vocabulary highlighting must share one worker');
assert.equal(await evaluate('!!document.querySelector(".word-wise-dock")'),false);
const geometry=await evaluate(`(()=>{const labels=[...document.querySelectorAll('.word-wise-short[data-fit=true]')];let overlaps=0;for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){const a=labels[i].getBoundingClientRect(),b=labels[j].getBoundingClientRect();if(a.left<b.right-.5&&a.right>b.left+.5&&a.top<b.bottom-.5&&a.bottom>b.top+.5)overlaps++}return {overlaps,clipped:labels.filter(e=>e.scrollWidth>e.clientWidth).length,labels:labels.length}})()`);
assert.equal(geometry.overlaps,0);assert.equal(geometry.clipped,0);assert.ok(geometry.labels>0);
await evaluate('scrollTo(0,250)');await sleep(200);
const tap=async selector=>{const point=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(200)};
const startY=await evaluate('scrollY');
await tap('[data-block="p1"] .word-wise');await until('!!document.querySelector(".dictionary-content")');
assert.equal(await evaluate('learnCalls[0].mode'),'dictionary');assert.equal(await evaluate('learnCalls[0].text'),'intricate');
assert.equal(await evaluate('scrollY'),startY);assert.deepEqual(await evaluate(positions),before);
await evaluate('document.querySelector(".sheet button[aria-label=Close]").click()');await sleep(100);
await tap('[data-block="p1"] .word-wise');await until('!!document.querySelector(".dictionary-content")');assert.equal(await evaluate('learnCalls.length'),1,'A repeated tap must reuse the dictionary');
await evaluate('document.querySelector(".sheet button[aria-label=Close]").click()');await sleep(100);
await tap('[data-block="p1"] .word-wise[data-wise-from="17"]');await until('learnCalls.length===2');await until('!!document.querySelector(".dictionary-content")');
await evaluate('document.querySelector(".sheet button[aria-label=Close]").click()');await sleep(100);
await send('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:true});
await until('document.querySelectorAll(".is-collapsed[data-action=define] .dictionary-preview").length===2');
assert.ok(await evaluate(`Array.from(document.querySelectorAll('.dictionary-preview')).every(e=>e.textContent.includes('复杂的')&&e.textContent.includes('made of many connected details'))`));
assert.equal(await evaluate(`document.querySelector('[data-gloss="summary-explain"] .note-summary')?.textContent`),'The key explanation stays visible.');
assert.equal(await evaluate(`document.querySelector('[data-gloss="summary-analyze"] .note-summary')?.textContent`),'The simplified meaning stays visible.');
const shot=await send('Page.captureScreenshot' ,{format:'png'});await writeFile(join(profile,'screenshot.png'),Buffer.from(shot.data,'base64'));console.log('Screenshot:',join(profile,'screenshot.png'));
await evaluate(`document.querySelector('[aria-label="Contents"]').click()`);await until(`!!document.querySelector('[aria-label="Search sections"]')`);
assert.ok(await evaluate(`document.querySelector('[aria-label="Book contents"]').textContent.includes('Show more')`));
await evaluate(`document.querySelector('[aria-label="Search sections"]').focus();window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));`);
await until(`!document.querySelector('[aria-label="Search sections"]')`);
assert.equal(await evaluate(`document.activeElement?.getAttribute('aria-label')`),'Contents');
await evaluate(`document.querySelector('[aria-label="Contents"]').click()`);await until(`!!document.querySelector('[aria-label="Search sections"]')`);

await evaluate(`const input=document.querySelector('[aria-label="Search sections"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Chapter 99');input.dispatchEvent(new Event('input',{bubbles:true}));`);
await until(`document.querySelector('[aria-label="Book contents"]').textContent.includes('Chapter 99') && !document.querySelector('[aria-label="Book contents"]').textContent.includes('Chapter 98')`);
await evaluate(`document.querySelector('[aria-label="Book contents"] button').click()`);await sleep(200);
assert.ok(await evaluate(`Math.abs(document.querySelector('[data-block="p3920"]').getBoundingClientRect().top-innerHeight*.28)<4`),'Far chapter jumps should settle immediately');
await evaluate(`window.dispatchEvent(new PageTransitionEvent('pagehide'));`);
assert.equal(await evaluate(`JSON.parse(localStorage.getItem('gloss:v2:progress:wise-test')).block`),'p3920','Exit must flush progress before debounce');
await evaluate('document.querySelector(".word-wise-toggle").click()');await until('!document.querySelector(".word-wise")');assert.equal(await evaluate('document.querySelector(".prose-read").hasAttribute("data-wise-inline")'),false);
console.log('PASS: 4,000 paragraphs and 10,000 vocabulary entries; shared Worker; zero async displacement; short labels fit without overlap; direct Dictionary and reuse; collapsed Dictionary/Explain/Analyze summaries remain visible; Escape focus restoration; chapter search and long-distance jump; immediate exit persistence; mode cleanup.');
}finally{ws?.close();chrome.kill()}
