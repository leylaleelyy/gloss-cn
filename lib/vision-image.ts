"use client";

/**
 * Book pictures are often scanned at print resolution. Vision models bill by
 * image size, so a large inline picture is reduced once and reused for every
 * follow-up question. Remote URLs are left alone: the provider fetches those.
 */
const cache = new Map<string, string>();
const MAX_EDGE = 1280;

const keyOf = (src: string) => `${src.length}:${src.slice(0, 64)}:${src.slice(-64)}`;

export async function shrinkImageForVision(src: string): Promise<string> {
  if (!src.startsWith("data:image/")) return src;
  const key = keyOf(src);
  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not read the picture."));
      img.src = src;
    });
    const longest = Math.max(image.naturalWidth, image.naturalHeight);
    if (!longest || longest <= MAX_EDGE) {
      cache.set(key, src);
      return src;
    }
    const scale = MAX_EDGE / longest;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) return src;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const shrunk = canvas.toDataURL("image/jpeg", 0.82);
    const result = shrunk.length < src.length ? shrunk : src;
    if (cache.size >= 20) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, result);
    return result;
  } catch {
    return src;
  }
}
