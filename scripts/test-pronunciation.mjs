import assert from "node:assert/strict";
import { pronounce, pronunciationInput } from "../lib/pronunciation.ts";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
for (const bad of [null, {}, {word:'hello',accent:'au'}, {word:'[[x]]',accent:'us'}, {word:'x'.repeat(121),accent:'uk'}, {word:'$(touch /tmp/no)',accent:'us'}]) assert.throws(() => pronunciationInput(bad));
assert.deepEqual(pronunciationInput({word:' turn   over ',accent:'uk'}),{word:'turn over',accent:'uk'});
const results = await Promise.all(['us','uk'].map(async accent => {
  const begin = performance.now(), audio = await pronounce('water',accent);
  assert.equal(audio.toString('ascii',0,4),'RIFF'); assert.equal(audio.toString('ascii',8,12),'WAVE');
  assert.equal(audio.readUInt32LE(4),audio.length-8); assert.ok(audio.length > 8000);
  assert.ok(audio.subarray(100).some(b => b !== 0), 'Audio contains speech samples');
  await writeFile(`/tmp/gloss-pronunciation-${accent}.wav`,audio);
  console.log(`${accent.toUpperCase()}: ${audio.length} bytes, ${(performance.now()-begin).toFixed(0)}ms`);
  assert.equal(await pronounce('water',accent),audio,'Repeated playback uses the cached clip');
  return createHash('sha256').update(audio).digest('hex');
}));
assert.notEqual(results[0], results[1], 'US and UK must generate different audio');
console.log('PASS: validation, real US/UK WAV generation, non-silent distinct audio, correct RIFF lengths, cache.');
if (process.env.GLOSS_TEST_ORIGIN) {
  const origin = process.env.GLOSS_TEST_ORIGIN;
  const post = (body, requestOrigin = origin) => fetch(`${origin}/api/pronounce`, {method:'POST',headers:{'Content-Type':'application/json',Origin:requestOrigin},body:JSON.stringify(body)});
  for (const accent of ['us','uk']) {
    const response = await post({word:'water',accent}); assert.equal(response.status,200); assert.equal(response.headers.get('content-type'),'audio/wav');
    assert.equal(Buffer.from(await response.arrayBuffer()).toString('ascii',0,4),'RIFF');
  }
  if (process.env.GLOSS_TEST_PLAYBACK === "1") {
    for (const accent of ['us','uk']) {
      const response = await post({word:'water',accent,playback:true});
      assert.equal(response.status,200);
      assert.equal((await response.json()).played,true);
    }
    console.log('PASS: native PipeWire playback completes for both accents.');
  }
  assert.equal((await post({word:'water',accent:'unknown'})).status,400);
  assert.equal((await post({word:'water',accent:'us'},'https://unrelated.example')).status,403);
  console.log('PASS: desktop API plays both accents, rejects invalid accents and cross-origin requests.');
}
