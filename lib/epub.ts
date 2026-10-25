import { unzip, strFromU8, type Unzipped } from "fflate";
import { DOMParser, parseHTML } from "linkedom";
import { htmlToBlocks } from "./html-to-blocks";
import { slugify, tidyTitle, type Article, type Block } from "./article";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const xml = (text: string) => new DOMParser().parseFromString(text, "text/xml") as unknown as Document;
const elements = (root: ReturnType<typeof xml>, name: string) => Array.from(root.querySelectorAll("*")).filter((node) => node.localName.split(":").at(-1) === name);

/** Resolve archive-relative references without allowing remote resources or escaping the archive. */
function pathOf(href: string, base = ""): string {
  if (/^[a-z][a-z\d+.-]*:|^\/\//i.test(href)) throw new Error("This EPUB references content outside the book.");
  const path = decodeURIComponent(href.split(/[?#]/)[0]);
  const parts = path.startsWith("/") ? [] : base.split("/").slice(0, -1);
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") { if (!parts.length) throw new Error("Invalid EPUB resource path."); parts.pop(); }
    else parts.push(part);
  }
  return parts.join("/");
}

function dataUrl(bytes: Uint8Array, mime: string): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return `data:${mime};base64,${btoa(binary)}`;
}

/** Read EPUB 2/3 locally, in spine order, into the same annotatable blocks as articles. */
export async function epubToArticle(file: File, onProgress?: (fraction: number, label?: string) => void): Promise<Article> {
  onProgress?.(0, "Opening EPUB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let archive: Unzipped;
  try {
    archive = await new Promise((resolve, reject) => unzip(bytes, {
      filter: (entry) => !/\.(?:ttf|otf|woff2?|mp3|mp4|ogg|wav|webm)$/i.test(entry.name),
    }, (error, files) => error ? reject(error) : resolve(files)));
  } catch { throw new Error("Could not open this EPUB. It may be damaged or encrypted."); }
  const read = (path: string) => {
    if (!Object.hasOwn(archive, path)) throw new Error(`This EPUB is missing a required file: ${path}`);
    return strFromU8(archive[path]);
  };
  const container = xml(read("META-INF/container.xml"));
  const rootfile = elements(container, "rootfile").find((node) => node.getAttribute("media-type") === "application/oebps-package+xml") ?? elements(container, "rootfile")[0];
  const packagePath = pathOf(rootfile?.getAttribute("full-path") || "");
  if (!packagePath) throw new Error("This EPUB has no package document.");
  const pack = xml(read(packagePath));
  const metadata = (name: string) => elements(pack, name).map((node) => node.textContent?.trim()).filter(Boolean).join(", ");
  const manifest = new Map(elements(pack, "item").map((node) => [node.getAttribute("id"), node]));
  const spine = elements(pack, "itemref");
  if (!spine.length) throw new Error("This EPUB has no reading order.");
  const encrypted = new Set(archive["META-INF/encryption.xml"]
    ? elements(xml(read("META-INF/encryption.xml")), "CipherReference").map((node) => pathOf(node.getAttribute("URI") || "")) : []);
  const pictures = new Map<string, string>();
  for (const item of manifest.values()) {
    const mime = item.getAttribute("media-type") || "";
    if (!IMAGE_TYPES.has(mime)) continue;
    const path = pathOf(item.getAttribute("href") || "", packagePath);
    if (archive[path] && !encrypted.has(path)) pictures.set(path, dataUrl(archive[path], mime));
  }
  const coverId = elements(pack, "meta").find((node) => node.getAttribute("name") === "cover")?.getAttribute("content");
  const cover = Array.from(manifest.values()).find((node) => (node.getAttribute("properties") || "").split(/\s+/).includes("cover-image")) ?? manifest.get(coverId || "");
  const image = cover ? pictures.get(pathOf(cover.getAttribute("href") || "", packagePath)) : undefined;
  const blocks: Block[] = [];
  for (let index = 0; index < spine.length; index++) {
    let item = manifest.get(spine[index].getAttribute("idref"));
    const visited = new Set<string>();
    while (item && !["application/xhtml+xml", "text/html"].includes(item.getAttribute("media-type") || "")) {
      const fallback = item.getAttribute("fallback") || "";
      if (!fallback || visited.has(fallback)) throw new Error("This EPUB uses an unsupported chapter format.");
      visited.add(fallback); item = manifest.get(fallback);
    }
    if (!item) throw new Error("This EPUB has a missing chapter in its reading order.");
    const path = pathOf(item.getAttribute("href") || "", packagePath);
    if (encrypted.has(path)) throw new Error("This EPUB is DRM-protected. Import an unencrypted EPUB instead.");
    const { document } = parseHTML(read(path));
    // Parse only; scripts and book styles are never executed or inserted into the app.
    for (const node of document.querySelectorAll("script,style,iframe,object,embed,form")) node.remove();
    const embedded = new Map<string, string>();
    for (const img of document.querySelectorAll("img")) {
      try {
        const local = pathOf(img.getAttribute("src") || "", path);
        const picture = pictures.get(local);
        if (!picture) { img.remove(); continue; }
        const token = `https://epub.invalid/${encodeURIComponent(local)}`;
        embedded.set(token, picture);
        img.removeAttribute("srcset"); img.setAttribute("src", token);
      } catch { img.remove(); }
    }
    const chapter = htmlToBlocks(document.body);
    for (const block of chapter) {
      if (block.src) {
        const picture = embedded.get(block.src);
        if (!picture) continue;
        block.src = picture;
      }
      blocks.push({ ...block, id: `b${blocks.length + 1}` });
    }
    onProgress?.((index + 1) / spine.length, `Reading chapter ${index + 1} of ${spine.length}`);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  if (!blocks.length) throw new Error("This EPUB contains no readable content.");
  const title = metadata("title") || file.name.replace(/\.epub$/i, "");
  return { id: `${slugify(title)}-${crypto.randomUUID().slice(0, 8)}`, title, author: metadata("creator") || undefined, published: metadata("date") || undefined, source: file.name, origin: "file", addedAt: Date.now(), blocks, ...(image ? { image } : {}) };
}
