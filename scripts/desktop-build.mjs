import { spawnSync } from "node:child_process";
import { cp, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, "desktop/out");
const app = join(out, "Gloss");
const env = { ...process.env, GLOSS_DESKTOP: "1", NEXT_PUBLIC_DESKTOP_LOCAL: "1" };

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
}

function nsh(args) {
  if (process.env.NSH_BIN) run(process.env.NSH_BIN, args);
  else run("mise", ["exec", "github:longbridge/nsh@0.2.0", "--", "nsh", ...args]);
}

if (process.platform !== "linux" || process.arch !== "x64") throw new Error("This package targets Linux x86_64.");
if (!process.argv.includes("--skip-web")) run(process.execPath, ["node_modules/next/dist/bin/next", "build"]);
nsh(["check", "desktop"]);
await rm(app, { recursive: true, force: true });
nsh(["package", "desktop", "--target", "linux", "-o", out]);
await rename(join(app, "Gloss"), join(app, "gloss-native"));
await cp(join(root, ".next-desktop/standalone"), join(app, "web"), {
  recursive: true,
  // Never distribute local API keys or database credentials.
  filter: (source) => !basename(source).startsWith(".env"),
});
await cp(join(root, ".next-desktop/static"), join(app, "web/.next-desktop/static"), { recursive: true });
await cp(join(root, "public"), join(app, "web/public"), { recursive: true });
await cp(join(root, "desktop/launch.mjs"), join(app, "launch.mjs"));
await mkdir(join(app, "runtime"), { recursive: true });
await cp(process.execPath, join(app, "runtime/node"));
await writeFile(join(app, "Gloss"), `#!/bin/sh
set -eu
APP_DIR=$(dirname -- "$(readlink -f -- "$0")")
STATE_DIR="${"$"}{XDG_STATE_HOME:-$HOME/.local/state}/gloss-desktop"
mkdir -p "$STATE_DIR"
exec "$APP_DIR/runtime/node" "$APP_DIR/launch.mjs" "$@" >> "$STATE_DIR/app.log" 2>&1
`, { mode: 0o755 });
run("tar", ["-czf", join(out, "Gloss.tar.gz"), "-C", out, "Gloss"]);
console.log(`Desktop package ready: ${app}\nLaunch: npm run desktop:start\nInstall launcher: npm run desktop:install`);
