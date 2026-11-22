import type { ResponseLanguage } from "./response-language";
import type { ModelKey } from "./models";
import type { UILanguage } from "./ui-lang";

/** Highlighter colours. */
export type Marker = "yellow" | "green" | "blue" | "pink";
export const MARKERS: { key: Marker; label: string; color: string }[] = [
  { key: "yellow", label: "Yellow", color: "#f2c438" },
  { key: "green", label: "Green", color: "#7cc66f" },
  { key: "blue", label: "Blue", color: "#6aa8f0" },
  { key: "pink", label: "Pink", color: "#f084ac" },
];

/** Reading faces. Literata and Atkinson load only when picked. */
export const FACES: { key: Settings["face"]; label: string; css: string }[] = [
  { key: "serif", label: "Serif", css: "var(--font-serif)" },
  { key: "book", label: "Book", css: "var(--font-book)" },
  { key: "sans", label: "Sans", css: "var(--font-sans)" },
  { key: "legible", label: "Legible", css: "var(--font-legible)" },
  { key: "dyslexie", label: "Dyslexie", css: '"Gloss Dyslexie", sans-serif' },
  { key: "huiwen", label: "汇文明朝体", css: '"Gloss Huiwen", serif' },
  { key: "arphic", label: "文鼎书苑宋", css: '"Gloss Arphic", serif' },
];

/** Everything a reader can tune. Applied to <html> as data attributes and CSS variables. */
export type Settings = {
  theme: "auto" | "paper" | "sepia" | "snow" | "night" | "ink";
  pen: "vermilion" | "cobalt" | "moss" | "graphite";
  face: "serif" | "book" | "sans" | "legible" | "dyslexie" | "huiwen" | "arphic";
  size: number;
  leading: "tight" | "normal" | "loose";
  width: "narrow" | "normal" | "wide";
  align: "left" | "justify";
  paras: "spaced" | "indented";
  marker: Marker;
  responseLanguage: ResponseLanguage;
  length: "short" | "normal" | "long";
  model: ModelKey;
  /** The reader's interface language. English is the default; Chinese is optional. */
  uiLanguage: UILanguage;
  /**
   * Let answers look things up on the web: the model gets a search tool and decides when to use it.
   * On by default. (It replaced "web", an opt-in toggle, so older saved settings start on.)
   */
  search: boolean;
  numbers: boolean;
  rail: boolean;
  /** Read aloud. Off by default: when on, a listen button joins the reader's top bar. */
  listen: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  theme: "auto",
  pen: "vermilion",
  face: "serif",
  size: 20,
  leading: "normal",
  width: "normal",
  align: "left",
  paras: "spaced",
  marker: "yellow",
  responseLanguage: "zh-CN",
  length: "normal",
  model: "flash",
  uiLanguage: "en",
  search: true,
  numbers: false,
  rail: true,
  listen: false,
};

/** Swatch colours for the settings panel. The real palettes live in globals.css. */
export const THEMES: { key: Settings["theme"]; label: string; bg: string; fg: string; dark: boolean }[] = [
  { key: "auto", label: "Auto", bg: "#f6f3ec", fg: "#1d1b18", dark: false },
  { key: "paper", label: "Paper", bg: "#f6f3ec", fg: "#1d1b18", dark: false },
  { key: "sepia", label: "Sepia", bg: "#f1e6cf", fg: "#33281b", dark: false },
  { key: "snow", label: "Snow", bg: "#ffffff", fg: "#141518", dark: false },
  { key: "night", label: "Night", bg: "#151412", fg: "#e9e3d6", dark: true },
  { key: "ink", label: "Ink", bg: "#0f1319", fg: "#e3e8f0", dark: true },
];

export const PENS: { key: Settings["pen"]; label: string; light: string; dark: string }[] = [
  { key: "vermilion", label: "Vermilion", light: "#c1401b", dark: "#ef7a50" },
  { key: "cobalt", label: "Cobalt", light: "#2c58c9", dark: "#86a8ff" },
  { key: "moss", label: "Moss", light: "#3b7a3d", dark: "#8fc68c" },
  { key: "graphite", label: "Graphite", light: "#4b4a47", dark: "#cfc9bd" },
];

export const LEADING: Record<Settings["leading"], number> = { tight: 1.5, normal: 1.64, loose: 1.82 };
export const MEASURE: Record<Settings["width"], number> = { narrow: 28, normal: 32, wide: 37 };
export const LENGTH_WORDS: Record<Settings["length"], number> = { short: 50, normal: 90, long: 180 };

export const SETTINGS_KEY = "gloss:settings";

export const BOOK_FACE_PREFIX = "gloss:book-face:";
export function bookFace(id: string | null): Settings["face"] | null {
  if (!id || typeof window === "undefined") return null;
  try {
    const face = localStorage.getItem(BOOK_FACE_PREFIX + id);
    return FACES.some(f => f.key === face) ? face as Settings["face"] : null;
  } catch { return null; }
}
export function readingBook(path: string): string | null {
  const match = /^\/read\/([^/]+)\/?$/.exec(path);
  try { return match ? decodeURIComponent(match[1]) : null; } catch { return null; }
}
export const BOOK_SETTINGS_PREFIX = "gloss:book-settings:";
export const BOOK_KEYS = ["face", "size", "leading", "width", "align", "paras"] as const;
export type BookSettings = Pick<Settings, typeof BOOK_KEYS[number]>;
export function cleanBookSettings(value: unknown): Partial<BookSettings> {
  if (!value || typeof value !== "object") return {};
  const v = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  const choices: Record<string, readonly string[]> = {
    face: ["serif", "book", "sans", "legible", "dyslexie", "huiwen", "arphic"],
    leading: ["tight", "normal", "loose"], width: ["narrow", "normal", "wide"],
    align: ["left", "justify"], paras: ["spaced", "indented"],
  };
  for (const [key, values] of Object.entries(choices)) {
    if (typeof v[key] === "string" && values.includes(v[key] as string)) result[key] = v[key];
  }
  if (typeof v.size === "number" && Number.isFinite(v.size) && v.size >= 15 && v.size <= 28) result.size = v.size;
  return result as Partial<BookSettings>;
}
export function bookSettings(id: string | null): Partial<BookSettings> {
  if (!id || typeof window === "undefined") return {};
  const face = bookFace(id);
  let saved = {};
  try { saved = cleanBookSettings(JSON.parse(localStorage.getItem(BOOK_SETTINGS_PREFIX + id) || "{}")); } catch {}
  return { ...(face ? { face } : {}), ...saved };
}
export function bookSettingsSnapshot(id: string | null): string {
  return JSON.stringify(bookSettings(id));
}
export function saveBookSettings(id: string, patch: Partial<BookSettings>) {
  localStorage.setItem(BOOK_SETTINGS_PREFIX + id, JSON.stringify({ ...bookSettings(id), ...cleanBookSettings(patch) }));
  window.dispatchEvent(new Event("gloss:book-settings"));
}

export function resolveTheme(theme: Settings["theme"]): Exclude<Settings["theme"], "auto"> {
  if (theme !== "auto") return theme;
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "night" : "paper";
}

export function applySettings(s: Settings) {
  s = { ...s, ...bookSettings(readingBook(window.location.pathname)) };
  const el = document.documentElement;
  el.dataset.theme = resolveTheme(s.theme);
  el.dataset.pen = s.pen;
  el.dataset.face = s.face;
  el.dataset.align = s.align;
  el.dataset.paras = s.paras;
  el.dataset.lang = s.uiLanguage === "zh" ? "zh" : "en";
  el.lang = el.dataset.lang;
  el.style.setProperty("--read-size", `${s.size}px`);
  el.style.setProperty("--leading", String(LEADING[s.leading]));
  el.style.setProperty("--measure-k", String(MEASURE[s.width]));
}

/**
 * Non-secret choices that follow the account. Appearance that depends on the
 * device (size, face, measure, spacing) intentionally stays local.
 */
export const SYNCED_SETTING_KEYS = [
  "theme",
  "pen",
  "marker",
  "responseLanguage",
  "length",
  "uiLanguage",
  "search",
  "numbers",
  "rail",
  "listen",
] as const;

export type SyncedSettings = Pick<Settings, typeof SYNCED_SETTING_KEYS[number]>;

const LENGTHS = ["short", "normal", "long"];
const RESPONSE_LANGUAGES = ["zh-CN", "zh-TW", "en", "ja", "ko", "auto"];

/** The synced subset of a full settings object. */
export function syncedSettings(s: Settings): SyncedSettings {
  return Object.fromEntries(SYNCED_SETTING_KEYS.map((key) => [key, s[key]])) as SyncedSettings;
}

/** A remote settings row, cleaned so a bad value can never reach <html> or the reader. */
export function cleanSyncedSettings(value: unknown): Partial<SyncedSettings> {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const out: Partial<SyncedSettings> = {};
  if (THEMES.some((theme) => theme.key === raw.theme)) out.theme = raw.theme as Settings["theme"];
  if (PENS.some((pen) => pen.key === raw.pen)) out.pen = raw.pen as Settings["pen"];
  if (MARKERS.some((marker) => marker.key === raw.marker)) out.marker = raw.marker as Marker;
  if (RESPONSE_LANGUAGES.includes(raw.responseLanguage as string)) out.responseLanguage = raw.responseLanguage as ResponseLanguage;
  if (LENGTHS.includes(raw.length as string)) out.length = raw.length as Settings["length"];
  if (raw.uiLanguage === "en" || raw.uiLanguage === "zh") out.uiLanguage = raw.uiLanguage;
  for (const key of ["search", "numbers", "rail", "listen"] as const) {
    if (typeof raw[key] === "boolean") out[key] = raw[key] as boolean;
  }
  return out;
}

/**
 * The same thing as applySettings, as an inline script for <head>, so the
 * first paint already has the reader's theme, pen and type. Kept in sync by hand.
 */
export const BOOT_SCRIPT = `try{var s=JSON.parse(localStorage.getItem("${SETTINGS_KEY}")||"{}"),e=document.documentElement,t=s.theme||"auto";if(t==="auto")t=matchMedia("(prefers-color-scheme: dark)").matches?"night":"paper";e.dataset.webkit=window.nsh?"true":"false";e.dataset.theme=t;e.dataset.lang=s.uiLanguage==="zh"?"zh":"en";e.lang=e.dataset.lang;e.dataset.pen=s.pen||"vermilion";var m=/^\\/read\\/([^/]+)\\/?$/.exec(location.pathname),f=m?localStorage.getItem("${BOOK_FACE_PREFIX}"+decodeURIComponent(m[1])):null;if(${JSON.stringify(FACES.map(f => f.key))}.includes(f))s.face=f;try{if(m)Object.assign(s,(${cleanBookSettings.toString()})(JSON.parse(localStorage.getItem("${BOOK_SETTINGS_PREFIX}"+decodeURIComponent(m[1]))||"{}")))}catch(_){}e.dataset.face=s.face||"serif";e.dataset.align=s.align||"left";e.dataset.paras=s.paras||"spaced";if(s.size)e.style.setProperty("--read-size",s.size+"px");var L={tight:1.5,normal:1.64,loose:1.82},M={narrow:28,normal:32,wide:37};if(s.leading)e.style.setProperty("--leading",L[s.leading]);if(s.width)e.style.setProperty("--measure-k",M[s.width])}catch(x){}`;
