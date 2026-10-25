import type { LiteParse } from "@llamaindex/liteparse-wasm";

type ParserLibrary = { LiteParse: typeof LiteParse };

/** Discover the document size before constructing a parser, whose default caps it at 1,000 pages. */
export async function countPdfPages(lp: ParserLibrary, bytes: Uint8Array): Promise<number> {
  const probe = new lp.LiteParse({ ocrEnabled: false, quiet: true, maxPages: 1 });
  try {
    const session = await probe.openBatchSession(bytes, 1);
    try { return session.totalPages; } finally { session.free(); }
  } finally { probe.free(); }
}

export async function openCompletePdf(lp: ParserLibrary, bytes: Uint8Array) {
  const total = await countPdfPages(lp, bytes);
  const parser = new lp.LiteParse({ ocrEnabled: false, outputFormat: "json", extractBlocks: true, imageMode: "off", quiet: true, maxPages: total });
  try {
    return { parser, session: await parser.openBatchSession(bytes, 25), total };
  } catch (error) {
    parser.free();
    throw error;
  }
}
