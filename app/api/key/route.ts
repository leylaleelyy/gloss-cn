import { normalizeProvider } from "@/lib/provider-config";
import { aiHeaders, providerConfigured, getProvider } from "@/lib/provider";

export const runtime = "nodejs";

/** Test an explicit configuration without storing it or borrowing server credentials. */
export async function POST(req: Request) {
  let config;
  try { config = normalizeProvider(await req.json()); }
  catch (error) { return Response.json({ ok: false, error: error instanceof Error ? error.message : "Invalid provider settings." }, { status: 400 }); }
  try {
    const response = await fetch(`${config.baseUrl}/models`, { headers: aiHeaders(config), signal: AbortSignal.timeout(10_000), redirect: "error" });
    return Response.json({ ok: response.ok, ...(!response.ok ? { error: `Provider returned HTTP ${response.status}. Check the URL and key; some providers do not expose /models.` } : {}) });
  } catch { return Response.json({ ok: false, error: "Could not reach the provider. Check its URL and that the server is running." }); }
}

export async function GET() {
  const configured = await providerConfigured();
  const provider = configured ? await getProvider() : null;
  return Response.json({ house: configured, model: provider?.model ?? null, free: null });
}
