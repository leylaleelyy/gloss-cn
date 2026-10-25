import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
const dir = await mkdtemp(join(tmpdir(), 'gloss-transfer-test-'));
const app = spawn(process.execPath, ['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3101'], {env:{...process.env,GLOSS_DESKTOP:'1',GLOSS_TRANSFER_DIR:dir,GLOSS_TRANSFER_TOKEN:'fixture-token'},stdio:'ignore'});
const origin='http://127.0.0.1:3101';
const headers={Host:'127.0.0.1:3101',Origin:'http://127.0.0.1:3101','Content-Type':'application/json','x-gloss-transfer':'fixture-token'};
const post=(body,extra={})=>fetch(origin+'/desktop-transfer',{method:'POST',headers:{...headers,...extra},body:JSON.stringify(body)});
try {
 for(let i=0;i<80;i++){try{if((await fetch(origin+'/api/desktop-health')).ok)break;}catch{} await new Promise(r=>setTimeout(r,250));}
 const html=await (await fetch(origin+'/desktop-transfer',{headers:{Host:'127.0.0.1:3101'}})).text();
 assert.match(html,/indexedDB\.open/);
 const script=html.match(/<script>([\s\S]*)<\/script>/)[1];
 new vm.Script(script);
 assert.equal((await post({action:'manifest'},{'x-gloss-transfer':'wrong'})).status,403);
 assert.equal((await post({action:'manifest'},{Origin:'https://example.org'})).status,403);
 assert.equal((await post({action:'record',index:-1,record:{}})).status,400);
 const record={kind:'local',key:'gloss:settings',value:'{"responseLanguage":"zh-CN"}'};
 assert.equal((await post({action:'record',index:0,record})).status,200);
 assert.equal((await post({action:'record',index:1,record:{kind:'fixture',value:'x'.repeat(11*1024*1024)}})).status,200);
 assert.equal((await post({action:'exported',count:2})).status,200);
 assert.deepEqual(await (await post({action:'read',index:0})).json(),record);
 assert.equal((await post({action:'record',index:0,record:{}})).status,409);
 assert.equal((await post({action:'imported',count:3})).status,400);
 assert.equal((await post({action:'imported',count:2})).status,200);
 assert.equal((await post({action:'manifest'})).status,409);
 console.log('PASS: migration page script, origin/token checks, record roundtrip, sealed backup, count checks and completion lock.');
} finally {app.kill('SIGTERM');await once(app,'exit');await rm(dir,{recursive:true,force:true});}
