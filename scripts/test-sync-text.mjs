// Run against a local server: GLOSS_TEST_URL=http://localhost:3100 node scripts/test-sync-text.mjs
// A short text syncs with its shelf entry and opens on another device; a long book does not.
import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {readFile,mkdtemp} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
const SHORT={id:'short-text',title:'Short text',author:'A',origin:'paste',source:'test',blocks:[{id:'b1',type:'p',runs:[{text:'SHORT BODY TEXT'}]},{id:'b2',type:'p',runs:[{text:'Second paragraph.'}]}]};
const LIB={glosses:{},highlights:{},briefs:{},progress:{},library:[{id:'short-text',title:'Short text',source:'test',words:4,origin:'paste',addedAt:1,docAt:1000},{id:'long-book',title:'Long book',source:'test',words:900000,origin:'file',addedAt:2,docAt:2000}]};
const profile=await mkdtemp(join(tmpdir(),'gst-'));const chrome=spawn(process.env.CHROMIUM_PATH||'/usr/bin/chromium',['--headless','--no-sandbox','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile],{stdio:'ignore'});const sleep=ms=>new Promise(r=>setTimeout(r,ms));let ws;
try{let port;for(let i=0;i<50;i++){try{port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break}catch{await sleep(100)}}const tab=await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));let id=0;const w=new Map();ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(w.has(m.id)){w.get(m.id)(m);w.delete(m.id)}if(m.method==='Runtime.exceptionThrown')console.log('EX',m.params.exceptionDetails.exception?.description?.slice(0,500))});const send=(method,params={})=>new Promise((res,rej)=>{const n=++id;const t=setTimeout(()=>rej(Error('timeout')),60000);w.set(n,m=>{clearTimeout(t);m.error?rej(m.error):res(m.result)});ws.send(JSON.stringify({id:n,method,params}))});const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
await send('Runtime.enable');await send('Page.enable');
await send('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{const real=window.fetch;window.__pushes=[];window.__articleFetches=[];window.fetch=async(u,i)=>{const s=String(u);if(s.includes('/api/sync')){if(!i||!i.method||i.method==='GET')return new Response(JSON.stringify({now:new Date().toISOString(),changes:{articles:[],highlights:[],glosses:[],briefs:[],progress:[],vocabulary:[],learning:[],settings:[]}}),{headers:{'content-type':'application/json'}});window.__pushes.push(JSON.parse(i.body));return new Response(JSON.stringify({ok:true,count:0}),{headers:{'content-type':'application/json'}})}if(s.includes('/api/articles/')){const id=decodeURIComponent(s.split('/api/articles/')[1].split('?')[0]);window.__articleFetches.push(id);if(id==='short-text')return new Response(JSON.stringify({doc:${JSON.stringify(SHORT)}}),{headers:{'content-type':'application/json'}});return new Response(JSON.stringify({error:'Not found.'}),{status:404,headers:{'content-type':'application/json'}})}return real(u,i)}})()`});
const base=process.env.GLOSS_TEST_URL||'http://localhost:3100';
const until=async(e,ms=15000)=>{for(let i=0;i<ms/200;i++){if(await ev(e))return;await sleep(200)}throw Error('Timed out: '+e+' page: '+await ev('(document.body?document.body.innerText:\'\').slice(0,600)'))};
const docs=async(fn)=>ev(`new Promise((resolve,reject)=>{const req=indexedDB.open('gloss',2);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('docs'))db.createObjectStore('docs')};req.onsuccess=()=>{const db=req.result;const tx=db.transaction('docs','readwrite');const s=tx.objectStore('docs');(${fn})(s);tx.oncomplete=()=>{db.close();resolve(true)};tx.onerror=()=>reject(String(tx.error))};req.onerror=()=>reject(String(req.error))})`);
await send('Page.navigate',{url:base+'/robots.txt'});await sleep(700);
await ev(`(()=>{const p={sub:'synctext',email:'s@example.com',name:'S',exp:Math.floor(Date.now()/1000)+3600};const b=s=>btoa(JSON.stringify(s)).replace(/=/g,'').replace(/\\+/g,'-').replace(/\\//g,'_');localStorage.clear();localStorage.setItem('gloss:google-token','e30.'+b(p)+'.sig');localStorage.setItem('gloss:google-seen','1');localStorage.setItem('gloss:v1',${JSON.stringify(JSON.stringify(LIB))});return true})()`);
// A short text and a much too long one, both stored on this device.
await docs(`s=>{s.put(${JSON.stringify(SHORT)},'short-text');s.put({id:'long-book',title:'Long book',blocks:[{id:'b1',type:'p',runs:[{text:'x'.repeat(4200000)}]}]},'long-book')}`);
await send('Page.navigate',{url:base+'/library'});
await until(`window.__pushes.length>0`,20000);
await sleep(1500);
const pushes=await ev(`JSON.stringify(window.__pushes)`);
const rows=JSON.parse(pushes).flatMap(p=>p.changes.articles||[]);
const short=rows.find(r=>r.id==='short-text');const long=rows.find(r=>r.id==='long-book');
assert.ok(short,'the short shelf entry is pushed');
assert.ok(short.doc,'the short text travels with it');
assert.equal(short.data.docAt,1000,'the shelf entry carries the text timestamp');
assert.ok(!long||long.doc===undefined,'the long book leaves its text at home');
const before=JSON.parse(pushes).length;
await ev(`window.dispatchEvent(new Event('gloss:sync-now'))`);await sleep(2500);
assert.equal(await ev(`window.__pushes.length`),before,'an unchanged text is not sent twice');
console.log('PASS: short texts sync, long books stay local, and texts are not re-sent');
// Another device: no local text. The short text is fetched and read; the long book offers an upload.
await docs(`s=>{s.delete('short-text');s.delete('long-book')}`);
await send('Page.navigate',{url:base+'/read/short-text'});
await until(`document.body.innerText.includes('SHORT BODY TEXT')`,20000);
assert.ok((await ev(`JSON.stringify(window.__articleFetches)`)).includes('short-text'),'the short text is fetched from the account');
await send('Page.navigate',{url:base+'/read/long-book'});
await until(`!!document.querySelector('input[type=file][accept*=".epub"]')`,20000);
assert.ok((await ev(`JSON.stringify(window.__articleFetches)`)).includes('long-book'),'the long book asks the account first');
console.log('PASS: a synced text opens elsewhere; a long book shows the upload prompt');
}finally{ws?.close();chrome.kill()}
