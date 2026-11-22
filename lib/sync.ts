"use client";

/**
 * Account sync for signed-in readers. The browser stays the source of truth
 * while you read; this mirrors it to the account and back.
 *
 * - Push: what changed since the last push, found by comparing each entity's
 *   stable JSON with a baseline of what the server already has. Deletions are
 *   entities in the baseline that are gone locally, sent as tombstones.
 * - Pull: rows changed since the last pull, merged in with applyRemote. The
 *   baseline then records them, so they are not pushed straight back.
 * - Texts travel separately: pushed once with the shelf entry, fetched on
 *   another device only when it is opened there.
 *
 * The baseline lives in localStorage per user, so a second account on the
 * same browser starts fresh and receives what is on this device.
 *
 * While a page watches the shelf (the library), it also pulls every few
 * seconds, so what an agent saves arrives while you look.
 */

import { flushDocMigrations, forgetDoc, loadDoc, saveDoc, useStore, type RemoteChanges } from "./store";
import type { Article } from "./article";
import { forgetCover } from "./covers";
import { setSyncStatus } from "./sync-status";
import { applyRemoteLearning, hydrateLearning, useLearning } from "./learning-store";
import { expireGoogleCredential, googleAuthHeaders } from "./google-auth";
import { applyRemoteSettings, localSyncedSettings } from "./settings-sync";
import { gzipSync } from "fflate";
import { clearArticleDeletions, pendingArticleDeletions } from "./sync-deletions";
import { confirmSyncDeletions } from "./sync-guard";
import { SYNCED_SETTING_KEYS } from "./settings";

const COLLECTIONS = ["articles", "highlights", "glosses", "briefs", "progress", "vocabulary", "learning", "settings"] as const;
type Collection = (typeof COLLECTIONS)[number];

type Entity = { articleId: string; data: unknown; key: string };
type Snapshot = { entities: Record<Collection, Map<string, Entity>>; busy: Set<string> };
const BASELINE_VERSION = 5;
type Baseline = { version: number; since: string | null; seen: Record<Collection, Record<string, [key: string, articleId: string, doc?: 0 | 1, docAt?: number]>> };
type OutRow = { id: string; articleId: string; data: unknown; deleted?: boolean; doc?: unknown; images?: boolean };

/** Pushes are split to stay well under the 4.5MB request cap. */
const BATCH_BYTES = 1_500_000;
const MAX_BODY = 15_000_000;
/** A stalled request must not leave the badge on "Syncing" forever. */
const PULL_TIMEOUT = 30_000;
const PUSH_TIMEOUT = 120_000;

/** Long texts ride compressed so a large EPUB fits the request and D1 row limits. */
function packDoc(doc: Article): unknown {
  const text = JSON.stringify(doc);
  if (text.length < 700_000) return doc;
  const bytes = gzipSync(new TextEncoder().encode(text));
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return { __gz: btoa(binary) };
}

/** True when the local text still carries pictures that an older sync may have stripped. */
function hasEmbeddedImages(doc: Article): boolean {
  return Boolean(doc.image?.startsWith("data:") || doc.blocks.some((block) => block.src?.startsWith("data:")));
}

const MAX_INLINE_DOC = 4_000_000;
const DOC_CHUNK = 700_000;
const REPACK_KEY = "gloss:docs-v5-images";

function repackedImages(): Set<string> {
  try {
    const value = JSON.parse(localStorage.getItem(REPACK_KEY) || "[]");
    return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function markImagesRepacked(ids: Iterable<string>) {
  const set = repackedImages();
  let changed = false;
  for (const id of ids) changed = !set.has(id) ? (set.add(id), true) : changed;
  if (!changed) return;
  try { localStorage.setItem(REPACK_KEY, JSON.stringify([...set])); } catch {}
}

/** A large text uploads as versioned gzip chunks and leaves a tiny pointer in the article row. */
async function uploadDoc(articleId: string, packed: unknown): Promise<unknown> {
  if (!packed || typeof packed !== "object" || typeof (packed as { __gz?: unknown }).__gz !== "string") return packed;
  const gz = (packed as { __gz: string }).__gz;
  if (gz.length <= MAX_INLINE_DOC) return packed;
  const total = Math.ceil(gz.length / DOC_CHUNK);
  const uploadId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const send = async (seq: number) => {
    const data = gz.slice(seq * DOC_CHUNK, (seq + 1) * DOC_CHUNK);
    const res = await fetchWithTimeout(
      `/api/articles/${encodeURIComponent(articleId)}/doc`,
      { method: "POST", headers: { "Content-Type": "application/json", ...googleAuthHeaders() }, body: JSON.stringify({ seq, total, data, uploadId }) },
      PUSH_TIMEOUT
    );
    if (res.status === 401) expireGoogleCredential();
    if (!res.ok) throw new Error(`doc ${res.status}`);
  };
  // Chunks are independent; a few in flight makes a large EPUB sync much faster.
  for (let seq = 0; seq < total; seq += 4) {
    await Promise.all(Array.from({ length: Math.min(4, total - seq) }, (_, i) => send(seq + i)));
  }
  return { __chunked: true, uploadId };
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Request timed out");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
/** Pulls overlap a little, so a write that landed while the last pull ran is not missed. Applying a row twice is harmless. */
const OVERLAP_MS = 2_000;

/** JSON with sorted keys, so the same object always compares equal, whatever order SQLite hands keys back in. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v) ?? "null";
}

/** Store entities are immutable, so an entity's key can be reused between pushes. */
const stableCache = new WeakMap<object, string>();
function stableCached(v: unknown): string {
  if (v && typeof v === "object") {
    const hit = stableCache.get(v);
    if (hit !== undefined) return hit;
    const key = stable(v);
    stableCache.set(v, key);
    return key;
  }
  return stable(v);
}

function snapshot(): Snapshot {
  const st = useStore.getState();
  const entities = Object.fromEntries(COLLECTIONS.map((c) => [c, new Map<string, Entity>()])) as Snapshot["entities"];
  const busy = new Set<string>();
  const put = (c: Collection, id: string, articleId: string, data: unknown) => entities[c].set(id, { articleId, data, key: stableCached(data) });

  for (const item of st.library) put("articles", item.id, item.id, item);
  for (const [aid, list] of Object.entries(st.highlights)) for (const h of list) put("highlights", h.id, aid, h);
  for (const [aid, list] of Object.entries(st.glosses))
    for (const g of list) {
      // An answer still being written is left alone until it settles.
      if (g.turns.some((t) => t.streaming)) busy.add(`glosses:${g.id}`);
      else put("glosses", g.id, aid, g);
    }
  for (const [aid, b] of Object.entries(st.briefs)) {
    if (b.status === "ready") put("briefs", aid, aid, b);
    else busy.add(`briefs:${aid}`);
  }
  for (const [aid, p] of Object.entries(st.progress)) put("progress", aid, aid, p);
  const learning = useLearning.getState();
  for (const entry of learning.entries) put("vocabulary", entry.id, "vocabulary", entry);
  if (learning.ready) put("learning", "preferences", "learning", learning.preferences);
  if (st.hydrated) put("settings", "preferences", "settings", localSyncedSettings());
  return { entities, busy };
}

/** Pages that want arrivals as they happen, and how to tell the running sync. */
let watchers = 0;
let poke: (() => void) | null = null;
const WATCH_MS = 8000;
const MAX_WATCH_MS = 20_000;

/** Pull now and every few seconds while the returned stop hasn't been called. */
export function watchShelf(): () => void {
  watchers++;
  poke?.();
  return () => {
    watchers--;
  };
}

const emptyBaseline = (): Baseline => ({ version: BASELINE_VERSION, since: null, seen: Object.fromEntries(COLLECTIONS.map((c) => [c, {}])) as Baseline["seen"] });

export function startSync(userId: string) {
  const storeKey = `gloss:sync:${userId}`;
  let base: Baseline = emptyBaseline();
  const alreadyRepacked = repackedImages();
  try {
    const raw = localStorage.getItem(storeKey);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Baseline>;
      if (saved.version === BASELINE_VERSION) {
        // A baseline from an older build may know fewer collections. Fill every
        // collection in, or the first push of a newly synced one reads undefined.
        const empty = emptyBaseline();
        base = {
          version: BASELINE_VERSION,
          since: saved.since ?? null,
          seen: Object.fromEntries(COLLECTIONS.map((c) => [c, saved.seen?.[c] ?? empty.seen[c]])) as Baseline["seen"],
        };
      }
    }
  } catch {}
  const save = () => {
    try {
      localStorage.setItem(storeKey, JSON.stringify(base));
    } catch {}
  };

  let stopped = false;
  let deletionsApproved = false;
  // One operation at a time: a pull never lands in the middle of a push.
  let chain: Promise<unknown> = Promise.resolve();
  const serial = (fn: () => Promise<void>) => (chain = chain.then(() => (stopped ? undefined : fn())).catch(() => {}));

  async function push() {
    setSyncStatus("syncing");
    try {
    const { entities, busy } = snapshot();
    const pendingDeletes = pendingArticleDeletions();
    const rows: { c: Collection; row: OutRow; key: string | null; size: number }[] = [];
    for (const c of COLLECTIONS) {
      const seen = base.seen[c];
      for (const [id, e] of entities[c]) {
        const seenEntry = seen[id];
        const dataChanged = seenEntry?.[0] !== e.key;
        let row: OutRow | null = dataChanged ? { id, articleId: e.articleId, data: e.data } : null;
        // A text goes up with its first shelf entry, and again when it is replaced (its rev changes).
        // Samples ship with the app. A text already on the shelf still uploads a missing document.
        if (c === "articles" && (e.data as { origin?: string }).origin !== "sample") {
          // Most pushes carry annotations, not text changes. Once a text is known to
          // have no pictures, there is no reason to open its megabyte-sized document
          // again on every push.
          const skipDoc = !dataChanged && Boolean(seenEntry?.[2]) && alreadyRepacked.has(id);
          if (!skipDoc) {
            const doc = await loadDoc(id);
            const images = Boolean(doc && hasEmbeddedImages(doc));
            // Keep retrying until this device actually gets its picture-bearing text to D1.
            const needsRepack = Boolean(doc && images && !alreadyRepacked.has(id));
            if (doc && (row || !seenEntry?.[2] || needsRepack)) {
              row ??= { id, articleId: e.articleId, data: e.data };
              row.data = { ...(e.data as Record<string, unknown>), docAt: Date.now() };
              row.doc = await uploadDoc(e.articleId, packDoc(doc));
              row.images = images;
            }
            if (doc && !images) markImagesRepacked([id]);
          }
        }
        if (!row) continue;
        rows.push({ c, row, key: stableCached(row.data), size: JSON.stringify(row).length });
      }
      for (const [id, [, articleId]] of Object.entries(seen)) {
        if (entities[c].has(id) || busy.has(`${c}:${id}`)) continue;
        // Only books the reader actually removed become tombstones. A shelf that
        // failed to load must never wipe the account's library.
        if (c === "articles" && !pendingDeletes.has(id)) continue;
        rows.push({ c, row: { id, articleId, data: {}, deleted: true }, key: null, size: id.length + articleId.length + 64 });
      }
    }
    if (!rows.length) {
      clearArticleDeletions(pendingDeletes);
      setSyncStatus("synced");
      return;
    }

    const tombstones = rows.filter((row) => row.row.deleted);
    const articleDeletes = tombstones.filter((row) => row.c === "articles").length;
    if (!deletionsApproved && (articleDeletes > 5 || tombstones.length > 30)) {
      const ok = await confirmSyncDeletions(articleDeletes, tombstones.length);
      if (!ok) {
        setSyncStatus("error", "Sync paused: deletions were not confirmed.");
        return;
      }
      deletionsApproved = true;
    }

    // Too big for one request even alone: send the shelf entry without the text.
    for (const r of rows) {
      if (r.size > MAX_BODY && r.row.doc) {
        delete r.row.doc;
        r.size = JSON.stringify(r.row).length;
      }
    }

    let batch: typeof rows = [];
    let bytes = 0;
    const flush = async () => {
      if (!batch.length) return;
      const changes: Partial<Record<Collection, OutRow[]>> = {};
      for (const r of batch) (changes[r.c] ??= []).push(r.row);
      const res = await fetchWithTimeout("/api/sync", { method: "POST", headers: { "Content-Type": "application/json", ...googleAuthHeaders() }, body: JSON.stringify({ changes, confirm: deletionsApproved }) }, PUSH_TIMEOUT);
      if (res.status === 401) expireGoogleCredential();
      if (!res.ok) throw new Error(`push ${res.status}`);
      for (const r of batch) {
        if (r.key === null) delete base.seen[r.c][r.row.id];
        else {
          const previous = base.seen[r.c][r.row.id];
          const docAt = r.c === "articles" ? (r.row.data as { docAt?: number }).docAt : undefined;
          base.seen[r.c][r.row.id] = [r.key, r.row.articleId, r.c === "articles" && r.row.doc !== undefined ? 1 : previous?.[2], docAt ?? previous?.[3]];
          if (r.c === "articles" && docAt) useStore.getState().shelve(r.row.id, { docAt });
        }
      }
      clearArticleDeletions(batch.filter((r) => r.c === "articles" && r.row.deleted).map((r) => r.row.id));
      markImagesRepacked(batch.filter((r) => r.c === "articles" && r.row.images).map((r) => r.row.id));
      save();
      batch = [];
      bytes = 0;
    };
    for (const r of rows) {
      if (bytes + r.size > BATCH_BYTES) await flush();
      batch.push(r);
      bytes += r.size;
    }
    await flush();
    clearArticleDeletions(pendingDeletes);
    setSyncStatus("synced");
    } catch (error) {
      setSyncStatus("error", error instanceof Error ? error.message : "Sync failed");
      throw error;
    }
  }

  async function pull() {
    setSyncStatus("syncing");
    try {
    const q = base.since ? `?since=${encodeURIComponent(new Date(Date.parse(base.since) - OVERLAP_MS).toISOString())}` : "";
    const res = await fetchWithTimeout(`/api/sync${q}`, { headers: googleAuthHeaders() }, PULL_TIMEOUT);
    if (res.status === 401) expireGoogleCredential();
    if (!res.ok) throw new Error(`pull ${res.status}`);
    const { now, changes } = (await res.json()) as { now: string; changes: RemoteChanges };

    // A text replaced on another device: drop this device's copy so it is fetched fresh on open.
    for (const r of changes.articles ?? []) {
      const before = base.seen.articles[r.id];
      const localDocAt = useStore.getState().library.find((item) => item.id === r.id)?.docAt;
      const remoteDocAt = (r.data as { docAt?: number } | null)?.docAt;
      const replaced =
        (!r.deleted && remoteDocAt && remoteDocAt !== localDocAt) ||
        (!r.deleted && r.data && before && (r.data as { rev?: number }).rev !== undefined && stable(r.data) !== before[0]);
      if (replaced) {
        await forgetDoc(r.id);
        window.dispatchEvent(new CustomEvent("gloss:doc-updated", { detail: r.id }));
      }
      // Removed on another device: its painted cover goes from this one too.
      if (r.deleted) void forgetCover(r.id);
    }
    const changedRows = COLLECTIONS.reduce((n, c) => n + (changes[c]?.length ?? 0), 0);
    useStore.getState().applyRemote(changes);
    await applyRemoteLearning(changes.vocabulary ?? [], changes.learning ?? []);
    applyRemoteSettings(changes.settings ?? []);

    // Record what was pulled as what the server has, read back through the same snapshot as a push.
    const { entities } = snapshot();
    for (const c of COLLECTIONS) {
      for (const r of changes[c] ?? []) {
        const e = entities[c].get(r.id);
        if (r.deleted) delete base.seen[c][r.id];
        else if (e) base.seen[c][r.id] = [e.key, e.articleId, c === "articles" ? (r.hasDoc ? 1 : 0) : undefined, c === "articles" ? (r.data as { docAt?: number } | null)?.docAt : undefined];
      }
    }
    base.since = now;
    save();
    quietPolls = changedRows ? 0 : Math.min(6, quietPolls + 1);
    interval = Math.min(MAX_WATCH_MS, WATCH_MS + quietPolls * 2000);
    setSyncStatus("synced");
    } catch (error) {
      setSyncStatus("error", error instanceof Error ? error.message : "Sync failed");
      throw error;
    }
  }

  const sync = () => serial(async () => {
    setSyncStatus("syncing");
    try {
      // Vocabulary lives in its own IndexedDB store; a push must not run before it is read.
      await hydrateLearning();
      await pull();
      // Fold texts that arrived under different ids on different devices and wait
      // for copied local documents to land before pushing the duplicate deletions.
      useStore.getState().dedupeLibrary();
      await flushDocMigrations();
      await push();
      setSyncStatus("synced");
    } catch (e) {
      setSyncStatus("error", e instanceof Error ? e.message : "Sync failed");
      throw e;
    }
  });

  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => serial(push), 2000);
  };
  const unsubscribe = useStore.subscribe((st, prev) => {
    if (!st.hydrated) return;
    const settingsChanged = SYNCED_SETTING_KEYS.some((key) => st.settings[key] !== prev.settings[key]);
    if (!settingsChanged && st.library === prev.library && st.highlights === prev.highlights && st.glosses === prev.glosses && st.briefs === prev.briefs && st.progress === prev.progress) return;
    schedule();
  });
  const unsubscribeLearning = useLearning.subscribe((st, prev) => {
    if (st.ready && (st.entries !== prev.entries || st.preferences !== prev.preferences)) schedule();
  });

  const retry = () => sync();
  window.addEventListener("gloss:sync-now", retry);

  let lastPull = 0;
  let quietPolls = 0;
  let interval = WATCH_MS;
  const pullIfStale = (ms: number) => {
    if (document.visibilityState === "hidden" || Date.now() - lastPull < ms) return;
    lastPull = Date.now();
    sync();
  };
  const onVisible = () => {
    if (document.visibilityState === "hidden") serial(push);
    else pullIfStale(watchers ? interval : 20_000);
  };
  document.addEventListener("visibilitychange", onVisible);
  const ticker = setInterval(() => watchers && pullIfStale(interval), 2000);
  poke = () => pullIfStale(3000);

  lastPull = Date.now();
  sync();

  return {
    stop() {
      stopped = true;
      setSyncStatus("off");
      unsubscribe();
      unsubscribeLearning();
      if (timer) clearTimeout(timer);
      clearInterval(ticker);
      poke = null;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("gloss:sync-now", retry);
    },
  };
}

/** Fetch one text from the account and keep it on this device. Null when signed out or not there. */
export async function fetchText(id: string): Promise<Article | null> {
  try {
    const res = await fetchWithTimeout(`/api/articles/${encodeURIComponent(id)}`, { headers: googleAuthHeaders() }, PULL_TIMEOUT);
    if (!res.ok) return null;
    const { doc } = (await res.json()) as { doc: Article };
    await saveDoc(doc);
    return doc;
  } catch {
    return null;
  }
}
