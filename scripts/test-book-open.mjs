// Run against a production server: GLOSS_TEST_URL=http://127.0.0.1:3115 npm run test:book-open
// Uses isolated browser storage; never submits a question or calls an AI provider.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const profile = await mkdtemp(join(tmpdir(), 'gloss-book-open-'));
const baseUrl = process.env.GLOSS_TEST_URL || 'http://127.0.0.1:3115';
const chrome=spawn(process.env.CHROMIUM_PATH || '/usr/bin/chromium',['--headless','--no-sandbox','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws;
try{
let port;for(let i=0;i<50;i++){try{port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break}catch{await sleep(100)}}
if (!port) throw Error('Chromium did not start or expose its debugging port');
const tab=await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));let id=0;const waiting=new Map();ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(waiting.has(m.id)){waiting.get(m.id)(m);waiting.delete(m.id)}});
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{waiting.delete(n);reject(Error('CDP timed out: '+method))},60000);waiting.set(n,m=>{clearTimeout(timer);m.error?reject(m.error):resolve(m.result)});ws.send(JSON.stringify({id:n,method,params}))});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};

const until=async expression=>{console.log('Waiting:',expression);for(let i=0;i<150;i++){if(await evaluate(expression))return;await sleep(200)}throw Error('Timed out: '+expression+'; page: '+await evaluate('document.body.innerText.slice(0,2000)'))};
await send('Emulation.setDeviceMetricsOverride',{width:744,height:1133,deviceScaleFactor:2,mobile:true});
await send('Emulation.setFocusEmulationEnabled',{enabled:true});
await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
await send('Page.navigate',{url:baseUrl+'/library'});
await until('!!document.querySelector(".library")');
const title='完整书名与长标题 '.repeat(12)+'UnbrokenTitle'.repeat(8);
const dek='这是完整的书籍介绍，不应在五行后截断，也不能被下面的按钮遮住。'.repeat(30);
await evaluate(`localStorage.setItem('gloss:v1',JSON.stringify({glosses:{},highlights:{},briefs:{},progress:{},library:[{id:'layout-test',title:${JSON.stringify(title)},author:'Long Author Name',dek:${JSON.stringify(dek)},origin:'file',topic:'science',words:50000,addedAt:1,cover:'/og.png'}]}))`);
await send('Page.navigate',{url:baseUrl+'/library'});
await until('!!document.querySelector("[data-book=layout-test]")');
const open=async()=>{await evaluate(`document.querySelector('[data-book="layout-test"]').click()`);await until(`!!document.querySelector('.ob-cover-front img')`);
const clipped = await evaluate(`new Promise(resolve=>{let bad=false;const start=performance.now();function frame(){const stage=document.querySelector('.ob-stage');if(stage?.dataset.layout==='single'){for(const selector of ['.ob-page','.ob-cover-front']){const el=document.querySelector(selector),r=el.getBoundingClientRect();if(r.left<0||r.right>innerWidth+1||r.top<0||r.bottom>innerHeight+1)bad=true;}}if(performance.now()-start<500)requestAnimationFrame(frame);else resolve(bad);}frame();})`);
assert.equal(clipped,false,'Portrait opening stays within the viewport throughout the animation');
assert.equal(await evaluate(`getComputedStyle(document.querySelector('.ob-cover-front img')).animationName`),'none');
await until(`document.querySelector('.ob-stage')?.dataset.phase==='open'`);await sleep(650)};
for(const [width,height] of [[744,1133],[820,1180],[1024,1366],[1133,744],[375,667],[390,844],[430,932],[1024,768]]) {
 await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
 await open();
 const state=await evaluate(`(()=>{const p=document.querySelector('.ob-page-in'),d=document.querySelector('.ob-dek'),t=document.querySelector('.ob-title');return {text:d.textContent,clamp:getComputedStyle(d).webkitLineClamp,dekHeight:d.clientHeight,dekScroll:d.scrollHeight,titleHeight:t.clientHeight,titleScroll:t.scrollHeight,width:p.clientWidth,scrollWidth:p.scrollWidth,animations:[...document.querySelectorAll('.ob-book,.ob-cover,.ob-shift')].flatMap(e=>e.getAnimations()).length,front:getComputedStyle(document.querySelector('.ob-cover-front')).visibility}})()`);
 assert.equal(state.text,dek);assert.equal(state.clamp,'none');assert.ok(state.dekScroll<=state.dekHeight+1);assert.ok(state.titleScroll<=state.titleHeight+1);assert.ok(state.scrollWidth<=state.width+1);assert.equal(state.animations,0);assert.equal(state.front,'hidden');
 await evaluate(`document.querySelector('.ob-page-in').scrollTop=1e6`);
 const reachable=await evaluate(`(()=>{const p=document.querySelector('.ob-page-in').getBoundingClientRect(),r=document.querySelector('.ob-read').getBoundingClientRect();return r.top>=p.top&&r.bottom<=p.bottom})()`);assert.ok(reachable,'Read action stays reachable');
 assert.ok(await evaluate(`(()=>{const stage=document.querySelector('.ob-stage'),cover=document.querySelector('.ob-cover');if(stage.dataset.layout==='single')return getComputedStyle(cover).visibility==='hidden';const r=cover.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()`),'Bookplate is either fully visible or intentionally hidden');
 const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(profile,`open-${width}.png`),Buffer.from(shot.data,'base64'));
 await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);await until('!document.querySelector(".ob-stage")');
 assert.equal(await evaluate(`document.querySelector('[data-book="layout-test"] .spine').style.visibility`),'');
 console.log('Full text and animation cleanup passed',width,height);
}
// Interrupt the entrance and reopen: no delayed phase callback or orphaned animation.
await evaluate(`document.querySelector('[data-book="layout-test"]').click()`);await sleep(120);
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);await until('!document.querySelector(".ob-stage")');await open();
await send('Emulation.setDeviceMetricsOverride',{width:744,height:1133,deviceScaleFactor:1,mobile:true});await sleep(200);
assert.ok(await evaluate(`(()=>{const r=document.querySelector('.ob-page').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()`));
console.log('PASS: interrupted opening, reopen and orientation resize. Screenshots:',profile);
}finally{ws?.close();chrome.kill();}
