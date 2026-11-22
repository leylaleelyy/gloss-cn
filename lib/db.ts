/**
 * Cloudflare D1 (SQLite) for signed-in readers. One row per entity per user,
 * with the client's object as JSON text. Server-side only.
 *
 * `initOpenNextCloudflareForDev()` in next.config.ts exposes the same binding
 * to `next dev`, where Wrangler keeps a local SQLite copy.
 */

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { gunzipSync } from "fflate";

type D1Result<T> = { results?: T[]; success?: boolean; meta?: { changes?: number } };
type D1Statement = {
  bind: (...values: unknown[]) => D1Statement;
  all: <T = Record<string, unknown>>() => Promise<D1Result<T>>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  run: () => Promise<D1Result<unknown>>;
};
type D1Database = {
  prepare: (sql: string) => D1Statement;
  batch: (statements: D1Statement[]) => Promise<D1Result<unknown>[]>;
};

export function d1(): D1Database {
  try {
    const { env } = getCloudflareContext();
    const database = (env as { DB?: D1Database }).DB;
    if (database) return database;
  } catch {}
  throw new Error("D1 is not configured. Set the DB binding in wrangler.jsonc.");
}

export function storageConfigured(): boolean {
  try {
    return Boolean((getCloudflareContext().env as { DB?: D1Database }).DB);
  } catch {
    return false;
  }
}

/** The tables the sync route reads and writes. Names are only ever taken from this list. */
export const COLLECTIONS = ["articles", "highlights", "glosses", "briefs", "progress", "vocabulary", "learning", "settings"] as const;
export type Collection = (typeof COLLECTIONS)[number];
export const isCollection = (v: unknown): v is Collection => typeof v === "string" && (COLLECTIONS as readonly string[]).includes(v);

export type PushRow = { id: string; article_id: string; data: unknown; deleted: boolean; doc?: unknown };
export type PullRow = { id: string; articleId: string; data: unknown; deleted: boolean; hasDoc?: boolean };

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const json = (v: unknown) => JSON.stringify(v ?? {});
const parse = (v: unknown) => {
  if (typeof v !== "string") return v ?? {};
  try { return JSON.parse(v) as unknown; } catch { return {}; }
};

/** A large text may arrive gzipped from the browser to fit the request and D1 limits. */
function inflateDoc(base64: string): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(gunzipSync(base64ToBytes(base64)))) as unknown;
  } catch {
    return null;
  }
}

function unpackDoc(value: string): unknown {
  const data = parse(value);
  if (data && typeof data === "object" && typeof (data as { __gz?: unknown }).__gz === "string") {
    return inflateDoc((data as { __gz: string }).__gz) ?? data;
  }
  return data;
}

/** Rows changed since `since` in every collection, tombstones included, plus the server clock to pull from next time. */
export async function pullRows(userId: string, since: string): Promise<{ now: string; changes: Record<Collection, PullRow[]> }> {
  const database = d1();
  const statements = [
    database.prepare(`select ${NOW} as now`),
    ...COLLECTIONS.map((table) =>
      database.prepare(`select id, article_id, data, deleted${table === "articles" ? ", doc is not null as has_doc" : ""} from ${table} where user_id = ? and updated_at > ? order by updated_at`).bind(userId, since)
    ),
  ];
  const results = await database.batch(statements);
  const clock = (results[0]?.results?.[0] as { now?: string } | undefined)?.now ?? new Date().toISOString();
  const changes = Object.fromEntries(
    COLLECTIONS.map((table, index) => {
      const rows = (results[index + 1]?.results ?? []) as { id: string; article_id: string; data: unknown; deleted: number; has_doc?: number }[];
      return [
        table,
        rows.map((row) => ({
          id: String(row.id),
          articleId: String(row.article_id),
          data: row.deleted ? null : parse(row.data),
          deleted: Boolean(row.deleted),
          ...(table === "articles" ? { hasDoc: Boolean(row.has_doc) } : {}),
        })),
      ];
    })
  ) as Record<Collection, PullRow[]>;
  return { now: clock, changes };
}

/** Upsert every collection's rows in one batch. The server stamps the time, so the latest write wins. */
export async function pushRows(userId: string, changes: Partial<Record<Collection, PushRow[]>>): Promise<void> {
  const database = d1();
  const statements: D1Statement[] = [];
  for (const [table, rows] of Object.entries(changes)) {
    if (!isCollection(table) || !rows?.length) continue;
    for (const row of rows) {
      if (table === "articles") {
        statements.push(
          database.prepare(
            `insert into articles (user_id, id, article_id, data, deleted, doc, updated_at)
             values (?, ?, ?, ?, ?, ?, ${NOW})
             on conflict (user_id, id) do update set
               article_id = excluded.article_id, data = excluded.data, deleted = excluded.deleted, updated_at = excluded.updated_at,
               doc = case when excluded.deleted then null else coalesce(excluded.doc, articles.doc) end`
          ).bind(userId, row.id, row.article_id, json(row.data), row.deleted ? 1 : 0, row.deleted ? null : row.doc == null ? null : JSON.stringify(row.doc))
        );
      } else {
        statements.push(
          database.prepare(
            `insert into ${table} (user_id, id, article_id, data, deleted, updated_at)
             values (?, ?, ?, ?, ?, ${NOW})
             on conflict (user_id, id) do update set
               article_id = excluded.article_id, data = excluded.data, deleted = excluded.deleted, updated_at = excluded.updated_at`
          ).bind(userId, row.id, row.article_id, json(row.data), row.deleted ? 1 : 0)
        );
      }
    }
  }
  // A text taken off the shelf takes its painted cover and document chunks with it.
  for (const row of (changes.articles ?? []).filter((r) => r.deleted)) {
    statements.push(database.prepare("delete from covers where user_id = ? and id = ?").bind(userId, row.id));
    statements.push(database.prepare("delete from article_docs where user_id = ? and article_id = ?").bind(userId, row.id));
    statements.push(database.prepare("delete from doc_chunks where user_id = ? and article_id = ?").bind(userId, row.id));
  }
  // Replacing a text prunes superseded chunks once the new article pointer lands.
  for (const row of (changes.articles ?? []).filter((r) => !r.deleted && r.doc != null)) {
    const marker = typeof row.doc === "object" ? (row.doc as { __chunked?: boolean; uploadId?: string }) : null;
    if (marker?.__chunked && marker.uploadId) {
      statements.push(database.prepare("delete from doc_chunks where user_id = ? and article_id = ? and upload_id != ?").bind(userId, row.id, marker.uploadId));
      statements.push(database.prepare("delete from article_docs where user_id = ? and article_id = ?").bind(userId, row.id));
    } else if (!marker?.__chunked) {
      statements.push(database.prepare("delete from doc_chunks where user_id = ? and article_id = ?").bind(userId, row.id));
      statements.push(database.prepare("delete from article_docs where user_id = ? and article_id = ?").bind(userId, row.id));
    }
  }
  // D1 batches are bounded; keep each one modest so a large import can still land.
  for (let i = 0; i < statements.length; i += 100) await database.batch(statements.slice(i, i + 100));
}

/** One article's full text. */
export async function articleDoc(userId: string, id: string): Promise<unknown | null> {
  const row = await d1().prepare("select doc from articles where user_id = ? and id = ? and deleted = 0 and doc is not null").bind(userId, id).first<{ doc?: string }>();
  if (!row?.doc) return null;
  const marker = parse(row.doc) as { __chunked?: boolean; uploadId?: string };
  if (marker.__chunked) {
    const chunks = marker.uploadId
      ? await d1().prepare("select data from doc_chunks where user_id = ? and article_id = ? and upload_id = ? order by seq").bind(userId, id, marker.uploadId).all<{ data: string }>()
      : await d1().prepare("select data from article_docs where user_id = ? and article_id = ? order by seq").bind(userId, id).all<{ data: string }>();
    const gz = (chunks.results ?? []).map((chunk) => chunk.data).join("");
    return gz ? inflateDoc(gz) : null;
  }
  return unpackDoc(row.doc);
}

/* ---------- painted covers ---------- */

export async function saveCover(userId: string, id: string, jpeg: Uint8Array): Promise<void> {
  await d1()
    .prepare(
      `insert into covers (user_id, id, jpeg, created_at) values (?, ?, ?, ${NOW})
       on conflict (user_id, id) do update set jpeg = excluded.jpeg, created_at = ${NOW}`
    )
    .bind(userId, id, bytesToBase64(jpeg))
    .run();
}

export async function loadCover(userId: string, id: string): Promise<Uint8Array | null> {
  const row = await d1().prepare("select jpeg from covers where user_id = ? and id = ?").bind(userId, id).first<{ jpeg?: string }>();
  return row?.jpeg ? base64ToBytes(row.jpeg) : null;
}

/* ---------- agent tokens ---------- */

export type AgentToken = { id: string; label: string; createdAt: string; lastUsedAt: string | null };

export async function createToken(userId: string, id: string, hash: string, label: string): Promise<void> {
  await d1().prepare(`insert into agent_tokens (id, user_id, hash, label, created_at) values (?, ?, ?, ?, ${NOW})`).bind(id, userId, hash, label).run();
}

export async function listTokens(userId: string): Promise<AgentToken[]> {
  const result = await d1()
    .prepare("select id, label, created_at, last_used_at from agent_tokens where user_id = ? and revoked = 0 order by created_at desc")
    .bind(userId)
    .all<{ id: string; label: string; created_at: string; last_used_at: string | null }>();
  return (result.results ?? []).map((row) => ({
    id: String(row.id),
    label: String(row.label ?? ""),
    createdAt: String(row.created_at),
    lastUsedAt: row.last_used_at ? String(row.last_used_at) : null,
  }));
}

export async function revokeToken(userId: string, id: string): Promise<boolean> {
  const result = await d1().prepare("update agent_tokens set revoked = 1 where user_id = ? and id = ? and revoked = 0").bind(userId, id).run();
  return Boolean(result.meta?.changes);
}

/** The reader a token belongs to, noting that it was used. Null for an unknown or revoked token. */
export async function tokenUser(hash: string): Promise<{ userId: string; label: string } | null> {
  const database = d1();
  const row = await database.prepare("select user_id, label from agent_tokens where hash = ? and revoked = 0").bind(hash).first<{ user_id: string; label: string }>();
  if (!row) return null;
  await database.prepare(`update agent_tokens set last_used_at = ${NOW} where hash = ? and revoked = 0`).bind(hash).run();
  return { userId: String(row.user_id), label: String(row.label ?? "") };
}

/* ---------- the library, for an agent ---------- */

export type ShelfRow = { id: string; data: Record<string, unknown>; pct: number };

/** Every text on a reader's shelf, with how far they've read. */
export async function shelfOf(userId: string): Promise<ShelfRow[]> {
  const result = await d1()
    .prepare(
      `select a.id, a.data, p.data as progress from articles a
       left join progress p on p.user_id = a.user_id and p.id = a.id and p.deleted = 0
       where a.user_id = ? and a.deleted = 0 order by a.updated_at desc`
    )
    .bind(userId)
    .all<{ id: string; data: string; progress: string | null }>();
  return (result.results ?? []).map((row) => {
    const progress = row.progress ? (parse(row.progress) as { pct?: number }) : null;
    return { id: String(row.id), data: (parse(row.data) ?? {}) as Record<string, unknown>, pct: Number(progress?.pct ?? 0) };
  });
}

/** Put one imported text on a reader's shelf, as their browser would: the next sync brings it down. */
export async function shelveForUser(userId: string, item: { id: string }, doc: unknown): Promise<void> {
  await d1()
    .prepare(
      `insert into articles (user_id, id, article_id, data, doc, deleted, updated_at) values (?, ?, ?, ?, ?, 0, ${NOW})
       on conflict (user_id, id) do update set data = excluded.data, doc = excluded.doc, deleted = 0, updated_at = excluded.updated_at`
    )
    .bind(userId, item.id, item.id, json(item), JSON.stringify(doc))
    .run();
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
