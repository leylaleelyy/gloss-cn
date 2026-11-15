// Run against a local server: GLOSS_TEST_URL=http://localhost:3117 node scripts/test-vocabulary-settings.mjs
// Uses isolated browser storage; never submits a question or calls an AI provider.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const profile = await mkdtemp(join(tmpdir(), 'gloss-ipad-'));
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
await send('Emulation.setDeviceMetricsOverride',{width:744,height:1133,deviceScaleFactor:2,mobile:true});
await send('Page.navigate',{url:baseUrl+'/read/on-a-piece-of-chalk?block=1'});
await until('!!document.querySelector(".prose-read")');
await until(`document.querySelector('a[aria-label="Vocabulary"]')?.href.includes('block%3D1')`);
await evaluate(`document.querySelector('a[aria-label="Vocabulary"]').click()`);
await until(`!!document.querySelector('[aria-label="Back to previous page"]')`);
await until(`document.querySelector('[aria-label="Back to previous page"]')?.getAttribute('href')==='/read/on-a-piece-of-chalk?block=1'`);
assert.equal(await evaluate(`document.querySelector('[aria-label="Back to previous page"]').getAttribute('href')`),'/read/on-a-piece-of-chalk?block=1');
await evaluate(`document.querySelector('[aria-label="Back to previous page"]').click()`);
await until('!!document.querySelector(".prose-read")');
assert.equal(await evaluate('location.pathname+location.search'),'/read/on-a-piece-of-chalk?block=1');
await send('Page.navigate',{url:baseUrl+'/vocabulary'});
await until(`!!document.querySelector('[aria-label="Back to previous page"]')`);
assert.equal(await evaluate(`document.querySelector('[aria-label="Back to previous page"]').getAttribute('href')`),'/library');
await until(`Object.keys(document.querySelector('button[aria-label="AI settings"]')).some(k=>k.startsWith('__reactProps$'))`);
await evaluate(`document.querySelector('button[aria-label="AI settings"]').click()`);
await until(`!!document.querySelector('[role="dialog"][aria-label="AI settings"]')`);
await evaluate(`document.querySelector('[aria-label="AI settings"][role="dialog"] details').open=true`);
const select=async(label,value)=>evaluate(`(()=>{const s=document.querySelector('select[aria-label="${label}"]');s.value=${JSON.stringify(value)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
const input=async(label,value)=>evaluate(`(()=>{const s=document.querySelector('input[aria-label="${label}"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(s,${JSON.stringify(value)});s.dispatchEvent(new Event('input',{bubbles:true}));})()`);
for(const provider of ['openai','qwen','siliconflow']) {
 await select('Vision provider',provider);await sleep(100);
 assert.ok(await evaluate(`document.querySelector('select[aria-label="Vision model"]').options.length>=4`));
 await input('Vision API key','test-image-key');
}
await select('Vision provider','openai');await sleep(100);
assert.equal(await evaluate(`document.querySelector('input[aria-label="Vision API key"]').value`),'');
await input('Vision API key','test-image-key');
await input('API key / 密钥','test-chat-key');
await select('Vision model','gpt-4.1-mini');
await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Save').click()`);
await until(`!document.querySelector('[role="dialog"][aria-label="AI settings"]')`);
const saved=await evaluate(`JSON.parse(localStorage.getItem('gloss:ai-provider'))`);
assert.equal(saved.visionModel,'gpt-4.1-mini');assert.equal(saved.visionApiKey,'test-image-key');assert.equal(saved.apiKey,'test-chat-key');
await evaluate(`document.querySelector('button[aria-label="AI settings"]').click()`);
await until(`!!document.querySelector('select[aria-label="Vision model"]')`);
assert.equal(await evaluate(`document.querySelector('select[aria-label="Vision model"]').value`),'gpt-4.1-mini');
await evaluate(`document.querySelector('[aria-label="AI settings"][role="dialog"] details').open=true`);
for(const width of [744,375]) {
 await send('Emulation.setDeviceMetricsOverride',{width,height:1133,deviceScaleFactor:2,mobile:true});await sleep(100);
 assert.ok(await evaluate(`(()=>{const p=document.querySelector('[role="dialog"][aria-label="AI settings"]');return p.scrollWidth<=p.clientWidth})()`));
}
console.log('PASS: vocabulary return URL and direct-entry fallback, vision presets, key reset, saving/reopening and narrow settings layout.');
}finally{ws?.close();chrome.kill();}
