import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { normalizeProvider } from '../lib/provider-config.ts';
import { visionProvider } from '../lib/vision-models.ts';
let config = normalizeProvider({baseUrl:'https://chat.example/v1',apiKey:'chat-secret',model:'chat',visionBaseUrl:'https://vision.example/v1',visionApiKey:'vision-secret',visionModel:'vision-model'});
globalThis.__visionTest = {getProvider:async()=>config,providerConfigured:async()=>true,visionProvider,aiHeaders:p=>({'Content-Type':'application/json',...(p.apiKey?{Authorization:'Bearer '+p.apiKey}:{})}),languageInstruction:()=>'',needKey:()=>new Response('',{status:401})};
async function route(path) {
 let source=await readFile(new URL(path,import.meta.url),'utf8');
 source=source.replace(/^import \{ ([^}]+) \} from "[^"]+";/gm,(_,names)=>`const { ${names} } = globalThis.__visionTest;`);
 return import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
}
const explain=await route('../app/api/image-explain/route.ts');
const pdf=await route('../app/api/pdf-page/route.ts');
const calls=[];
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
 const body=JSON.parse(options.body);calls.push({url,headers:options.headers,body});
 return body.stream?new Response('data: '+JSON.stringify({choices:[{delta:{content:'A scanned page.'}}]})+'\n\ndata: [DONE]\n\n'):Response.json({choices:[{message:{content:'A diagram.'}}]});
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
 config={...config,visionApiKey:''};
 await explain.POST(new Request('https://gloss.example/api/test',{method:'POST',body:JSON.stringify({image:'data:image/png;base64,AAAA'})}));
 assert.equal(calls.at(-1).headers.Authorization,undefined);
 config={...config,visionBaseUrl:'',visionModel:''};
 await explain.POST(new Request('https://gloss.example/api/test',{method:'POST',body:JSON.stringify({image:'data:image/png;base64,AAAA'})}));
 assert.equal(calls.at(-1).url,'https://chat.example/v1/chat/completions');
 assert.equal(calls.at(-1).headers.Authorization,'Bearer chat-secret');
 assert.equal(calls.at(-1).body.model,'chat');
 console.log('PASS: image understanding and PDF routes use the selected vision endpoint/model/key; shared fallback and key isolation.');
} finally {globalThis.fetch=originalFetch;delete globalThis.__visionTest;}
