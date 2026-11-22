export type AnswerPart = { kind: "p" | "ul" | "ol" | "heading" | "quote" | "code" | "hr" | "table"; lines: string[]; level?: number; start?: number };
const heading = /^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/;
const list = /^\s*(?:([-*•])|(\d+)[.)])\s+(.+)$/;
const divider = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const tableRule = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;
export const tableCells = (line: string) => line.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, "|"));

/** A safe, streaming-tolerant block parser; inline content is rendered as React text. */
export function parseAnswerBlocks(text: string): AnswerPart[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const parts: AnswerPart[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const fence = line.match(/^\s*(`{3,}|~{3,})[^`~]*$/);
    if (fence) {
      const body: string[] = []; i++;
      while (i < lines.length && !new RegExp(`^\\s*${fence[1][0]}{${fence[1].length},}\\s*$`).test(lines[i])) body.push(lines[i++]);
      if (i < lines.length) i++;
      parts.push({ kind: "code", lines: body }); continue;
    }
    const h = line.match(heading);
    if (h) { parts.push({ kind: "heading", level: h[1].length, lines: [h[2]] }); i++; continue; }
    if (i + 1 < lines.length && line.includes("|") && tableRule.test(lines[i + 1])) {
      const body = [line]; i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) body.push(lines[i++]);
      parts.push({ kind: "table", lines: body }); continue;
    }
    if (divider.test(line)) { parts.push({ kind: "hr", lines: [] }); i++; continue; }
    if (/^\s*>/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ""));
      parts.push({ kind: "quote", lines: [body.join(" ")] }); continue;
    }
    const item = line.match(list);
    if (item) {
      const kind = item[2] ? "ol" : "ul";
      const body: string[] = [];
      while (i < lines.length) {
        const next = lines[i].match(list);
        if (!next || (next[2] ? "ol" : "ul") !== kind) break;
        body.push(next[3]); i++;
      }
      parts.push({ kind, lines: body, ...(kind === "ol" ? { start: Number(item[2]) } : {}) }); continue;
    }
    const body = [line]; i++;
    while (i < lines.length && lines[i].trim() && !heading.test(lines[i]) && !list.test(lines[i]) && !divider.test(lines[i]) && !/^\s*(>|`{3,}|~{3,})/.test(lines[i]) && !(lines[i].includes("|") && tableRule.test(lines[i + 1] ?? ""))) body.push(lines[i++]);
    parts.push({ kind: "p", lines: [body.join(" ")] });
  }
  return parts;
}

/**
 * While an answer streams in, everything before the last blank line is already
 * settled. Parse that prefix once and only re-parse the growing tail. Any code
 * fence opts out, since blank lines inside it are not block boundaries.
 */
const prefixCache = new Map<string, AnswerPart[]>();

export function parseAnswerBlocksProgressive(text: string): AnswerPart[] {
  if (!text.includes("\n\n") || text.includes("```") || text.includes("~~~")) return parseAnswerBlocks(text);
  const cut = text.lastIndexOf("\n\n");
  const prefix = text.slice(0, cut + 2);
  const tail = text.slice(cut + 2);
  let settled = prefixCache.get(prefix);
  if (!settled) {
    settled = parseAnswerBlocks(prefix);
    if (prefixCache.size >= 24) {
      const oldest = prefixCache.keys().next().value;
      if (oldest !== undefined) prefixCache.delete(oldest);
    }
    prefixCache.set(prefix, settled);
  }
  return tail ? [...settled, ...parseAnswerBlocks(tail)] : settled;
}
