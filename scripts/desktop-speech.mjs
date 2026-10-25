// Install a private runtime from signed packages in the configured Arch/Omarchy repository.
// No sudo, system package changes, browser extensions, or API credentials.
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rename, rm, access } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
if (process.platform !== "linux" || process.arch !== "x64") throw new Error("This installer targets Arch/Omarchy x86_64.");
const parent = join(process.env.XDG_DATA_HOME || join(homedir(), ".local/share"), "gloss-desktop");
await mkdir(parent, { recursive: true });
const stage = await mkdtemp(join(parent, "speech-install-"));
const root = join(stage, "runtime"); await mkdir(root);
try {
  const lines = execFileSync("pacman", ["-Sp", "--print-format", "%n %l", "espeak-ng", "pcaudiolib", "libsonic"], { encoding: "utf8" }).trim().split("\n");
  for (const line of lines) {
    const [name, url] = line.split(" ");
    if (!["espeak-ng", "pcaudiolib", "libsonic"].includes(name)) continue;
    if (!url.startsWith("https://")) throw new Error("Speech package mirror must use HTTPS.");
    const file = join(stage, new URL(url).pathname.split("/").pop());
    for (const suffix of ["", ".sig"]) { const response = await fetch(url + suffix); if (!response.ok) throw new Error(`Could not download ${name}: ${response.status}`); await writeFile(file + suffix, new Uint8Array(await response.arrayBuffer())); }
    execFileSync("gpg", ["--homedir", "/etc/pacman.d/gnupg", "--verify", file + ".sig", file], { stdio: "inherit" });
    execFileSync("bsdtar", ["-xf", file, "-C", root, "usr"]);
  }
  const env = { ...process.env, LD_LIBRARY_PATH: join(root, "usr/lib"), ESPEAK_DATA_PATH: join(root, "usr/share/espeak-ng-data") };
  const voices = execFileSync(join(root, "usr/bin/espeak-ng"), ["--voices=en"], { env, encoding: "utf8" });
  if (!voices.includes("en-us") || !voices.includes("en-gb")) throw new Error("US and UK voices were not installed.");
  const destination = join(parent, "speech"), backup = join(stage, "previous");
  const exists = await access(destination).then(() => true, () => false);
  if (exists) await rename(destination, backup);
  try { await rename(root, destination); } catch (e) { if (exists) await rename(backup, destination); throw e; }
  console.log(`Offline US/UK speech installed: ${destination}`);
} finally { await rm(stage, { recursive: true, force: true }); }
