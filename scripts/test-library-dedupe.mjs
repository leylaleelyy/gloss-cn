// Run against a local server: GLOSS_TEST_URL=http://localhost:3100 node scripts/test-library-dedupe.mjs
// Two shelf entries for one URL merge their tags, marks and furthest reading position.
import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {readFile,mkdtemp} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
const profile=await mkdtemp(join(tmpdir(),'gdd-'));const chrome=spawn('/usr/bin/chromium',['--no-sandbox','--headless','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile],{stdio:'ignore'});const sleep=ms=>new Promise(r=>setTimeout(r,ms));let ws;
try{let port;for(let i=0;i<50;i++){try{port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break}catch{await sleep(100)}}const tab=await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));let id=0;const w=new Map();ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(w.has(m.id)){w.get(m.id)(m);w.delete(m.id)}});const send=(method,params={})=>new Promise((res,rej)=>{const n=++id;const t=setTimeout(()=>rej(Error('timeout')),60000);w.set(n,m=>{clearTimeout(t);m.error?rej(m.error):res(m.result)});ws.send(JSON.stringify({id:n,method,params}))});const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
await send('Runtime.enable');await send('Page.enable');await send('Page.navigate',{url:(process.env.GLOSS_TEST_URL || 'http://localhost:3100')+'/robots.txt'});await sleep(800);
const item=(id,words)=>({id,title:'The Tail End',author:'Tim Urban',source:'Wait But Why',words,origin:'url',addedAt:id==='a'?1:2,sourceUrl:'https://waitbutwhy.com/2015/12/the-tail-end.html',topic:'living',tags:id==='a'?['time']:['life']});
const h=(id,articleId,o)=>({id,articleId,anchor:{start:{b:'b1',o},end:{b:'b1',o:o+5},quote:'quote'},createdAt:1,color:'yellow',note:'note '+id});
await ev(`localStorage.clear();localStorage.setItem('gloss:v1',JSON.stringify({glosses:{},briefs:{},progress:{a:{block:'b1',pct:.2,at:1},b:{block:'b2',pct:.8,at:2}},highlights:{a:[${JSON.stringify(h('h1','a',0))}],b:[${JSON.stringify(h('h2','b',5))}]},library:[${JSON.stringify(item('a',100))},${JSON.stringify(item('b',100))}]}))`);
await send('Page.navigate',{url:(process.env.GLOSS_TEST_URL || 'http://localhost:3100')+'/library'});for(let i=0;i<60&&!await ev(`!!localStorage.getItem('gloss:v2:library')`);i++)await sleep(250);await sleep(300);
const lib=await ev(`JSON.parse(localStorage.getItem('gloss:v2:library')||'[]')`);
assert.equal(lib.length,1,'one library entry remains');
assert.deepEqual(lib[0].tags.sort(),['life','time']);
assert.equal(lib[0].id,'a','oldest entry is canonical on a tie');
const hs=await ev(`JSON.parse(localStorage.getItem('gloss:v2:highlights:a')||'[]').map(h=>h.id).sort()`);
assert.deepEqual(hs,['h1','h2']);
assert.equal(await ev(`localStorage.getItem('gloss:v2:highlights:b')`),null);
assert.equal(await ev(`JSON.parse(localStorage.getItem('gloss:v2:progress:a')).pct`),0.8);
console.log('PASS: duplicate shelf entries merge, annotations move and progress keeps the furthest read');
}finally{ws?.close();chrome.kill()}
