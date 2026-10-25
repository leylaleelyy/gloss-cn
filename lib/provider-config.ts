export type ProviderConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  visionModel: string;
  speechModel: string;
  speechVoice: string;
  imageModel: string;
};

export const EMPTY_PROVIDER: ProviderConfig = { baseUrl: "", apiKey: "", model: "", visionModel: "", speechModel: "", speechVoice: "", imageModel: "" };
export const PROVIDER_STORAGE = "gloss:ai-provider";

export function normalizeProvider(value: unknown): ProviderConfig {
  if (!value || typeof value !== "object") throw new Error("Enter your AI provider settings.");
  const raw = value as Record<string, unknown>;
  const config = { ...EMPTY_PROVIDER };
  for (const key of Object.keys(config) as (keyof ProviderConfig)[]) {
    if (raw[key] !== undefined && typeof raw[key] !== "string") throw new Error(`Invalid ${key}.`);
    config[key] = (raw[key] as string | undefined)?.trim() ?? "";
    if (config[key].length > 2048) throw new Error(`${key} is too long.`);
  }
  if (!config.baseUrl || !config.model) throw new Error("Base URL and chat model are required.");
  const url = new URL(config.baseUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("Use an HTTP(S) API base URL without credentials, query parameters, or fragments.");
  config.baseUrl = url.href.replace(/\/+$/, "");
  return config;
}

export function readProvider(): ProviderConfig {
  try { return normalizeProvider(JSON.parse(localStorage.getItem(PROVIDER_STORAGE) || "null")); }
  catch { return { ...EMPTY_PROVIDER }; }
}

/** An explicit configuration never borrows a key from another provider. */
export function providerHeaders(): Record<string, string> {
  const config = readProvider();
  return config.baseUrl ? { "X-Gloss-Provider": encodeURIComponent(JSON.stringify(config)) } : {};
}
