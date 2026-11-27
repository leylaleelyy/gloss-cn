// Run against a local server: GLOSS_TEST_URL=http://localhost:3117 node scripts/test-ipad-mini.mjs
// Uses isolated browser storage; never submits a question or calls an AI provider.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
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
await send('Emulation.setFocusEmulationEnabled',{enabled:true});
await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
await send('Page.navigate',{url:baseUrl+'/read/on-a-piece-of-chalk'});
await until('!!document.querySelector(".prose-read")');
await until(`Object.keys(document.querySelector('button[aria-label=\"Appearance and answers\"]')).some(k=>k.startsWith('__reactProps$'))`);
console.log('Reader loaded');
for(const [width,height] of (process.argv.includes('--keyboard-only') ? [] : [[744,1133],[820,1180],[1024,1366],[1133,744],[768,1024],[1024,768],[375,667],[390,844],[430,932]])) {
 await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:2,mobile:true});
 await evaluate('window.scrollTo(0,0)');await sleep(200);
 if(height>width) {
  const margins=await evaluate(`(()=>{const r=document.querySelector('.prose-read').getBoundingClientRect();return {left:r.left,right:innerWidth-r.right}})()`);
  assert.ok(Math.abs(margins.left-margins.right)<2,'Portrait reading margins must match: '+JSON.stringify(margins));
  assert.ok(margins.left>=16&&margins.right>=16);
 }
 await evaluate('window.scrollTo(0,900)');await sleep(120);
 const docked=await evaluate(`(()=>{const dock=document.querySelector('.composer'), form=document.querySelector('.composer form'), prose=document.querySelector('.prose-read');const fr=form.getBoundingClientRect(), pr=prose.getBoundingClientRect();return {pos:getComputedStyle(dock).position,bottomGap:innerHeight-fr.bottom,centerDelta:Math.abs((fr.left+fr.right)/2-(pr.left+pr.right)/2),scrollY:window.scrollY}})()`);
 assert.equal(docked.pos,'fixed','Composer must stay fixed at viewport bottom across resizes/rotations: '+JSON.stringify({width,height,docked}));
 assert.ok(docked.bottomGap>=12&&docked.bottomGap<=32,'Composer must stay pinned to bottom while scrolled: '+JSON.stringify({width,height,docked}));
 assert.ok(docked.centerDelta<=2,'Composer must stay centered over the reading column: '+JSON.stringify({width,height,docked}));
 await evaluate('window.scrollTo(0,0)');await sleep(100);
 if(width===1133&&height===744) {
  await evaluate(`document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'f',bubbles:true}))`);await sleep(120);
  const focusedLayout=await evaluate(`(()=>{const m=document.querySelector('.rg-margin'), p=document.querySelector('.prose-read').getBoundingClientRect();return {marginDisplay:getComputedStyle(m).display,left:p.left,right:innerWidth-p.right}})()`);
  assert.equal(focusedLayout.marginDisplay,'none','Focus mode must hide margin on landscape tablet: '+JSON.stringify(focusedLayout));
  assert.ok(Math.abs(focusedLayout.left-focusedLayout.right)<2,'Focus mode must center prose on landscape tablet: '+JSON.stringify(focusedLayout));
  await evaluate(`document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);await sleep(120);
 }
 await evaluate(`document.querySelector('button[aria-label="Appearance and answers"]').click()`);
 await until(`!!document.querySelector('[role="dialog"][aria-label="Appearance and answers"]')`);
 await evaluate(`Array.from(document.querySelectorAll('[role="radio"]')).find(e=>e.textContent==='Look').click()`);await sleep(100);
 const density = await evaluate(`(()=>{const p=document.querySelector('[role="dialog"][aria-label="Appearance and answers"]'), tabs=p.querySelector('[aria-label="Settings section"]'), r=p.getBoundingClientRect(), t=tabs.getBoundingClientRect(), style=getComputedStyle(p);return {inner:p.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),tabs:tabs.offsetWidth,tabHeight:tabs.querySelector('button').offsetHeight,switchHeight:p.querySelector('[role="switch"]').offsetHeight}})()`);
 assert.ok(Math.abs(density.inner-density.tabs)<1,'Tabs must fill the panel: '+JSON.stringify(density));
 assert.ok(density.tabHeight<=26 && density.switchHeight<=28,'Compact control sizes: '+JSON.stringify(density));
 if(width===744) {
  const shot=await send('Page.captureScreenshot',{format:'png'});
  await writeFile(join(profile,'appearance-look.png'),Buffer.from(shot.data,'base64'));
  console.log('Appearance screenshot:',join(profile,'appearance-look.png'));
 }
 for (const pen of ['Vermilion', 'Cobalt', 'Moss', 'Graphite']) {
  await evaluate(`document.querySelector('[aria-label="${pen} pen"]').click()`);
  const look = await evaluate(`(()=>{const p=document.querySelector('[role="dialog"][aria-label="Appearance and answers"]');return {scroll:p.scrollWidth,client:p.clientWidth,painted:p.textContent.includes('Painted covers')}})()`);
  assert.ok(look.scroll<=look.client, 'Look must not overflow horizontally: '+JSON.stringify({width,height,pen,look}));
  assert.equal(look.painted,false);
 }
 await evaluate(`Array.from(document.querySelectorAll('[role="radio"]')).find(e=>e.textContent==='Answers').click()`);await sleep(200);
 const menu=await evaluate(`(()=>{const p=document.querySelector('[role="dialog"][aria-label="Appearance and answers"]'); const r=p.getBoundingClientRect();p.scrollTop=9999;return {left:r.left,right:r.right,bottom:r.bottom,top:r.top,scroll:p.scrollTop,overflow:p.scrollHeight>p.clientHeight}})()`);
 assert.ok(menu.left>=0&&menu.right<=width+1&&menu.bottom<=height&&menu.top>=0,JSON.stringify({width,height,menu}));
 if(menu.overflow)assert.ok(menu.scroll>0,'Overflow must scroll');
 await evaluate(`Array.from(document.querySelectorAll('[role="radio"]')).find(e=>e.textContent==='Text').click()`);
 const before=await evaluate(`document.querySelector('.prose-read').getBoundingClientRect().width`);
 await evaluate(`document.querySelector('[aria-label="Smaller text"]').click()`);await sleep(100);
 assert.equal(await evaluate(`document.querySelector('.prose-read').getBoundingClientRect().width`),before,'Font size must not change column width');
 await evaluate(`document.querySelector('button[aria-label="Appearance and answers"]').click()`);
 console.log('Layout passed',width,height);
}
await send('Emulation.setDeviceMetricsOverride',{width:744,height:1133,deviceScaleFactor:2,mobile:true});
await evaluate(`window.scrollTo(0,1200);document.querySelector('.composer input').focus()`);console.log('Focus state:',await evaluate(`({active:document.activeElement?.outerHTML,focus:document.hasFocus(),style:document.querySelector('.composer').getAttribute('style')})`));await until(`document.querySelector('.composer').style.bottom !== ''`);
await evaluate(`Object.defineProperty(visualViewport,'height',{configurable:true,value:700});Object.defineProperty(visualViewport,'offsetTop',{configurable:true,value:50});visualViewport.dispatchEvent(new Event('resize'))`);
console.log('Keyboard state:',await evaluate(`({bottom:document.querySelector('.composer').style.bottom, active:document.activeElement?.tagName,height:innerHeight,vh:visualViewport.height,offset:visualViewport.offsetTop})`));
const formBounds=await evaluate(`(()=>{const r=document.querySelector('.composer form').getBoundingClientRect();return {top:r.top,bottom:r.bottom}})()`);
assert.ok(formBounds.top>=50&&formBounds.bottom<=750, 'Composer must stay above the simulated keyboard: '+JSON.stringify(formBounds));
const shot=await send('Page.captureScreenshot',{format:'png'});
await writeFile(join(profile,'keyboard-layout.png'),Buffer.from(shot.data,'base64'));
console.log('Screenshot:',join(profile,'keyboard-layout.png'));
await evaluate(`document.querySelector('.composer input').blur()`);await sleep(100);
assert.equal(await evaluate(`document.querySelector('.composer').style.bottom`),'');
console.log('Keyboard viewport resize and blur cleanup passed (simulated; physical iPad still required).');
}finally{ws?.close();chrome.kill();}
