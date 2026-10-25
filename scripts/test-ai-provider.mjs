import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { normalizeProvider } from "../lib/provider-config.ts";

assert.throws(() => normalizeProvider({ baseUrl: "file:///etc", model: "x" }));
assert.throws(() => normalizeProvider({ baseUrl: "https://user:password@example.com/v1", model: "x" }));
const requests = [];
const mock = createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  requests.push({ path: req.url, auth: req.headers.authorization, body });
  if (req.url.endsWith("/models")) return res.end(JSON.stringify({ data: [{ id: "test-chat" }] }));
  if (req.url.endsWith("/audio/speech")) { res.setHeader("Content-Type", "audio/mpeg"); return res.end("test-audio"); }
  if (req.url.endsWith("/images/generations")) return res.end(JSON.stringify({ data: [{ b64_json: Buffer.from([255, 216, 255, 217]).toString("base64") }] }));
  if (body.stream) {
    res.setHeader("Content-Type", "text/event-stream");
    const data = `data: ${JSON.stringify({ choices: [{ delta: { content: "A test answer." } }] })}\r\n\r\ndata: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 20, completion_tokens: 4 } })}\r\n\r\ndata: [DONE]\r\n\r\n`;
    res.write(data.slice(0, 23));
    return setTimeout(() => res.end(data.slice(23)), 10);
  }
  if (body.messages?.[0]?.content.includes("reading tutor")) {
    const word = { word: "bank", partOfSpeech: "noun", pronunciation: "/bæŋk/", english: "Land beside a river.", native: "河岸" };
    const sentence = { simplified: "We sat by the river.", translation: "我们坐在河岸边。", chunks: ["We sat", "on the bank."], backbone: "We sat · 主谓结构", grammar: [{ part: "on the bank", explanation: "介词短语表示地点" }], vocabulary: [word] };
    const data = body.messages[0].content.includes('"simplified"') ? sentence : word;
    return res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(data) } }] }));
  }
  res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ gist: "Test summary", claims: [{ text: "Evidence", cite: 1 }], sections: [], caveats: [], topic: "science", tags: [], scene: "A book" }) } }], usage: { prompt_tokens: 20, completion_tokens: 4 } }));
});
mock.listen(0, "127.0.0.1"); await once(mock, "listening");
const mockUrl = `http://127.0.0.1:${mock.address().port}/v1`;
const config = normalizeProvider({ baseUrl: mockUrl + "/", model: "test-chat", apiKey: "test-user-key", visionModel: "test-vision", speechModel: "test-speech", speechVoice: "test-voice", imageModel: "test-image" });
let output = "";
const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3102"], {
  env: { ...process.env, GLOSS_DESKTOP: "1", NEXT_PUBLIC_DESKTOP_LOCAL: "1", AI_BASE_URL: mockUrl, AI_MODEL: "server-model", AI_API_KEY: "server-only-test-key" },
  stdio: ["ignore", "pipe", "pipe"],
});
app.stdout.on("data", (chunk) => { output += chunk; }); app.stderr.on("data", (chunk) => { output += chunk; });
const origin = "http://127.0.0.1:3102";
async function post(path, body, settings = config) {
  return fetch(origin + path, { method: "POST", headers: { "Content-Type": "application/json", "X-Gloss-Provider": encodeURIComponent(JSON.stringify(settings)) }, body: JSON.stringify(body) });
}
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (app.exitCode !== null) throw new Error(output);
    try { ready = (await fetch(origin + "/api/desktop-health")).ok; } catch {}
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(ready, output);
  assert.equal((await (await post("/api/key", config)).json()).ok, true);
  assert.equal((await post("/api/key", { baseUrl: "file:///bad", model: "x" })).status, 400);
  const doc = { title: "Fixture", paras: [{ n: 1, text: "This text explains a test." }] };
  const response = await post("/api/ask", { doc, thread: { action: "ask", question: "Explain this." }, search: false });
  assert.equal(response.status, 200);
  const stream = await response.text();
  assert.match(stream, /A test answer/); assert.match(stream, /test-chat/); assert.match(stream, /"costUsd":null/);
  const brief = await (await post("/api/brief", { doc })).json(); assert.equal(brief.brief.gist, "Test summary");
  assert.ok(requests.at(-1).body.messages.some((m) => m.role === "system" && m.content.includes("Simplified Chinese")));
  for (const [language, expected] of [["zh-TW", "Traditional Chinese"], ["en", "English"], ["auto", "latest question"], ["invalid", "Simplified Chinese"]]) {
    const answer = await post("/api/ask", { doc, responseLanguage: language, thread: { action: "simplify", quote: "Test passage" }, history: [{ role: "user", content: "Continue" }], search: false });
    await answer.text();
    assert.ok(requests.at(-1).body.messages.some((m) => m.role === "system" && m.content.includes(expected)), language);
  }
  await (await post("/api/brief", { doc, responseLanguage: "zh-TW" })).json();
  assert.ok(requests.at(-1).body.messages.some((m) => m.role === "system" && m.content.includes("Traditional Chinese")));

  const learned = await post("/api/learn", { mode: "dictionary", text: "bank", context: "We sat on the bank of the river.", preferences: { level: "A2" }, language: "zh-CN" });
  assert.equal(learned.status, 200); assert.equal((await learned.json()).data.native, "河岸");
  assert.match(requests.at(-1).body.messages[0].content, /CEFR A2/);
  assert.match(requests.at(-1).body.messages[0].content, /Simplified Chinese/);
  const studied = await post("/api/learn", { mode: "sentence", text: "We sat on the bank.", context: "A river nearby.", language: "zh-TW" });
  assert.equal(studied.status, 200); assert.equal((await studied.json()).data.vocabulary.length, 1);
  assert.match(requests.at(-1).body.messages[0].content, /Traditional Chinese/);
  const count = requests.length;
  for (const bad of [{}, { mode: "dictionary", text: "x".repeat(6001), context: "" }, { mode: "sentence", text: "x".repeat(6001), context: "" }]) assert.equal((await post("/api/learn", bad)).status, 400);
  assert.equal(requests.length, count, "Invalid selections must not spend provider tokens");
  assert.equal((await post("/api/shelve", { title: "Fixture" })).status, 200);
  const vision = await (await post("/api/pdf-page", { image: "data:image/png;base64,AAAA" })).json(); assert.equal(vision.markdown, "A test answer.");
  assert.equal(await (await post("/api/speak", { text: "Read this." })).text(), "test-audio");
  assert.equal((await post("/api/covers", { id: "fixture", scene: "A book", topic: "science" })).status, 200);
  await (await post("/api/brief", { doc }, { ...config, apiKey: "" })).text();
  assert.equal(requests.at(-1).auth, undefined, "Keyless local providers must not inherit server credentials");
  assert.ok(requests.some((r) => r.body.model === "test-vision"));
  assert.ok(requests.some((r) => r.body.model === "test-speech" && r.body.voice === "test-voice"));
  assert.ok(requests.some((r) => r.body.model === "test-image" && r.body.response_format === "b64_json"));
  assert.ok(requests.every((r) => r.auth !== "Bearer server-only-test-key"));
  assert.ok(requests.every((r) => !("chat_template_kwargs" in r.body)));
  assert.ok(requests.some((r) => r.auth === "Bearer test-user-key"));
  console.log("PASS: provider validation, streaming chat, summaries, shelving, vision, speech, images, and keyless credential isolation.");
} finally {
  app.kill("SIGTERM");
  if (app.exitCode === null) await once(app, "exit");
  mock.closeAllConnections(); await new Promise((resolve) => mock.close(resolve));
}
