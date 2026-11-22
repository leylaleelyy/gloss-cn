"use client";

import { SignInButton } from "@/components/account/Auth";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, BookOpen, BookmarkPlus, Check, Copy, FileUp, Link2, Loader2, Plus, Trash2, X } from "lucide-react";
import { importFromUrl, importFromFile, keep, looksLikeUrl } from "@/lib/import";
import { accountsEnabled } from "@/lib/accounts";
import { googleAuthHeaders, useGoogleAuth } from "@/lib/google-auth";
import { normalizeUrl } from "@/lib/links";
import { useStore } from "@/lib/store";
import { Mark, MarkStack, type AgentMark } from "./AgentMarks";
import { Glyph } from "./Book";
import { useI18n } from "@/lib/ui-lang";

export type AddTab = "links" | "agent" | "files";

/**
 * Adding to the library: paste links (one or many), or connect an agent that
 * saves to it through the Gloss MCP server.
 */
export function AddPanel({ tab, onTab, onClose, signedIn }: { tab: AddTab; onTab: (t: AddTab) => void; onClose: () => void; signedIn: boolean }) {
  const { t } = useI18n();
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", key);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[80]" role="presentation">
      <div className="absolute inset-0 bg-ink/20 backdrop-blur-[2px]" style={{ animation: "fade 0.2s both" }} onClick={onClose} />
      <section role="dialog" aria-modal aria-label={t("add.dialog")} className="add-panel">
        <header className="flex items-center justify-between gap-3">
          <div className="lib-sort no-scrollbar !ml-0 max-w-[calc(100%-2.75rem)] overflow-x-auto" role="tablist" aria-label={t("add.title")}>
            <button type="button" role="tab" aria-selected={tab === "agent"} aria-checked={tab === "agent"} onClick={() => onTab("agent")} className="whitespace-nowrap">
              <span className="sm:hidden">{t("add.agentShort")}</span><span className="hidden sm:inline">{t("add.agent")}</span>
            </button>
            <button type="button" role="tab" aria-selected={tab === "links"} aria-checked={tab === "links"} onClick={() => onTab("links")} className="whitespace-nowrap">
              <span className="sm:hidden">{t("add.linksShort")}</span><span className="hidden sm:inline">{t("add.links")}</span>
            </button>
            <button type="button" role="tab" aria-selected={tab === "files"} onClick={() => onTab("files")} className="whitespace-nowrap">
              <span className="sm:hidden">{t("add.filesShort")}</span><span className="hidden sm:inline">{t("add.files")}</span>
            </button>
          </div>
          <button type="button" aria-label={t("add.close")} data-tip={t("add.close")} data-tip-kbd="Esc" onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:bg-sunk hover:text-ink">
            <X size={17} />
          </button>
        </header>
        {tab === "files" ? <Files /> : tab === "links" ? <Links /> : <Agent signedIn={signedIn} />}
      </section>
    </div>,
    document.body
  );
}

/**
 * What opens the panel: plain about adding articles, with the agents that can
 * do it for you. On hover the marks fan out to the right from Grok, which
 * holds its place, and the plus turns.
 */
export function AddButton({ onClick, compact }: { onClick: () => void; compact?: boolean }) {
  const { t } = useI18n();
  return (
    <button type="button" onClick={onClick} className={`lib-add${compact ? " is-compact" : ""}`}>
      <MarkStack size={compact ? 22 : 26} />
      <span className="min-w-0 text-left">
        <span className="lib-add-title">{t("add.title")}</span>
        {!compact && <span className="lib-add-sub">{t("add.subtitle")}</span>}
      </span>
      {!compact && (
        <span className="lib-add-plus" aria-hidden>
          <Plus size={15} strokeWidth={2.2} />
        </span>
      )}
    </button>
  );
}

/* ---------- links ---------- */

type Row = { url: string; state: "waiting" | "reading" | "saved" | "already" | "failed"; title?: string; error?: string };

/** How many links one Save reads in. A Pocket export can hold thousands; the rest wait in the box for the next Save. */
const BATCH = 100;

/** Every web link in an export: Pocket, Instapaper and Raindrop CSVs, Pocket's HTML, or a plain list. */
function linksIn(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s"'<>,]+/gi) ?? [];
  return [...new Set(found.map((u) => u.replace(/[).;\]]+$/, "")))];
}

function Links() {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);

  const urls = [...new Set(text.split(/[\s,]+/).map((s) => s.trim()).filter(looksLikeUrl))];

  const fromExport = async (f: File) => {
    const found = linksIn(await f.text().catch(() => ""));
    if (!found.length) return setNote(`No links found in ${f.name}.`);
    setText((cur) => [cur.trim(), ...found].filter(Boolean).join("\n"));
    setNote(`Found ${found.length} link${found.length === 1 ? "" : "s"} in ${f.name}.`);
  };

  const save = async () => {
    if (!urls.length || busy) return;
    setBusy(true);
    const have = new Set(useStore.getState().library.flatMap((x) => (x.sourceUrl ? [normalizeUrl(x.sourceUrl)] : [])));
    const all: Row[] = urls.map((url) => ({ url, state: have.has(normalizeUrl(url)) ? "already" : "waiting" }));
    const fresh = all.filter((r) => r.state === "waiting");
    const known = all.length - fresh.length;
    const rest = fresh.slice(BATCH).map((r) => r.url);
    // A long export lists only what is being read now; a short paste shows every link, saved before or not.
    const list = all.length > BATCH ? fresh.slice(0, BATCH) : all;
    setRows(list);
    setText(rest.join("\n"));
    setNote(
      all.length > BATCH
        ? [rest.length ? `Saving ${BATCH} now; ${rest.length} more wait above for the next Save.` : `Saving ${fresh.length}.`, known ? `${known} already in your library.` : ""].filter(Boolean).join(" ")
        : null
    );
    const set = (i: number, r: Partial<Row>) => setRows((cur) => cur.map((x, j) => (j === i ? { ...x, ...r } : x)));
    const todo = list.map((r, i) => ({ r, i })).filter((x) => x.r.state === "waiting");
    const next = async () => {
      for (let x = todo.shift(); x; x = todo.shift()) {
        set(x.i, { state: "reading" });
        const r = await importFromUrl(x.r.url, (_, label) => label && set(x!.i, { title: label }));
        const err = r.ok ? await keep(r.article, r.file) : r.error;
        set(x.i, err ? { state: "failed", error: err, title: undefined } : { state: "saved", title: r.ok ? r.article.title : undefined });
      }
    };
    // A few at a time, so a slow site never holds the rest up.
    await Promise.all([next(), next(), next()]);
    setBusy(false);
  };

  return (
    <div className="mt-5">
      <p className="text-[19px] font-serif leading-tight text-ink">{t("links.title")}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{t("links.intro")}</p>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.html,.htm,.txt,.json,text/csv,text/html,text/plain,application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void fromExport(f);
          e.target.value = "";
        }}
      />
      <div
        className={`mt-3 overflow-hidden rounded-[14px] border bg-bg transition-colors ${over ? "border-[var(--rubric)] bg-[var(--rubric-wash)]" : "border-rule focus-within:border-rule-strong"}`}
        onDragOver={(e) => {
          if (!Array.from(e.dataTransfer.types).includes("Files")) return;
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
        }}
        onDrop={(e) => {
          const f = e.dataTransfer.files?.[0];
          setOver(false);
          if (!f) return;
          e.preventDefault();
          void fromExport(f);
        }}
      >
        <div className="flex items-center justify-between gap-2 px-3.5 pt-2.5">
          <span className="text-[11.5px] font-medium text-ink-4">{over ? t("links.dropHint") : t("links.pasteHint")}</span>
          <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11.5px] font-medium text-ink-3 transition-colors hover:bg-sunk hover:text-ink">
            <FileUp size={13} aria-hidden /> {t("links.import")}
          </button>
        </div>
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void save();
            }
          }}
          placeholder={"https://paulgraham.com/greatwork.html\nhttps://..."}
          rows={4}
          className="block w-full resize-y bg-transparent px-3.5 py-2 text-[13.5px] leading-relaxed text-ink outline-none placeholder:text-ink-4"
          aria-label="Links to save"
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-rule px-3 py-2">
          <span className={`rounded-full px-2 py-0.5 text-[11.5px] tabular-nums ${urls.length ? "bg-[var(--rubric-wash)] text-rubric-text" : "text-ink-4"}`}>
            {urls.length ? t(urls.length === 1 ? "links.count" : "links.countPlural", { count: urls.length }) : text.trim() ? t("links.notFound") : t("links.none")}
          </span>
          <div className="flex items-center gap-2">
            {text && (
              <button type="button" onClick={() => { setText(""); setNote(null); ref.current?.focus(); }} className="rounded-full px-2.5 py-1 text-[12px] text-ink-3 transition-colors hover:bg-sunk hover:text-ink">
                {t("links.clear")}
              </button>
            )}
            <button type="button" onClick={save} disabled={!urls.length || busy} className="add-btn">
              {busy && <Loader2 size={14} className="animate-spin" />}
              {busy ? t("links.saving") : urls.length > 1 ? t("links.saveN", { count: Math.min(urls.length, BATCH) }) : t("links.save")}
            </button>
          </div>
        </div>
      </div>
      {note && <p className="mt-2 text-[12.5px] text-ink-3">{note}</p>}
      {rows.length > 0 && (
        <ul className="add-rows scroll-thin">
          {rows.map((r) => (
            <li key={r.url} data-state={r.state}>
              <span className="add-dot" aria-hidden>
                {r.state === "reading" ? <Loader2 size={13} className="animate-spin" /> : r.state === "saved" || r.state === "already" ? <Check size={13} /> : r.state === "failed" ? <X size={13} /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] text-ink">{r.title ?? r.url.replace(/^https?:\/\/(www\.)?/, "")}</span>
                <span className="block truncate text-[12px] text-ink-3">
                  {r.state === "saved" ? "On the shelf" : r.state === "already" ? "Already in your library" : r.state === "failed" ? r.error : r.state === "reading" ? "Reading" : "Waiting"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <Bookmarklets />
    </div>
  );
}

/**
 * Bookmarklets: one click on any page opens it in Gloss, in a new tab, to read now
 * or to shelve for later (`/?url=` and `/?save=` on the home page).
 */
function Bookmarklets() {
  const readRef = useRef<HTMLAnchorElement>(null);
  const saveRef = useRef<HTMLAnchorElement>(null);
  const [origin, setOrigin] = useState("https://usegloss.io");
  const code = (param: "url" | "save") => `javascript:void(window.open('${origin}/?${param}='+encodeURIComponent(location.href)))`;
  useEffect(() => setOrigin(window.location.origin), []);
  // React refuses javascript: links in JSX, so they are set by hand.
  useEffect(() => {
    readRef.current?.setAttribute("href", code("url"));
    saveRef.current?.setAttribute("href", code("save"));
  });
  const pill = "inline-flex cursor-grab items-center gap-1.5 rounded-full border border-rule-strong bg-bg px-3 py-1.5 text-[13px] font-medium text-ink shadow-[var(--shadow-card)] active:cursor-grabbing";
  return (
    <div className="mt-6 border-t border-rule pt-5">
      <p className="lib-label">From any page</p>
      <p className="mt-1 text-[13px] text-ink-3">Drag one to your bookmarks bar, then click it on any article.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a ref={readRef} onClick={(e) => e.preventDefault()} data-tip="Drag me to your bookmarks bar" className={pill}>
          <BookOpen size={14} className="text-ink-3" /> Read in Gloss
        </a>
        <a ref={saveRef} onClick={(e) => e.preventDefault()} data-tip="Drag me to your bookmarks bar" className={pill}>
          <BookmarkPlus size={14} className="text-ink-3" /> Save to Gloss
        </a>
      </div>
      <details className="mt-3 text-[12.5px] text-ink-3">
        <summary className="cursor-pointer select-none hover:text-ink-2">On a phone</summary>
        <div className="mt-2">
          <CopyBlock title="Bookmark any page, then edit the bookmark" body="Paste this as its address and name it Save to Gloss." text={code("save")} />
        </div>
      </details>
    </div>
  );
}

/* ---------- an agent ---------- */

type Conn = { id: string; label: string; createdAt: string; lastUsedAt: string | null };
const LABELS: { label: string; mark?: AgentMark }[] = [
  { label: "Grok Bot", mark: "grok" },
  { label: "Claude", mark: "claude" },
  { label: "ChatGPT", mark: "chatgpt" },
  { label: "Other" },
];

function Agent({ signedIn }: { signedIn: boolean }) {
  const { t } = useI18n();
  const configured = useGoogleAuth((state) => state.configured);
  const [conns, setConns] = useState<Conn[] | null>(null);
  const [made, setMade] = useState<{ token: string; label: string } | null>(null);
  const [label, setLabel] = useState("Grok Bot");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "https://usegloss.io";

  useEffect(() => {
    if (!signedIn) return;
    fetch("/api/agent-tokens", { headers: googleAuthHeaders() })
      .then((r) => r.json())
      .then((j: { tokens?: Conn[] }) => setConns(j.tokens ?? []))
      .catch(() => setConns([]));
  }, [signedIn]);

  if (!signedIn)
    return (
      <div className="mt-5">
        <AgentIntro />
        <div className="mt-4 rounded-[14px] border border-rule bg-bg px-4 py-4">
          <p className="text-[13.5px] leading-relaxed text-ink-2">{accountsEnabled && configured === true ? t("agent.signInBody") : t("agent.accountsOff")}</p>
          {accountsEnabled && configured === true && (
            <SignInButton mode="modal">
              <button type="button" className="add-btn mt-3">
                {t("agent.signIn")}
              </button>
            </SignInButton>
          )}
        </div>
      </div>
    );

  const create = async () => {
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/agent-tokens", { method: "POST", headers: { "Content-Type": "application/json", ...googleAuthHeaders() }, body: JSON.stringify({ label }) });
    const j = (await res.json().catch(() => ({}))) as { id?: string; token?: string; label?: string; error?: string };
    setBusy(false);
    if (!res.ok || !j.token || !j.id) return setErr(j.error ?? "Could not make a connection. Try again.");
    setMade({ token: j.token, label: j.label ?? label });
    setConns((c) => [{ id: j.id!, label: j.label ?? label, createdAt: new Date().toISOString(), lastUsedAt: null }, ...(c ?? [])]);
  };

  const revoke = async (id: string) => {
    setConns((c) => c?.filter((x) => x.id !== id) ?? null);
    await fetch(`/api/agent-tokens?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: googleAuthHeaders() }).catch(() => {});
  };

  return (
    <div className="mt-5">
      <AgentIntro />
      {made ? (
        <Setup token={made.token} label={made.label} origin={origin} />
      ) : (
        <div className="mt-4 rounded-[14px] border border-rule bg-bg p-3.5">
          <p className="text-[12px] font-medium text-ink-3">{t("agent.stepChoose")}</p>
          <div className="lib-sort !ml-0 mt-2 max-w-full overflow-x-auto no-scrollbar" role="radiogroup" aria-label={t("agent.which")}>
            {LABELS.map((l) => (
              <button key={l.label} type="button" role="radio" aria-checked={label === l.label} onClick={() => setLabel(l.label)} className="inline-flex whitespace-nowrap items-center gap-1.5">
                {l.mark && <Mark k={l.mark} size={14} />}
                {l.label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-rule pt-3">
            <p className="text-[12px] leading-snug text-ink-3">{t("agent.stepCreate")}</p>
            <button type="button" onClick={create} disabled={busy} className="add-btn">
              {busy && <Loader2 size={14} className="animate-spin" />}
              {busy ? t("agent.making") : t("agent.make")}
            </button>
          </div>
          {err && <p className="mt-2 text-[12.5px] text-rubric-text">{err}</p>}
        </div>
      )}
      {conns && conns.length > 0 && (
        <div className="mt-6">
          <p className="lib-label">{t("agent.connected")}</p>
          <ul className="mt-2 space-y-2">
            {conns.map((c) => (
              <li key={c.id} className="flex items-center gap-3 rounded-[12px] border border-rule bg-bg px-3 py-2.5 text-[13px]">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sunk text-ink-3" aria-hidden><Link2 size={15} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{c.label}</span>
                  <span className="block text-[12px] text-ink-3">
                    {c.lastUsedAt ? t("agent.lastUsed", { date: new Date(c.lastUsedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" }) }) : t("agent.notUsed")}
                  </span>
                </span>
                <button type="button" onClick={() => revoke(c.id)} className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] text-ink-3 transition-colors hover:bg-sunk hover:text-ink">
                  <Trash2 size={13} /> {t("agent.revoke")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function AgentIntro() {
  return (
    <div className="flex items-start gap-3.5">
      <Glyph k="agent" size={46} className="shrink-0" />
      <div>
        <p className="font-serif text-[19px] leading-tight text-ink">Let your agent shelve for you</p>
        <p className="mt-1 text-[13px] leading-[1.55] text-ink-3">
          Give Grok Bot, Claude or ChatGPT a private connection to your Gloss library. Ask it to save articles, and each one is read in, sorted onto a topic, and waiting on your shelves next time you open Gloss.
        </p>
      </div>
    </div>
  );
}

const PROMPT = "Go through my X bookmarks from the last month, find the ones that link to articles, essays or papers, and save those links to my Gloss library.";

function Setup({ token, label, origin }: { token: string; label: string; origin: string }) {
  const url = `${origin}/mcp`;
  const steps: { title: string; body: string; copy: string }[] =
    label === "Grok Bot" || label === "Grok"
      ? [
          { title: "Grok Bot: say this in a chat", body: "It asks you to confirm; then the Gloss tools are ready.", copy: `Add a custom MCP server called Gloss at ${url} with the header Authorization set to Bearer ${token}` },
        ]
      : label === "Claude"
        ? [
            { title: "Claude Code: run this", body: "Then ask Claude to save something to your Gloss library.", copy: `claude mcp add --transport http gloss ${url} --header "Authorization: Bearer ${token}"` },
            { title: "Or claude.ai: Settings, Connectors, Add custom connector", body: "This link carries your token, so keep it private.", copy: `${url}/${token}` },
          ]
        : [
            { title: "The server URL and a header", body: `URL ${url}, and this header:`, copy: `Authorization: Bearer ${token}` },
            { title: "Or, for apps that only take a URL, one with your token in it", body: "Keep it private: it can end up in logs.", copy: `${url}/${token}` },
          ];
  return (
    <div className="mt-5 space-y-3">
      <p className="text-[13px] text-good">Made. This token is shown once: copy it now.</p>
      {steps.map((s) => (
        <CopyBlock key={s.title} title={s.title} body={s.body} text={s.copy} />
      ))}
      <CopyBlock title="Then ask it something like" body="Agents save the article a post links to. When the post is the piece, like an X Article or a long post, they send its text." text={PROMPT} />
    </div>
  );
}

function CopyBlock({ title, body, text }: { title: string; body: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-[14px] border border-rule bg-bg p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-ink">{title}</p>
          <p className="text-[12px] text-ink-3">{body}</p>
        </div>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            } catch {}
          }}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-sunk px-2.5 py-1 text-[12px] font-medium text-ink-2 transition-colors hover:text-ink"
        >
          {copied ? <Check size={12} className="text-good" /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-sunk px-2.5 py-2 text-[11.5px] leading-relaxed text-ink-2">{text}</pre>
    </div>
  );
}


function Files() {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<{ name: string; title?: string; status: "working" | "ok" | "error"; detail?: string }[]>([]);
  const pending = useRef(false);

  const supported = (file: File) => /\.(epub|pdf|txt|md|markdown)$/i.test(file.name);

  const open = async (files: File[]) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      let next = items.length;
      for (const file of files) {
        if (!supported(file)) {
          setItems((list) => [...list, { name: file.name, status: "error", detail: t("files.unsupported") }]);
          continue;
        }
        const index = next++;
        setItems((list) => [...list, { name: file.name, status: "working", detail: t("files.reading") }]);
        const update = (patch: { title?: string; status?: "working" | "ok" | "error"; detail?: string }) =>
          setItems((list) => list.map((item, i) => (i === index ? { ...item, ...patch } : item)));
        const result = await importFromFile(file, (_, label) => update({ detail: label || t("files.reading") }));
        if (!result.ok) {
          update({ status: "error", detail: result.error });
          continue;
        }
        const error = await keep(result.article, result.file);
        if (error) update({ status: "error", detail: error });
        else update({ status: "ok", title: result.article.title, detail: t("files.saved") });
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="mt-5">
      <div
        role="button"
        tabIndex={busy ? -1 : 0}
        aria-disabled={busy}
        aria-label={t("files.choose")}
        onClick={() => !busy && input.current?.click()}
        onKeyDown={(event) => {
          if (busy) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            input.current?.click();
          }
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void open(Array.from(event.dataTransfer.files));
        }}
        className={`group rounded-[18px] border-2 border-dashed px-6 py-7 text-center outline-none transition-[border-color,background-color,transform] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rubric)] ${
          busy
            ? "cursor-default border-rule bg-bg/60"
            : dragging
              ? "scale-[0.995] cursor-copy border-[var(--rubric)] bg-[var(--rubric-wash)]"
              : "cursor-pointer border-rule bg-bg hover:border-rule-strong hover:bg-sunk/40"
        }`}
      >
        <span className={`mx-auto grid size-12 place-items-center rounded-[14px] transition-colors ${dragging ? "bg-[var(--rubric)] text-white" : "bg-sunk text-ink-3 group-hover:text-ink-2"}`} aria-hidden>
          {busy ? <Loader2 size={22} className="animate-spin" /> : <FileUp size={22} strokeWidth={1.8} />}
        </span>
        <p className="mt-3 text-[15px] font-medium leading-tight text-ink">{dragging ? t("files.dropNow") : t("files.dropTitle")}</p>
        <p className="mx-auto mt-1.5 max-w-[320px] text-[13px] leading-relaxed text-ink-3">{t("files.hint")}</p>
        <span className={`mt-4 inline-flex h-9 items-center rounded-full px-4 text-[13px] font-medium transition-colors ${busy ? "bg-sunk text-ink-3" : "bg-ink text-bg group-hover:bg-ink/90"}`}>
          {busy ? t("files.opening") : t("files.choose")}
        </span>
        <p className="mt-3 text-[11.5px] tracking-wide text-ink-4">{t("files.formats")}</p>
      </div>
      <input
        ref={input}
        className="sr-only"
        aria-label={t("files.choose")}
        type="file"
        multiple
        disabled={busy}
        accept=".epub,.pdf,.txt,.md,.markdown,application/epub+zip,application/pdf,text/plain,text/markdown"
        onChange={(event) => {
          const files = Array.from(event.target.files || []);
          event.target.value = "";
          void open(files);
        }}
      />

      {items.length > 0 && (
        <ul role="status" aria-live="polite" className="mt-3 space-y-2">
          {items.map((item, index) => (
            <li key={`${item.name}:${index}`} className="flex items-start gap-3 rounded-[12px] border border-rule bg-bg px-3 py-2.5">
              <span className={`mt-[1px] shrink-0 ${item.status === "ok" ? "text-good" : item.status === "error" ? "text-rubric-text" : "text-ink-4"}`} aria-hidden>
                {item.status === "working" ? <Loader2 size={15} className="animate-spin" /> : item.status === "ok" ? <Check size={15} /> : <AlertCircle size={15} />}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium leading-snug text-ink">{item.title ?? item.name}</span>
                <span className={`mt-0.5 block truncate text-[12px] leading-snug ${item.status === "error" ? "text-rubric-text" : "text-ink-3"}`}>{item.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
