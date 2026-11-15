// Run against a local server: GLOSS_TEST_URL=http://localhost:3117 node scripts/test-reading-cards.mjs
// Uses isolated browser storage; never submits a question or calls an AI provider.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const profile = await mkdtemp(join(tmpdir(), 'gloss-cards-'));
const baseUrl = process.env.GLOSS_TEST_URL || 'http://localhost:3117';
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
await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
await send('Page.navigate',{url:baseUrl+'/read/on-a-piece-of-chalk'});
await until('!!document.querySelector(".prose-read")');
const blocks=await evaluate(`Array.from(document.querySelectorAll('.prose-read [data-block][data-n]')).map(el=>({id:el.dataset.block,n:Number(el.dataset.n),quote:el.querySelector('.blk-text').textContent.slice(0,16)}))`);
const origin=blocks[2],far=blocks.at(-5),middle=blocks[Math.floor(blocks.length/2)];
const note=(id,block,target,follow=false)=>({id,articleId:'on-a-piece-of-chalk',action:'ask',question:'Initial question',anchor:{start:{b:block.id,o:0},end:{b:block.id,o:16},quote:block.quote},createdAt:1,turns:[{role:'assistant',content:`==Initial answer summary.== See [¶${target.n}] and [¶${block.n}].`},...(follow?[{role:'user',content:'Why is this important?'},{role:'assistant',content:'==It explains the evidence.== More detail.'},{role:'user',content:'What is the conclusion?'},{role:'assistant',content:'==The conclusion connects both ideas.== More detail.'}]:[])]});
await evaluate(`localStorage.setItem('gloss:v1',JSON.stringify({glosses:{'on-a-piece-of-chalk':${JSON.stringify([note('return-origin',origin,far,true),note('return-far',far,middle)])}},highlights:{},briefs:{},progress:{},library:[]}))`);
await send('Page.navigate',{url:baseUrl+'/read/on-a-piece-of-chalk'});
await until(`!!document.querySelector('[data-gloss="return-origin"].is-collapsed')`);
assert.equal(await evaluate(`document.querySelectorAll('[data-gloss="return-origin"] .follow-up-summary').length`),2);
for(const phrase of ['Initial answer summary.','Why is this important?','It explains the evidence.','What is the conclusion?','The conclusion connects both ideas.']) assert.ok(await evaluate(`document.querySelector('[data-gloss="return-origin"]').textContent.includes(${JSON.stringify(phrase)})`));
for(const [width,height] of [[1440,900],[744,1133]]) {
 await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<960});await sleep(300);
 await evaluate(`window.scrollTo({top:document.querySelector('[data-block="${origin.id}"]').getBoundingClientRect().top+scrollY-180,behavior:'instant'});document.querySelector('[data-g="return-origin"]').click()`);
 await until(`!!document.querySelector('[data-gloss="return-origin"] [aria-label="Jump to paragraph ${far.n}"]')`);
 await evaluate(`document.querySelector('[data-gloss="return-origin"] [aria-label="Jump to paragraph ${origin.n}"]').click()`);await sleep(600);
 assert.equal(await evaluate(`!!document.querySelector('.reading-return')`),false,'Nearby citation needs no return');
 const before=await evaluate(`document.querySelector('[data-block="${origin.id}"]').getBoundingClientRect().top`);
 await evaluate(`document.querySelector('[data-gloss="return-origin"] [aria-label="Jump to paragraph ${far.n}"]').click()`);
 await until(`!!document.querySelector('.reading-return')`);
 assert.equal(await evaluate(`!!document.querySelector('.sheet')`),false,'Far jump reveals destination on touch screens');
 assert.ok(await evaluate(`Math.abs(document.querySelector('[data-block="${far.id}"]').getBoundingClientRect().top-innerHeight*.28)<5`),'Far destination is visible');
 await evaluate(`document.querySelector('[data-g="return-far"]').click()`);
 await until(`!!document.querySelector('[data-gloss="return-far"] [aria-label="Jump to paragraph ${middle.n}"]')`);
 await evaluate(`document.querySelector('[data-gloss="return-far"] [aria-label="Jump to paragraph ${middle.n}"]').click()`);
 await evaluate(`document.querySelector('.reading-return button').click()`);await sleep(300);
 const after=await evaluate(`document.querySelector('[data-block="${origin.id}"]').getBoundingClientRect().top`);
 assert.ok(Math.abs(after-before)<5,JSON.stringify({width,before,after}));
 assert.equal(await evaluate(`!!document.querySelector('.reading-return')`),false);
 console.log('PASS: near/far citations, chained jumps and exact reading return',width,height);
}
console.log('PASS: collapsed multi-question summaries. No AI calls.');
}finally{ws?.close();chrome.kill();}
