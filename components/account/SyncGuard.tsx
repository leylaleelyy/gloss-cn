"use client";

import { useEffect } from "react";
import { ShieldAlert } from "lucide-react";
import { answerSyncGuard, useSyncGuard } from "@/lib/sync-guard";
import { useI18n } from "@/lib/ui-lang";

/** A second look before a sync pass removes a lot from the account. */
export function SyncGuard() {
  const request = useSyncGuard((s) => s.request);
  const { t } = useI18n();

  useEffect(() => {
    if (!request) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      answerSyncGuard(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [request]);

  if (!request) return null;
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-ink/25 p-4 backdrop-blur-[2px]" style={{ animation: "fade 0.18s" }} onClick={() => answerSyncGuard(false)}>
      <div role="dialog" aria-modal aria-label={t("syncGuard.title")} className="w-full max-w-[380px] rounded-[22px] border border-rule bg-raised p-5 shadow-pop" onClick={(event) => event.stopPropagation()} style={{ animation: "pop-in 0.22s var(--ease-out)" }}>
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--rubric-wash)] text-rubric-text" aria-hidden>
            <ShieldAlert size={19} />
          </span>
          <div>
            <p className="font-serif text-[21px] leading-tight text-ink">{t("syncGuard.title")}</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">{t("syncGuard.body", { articles: request.articles, total: request.total })}</p>
          </div>
        </div>
        <p className="mt-3 rounded-[10px] bg-sunk/70 px-3 py-2 text-[12px] leading-relaxed text-ink-3">{t("syncGuard.hint")}</p>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={() => answerSyncGuard(false)} className="inline-flex h-9 items-center rounded-full px-3.5 text-[13px] font-medium text-ink-2 transition-colors hover:bg-sunk hover:text-ink">
            {t("syncGuard.cancel")}
          </button>
          <button type="button" onClick={() => answerSyncGuard(true)} className="inline-flex h-9 items-center rounded-full bg-rubric px-4 text-[13px] font-medium text-white transition-transform active:scale-[0.98]">
            {t("syncGuard.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
