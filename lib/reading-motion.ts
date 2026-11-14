/** Respect the reader's system motion preference during navigation. */
export function readingScrollBehavior(): ScrollBehavior {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
}
