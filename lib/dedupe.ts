import { normalizeUrl } from "./links";

type Identifiable = {
  title: string;
  author?: string;
  /** The imported file's original name, for texts that arrived as files. */
  source?: string;
  sourceUrl?: string;
  origin?: string;
  words?: number;
};

const clean = (value: string) =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, " ")
    .trim();

/**
 * One text, even when it arrived on two devices: links compare by normalized
 * URL; imported files by title, author and original filename; pastes and
 * anything without a stable origin by title, author and length.
 */
export function libraryKey(item: Identifiable): string {
  if (item.sourceUrl) return `url:${normalizeUrl(item.sourceUrl)}`;
  if (item.origin === "file" && item.source) return `file:${clean(item.title)}|${clean(item.author ?? "")}|${clean(item.source)}`;
  return `text:${clean(item.title)}|${clean(item.author ?? "")}|${item.words ?? ""}`;
}
