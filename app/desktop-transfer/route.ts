import { mkdir, readFile, writeFile, rename, access } from "node:fs/promises";
import { join } from "node:path";
import { transferClient } from "@/lib/desktop-transfer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
function config(req: Request) {
  const root = process.env.GLOSS_TRANSFER_DIR;
  const token = process.env.GLOSS_TRANSFER_TOKEN;
  if (process.env.GLOSS_DESKTOP !== "1" || !root || !token) return null;
  if (req.headers.get("host") !== "127.0.0.1:3101") return null;
  if (req.headers.get("sec-fetch-site") === "cross-site") return null;
  return { root, token };
}
export async function GET(req: Request) {
  const c = config(req);
  if (!c) return Response.redirect(new URL("http://127.0.0.1:3101/library"));
  try { await access(join(c.root, "imported.json")); return Response.redirect(new URL("http://127.0.0.1:3101/library")); } catch {}
  const mode = new URL(req.url).searchParams.get("mode") === "import" ? "import" : "export";
  return new Response(`<!doctype html><meta charset="utf-8"><title>Moving your Gloss library</title><style>body{background:#f6f3ec;color:#29251f;font:18px system-ui;max-width:600px;margin:15vh auto;padding:24px}p{line-height:1.6}</style><h1>Moving your Gloss library</h1><p id="status">${mode === "export" ? "Backing up the WebKit library…" : "Restoring your library in Chromium…"}</p><script>(${transferClient.toString()})(${JSON.stringify(mode)},${JSON.stringify(c.token)})</script>`, { headers: { ...headers, "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self' data:; img-src data:; frame-ancestors 'none'" } });
}
export async function POST(req: Request) {
  const c = config(req);
  if (!c || req.headers.get("x-gloss-transfer") !== c.token || req.headers.get("origin") !== "http://127.0.0.1:3101") return new Response("Forbidden", { status: 403 });
  try {
    await access(join(c.root, "imported.json"));
    return new Response("Transfer already finished", { status: 409 });
  } catch {}
  const body = await req.json();
  await mkdir(c.root, { recursive: true, mode: 0o700 });
  const json = (value: unknown) => Response.json(value, { headers });
  if (body.action === "record") {
    if (!Number.isSafeInteger(body.index) || body.index < 0) return new Response("Invalid record", { status: 400 });
    try { await access(join(c.root, "exported.json")); return new Response("Backup is sealed", { status: 409 }); } catch {}
    await writeFile(join(c.root, `${body.index}.json`), JSON.stringify(body.record), { mode: 0o600 });
    return json({ ok: true });
  }
  if (body.action === "manifest") return json(JSON.parse(await readFile(join(c.root, "exported.json"), "utf8")));
  if (body.action === "read" && Number.isSafeInteger(body.index) && body.index >= 0) return json(JSON.parse(await readFile(join(c.root, `${body.index}.json`), "utf8")));
  if (body.action === "exported" || body.action === "imported") {
    if (!Number.isSafeInteger(body.count) || body.count < 0) return new Response("Invalid count", { status: 400 });
    if (body.action === "imported") {
      const manifest = JSON.parse(await readFile(join(c.root, "exported.json"), "utf8"));
      if (manifest.count !== body.count) return new Response("Count mismatch", { status: 400 });
    } else {
      for (let i = 0; i < body.count; i++) await access(join(c.root, `${i}.json`));
    }
    const path = join(c.root, `${body.action}.json`);
    await writeFile(path + ".tmp", JSON.stringify({ count: body.count, at: new Date().toISOString() }), { mode: 0o600 });
    await rename(path + ".tmp", path);
    return json({ ok: true });
  }
  return new Response("Unknown action", { status: 400 });
}
