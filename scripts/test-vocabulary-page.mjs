// Run against a local server: GLOSS_TEST_URL=http://localhost:3117 node scripts/test-vocabulary-page.mjs
// Uses isolated browser storage; never submits a question or calls an AI provider.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const baseUrl = process.env.GLOSS_TEST_URL || 'http://localhost:3117';
const profile=await mkdtemp(join(tmpdir(),'gvui-'));
const chrome=spawn('/usr/bin/chromium',['--headless','--no-sandbox','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let ws;
try{let port;for(let i=0;i<50;i++){try{port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break}catch{await sleep(100)}}
const tab=await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));let id=0;const waiting=new Map();ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(waiting.has(m.id)){waiting.get(m.id)(m);waiting.delete(m.id)}});
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{waiting.delete(n);reject(Error('timeout '+method))},60000);waiting.set(n,m=>{clearTimeout(timer);m.error?reject(m.error):resolve(m.result)});ws.send(JSON.stringify({id:n,method,params}))});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
const until=async expression=>{for(let i=0;i<200;i++){if(await evaluate(expression))return;await sleep(200)}throw Error('timeout '+expression)};
await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
await send('Page.navigate',{url:baseUrl+'/robots.txt'});await sleep(600);
await evaluate(`(async()=>{await new Promise(r=>{const d=indexedDB.deleteDatabase('gloss-learning');d.onsuccess=r;d.onerror=r;d.onblocked=r});const db=await new Promise((res,rej)=>{const r=indexedDB.open('gloss-learning',1);r.onupgradeneeded=()=>r.result.createObjectStore('vocabulary',{keyPath:'id'});r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});const tx=db.transaction('vocabulary','readwrite'),s=tx.objectStore('vocabulary');for(const e of [{id:'a',word:'sunk',surface:'sunk',partOfSpeech:'verb',pronunciation:'/sʌŋk/',english:'below the surface',native:'下沉的',status:'new',sources:[],createdAt:1,updatedAt:1},{id:'b',word:'chalk',surface:'chalk',partOfSpeech:'noun',pronunciation:'/tʃɔːk/',english:'soft white rock',native:'白垩',status:'familiar',sources:[],createdAt:2,updatedAt:2}])s.put(e);await new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});db.close()})()`);
await send('Page.navigate',{url:baseUrl+'/vocabulary'});await until(`document.querySelectorAll('article').length===2`);
assert.equal(await evaluate(`document.querySelectorAll('article').length`),2);
assert.ok(await evaluate(`document.body.innerText.includes('2 words')`));
// Filter to Familiar
await evaluate(`Array.from(document.querySelectorAll('[role=tab]')).find(b=>b.textContent.includes('Familiar')).click()`);await sleep(300);
assert.equal(await evaluate(`document.querySelectorAll('article').length`),1);
assert.ok(await evaluate(`document.querySelector('article').textContent.includes('chalk')`));
// Switch status to Mastered
await evaluate(`Array.from(document.querySelector('article').querySelectorAll('button')).find(b=>b.textContent.trim()==='Mastered').click()`);await sleep(400);
assert.equal(await evaluate(`document.querySelectorAll('article').length`),0,'filtered list empties after leaving Familiar');
// All + remove
await evaluate(`Array.from(document.querySelectorAll('[role=tab]')).find(b=>b.textContent.includes('All')).click()`);await sleep(200);
assert.equal(await evaluate(`document.querySelectorAll('article').length`),2);
await evaluate(`document.querySelector('article button[aria-label^="Remove"]').click()`);await sleep(400);
assert.equal(await evaluate(`document.querySelectorAll('article').length`),1);
// Mobile layout: no horizontal overflow
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await sleep(400);
assert.ok(await evaluate(`document.documentElement.scrollWidth<=390`),'no horizontal overflow');
console.log('PASS: vocabulary cards, filters, mastery updates, removal and mobile layout');
}finally{ws?.close();chrome.kill();}
