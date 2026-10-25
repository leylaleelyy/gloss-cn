import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { access, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";

// Private runtime settings stay outside the checkout and distributable archive.
try {
  process.loadEnvFile(join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "gloss-desktop/ai.env"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const root = dirname(fileURLToPath(import.meta.url));
const origin = "http://127.0.0.1:3101";
const data = join(process.env.XDG_DATA_HOME || join(homedir(), ".local/share"), "gloss-desktop");
const transferDir = join(data, "webkit-backup");
const exists = async (path) => access(path).then(() => true, () => false);
const useNsh = process.env.GLOSS_ENGINE === "nsh";
const chromium = process.env.CHROMIUM_BIN || "/usr/bin/chromium";
const migrate = !useNsh && !(await exists(join(transferDir, "imported.json")));
const transferToken = migrate ? randomBytes(32).toString("hex") : "";
let server;
let window;
let stopping = false;

async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  const children = [window, server].filter((child) => child?.pid && child.exitCode === null && child.signalCode === null);
  const exits = children.map((child) => once(child, "exit").catch(() => {}));
  children.forEach((child) => child.kill("SIGTERM"));
  const force = setTimeout(() => children.forEach((child) => child.kill("SIGKILL")), 5000);
  await Promise.all(exits);
  clearTimeout(force);
  process.exit(code);
}

process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());

try {
  if (!useNsh) await access(chromium);
  await mkdir(data, { recursive: true, mode: 0o700 });
  // Never reuse an unrelated service or silently switch origins: storage is origin-bound.
  const probe = createServer();
  probe.listen(3101, "127.0.0.1");
  await once(probe, "listening");
  await new Promise((resolve) => probe.close(resolve));

  server = spawn(process.execPath, [join(root, "web/server.js")], {
    cwd: join(root, "web"),
    env: { ...process.env, NODE_ENV: "production", HOSTNAME: "127.0.0.1", PORT: "3101", GLOSS_DESKTOP: "1", NEXT_PUBLIC_DESKTOP_LOCAL: "1", GLOSS_TRANSFER_DIR: migrate ? transferDir : "", GLOSS_TRANSFER_TOKEN: transferToken },
    stdio: "inherit",
  });
  server.on("error", (error) => { console.error(error.message); void stop(1); });
  server.on("exit", () => { if (!stopping) { console.error("Gloss server stopped."); void stop(1); } });

  let ready = false;
  for (let attempt = 0; attempt < 120 && !stopping; attempt++) {
    try {
      const response = await fetch(`${origin}/api/desktop-health`, { signal: AbortSignal.timeout(1000) });
      ready = response.ok && (await response.json()).app === "gloss";
    } catch {}
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error("Gloss did not become ready within 30 seconds.");
  if (migrate && !(await exists(join(transferDir, "exported.json")))) {
    console.log("Backing up the original WebKit library before opening Chromium.");
    window = spawn(join(root, "gloss-native"), [], {
      cwd: root, stdio: "inherit",
      env: { ...process.env, GSK_RENDERER: "gl", WEBKIT_SKIA_ENABLE_CPU_RENDERING: "1" },
    });
    let exportError;
    window.on("error", (error) => { exportError = error; });
    const deadline = Date.now() + 300_000;
    while (!(await exists(join(transferDir, "exported.json")))) {
      if (stopping) break;
      if (exportError) throw exportError;
      if (window.exitCode !== null || window.signalCode !== null) throw new Error("Library transfer was closed. Reopen Gloss to retry; original data is intact.");
      if (Date.now() > deadline) throw new Error("Library transfer timed out. Original data is intact; reopen Gloss to retry.");
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (stopping) throw new Error("Stopped");
    const exited = once(window, "exit");
    window.kill("SIGTERM");
    await exited;
    console.log("WebKit backup saved; importing into the dedicated Chromium profile.");
  }
  if (useNsh) {
    window = spawn(join(root, "gloss-native"), process.argv.slice(2), { cwd: root, stdio: "inherit", env: { ...process.env, GSK_RENDERER: process.env.GSK_RENDERER || "gl" } });
  } else {
    const profile = join(data, "chromium");
    await mkdir(profile, { recursive: true, mode: 0o700 });
    window = spawn(chromium, [
      `--user-data-dir=${profile}`, "--class=io.usegloss.desktop", "--no-first-run", "--no-default-browser-check",
      "--disable-background-mode", "--ozone-platform=wayland",
      `--app=${origin}/${migrate ? "desktop-transfer?mode=import" : "library"}`,
    ], { cwd: root, stdio: "inherit" });
    console.log("Gloss desktop engine: Chromium (dedicated profile, GPU defaults).");
  }
  window.on("error", (error) => { console.error(error.message); void stop(1); });
  window.on("exit", (code) => void stop(code ?? 0));
} catch (error) {
  console.error(error.code === "EADDRINUSE" ? "Gloss cannot start: port 3101 is already in use. Close the other Gloss window or service first." : error.message);
  await stop(1);
}
