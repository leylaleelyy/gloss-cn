// Word Wise is off by default and remembered per text, even if an old global preference was on.
// Run against a local server: GLOSS_TEST_URL=http://localhost:3100 node scripts/test-word-wise-book.mjs
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {readFile,mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
const profile = await mkdtemp(join(tmpdir(), "gloss-wise-book-"));
const baseUrl = process.env.GLOSS_TEST_URL || "http://localhost:3117";
const chrome=spawn(process.env.CHROMIUM_PATH || "/usr/bin/chromium",["--headless","--no-sandbox","--disable-gpu","--no-first-run","--remote-debugging-port=0","--user-data-dir="+profile],{stdio:"ignore"});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws;
try{
let port;for(let i=0;i<50;i++){try{port=(await readFile(join(profile,"DevToolsActivePort"),"utf8")).split("\n")[0];break}catch{await sleep(100)}}
const tab=await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:"PUT"})).json();ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener("open",r,{once:true}));let id=0;const waiting=new Map();ws.addEventListener("message",e=>{const m=JSON.parse(e.data);if(waiting.has(m.id)){waiting.get(m.id)(m);waiting.delete(m.id)}});
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>reject(Error("CDP timed out")),60000);waiting.set(n,m=>{clearTimeout(timer);m.error?reject(m.error):resolve(m.result)});ws.send(JSON.stringify({id:n,method,params}))});
const evaluate=async expression=>{const r=await send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
const until=async expression=>{for(let i=0;i<150;i++){if(await evaluate(expression))return;await sleep(200)}throw Error("Timed out: "+expression)};
await send("Page.navigate",{url:baseUrl+"/robots.txt"});await until('document.readyState==="complete"');
const doc=(id,title)=>({id,title,origin:"file",blocks:Array.from({length:12},(_,i)=>({id:"p"+i,type:"p",runs:[{text:"An intricate and obscure passage about reading. ".repeat(4)}]}))});
await evaluate(`localStorage.setItem('gloss:doc:a',${JSON.stringify(JSON.stringify(doc("a","Book A")))});localStorage.setItem('gloss:doc:b',${JSON.stringify(JSON.stringify(doc("b","Book B")))});localStorage.setItem('gloss:learning-settings',JSON.stringify({wordWise:true,level:'B1',display:'bilingual',highlight:true}));localStorage.setItem('gloss:hinted','1')`);
const pressed=()=>evaluate(`document.querySelector('.word-wise-toggle')?.getAttribute('aria-pressed')`);
await send("Page.navigate",{url:baseUrl+"/read/a"});await until('!!document.querySelector(".word-wise-toggle")');await sleep(400);
assert.equal(await pressed(),"false","Word Wise starts off even with an old global preference");
await evaluate(`document.querySelector('.word-wise-toggle').click()`);await sleep(300);
assert.equal(await pressed(),"true");
assert.equal(await evaluate(`localStorage.getItem('gloss:word-wise:a')`),"1");
await send("Page.navigate",{url:baseUrl+"/read/b"});await until('!!document.querySelector(".word-wise-toggle")');await sleep(400);
assert.equal(await pressed(),"false","another text starts off");
assert.equal(await evaluate(`localStorage.getItem('gloss:word-wise:b')`),null);
await send("Page.navigate",{url:baseUrl+"/read/a?again=1"});await until('!!document.querySelector(".word-wise-toggle")');await sleep(400);
assert.equal(await pressed(),"true","the first text remembers being on");
console.log("PASS: Word Wise is off by default and remembered per text");
}finally{ws?.close();chrome.kill();}
