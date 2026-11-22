// Verifies Google ID token checks without calling Google: a local RSA key stands in.
import assert from 'node:assert/strict';
process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: 'SHA-256' }, true, ['sign','verify']);
const jwk = await crypto.subtle.exportKey('jwk', publicKey);
jwk.kid = 'test-key'; jwk.alg = 'RS256'; jwk.use = 'sig';
globalThis.fetch = async (url) => {
  if (String(url).includes('googleapis.com')) return new Response(JSON.stringify({ keys: [jwk] }), { status: 200, headers: { 'content-type': 'application/json' } });
  throw new Error('unexpected fetch '+url);
};
const b64 = (obj) => Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj)).toString('base64url');
async function token(payload, kid='test-key') {
  const head = b64({ alg:'RS256', kid, typ:'JWT' });
  const body = b64(payload);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${Buffer.from(sig).toString('base64url')}`;
}
const base = { iss:'https://accounts.google.com', aud:'test-client.apps.googleusercontent.com', sub:'google-user-1', email:'reader@example.com', name:'A Reader', email_verified:true, exp: Math.floor(Date.now()/1000)+3600 };
const { verifyGoogleIdToken } = await import('/home/leyla/Projects/gloss-cn/lib/google.ts');
const ok = await verifyGoogleIdToken(await token(base));
assert.deepEqual(ok && { userId: ok.userId, email: ok.email, name: ok.name }, { userId:'google-user-1', email:'reader@example.com', name:'A Reader' });
assert.equal(await verifyGoogleIdToken(await token({ ...base, aud:'someone-else' })), null, 'wrong audience rejected');
assert.equal(await verifyGoogleIdToken(await token({ ...base, exp: Math.floor(Date.now()/1000)-10 })), null, 'expired rejected');
assert.equal(await verifyGoogleIdToken(await token(base, 'other-key')), null, 'unknown key rejected');
const { decodeGoogleCredential } = await import('../lib/google-auth.ts');
const chinese = await token({ ...base, name: '张伟' });
assert.equal(decodeGoogleCredential(chinese)?.name, '张伟', 'UTF-8 Google names decode correctly');
console.log('PASS: Google ID token signature, audience, expiry and key checks');
console.log('PASS: Google names in Chinese decode without mojibake');
