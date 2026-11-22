import { normalizeUrl } from "./links";

type Identifiable = {
  title: string;
  author?: string;
  sourceUrl?: string;
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
 * URL; files and pastes compare by title, author and length.
 */
export function libraryKey(item: Identifiable): string {
  if (item.sourceUrl) return `url:${normalizeUrl(item.sourceUrl)}`;
  return `text:${clean(item.title)}|${clean(item.author ?? "")}|${item.words ?? ""}`;
}
