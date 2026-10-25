import { pronunciationInput, pronounce, playPronunciation } from "@/lib/pronunciation";
export const runtime = "nodejs";
export async function POST(req: Request) {
  if (process.env.GLOSS_DESKTOP !== "1") return Response.json({ error: "Offline pronunciation is available in Gloss desktop. · 离线发音仅适用于桌面版。" }, { status: 503 });
  const host = req.headers.get("host") ?? "";
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) return Response.json({ error: "Invalid host" }, { status: 403 });
  // Next rewrites req.url internally; compare with the actual local Host instead.
  if (req.headers.get("origin") && req.headers.get("origin") !== `http://${host}`) return Response.json({ error: "Invalid origin" }, { status: 403 });
  let input;
  let playback = false;
  try { const body = await req.json(); input = pronunciationInput(body); playback = body.playback === true; } catch (e) { return Response.json({ error: e instanceof Error ? e.message : "Invalid selection" }, { status: 400 }); }
  try {
    const audio = await pronounce(input.word, input.accent);
    if (playback) { await playPronunciation(audio, req.signal); return Response.json({ played: true }); }
    return new Response(new Uint8Array(audio), { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" } });
  } catch (e) { return Response.json({ error: e instanceof Error ? e.message : "Pronunciation unavailable" }, { status: 503 }); }
}
