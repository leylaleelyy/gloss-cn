import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type Accent = "us" | "uk";
export function pronunciationInput(raw: unknown): { word: string; accent: Accent } {
  const b = raw as Record<string, unknown> | null;
  if (!b || typeof b.word !== "string" || !["us", "uk"].includes(String(b.accent))) throw new Error("Choose a word and US or UK pronunciation.");
  const word = b.word.trim().replace(/\s+/g, " ");
  if (!word || word.length > 120 || !/^[\p{L}\p{M} '’.-]+$/u.test(word) || !/\p{L}/u.test(word)) throw new Error("Choose a word or short phrase up to 120 characters.");
  return { word, accent: b.accent as Accent };
}
const cache = new Map<string, Buffer>();
let active = 0;
export async function pronounce(word: string, accent: Accent): Promise<Buffer> {
  const key = `${accent}:${word}`;
  const cached = cache.get(key); if (cached) return cached;
  if (active >= 2) throw new Error("Speech is busy. Please try again. · 发音忙碌，请重试。");
  const root = join(process.env.XDG_DATA_HOME || join(homedir(), ".local/share"), "gloss-desktop/speech/usr");
  const local = existsSync(join(root, "bin/espeak-ng"));
  const bin = local ? join(root, "bin/espeak-ng") : "/usr/bin/espeak-ng";
  if (!existsSync(bin)) throw new Error("Install the Gloss speech runtime (npm run desktop:speech) or espeak-ng. · 请安装语音引擎。");
  active++;
  try {
    const audio = await new Promise<Buffer>((resolve, reject) => {
      const child = execFile(bin, ["--stdout", "--stdin", "-v", accent === "us" ? "en-us" : "en-gb", "-s", "145"], {
        timeout: 5000, maxBuffer: 2 * 1024 * 1024, encoding: "buffer",
        env: local ? { ...process.env, LD_LIBRARY_PATH: join(root, "lib"), ESPEAK_DATA_PATH: join(root, "share/espeak-ng-data") } : process.env,
      }, (error, stdout) => error ? reject(new Error("Could not generate pronunciation. · 无法生成发音。")) : resolve(stdout));
      child.stdin?.on("error", () => {}); child.stdin?.end(word);
    });
    if (audio.toString("ascii", 0, 4) !== "RIFF" || audio.toString("ascii", 8, 12) !== "WAVE") throw new Error("Invalid speech audio.");
    // stdout uses a placeholder length; give Chromium a complete, seekable WAV.
    audio.writeUInt32LE(audio.length - 8, 4);
    for (let p = 12; p + 8 <= audio.length;) {
      const size = audio.readUInt32LE(p + 4);
      if (audio.toString("ascii", p, p + 4) === "data") { audio.writeUInt32LE(audio.length - p - 8, p + 4); break; }
      p += 8 + size + (size % 2);
    }
    cache.set(key, audio); if (cache.size > 24) cache.delete(cache.keys().next().value!);
    return audio;
  } finally { active--; }
}

/** Desktop playback goes straight to the user's PipeWire session. */
let stopPlayback: (() => void) | undefined;
export async function playPronunciation(audio: Buffer, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw new Error("Playback stopped.");
  if (!existsSync("/usr/bin/pw-play")) throw new Error("PipeWire playback is unavailable. · 系统音频播放不可用。");
  stopPlayback?.();
  await new Promise<void>((resolve, reject) => {
    const child = execFile("/usr/bin/pw-play", ["--media-role", "Notification", "-"], {
      timeout: 15000, maxBuffer: 64000,
    }, error => {
      signal.removeEventListener("abort", stop);
      if (stopPlayback === stop) stopPlayback = undefined;
      if (error) reject(new Error(signal.aborted ? "Playback stopped." : "System audio could not play. Check your output device. · 请检查音频输出设备。"));
      else resolve();
    });
    const stop = () => { child.kill("SIGTERM"); };
    stopPlayback = stop;
    signal.addEventListener("abort", stop, { once: true });
    child.stdin?.on("error", () => {});
    child.stdin?.end(audio);
    if (signal.aborted) stop();
  });
}
