-- Gloss on Cloudflare D1 (SQLite). A signed-in reader's shelf, marks, notes
-- and vocabulary, mirrored from the browser. Every synced table has the same
-- shape so one sync route serves them all. Safe to run more than once.
--
-- npm run db:migrate        (remote)
-- npm run db:migrate:local  (local `next dev`)

create table if not exists articles (
  user_id text not null,
  id text not null,
  article_id text not null,
  data text not null,
  doc text,
  deleted integer not null default 0,
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  primary key (user_id, id)
);

create table if not exists highlights (
  user_id text not null,
  id text not null,
  article_id text not null,
  data text not null,
  deleted integer not null default 0,
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  primary key (user_id, id)
);

create table if not exists glosses (
  user_id text not null,
  id text not null,
  article_id text not null,
  data text not null,
  deleted integer not null default 0,
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  primary key (user_id, id)
);

create table if not exists briefs (
  user_id text not null,
  id text not null,
  article_id text not null,
  data text not null,
  deleted integer not null default 0,
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  primary key (user_id, id)
);

create table if not exists progress (
  user_id text not null,
  id text not null,
  article_id text not null,
  data text not null,
  deleted integer not null default 0,
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  primary key (user_id, id)
);

create table if not exists vocabulary (
  user_id text not null,
  id text not null,
  article_id text not null,
  data text not null,
  deleted integer not null default 0,
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  primary key (user_id, id)
);

create table if not exists learning (
  user_id text not null,
  id text not null,
  article_id text not null,
  data text not null,
  deleted integer not null default 0,
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  primary key (user_id, id)
);

create index if not exists articles_user_updated on articles (user_id, updated_at);
create index if not exists highlights_user_updated on highlights (user_id, updated_at);
create index if not exists glosses_user_updated on glosses (user_id, updated_at);
create index if not exists briefs_user_updated on briefs (user_id, updated_at);
create index if not exists progress_user_updated on progress (user_id, updated_at);
create index if not exists vocabulary_user_updated on vocabulary (user_id, updated_at);
create index if not exists learning_user_updated on learning (user_id, updated_at);

-- Painted covers for signed-in readers, so another device fetches them.
create table if not exists covers (
  user_id text not null,
  id text not null,
  jpeg text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  primary key (user_id, id)
);

-- Tokens that let a reader's agent save to their library through /mcp.
create table if not exists agent_tokens (
  id text primary key,
  user_id text not null,
  hash text not null unique,
  label text not null default '',
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_used_at text,
  revoked integer not null default 0
);
create index if not exists agent_tokens_user on agent_tokens (user_id);

-- Account-wide preferences that are safe to carry between devices. Device-only
-- typography and API keys are never stored here.
create table if not exists settings (
  user_id text not null,
  id text not null,
  article_id text not null,
  data text not null,
  deleted integer not null default 0,
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  primary key (user_id, id)
);
create index if not exists settings_user_updated on settings (user_id, updated_at);

-- Large book texts are stored as gzip chunks, so an image-heavy EPUB can sync
-- without exceeding one request or one D1 row. articles.doc carries a small
-- {"__chunked":true} marker.
create table if not exists article_docs (
  user_id text not null,
  article_id text not null,
  seq integer not null,
  data text not null,
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  primary key (user_id, article_id, seq)
);
create index if not exists article_docs_user on article_docs (user_id, article_id);

-- Versioned document chunks so an interrupted upload never overwrites the
-- previous complete text; old chunks are pruned once the article row commits.
create table if not exists doc_chunks (
  user_id text not null,
  article_id text not null,
  upload_id text not null,
  seq integer not null,
  data text not null,
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  primary key (user_id, article_id, upload_id, seq)
);
create index if not exists doc_chunks_user on doc_chunks (user_id, article_id, upload_id);

-- Pictures from an EPUB are uploaded as individual assets, so the book text
-- stays small and an image-heavy book does not hit Worker CPU limits.
create table if not exists assets (
  user_id text not null,
  article_id text not null,
  id text not null,
  mime text not null,
  data text not null,
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  primary key (user_id, article_id, id)
);
