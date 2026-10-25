/**
 * A painted cover for one text, on the server: the scene the classifier
 * wrote, as a two-colour risograph print in its topic's inks. The title is
 * never in the prompt, or the model letters it onto the picture.
 */

import { TOPIC, type TopicKey } from "./library";
import { getProvider, aiHeaders } from "./provider";

export async function paintCover(req: { scene: string; topic: TopicKey; apiKey?: string; signal?: AbortSignal }): Promise<{ ok: true; jpeg: Uint8Array } | { ok: false; error: string }> {
  const provider = await getProvider();
  if (!provider.imageModel) return { ok: false, error: "Set an image model in AI settings to paint covers." };
  const prompt = `Editorial risograph print. ${req.scene.replace(/\.?$/, ".")} Two-colour palette of ${TOPIC[req.topic].inks} ink on warm cream paper filling the whole image, grain and halftone texture, mid-century book-cover illustration, wordless, no lettering, no border.`;
  let res: Response;
  try {
    res = await fetch(`${provider.baseUrl}/images/generations`, {
      method: "POST",
      signal: req.signal,
      headers: aiHeaders(provider),
      body: JSON.stringify({ model: provider.imageModel, prompt, size: "1024x1024", n: 1, response_format: "b64_json" }),
    });
  } catch (e) {
    return { ok: false, error: `Could not reach the AI provider: ${String(e)}` };
  }
  const j = (await res.json().catch(() => ({}))) as { data?: { b64_json?: string }[]; error?: { message?: string } };
  const b64 = j.data?.[0]?.b64_json;
  if (!res.ok || !b64) return { ok: false, error: j.error?.message ?? `The AI provider answered ${res.status}.` };
  return { ok: true, jpeg: Uint8Array.from(Buffer.from(b64, "base64")) };
}
