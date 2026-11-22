import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
// Run against a local server: GLOSS_TEST_URL=http://localhost:3100 node scripts/test-ui-language.mjs
// Uses isolated browser storage; never submits a question or calls an AI provider.
const profile = await mkdtemp(join(tmpdir(), 'gloss-i18n-'));
const baseUrl = process.env.GLOSS_TEST_URL || 'http://localhost:3100';
const chrome=spawn('/usr/bin/chromium',['--headless','--no-sandbox','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws;
try{
let port;for(let i=0;i<50;i++){try{port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break}catch{await sleep(100)}}
const tab=await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));let id=0;const waiting=new Map();ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(waiting.has(m.id)){waiting.get(m.id)(m);waiting.delete(m.id)}});
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{waiting.delete(n);reject(Error('CDP timed out: '+method))},60000);waiting.set(n,m=>{clearTimeout(timer);m.error?reject(m.error):resolve(m.result)});ws.send(JSON.stringify({id:n,method,params}))});
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')console.log('PAGE EXCEPTION:',m.params.exceptionDetails.exception?.description?.slice(0,800)||m.params.exceptionDetails.text);});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
const until=async expression=>{for(let i=0;i<150;i++){if(await evaluate(expression))return;await sleep(200)}throw Error('Timed out: '+expression+'; page: '+await evaluate('document.body.innerText.slice(0,900)'))};
await send('Runtime.enable');await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});

// Same-origin fetch with no app JS, so storage writes are not overwritten by a flush.
await send('Page.navigate',{url:baseUrl+'/robots.txt'});
await until(`document.readyState==='complete'`);
await evaluate(`localStorage.clear();localStorage.setItem('gloss:v1',JSON.stringify({glosses:{},highlights:{'on-a-piece-of-chalk':[{id:'note-1',articleId:'on-a-piece-of-chalk',anchor:{start:{b:'b1',o:0},end:{b:'b1',o:20},quote:'If a well were sunk'},createdAt:1,color:'green',note:'第一行笔记\\n第二行'}]},briefs:{},progress:{},library:[]}))`);
await send('Page.navigate',{url:baseUrl+'/read/on-a-piece-of-chalk'});
await until(`!!document.querySelector('[data-note="note-1"]')`);
assert.ok(await evaluate(`document.querySelector('[data-note="note-1"]').textContent.includes('Note')`),'English default shows Note');
assert.equal(await evaluate(`localStorage.getItem('gloss:v1')`),null,'legacy key migrated');
assert.ok(await evaluate(`!!localStorage.getItem('gloss:v2:highlights:on-a-piece-of-chalk')`),'highlight shard written');

// Switch to Chinese from the language menu.
await evaluate(`document.querySelector('button[aria-label="Interface language"]').click()`);
await until(`!!document.querySelector('[role="dialog"][aria-label="Interface language"]')`);
await evaluate(`Array.from(document.querySelectorAll('[role="dialog"][aria-label="Interface language"] button')).find(b=>b.textContent.includes('简体中文')).click()`);
await until(`document.documentElement.lang==='zh'`);
await sleep(300);
assert.ok(await evaluate(`!!document.querySelector('[aria-label="返回书库"]')`),'topbar switches to Chinese');
assert.equal(await evaluate(`document.querySelector('input[aria-label="就全文提出任何问题"]')?.placeholder`),'就全文提问','composer placeholder switches to Chinese');
assert.ok(await evaluate(`document.body.innerText.includes('笔记')`),'note card label switches to Chinese');
assert.ok(await evaluate(`document.documentElement.dataset.lang==='zh'`),'html lang set');

// Persists across a reload.
await evaluate(`location.reload()`);
await until(`!!document.querySelector('[aria-label="返回书库"]')`);
assert.equal(await evaluate(`document.querySelector('input[aria-label="就全文提出任何问题"]')?.placeholder`),'就全文提问','Chinese persists after reload');
// Switch back to English.
await evaluate(`document.querySelector('button[aria-label="界面语言"]').click()`);
await until(`!!document.querySelector('[role="dialog"][aria-label="界面语言"]')`);
await evaluate(`Array.from(document.querySelectorAll('[role="dialog"][aria-label="界面语言"] button')).find(b=>b.textContent.trim()==='English').click()`);
await until(`document.documentElement.lang==='en'`);
assert.ok(await evaluate(`!!document.querySelector('[aria-label="Back to library"]')`),'switches back to English');
console.log('PASS: language menu, Chinese strings, persistence, legacy storage migration');
}finally{ws?.close();chrome.kill();}
