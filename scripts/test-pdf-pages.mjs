import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import init, { LiteParse } from "@llamaindex/liteparse-wasm";
import { openCompletePdf } from "../lib/pdf-session.ts";

// Small, real PDF with a distinct text marker on every page, beyond all old caps.
const count = 1001;
const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
const kids = [];
for (let page = 1; page <= count; page++) {
  const pageId = objects.length + 1;
  kids.push(`${pageId} 0 R`);
  objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageId + 1} 0 R >>`);
  const content = `BT /F1 12 Tf 40 700 Td (Page marker ${page}) Tj ET`;
  objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
}
objects[1] = `<< /Type /Pages /Count ${count} /Kids [${kids.join(" ")}] >>`;
let pdf = "%PDF-1.4\n";
const offsets = [0];
objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
const xref = pdf.length;
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
await init({ module_or_path: await readFile(new URL("../public/liteparse-2.15.1.wasm", import.meta.url)) });
const { parser, session, total } = await openCompletePdf({ LiteParse }, new TextEncoder().encode(pdf));
try {
  assert.equal(total, count);
  const pages = [];
  for (let batch = await session.nextBatch(); batch; batch = await session.nextBatch()) pages.push(...batch.result.pages);
  assert.equal(pages.length, count);
  assert.equal(pages.at(-1).pageNum, count);
  assert.match(JSON.stringify(pages.at(-1)), /Page marker 1001/);
  console.log("PASS: all 1,001 PDF pages extracted, including final-page text, without AI credentials.");
} finally { session.free(); parser.free(); }
