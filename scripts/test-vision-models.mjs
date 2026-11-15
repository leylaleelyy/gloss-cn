import assert from 'node:assert/strict';
import { normalizeProvider } from '../lib/provider-config.ts';
import { visionProvider, VISION_PROVIDERS } from '../lib/vision-models.ts';
import { vocabularyReturn } from '../lib/vocabulary-navigation.ts';
const chat = normalizeProvider({ baseUrl:'https://api.deepseek.com', model:'chat', apiKey:'chat-secret' });
assert.equal(visionProvider(chat).model,'chat');
assert.equal(visionProvider({...chat,visionModel:'legacy-vision'}).model,'legacy-vision');
assert.equal(visionProvider(chat).apiKey,'chat-secret');
for (const provider of VISION_PROVIDERS) {
 const config = normalizeProvider({...chat, visionBaseUrl:provider.baseUrl, visionApiKey:'vision-secret', visionModel:provider.models[0].id});
 assert.equal(visionProvider(config).baseUrl,provider.baseUrl);
 assert.equal(visionProvider(config).model,provider.models[0].id);
 assert.equal(visionProvider(config).apiKey,'vision-secret');
 assert.equal(visionProvider({...config,visionApiKey:''}).apiKey,'');
 assert.equal(config.model,'chat');
}
assert.throws(()=>normalizeProvider({...chat,visionBaseUrl:'file:///etc'}));
assert.throws(()=>normalizeProvider({...chat,visionBaseUrl:'https://user:password@example.com'}));
assert.throws(()=>normalizeProvider({...chat,visionBaseUrl:'https://example.com'}));
for(const invalid of [null,'https://evil.example','javascript:alert(1)','//evil.example','/vocabulary?from=/read/a','https://gloss.example//evil.example']) assert.equal(vocabularyReturn(invalid,'https://gloss.example'),'/library');
assert.equal(vocabularyReturn('/read/a?block=b#c','https://gloss.example'),'/read/a?block=b#c');
assert.equal(vocabularyReturn('/','https://gloss.example'),'/');
console.log('PASS: vision presets, separate credentials, legacy config and safe return navigation.');
