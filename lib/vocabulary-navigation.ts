/** Only return to a page within Gloss, never a supplied external URL. */
export function vocabularyReturn(value: string | null, origin: string): string {
  if (!value) return "/library";
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || url.pathname.startsWith("//") || url.pathname.replace(/\/+$/, "") === "/vocabulary") return "/library";
    return url.pathname + url.search + url.hash;
  } catch { return "/library"; }
}
