import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { normalizeProvider } from '../lib/provider-config.ts';
import { visionProvider, visionGenerationOptions } from '../lib/vision-models.ts';
let config = normalizeProvider({baseUrl:'https://chat.example/v1',apiKey:'chat-secret',model:'chat',visionBaseUrl:'https://vision.example/v1',visionApiKey:'vision-secret',visionModel:'vision-model'});
globalThis.__visionTest = {getProvider:async()=>config,providerConfigured:async()=>true,visionProvider,visionGenerationOptions,aiHeaders:p=>({'Content-Type':'application/json',...(p.apiKey?{Authorization:'Bearer '+p.apiKey}:{})}),languageInstruction:()=>'',needKey:()=>new Response('',{status:401})};
async function route(path) {
 let source=await readFile(new URL(path,import.meta.url),'utf8');
 source=source.replace(/^import \{ ([^}]+) \} from "[^"]+";/gm,(_,names)=>`const { ${names} } = globalThis.__visionTest;`);
 return import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
}
const explain=await route('../app/api/image-explain/route.ts');
const pdf=await route('../app/api/pdf-page/route.ts');
const calls=[];
const originalFetch=globalThis.fetch;
let finishReason = 'stop';
globalThis.fetch=async(url,options)=>{
 const body=JSON.parse(options.body);calls.push({url,headers:options.headers,body});
 return body.stream?new Response('data: '+JSON.stringify({choices:[{delta:{content:'A scanned page.'}}]})+'\n\ndata: [DONE]\n\n'):Response.json({choices:[{message:{content:'A diagram.'},finish_reason:finishReason}]});
};
try {
 for(const api of [explain,pdf]) {
  const result=await api.POST(new Request('https://gloss.example/api/test',{method:'POST',body:JSON.stringify({image:'data:image/png;base64,AAAA'})}));
  assert.equal(result.status,200);
  const call=calls.at(-1);
  assert.equal(call.url,'https://vision.example/v1/chat/completions');
  assert.equal(call.headers.Authorization,'Bearer vision-secret');
  assert.equal(call.body.model,'vision-model');
  assert.ok(call.body.messages.some(m=>Array.isArray(m.content)&&m.content.some(c=>c.type==='image_url')));
 }
 const request = history => new Request('https://gloss.example/api/test',{method:'POST',body:JSON.stringify({image:'data:image/png;base64,AAAA',history})});
 const complete = await (await explain.POST(request([]))).json();
 assert.equal(complete.truncated,false);
 finishReason = 'length';
 const previous = 'x'.repeat(5000) + 'LAST SENTENCE';
 const partial = await (await explain.POST(request([{role:'assistant',content:previous},{role:'user',content:'继续'}]))).json();
 assert.equal(partial.truncated,true);
 assert.equal(partial.content,'A diagram.');
 assert.equal(calls.at(-1).body.max_tokens,8192);
 assert.equal(calls.at(-1).body.messages.at(-2).content,previous);
 assert.equal(calls.at(-1).body.messages.at(-1).content,'继续');
 finishReason = 'stop';
 config={...config,visionApiKey:''};
 await explain.POST(new Request('https://gloss.example/api/test',{method:'POST',body:JSON.stringify({image:'data:image/png;base64,AAAA'})}));
 assert.equal(calls.at(-1).headers.Authorization,undefined);
 config={...config,visionBaseUrl:'',visionModel:''};
 await explain.POST(new Request('https://gloss.example/api/test',{method:'POST',body:JSON.stringify({image:'data:image/png;base64,AAAA'})}));
 assert.equal(calls.at(-1).url,'https://chat.example/v1/chat/completions');
 assert.equal(calls.at(-1).headers.Authorization,'Bearer chat-secret');
 assert.equal(calls.at(-1).body.model,'chat');
 config={...config,visionModel:'gpt-5.4-mini'};
 for (const api of [explain,pdf]) {
  await api.POST(request([]));
  const body=calls.at(-1).body;
  assert.ok(body.max_completion_tokens > 0);
  assert.equal(body.max_tokens,undefined);
  assert.equal(body.temperature,undefined);
  assert.equal(body.reasoning_effort,'none');
 }
 console.log('PASS: image understanding and PDF routes use the selected vision endpoint/model/key; shared fallback and key isolation.');
} finally {globalThis.fetch=originalFetch;delete globalThis.__visionTest;}
