"use client";

/**
 * "Read it more carefully": the PDF behind a text, read again by the configured vision model
 * through /api/pdf-page, for layouts the free reader gets wrong (columns,
 * tables, maths, scans). No page cap; the provider must support images.
 */

import { markdownBlocks, wordCount, type Article } from "./article";
import { providerHeaders } from "./provider-config";
import { htmlTablesToMarkdown, stitchBlocks, pdfPageCount, renderPages } from "./pdf";
import { loadDoc, loadPdf, useStore } from "./store";

export type CarefulResult = { ok: true; article: Article } | { ok: false; error: string; needKey?: boolean };

const same = (a: string, b: string) => a.replace(/\W+/g, "").toLowerCase() === b.replace(/\W+/g, "").toLowerCase();

export async function readCarefully(shown: Article, signal?: AbortSignal): Promise<CarefulResult> {
  // The reader shows a display copy; the new reading builds on the stored original.
  const article = (await loadDoc(shown.id)) ?? shown;
  const pdf = await loadPdf(article.id);
  if (!pdf) return { ok: false, error: "The PDF is not on this device. Open it again from the file to read it carefully." };
  const bytes = new Uint8Array(await pdf.arrayBuffer());
  const pages: string[] = [];
  try {
    const count = await pdfPageCount(bytes);
    for (let page = 1; page <= count; page += 3) {
      if (signal?.aborted) return { ok: false, error: "Stopped." };
      const numbers = Array.from({ length: Math.min(3, count - page + 1) }, (_, i) => page + i);
      const shots = await renderPages(bytes, numbers);
      if (shots.length !== numbers.length) return { ok: false, error: "Some pages could not be rendered. The text is unchanged." };
      const batch = await Promise.all(shots.sort((a, b) => a.pageNum - b.pageNum).map(async (shot) => {
        const response = await fetch("/api/pdf-page", {
          method: "POST", headers: { "Content-Type": "application/json", ...providerHeaders() },
          body: JSON.stringify({ image: shot.image, mode: "layout" }), signal,
        });
        const result = await response.json();
        if (!response.ok || !result.markdown?.trim()) throw new Error(result.error || `Page ${shot.pageNum} could not be read. The text is unchanged.`);
        return result.markdown as string;
      }));
      pages.push(...batch);
    }
  } catch (error) {
    return { ok: false, error: signal?.aborted ? "Stopped." : error instanceof Error ? error.message : "Could not read the PDF. The text is unchanged." };
  }

  let blocks = stitchBlocks(pages.flatMap((md) => markdownBlocks(htmlTablesToMarkdown(md))));
  // The title is already shown above the text.
  if (blocks[0] && (blocks[0].type === "h2" || blocks[0].type === "h3") && same(blocks[0].runs.map((r) => r.text).join(""), article.title)) blocks = blocks.slice(1);
  if (!blocks.some((b) => b.type === "p")) return { ok: false, error: "The careful reading came back empty. The text is unchanged." };
  // Ids from separate pages would collide; number them again in reading order.
  blocks = blocks.map((b, i) => ({ ...b, id: `b${i + 1}` }));

  const next: Article = { ...article, blocks };
  if (!(await useStore.getState().replaceText(next, wordCount(next)))) return { ok: false, error: "This browser's storage is full. The text is unchanged." };
  window.dispatchEvent(new CustomEvent("gloss:text-replaced", { detail: next }));
  return { ok: true, article: next };
}
