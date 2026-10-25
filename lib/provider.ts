import { headers } from "next/headers";
import { EMPTY_PROVIDER, normalizeProvider, type ProviderConfig } from "./provider-config";

export async function getProvider(): Promise<ProviderConfig> {
  const raw = (await headers()).get("x-gloss-provider");
  if (raw) return normalizeProvider(JSON.parse(decodeURIComponent(raw)));
  if (!process.env.AI_BASE_URL || !process.env.AI_MODEL) return { ...EMPTY_PROVIDER };
  return normalizeProvider({
    baseUrl: process.env.AI_BASE_URL, apiKey: process.env.AI_API_KEY,
    model: process.env.AI_MODEL, visionModel: process.env.AI_VISION_MODEL,
    speechModel: process.env.AI_SPEECH_MODEL, speechVoice: process.env.AI_SPEECH_VOICE,
    imageModel: process.env.AI_IMAGE_MODEL,
  });
}

export async function providerConfigured() {
  try { return Boolean((await getProvider()).model); } catch { return false; }
}

export function aiHeaders(config: ProviderConfig): Record<string, string> {
  return { "Content-Type": "application/json", "User-Agent": "Gloss/0.1", ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}) };
}
