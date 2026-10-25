import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { zipSync, strToU8 } from "fflate";
registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith(".") && context.parentURL && !/\.[a-z]+$/i.test(specifier)) {
    const candidate = new URL(specifier + ".ts", context.parentURL);
    if (existsSync(candidate)) return next(candidate.href, context);
  }
  return next(specifier, context);
} });
const { epubToArticle } = await import("../lib/epub.ts");
const container = '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="Books/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>';
const pack = '<package version="3.0" xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>EPUB 测试</dc:title><dc:creator>Test Author</dc:creator></metadata><manifest><item id="two" href="Text/second.xhtml" media-type="application/xhtml+xml"/><item id="one" href="Text/first%20chapter.xhtml" media-type="application/xhtml+xml"/><item id="cover" href="Images/cover.png" media-type="image/png" properties="cover-image"/></manifest><spine><itemref idref="one"/><itemref idref="two"/></spine></package>';
const fixture = {
  mimetype: strToU8("application/epub+zip"),
  "META-INF/container.xml": strToU8(container),
  "Books/package.opf": strToU8(pack),
  "Books/Text/first chapter.xhtml": strToU8('<html xmlns="http://www.w3.org/1999/xhtml"><head><title>First</title></head><body><h1>Chapter One</h1><p>第一章 <em>italic</em> and <strong>bold</strong>.</p><img src="../Images/cover.png"/><script>BAD SCRIPT</script><img src="https://tracker.example/track.png"/></body></html>'),
  "Books/Text/second.xhtml": strToU8('<html><body><h2>Chapter Two</h2><p>Last chapter text.</p></body></html>'),
  "Books/Images/cover.png": Uint8Array.from([137,80,78,71,13,10,26,10]),
};
const file = (entries) => new File([zipSync(entries)], "fixture.epub", { type: "application/epub+zip" });
const book = await epubToArticle(file(fixture));
assert.equal(book.title, "EPUB 测试"); assert.equal(book.author, "Test Author");
const text = book.blocks.flatMap((block) => block.runs.map((run) => run.text)).join(" ");
assert.ok(text.indexOf("Chapter One") < text.indexOf("Chapter Two"));
assert.match(text, /第一章/); assert.match(text, /Last chapter text/); assert.doesNotMatch(text, /BAD SCRIPT/);
assert.ok(book.blocks.some((block) => block.runs.some((run) => run.em)));
assert.ok(book.blocks.some((block) => block.runs.some((run) => run.strong)));
assert.ok(book.image.startsWith("data:image/png;base64,"));
assert.equal(book.blocks.filter((block) => block.type === "figure").length, 1);
assert.ok(book.blocks.find((block) => block.type === "figure").src.startsWith("data:"));
assert.equal(new Set(book.blocks.map((block) => block.id)).size, book.blocks.length);
const missing = { ...fixture }; delete missing["Books/Text/second.xhtml"];
await assert.rejects(epubToArticle(file(missing)), /missing a required file/);
await assert.rejects(epubToArticle(file({ ...fixture, "META-INF/encryption.xml": strToU8('<encryption><EncryptedData><CipherData><CipherReference URI="Books/Text/second.xhtml"/></CipherData></EncryptedData></encryption>') })), /DRM-protected/);
const v2 = { ...fixture, "Books/package.opf": strToU8(pack.replace('version="3.0"', 'version="2.0"').replace('<dc:creator>', '<dc:creator>')) };
assert.equal((await epubToArticle(file(v2))).blocks.length, book.blocks.length);
await assert.rejects(epubToArticle(new File(["not a zip"], "bad.epub")), /damaged or encrypted/);
await writeFile('/tmp/gloss-epub-fixture.epub', new Uint8Array(await file(fixture).arrayBuffer()));
console.log("PASS: EPUB 2/3 metadata, Chinese text, spine order, formatting, embedded images, unique anchors, missing chapters, DRM and corrupt archives.");
