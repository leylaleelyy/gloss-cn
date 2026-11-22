"use client";

import { create } from "zustand";
import type { Analysis, Definition, LearningPreferences, VocabularyEntry } from "./learning";
import type { Action } from "./actions";
import type { Article, BriefData } from "./article";
import { modelOf, type ModelKey, type Source, type Usage } from "./models";
import { responseLanguage } from "./response-language";
import { libraryKey } from "./dedupe";
import { markArticleDeleted } from "./sync-deletions";
import { DEFAULT_SETTINGS, SETTINGS_KEY, type Marker, type Settings } from "./settings";
import { isUILanguage } from "./ui-lang";

/** A point in the text: block id and a character offset into its plain text. */
export type Point = { b: string; o: number };
export type Anchor = { start: Point; end: Point; quote: string };

export type Turn = {
  /** Structured learning answer, persisted alongside its readable transcript. */
  analysis?: Analysis;
  definition?: Definition;
  role: "user" | "assistant";
  content: string;
  usage?: Usage;
  model?: string;
  modelKey?: ModelKey;
  /** The reader needs their own key to continue: free answers are spent, or there is no shared key. */
  needKey?: boolean;
  /** Looking things up on the web before the answer starts. */
  searching?: boolean;
  /** The web results this answer may cite as [1], [2]. */
  sources?: Source[];
  error?: string;
  truncated?: boolean;
  streaming?: boolean;
};

export type Gloss = {
  id: string;
  articleId: string;
  /** Anchored to a selection... */
  anchor?: Anchor;
  /** ...or asked about the whole text from a reading position (a block id). */
  at?: string;
  /** Figure block retained for visual follow-up and retry without duplicating image bytes. */
  imageBlock?: string;
  action: Action;
  question?: string;
  turns: Turn[];
  createdAt: number;
};

/**
 * Where a highlight stands in the daily review: when it is next due, how many
 * times it has come round, when it was last seen, and whether it was retired.
 */
export type Review = { due: number; step: number; last: number; off?: boolean };

export type Highlight = { id: string; articleId: string; anchor: Anchor; createdAt: number; color?: Marker; note?: string; review?: Review };

export type BriefState =
  | { status: "loading" }
  | { status: "ready"; data: BriefData; usage?: Usage; modelKey?: ModelKey; at: number }
  | { status: "error"; error: string; needKey?: boolean };

export type { Settings } from "./settings";

export type LibraryItem = {
  id: string;
  title: string;
  author?: string;
  source?: string;
  words: number;
  origin: Article["origin"];
  addedAt: number;
  /** Bumped when the text itself is replaced (read more carefully), so sync sends it again. */
  rev?: number;
  /* The library: where it is shelved, and what it looks like there. */
  /** One of the library's topics (lib/library.ts); missing until it has been sorted. */
  topic?: string;
  tags?: string[];
  /** What the painted cover shows, written when the text is sorted. */
  scene?: string;
  dek?: string;
  year?: number;
  sourceUrl?: string;
  /** The page's own lead picture. */
  image?: string;
  /** A painted cover: a bundled one by path, or "painted" for one made for this text. */
  cover?: string;
  /** When the text itself last changed on the account, so other devices refresh their copy. */
  docAt?: number;
  favorite?: boolean;
  /** When it was first read to the end. */
  finishedAt?: number;
  /** Shelved by an agent, through the Gloss MCP server. */
  addedBy?: "agent";
  /** Which connection an agent saved it through, by the name the reader gave it. */
  addedVia?: string;
};

export type Progress = { block: string; pct: number; at: number };

/** A row from the account, as the sync route sends it. `data` is null on a tombstone. */
export type RemoteRow<T> = { id: string; articleId: string; data: T | null; deleted: boolean; hasDoc?: boolean };
export type RemoteChanges = {
  articles?: RemoteRow<LibraryItem>[];
  highlights?: RemoteRow<Highlight>[];
  glosses?: RemoteRow<Gloss>[];
  briefs?: RemoteRow<BriefState>[];
  progress?: RemoteRow<Progress>[];
  vocabulary?: RemoteRow<VocabularyEntry>[];
  learning?: RemoteRow<LearningPreferences>[];
  settings?: RemoteRow<Partial<Settings>>[];
};

type Persisted = {
  glosses: Record<string, Gloss[]>;
  highlights: Record<string, Highlight[]>;
  briefs: Record<string, BriefState>;
  progress: Record<string, Progress>;
  library: LibraryItem[];
};

type UI = {
  hydrated: boolean;
  activeGloss: string | null;
  hoverGloss: string | null;
  enteringGloss: string | null;
  activeHighlight: string | null;
  /** Just created: its mark is drawn on rather than appearing. */
  enteringHighlight: string | null;
  notebookOpen: boolean;
  shortcutsOpen: boolean;
  focusMode: boolean;
  cursor: string | null;
  briefOpen: boolean;
  /** The passage a question is being typed about, shown while the native selection is gone. */
  pending: Anchor | null;
  /** The whole shelf, pulled up over the desk: its texts, or every highlight across them. */
  shelf: null | "texts" | "highlights";
};

type State = Persisted &
  UI & {
    settings: Settings;
    hydrate: () => void;
    setSettings: (s: Partial<Settings>) => void;
    setUI: (u: Partial<UI>) => void;
    addGloss: (g: Gloss) => void;
    updateGloss: (articleId: string, id: string, fn: (g: Gloss) => Gloss) => void;
    removeGloss: (articleId: string, id: string) => void;
    addHighlight: (h: Highlight) => void;
    updateHighlight: (articleId: string, id: string, patch: Partial<Highlight>) => void;
    removeHighlight: (articleId: string, id: string) => void;
    setBrief: (articleId: string, b: BriefState | null) => void;
    setProgress: (articleId: string, p: Progress) => void;
    addToLibrary: (a: Article, words: number, extra?: Partial<LibraryItem>) => void;
    /** Fold shelf entries that are the same text into one, carrying every mark and reading position over. */
    dedupeLibrary: () => boolean;
    /** Change a shelf entry's library fields: its topic, tags, cover, favourite. */
    shelve: (id: string, patch: Partial<LibraryItem>) => void;
    removeFromLibrary: (id: string) => void;
    replaceText: (a: Article, words: number) => Promise<boolean>;
    updateText: (a: Article, words: number) => Promise<boolean>;
    applyRemote: (c: RemoteChanges) => void;
  };

const KEY = "gloss:v1";
const DOC_PREFIX = "gloss:doc:";
/** Per-article shards. Streaming rewrites only the article that changed, and one article never crowds the rest out of the quota. */
const V2 = {
  glosses: "gloss:v2:glosses:",
  highlights: "gloss:v2:highlights:",
  briefs: "gloss:v2:briefs:",
  progress: "gloss:v2:progress:",
  library: "gloss:v2:library",
} as const;


export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const useStore = create<State>((set, get) => ({
  glosses: {},
  highlights: {},
  briefs: {},
  progress: {},
  library: [],
  settings: DEFAULT_SETTINGS,
  hydrated: false,
  activeGloss: null,
  hoverGloss: null,
  enteringGloss: null,
  activeHighlight: null,
  enteringHighlight: null,
  notebookOpen: false,
  shortcutsOpen: false,
  focusMode: false,
  cursor: null,
  briefOpen: true,
  pending: null,
  shelf: null,

  hydrate: () => {
    if (get().hydrated) return;
    let data: Partial<Persisted> = {};
    let settings: Partial<Settings> = {};
    let legacy = false;
    try {
      settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    } catch {}
    const v2 = readV2();
    let legacyData: Partial<Persisted> | null = null;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw !== null) legacyData = JSON.parse(raw) as Partial<Persisted>;
    } catch {}
    if (legacyData) {
      // Finish a migration that was interrupted, or moved over from an older build:
      // shards already written win; anything only in the legacy blob is kept.
      const merge = <T extends { id: string }>(sharded: Record<string, T[]> = {}, old: Record<string, T[]> = {}) => {
        const out = { ...old, ...sharded };
        for (const [id, list] of Object.entries(sharded)) {
          const seen = new Set(list.map((x) => x.id));
          out[id] = [...list, ...(old[id] ?? []).filter((x) => !seen.has(x.id))];
        }
        return out;
      };
      const mergeMap = <T>(sharded: Record<string, T> = {}, old: Record<string, T> = {}) => ({ ...old, ...sharded });
      data = {
        glosses: merge(v2.data.glosses, legacyData.glosses),
        highlights: merge(v2.data.highlights, legacyData.highlights),
        briefs: mergeMap(v2.data.briefs, legacyData.briefs),
        progress: mergeMap(v2.data.progress, legacyData.progress),
        library: v2.data.library?.length ? v2.data.library : legacyData.library ?? [],
      };
      legacy = true;
    } else {
      data = v2.data;
    }
    // A reload mid-answer leaves a dangling stream: mark it, never spin forever.
    const glosses = data.glosses ?? {};
    for (const list of Object.values(glosses)) {
      for (const g of list) {
        for (const t of g.turns) {
          if (t.streaming) {
            t.streaming = false;
            if (!t.content) t.error = "Interrupted. Ask again to retry.";
          }
        }
      }
    }
    const briefs = data.briefs ?? {};
    for (const [k, b] of Object.entries(briefs)) if (b.status !== "ready") delete briefs[k];
    set({
      glosses,
      highlights: data.highlights ?? {},
      briefs,
      progress: data.progress ?? {},
      library: data.library ?? [],
      settings: { ...DEFAULT_SETTINGS, ...settings, responseLanguage: responseLanguage(settings.responseLanguage), model: modelOf(settings.model), uiLanguage: isUILanguage(settings.uiLanguage) ? settings.uiLanguage : "en" },
      hydrated: true,
    });
    if (legacy) {
      // Move the legacy single key into per-article shards, once.
      try {
        writeAllV2(get());
        localStorage.removeItem(KEY);
      } catch {}
    }
    get().dedupeLibrary();
    void migrateDocs();
  },

  setSettings: (s) => {
    const settings = { ...get().settings, ...s };
    set({ settings });
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {}
  },

  setUI: (u) => set(u),

  addGloss: (g) =>
    set((st) => ({
      glosses: { ...st.glosses, [g.articleId]: [...(st.glosses[g.articleId] ?? []), g] },
      activeGloss: g.id,
      enteringGloss: g.id,
    })),

  updateGloss: (articleId, id, fn) =>
    set((st) => ({
      glosses: { ...st.glosses, [articleId]: (st.glosses[articleId] ?? []).map((g) => (g.id === id ? fn(g) : g)) },
    })),

  removeGloss: (articleId, id) =>
    set((st) => ({
      glosses: { ...st.glosses, [articleId]: (st.glosses[articleId] ?? []).filter((g) => g.id !== id) },
      activeGloss: st.activeGloss === id ? null : st.activeGloss,
      hoverGloss: st.hoverGloss === id ? null : st.hoverGloss,
    })),

  addHighlight: (h) => {
    set((st) => ({ highlights: { ...st.highlights, [h.articleId]: [...(st.highlights[h.articleId] ?? []), h] }, enteringHighlight: h.id }));
    setTimeout(() => get().enteringHighlight === h.id && set({ enteringHighlight: null }), 700);
  },

  updateHighlight: (articleId, id, patch) =>
    set((st) => ({
      highlights: { ...st.highlights, [articleId]: (st.highlights[articleId] ?? []).map((h) => (h.id === id ? { ...h, ...patch } : h)) },
    })),

  removeHighlight: (articleId, id) =>
    set((st) => ({
      highlights: { ...st.highlights, [articleId]: (st.highlights[articleId] ?? []).filter((h) => h.id !== id) },
      activeHighlight: st.activeHighlight === id ? null : st.activeHighlight,
    })),

  setBrief: (articleId, b) =>
    set((st) => {
      const briefs = { ...st.briefs };
      if (b) briefs[articleId] = b;
      else delete briefs[articleId];
      return { briefs };
    }),

  setProgress: (articleId, p) =>
    set((st) => {
      // The first time a text is read to the end, the library notes when.
      const done = p.pct >= 1 && st.library.some((x) => x.id === articleId && !x.finishedAt);
      return {
        progress: { ...st.progress, [articleId]: p },
        ...(done ? { library: st.library.map((x) => (x.id === articleId ? { ...x, finishedAt: p.at } : x)) } : {}),
      };
    }),

  addToLibrary: (a, words, extra) => {
    set((st) => {
      const year = Number(a.published?.match(/\b(1[5-9]\d\d|20\d\d)\b/)?.[1]) || undefined;
      const item: LibraryItem = {
        id: a.id,
        title: a.title,
        author: a.author,
        source: a.source,
        words,
        origin: a.origin,
        addedAt: a.addedAt ?? Date.now(),
        dek: a.dek,
        year,
        sourceUrl: a.sourceUrl,
        image: a.image,
        ...extra,
      };
      // Undefined fields are left out, so a shelf entry's JSON stays as small as it was.
      for (const k of Object.keys(item) as (keyof LibraryItem)[]) if (item[k] === undefined) delete item[k];
      return { library: [item, ...st.library.filter((x) => x.id !== a.id)] };
    });
    // The same link or file arriving again becomes the entry already on the shelf.
    get().dedupeLibrary();
  },

  dedupeLibrary: () => {
    const st = get();
    const groups = new Map<string, LibraryItem[]>();
    for (const item of st.library) {
      const key = libraryKey(item);
      const list = groups.get(key);
      if (list) list.push(item);
      else groups.set(key, [item]);
    }
    if (![...groups.values()].some((group) => group.length > 1)) return false;

    const highlights = { ...st.highlights };
    const glosses = { ...st.glosses };
    const briefs = { ...st.briefs };
    const progress = { ...st.progress };
    const docs: [from: string, to: string][] = [];
    const library: LibraryItem[] = [];

    for (const group of groups.values()) {
      if (group.length === 1) {
        library.push(group[0]);
        continue;
      }
      // Prefer the fullest document; ties keep the entry that was added first.
      group.sort((a, b) => (b.words ?? 0) - (a.words ?? 0) || a.addedAt - b.addedAt);
      let canonical = { ...group[0] };
      for (const duplicate of group.slice(1)) {
        docs.push([duplicate.id, canonical.id]);
        markArticleDeleted(duplicate.id);
        canonical = {
          ...canonical,
          addedAt: Math.min(canonical.addedAt, duplicate.addedAt),
          words: Math.max(canonical.words, duplicate.words),
          topic: canonical.topic && canonical.topic !== "unsorted" ? canonical.topic : duplicate.topic,
          tags: [...new Set([...(canonical.tags ?? []), ...(duplicate.tags ?? [])])],
          favorite: Boolean(canonical.favorite || duplicate.favorite),
          cover: canonical.cover ?? duplicate.cover,
          docAt: Math.max(canonical.docAt ?? 0, duplicate.docAt ?? 0) || undefined,
          image: canonical.image ?? duplicate.image,
          dek: canonical.dek ?? duplicate.dek,
          year: canonical.year ?? duplicate.year,
          sourceUrl: canonical.sourceUrl ?? duplicate.sourceUrl,
          finishedAt: Math.max(canonical.finishedAt ?? 0, duplicate.finishedAt ?? 0) || undefined,
          addedBy: canonical.addedBy ?? duplicate.addedBy,
          addedVia: canonical.addedVia ?? duplicate.addedVia,
        };

        const hs = highlights[duplicate.id];
        if (hs?.length) {
          const byId = new Map((highlights[canonical.id] ?? []).map((h) => [h.id, h]));
          for (const h of hs) byId.set(h.id, { ...h, articleId: canonical.id });
          highlights[canonical.id] = [...byId.values()];
          delete highlights[duplicate.id];
        }
        const gs = glosses[duplicate.id];
        if (gs?.length) {
          const byId = new Map((glosses[canonical.id] ?? []).map((g) => [g.id, g]));
          for (const g of gs) byId.set(g.id, { ...g, articleId: canonical.id });
          glosses[canonical.id] = [...byId.values()].sort((a, b) => a.createdAt - b.createdAt);
          delete glosses[duplicate.id];
        }
        const brief = briefs[duplicate.id];
        if (brief) {
          const current = briefs[canonical.id];
          if (!current || (brief.status === "ready" && current.status !== "ready") || (brief.status === "ready" && current.status === "ready" && brief.at > current.at)) briefs[canonical.id] = brief;
          delete briefs[duplicate.id];
        }
        const p = progress[duplicate.id];
        if (p) {
          const current = progress[canonical.id];
          if (!current || p.pct > current.pct || (p.pct === current.pct && p.at > current.at)) progress[canonical.id] = p;
          delete progress[duplicate.id];
        }
      }
      library.push(canonical);
    }

    set({ library, highlights, glosses, briefs, progress });
    // The duplicate's text is folded into the canonical entry without blocking the shelf.
    for (const [from, to] of docs) {
      void (async () => {
        if (!(await loadDoc(to))) {
          const doc = await loadDoc(from);
          if (doc) await saveDoc({ ...doc, id: to });
        }
        await forgetDoc(from);
      })();
    }
    return true;
  },

  shelve: (id, patch) => set((st) => ({ library: st.library.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),

  removeFromLibrary: (id) => {
    markArticleDeleted(id);
    void dropDoc(id);
    set((st) => ({ library: st.library.filter((x) => x.id !== id) }));
  },

  // Part of a text read again (a page swapped in by lib/upgrade.ts) where no mark is anchored:
  // the marks stay. The rev bump makes sync send the text again.
  updateText: async (a, words) => {
    if (!(await saveDoc(a))) return false;
    set((st) => ({ library: st.library.map((x) => (x.id === a.id ? { ...x, words, rev: (x.rev ?? 0) + 1 } : x)) }));
    return true;
  },

  // A new reading of the same text. Every mark is anchored to a block id and offset in the old
  // text, so highlights, glosses and the whole-text gloss go with it; the caller asks first.
  replaceText: async (a, words) => {
    if (!(await saveDoc(a))) return false;
    set((st) => {
      const rest = <T,>(m: Record<string, T>) => Object.fromEntries(Object.entries(m).filter(([k]) => k !== a.id)) as Record<string, T>;
      return {
        library: st.library.map((x) => (x.id === a.id ? { ...x, words, rev: (x.rev ?? 0) + 1 } : x)),
        highlights: rest(st.highlights),
        glosses: rest(st.glosses),
        briefs: rest(st.briefs),
        progress: rest(st.progress),
      };
    });
    return true;
  },

  // Changes from another device. The server's copy replaces the local one,
  // except a gloss that is still being written here.
  applyRemote: (c) =>
    set((st) => {
      let library = st.library;
      for (const r of c.articles ?? []) {
        library = library.filter((x) => x.id !== r.id);
        if (r.deleted || !r.data) void dropDoc(r.id);
        else library = [r.data, ...library];
      }

      const merge = <T extends { id: string; createdAt: number }>(cur: Record<string, T[]>, rows: RemoteRow<T>[] = [], keep?: (t: T) => boolean) => {
        if (!rows.length) return cur;
        const next = { ...cur };
        for (const r of rows) {
          const list = next[r.articleId] ?? [];
          const local = list.find((x) => x.id === r.id);
          if (local && keep?.(local)) continue;
          next[r.articleId] = list.filter((x) => x.id !== r.id);
          if (!r.deleted && r.data) next[r.articleId] = [...next[r.articleId], r.data].sort((a, b) => a.createdAt - b.createdAt);
        }
        return next;
      };

      const byArticle = <T,>(cur: Record<string, T>, rows: RemoteRow<T>[] = []) => {
        if (!rows.length) return cur;
        const next = { ...cur };
        for (const r of rows) {
          if (r.deleted || !r.data) delete next[r.id];
          else next[r.id] = r.data;
        }
        return next;
      };

      return {
        library,
        highlights: merge(st.highlights, c.highlights),
        glosses: merge(st.glosses, c.glosses, (g) => g.turns.some((t) => t.streaming)),
        briefs: byArticle(st.briefs, c.briefs),
        progress: byArticle(st.progress, c.progress),
      };
    }),
}));

/* Debounce streaming writes, but flush before the browser suspends the page.
   Each article is its own key, so a long answer being streamed rewrites only
   that one article instead of stringifying the whole store every 400ms. */
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let persistenceDirty = false;
let dirty: { glosses: Set<string>; highlights: Set<string>; briefs: Set<string>; progress: Set<string>; library: boolean } = { glosses: new Set(), highlights: new Set(), briefs: new Set(), progress: new Set(), library: false };

function readCollection<T>(prefix: string): Record<string, T> {
  const out: Record<string, T> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k?.startsWith(prefix)) continue;
    try {
      out[k.slice(prefix.length)] = JSON.parse(localStorage.getItem(k) || "null") as T;
    } catch {}
  }
  return out;
}

/** Reads the per-article shards; `has` is false only when no shard has ever been written. */
function readV2(): { has: boolean; data: Partial<Persisted> } {
  let has = false;
  const data: Partial<Persisted> = {};
  try {
    data.glosses = readCollection<Gloss[]>(V2.glosses);
    data.highlights = readCollection<Highlight[]>(V2.highlights);
    data.briefs = readCollection<BriefState>(V2.briefs);
    data.progress = readCollection<Progress>(V2.progress);
    has = Object.keys(data.glosses).length > 0 || Object.keys(data.highlights).length > 0 || Object.keys(data.briefs).length > 0 || Object.keys(data.progress).length > 0;
    const libraryRaw = localStorage.getItem(V2.library);
    if (libraryRaw !== null) {
      has = true;
      try {
        data.library = JSON.parse(libraryRaw) as LibraryItem[];
      } catch {}
    }
  } catch {}
  return { has, data };
}

function writeCollection<T>(all: Record<string, T>, ids: Set<string>, prefix: string) {
  for (const id of ids) {
    const v = all[id];
    const k = prefix + id;
    if (v === undefined || v === null || (Array.isArray(v) && v.length === 0)) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  }
}

/** Writes every article, used once to move the legacy single key into shards. */
function writeAllV2(st: State) {
  for (const [id, list] of Object.entries(st.glosses)) if (list.length) localStorage.setItem(V2.glosses + id, JSON.stringify(list));
  for (const [id, list] of Object.entries(st.highlights)) if (list.length) localStorage.setItem(V2.highlights + id, JSON.stringify(list));
  for (const [id, b] of Object.entries(st.briefs)) localStorage.setItem(V2.briefs + id, JSON.stringify(b));
  for (const [id, p] of Object.entries(st.progress)) localStorage.setItem(V2.progress + id, JSON.stringify(p));
  localStorage.setItem(V2.library, JSON.stringify(st.library));
}

export function flushStorePersistence() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  if (!persistenceDirty || !useStore.getState().hydrated) return;
  const st = useStore.getState();
  try {
    writeCollection(st.glosses, dirty.glosses, V2.glosses);
    writeCollection(st.highlights, dirty.highlights, V2.highlights);
    writeCollection(st.briefs, dirty.briefs, V2.briefs);
    writeCollection(st.progress, dirty.progress, V2.progress);
    if (dirty.library) localStorage.setItem(V2.library, JSON.stringify(st.library));
    localStorage.removeItem(KEY);
  } catch {
    /* Keep dirty so a later save or page lifecycle event can retry. */
    return;
  }
  dirty = { glosses: new Set(), highlights: new Set(), briefs: new Set(), progress: new Set(), library: false };
  persistenceDirty = false;
}
if (typeof window !== "undefined") {
  useStore.subscribe((st, prev) => {
    if (!st.hydrated) return;
    const diff = (cur: Record<string, unknown>, old: Record<string, unknown>, set: Set<string>) => {
      for (const k of new Set([...Object.keys(cur), ...Object.keys(old)])) if (cur[k] !== old[k]) set.add(k);
    };
    diff(st.glosses, prev.glosses, dirty.glosses);
    diff(st.highlights, prev.highlights, dirty.highlights);
    diff(st.briefs, prev.briefs, dirty.briefs);
    diff(st.progress, prev.progress, dirty.progress);
    if (st.library !== prev.library) dirty.library = true;
    if (!dirty.glosses.size && !dirty.highlights.size && !dirty.briefs.size && !dirty.progress.size && !dirty.library) return;
    persistenceDirty = true;
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(flushStorePersistence, 400);
  });
  window.addEventListener('pagehide', flushStorePersistence);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushStorePersistence();
  });
}

/* Texts live in IndexedDB, which holds far more than localStorage's few
   megabytes. Older builds kept them in localStorage; they move over on first read. */

const DB_NAME = "gloss";
const DOCS = "docs";
/** The original files of imported PDFs, for reading them again more carefully. Local only; never synced. */
const FILES = "files";
let dbp: Promise<IDBDatabase> | null = null;

function idb(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      for (const name of [DOCS, FILES]) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  dbp.catch(() => (dbp = null));
  return dbp;
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>, store = DOCS): Promise<T> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveDoc(a: Article): Promise<boolean> {
  try {
    await tx("readwrite", (s) => s.put(a, a.id));
    return true;
  } catch {}
  // No IndexedDB (some private windows): the old, smaller home still works.
  try {
    localStorage.setItem(DOC_PREFIX + a.id, JSON.stringify(a));
    return true;
  } catch {
    return false;
  }
}

export async function loadDoc(id: string): Promise<Article | null> {
  try {
    const a = await tx<Article | undefined>("readonly", (s) => s.get(id));
    if (a) return a;
  } catch {}
  let legacy: Article | null = null;
  try {
    const raw = localStorage.getItem(DOC_PREFIX + id);
    legacy = raw ? (JSON.parse(raw) as Article) : null;
  } catch {}
  if (legacy) {
    try {
      await tx("readwrite", (s) => s.put(legacy, id));
      localStorage.removeItem(DOC_PREFIX + id);
    } catch {}
  }
  return legacy;
}

/** Moves every text an older build left in localStorage into IndexedDB, freeing room for notes. */
async function migrateDocs() {
  let ids: string[] = [];
  try {
    ids = Object.keys(localStorage).filter((k) => k.startsWith(DOC_PREFIX)).map((k) => k.slice(DOC_PREFIX.length));
  } catch {}
  for (const id of ids) await loadDoc(id);
}

/** Keep an imported PDF's original file, by its article id. */
export async function savePdf(id: string, file: Blob): Promise<boolean> {
  try {
    await tx("readwrite", (s) => s.put(file, id), FILES);
    return true;
  } catch {
    return false;
  }
}

/** The original PDF behind an article, when this browser imported it. */
export async function loadPdf(id: string): Promise<Blob | null> {
  try {
    return (await tx<Blob | undefined>("readonly", (s) => s.get(id), FILES)) ?? null;
  } catch {
    return null;
  }
}

/** Forget this device's copy of a text (not its PDF): it changed elsewhere and is fetched again on open. */
export async function forgetDoc(id: string) {
  try {
    localStorage.removeItem(DOC_PREFIX + id);
  } catch {}
  try {
    await tx("readwrite", (s) => s.delete(id));
  } catch {}
}

async function dropDoc(id: string) {
  try {
    localStorage.removeItem(DOC_PREFIX + id);
  } catch {}
  try {
    await tx("readwrite", (s) => s.delete(id));
    await tx("readwrite", (s) => s.delete(id), FILES);
  } catch {}
}

const EMPTY: never[] = [];
export const useGlosses = (articleId: string) => useStore((s) => s.glosses[articleId] ?? EMPTY);
export const useHighlights = (articleId: string) => useStore((s) => s.highlights[articleId] ?? EMPTY);
