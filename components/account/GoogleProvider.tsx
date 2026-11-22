"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { accountsEnabled } from "@/lib/accounts";
import { initGoogleAuth, setGoogleConfigured, setGoogleCredential, useGoogleAuth } from "@/lib/google-auth";
import { useI18n } from "@/lib/ui-lang";

/** Loads Google Identity Services and owns the one sign-in dialog. */
export function GoogleProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const buttonRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const { user, loaded } = useGoogleAuth();
  const { t } = useI18n();

  useEffect(() => {
    initGoogleAuth();
    if (!accountsEnabled) return;
    const show = () => setOpen(true);
    window.addEventListener("gloss:google-signin", show);
    fetch("/api/config")
      .then((response) => response.json())
      .then((data: { googleClientId?: string }) => {
        const id = data.googleClientId ?? "";
        setClientId(id);
        setGoogleConfigured(Boolean(id));
      })
      .catch(() => {
        setClientId("");
        setGoogleConfigured(false);
      });
    return () => window.removeEventListener("gloss:google-signin", show);
  }, []);

  useEffect(() => {
    if (!accountsEnabled || !clientId) return;
    let cancelled = false;
    const init = () => {
      if (cancelled || initialized.current || !window.google) return;
      initialized.current = true;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response: { credential?: string }) => {
          if (response.credential) setGoogleCredential(response.credential);
          setOpen(false);
        },
        auto_select: false,
        cancel_on_tap_outside: true,
        ux_mode: "popup",
      });
      setReady(true);
    };
    if (window.google) {
      init();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    const script = existing ?? document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    const fail = () => !cancelled && setFailed(true);
    script.addEventListener("load", init);
    script.addEventListener("error", fail);
    if (!existing) document.head.appendChild(script);
    return () => {
      cancelled = true;
      script.removeEventListener("load", init);
      script.removeEventListener("error", fail);
    };
  }, [clientId]);

  // Draw Google's own button only while the dialog is visible.
  useLayoutEffect(() => {
    if (!open || !ready || !clientId || !buttonRef.current || !window.google) return;
    buttonRef.current.replaceChildren();
    window.google.accounts.id.renderButton(buttonRef.current, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "continue_with",
      shape: "pill",
      logo_alignment: "left",
      width: 260,
    });
  }, [open, ready, clientId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  return (
    <>
      {children}
      {accountsEnabled && open && !(loaded && user) && (
        <div className="fixed inset-0 z-[95] grid place-items-center bg-ink/20 p-4 backdrop-blur-[2px]" style={{ animation: "fade 0.18s" }} onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal aria-label={t("auth.signIn")} className="w-full max-w-[360px] rounded-[22px] border border-rule bg-raised p-5 shadow-pop" onClick={(event) => event.stopPropagation()} style={{ animation: "pop-in 0.22s var(--ease-out)" }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-serif text-[22px] leading-tight text-ink">{t("auth.syncTitle")}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">{t("auth.syncBody")}</p>
              </div>
              <button type="button" aria-label={t("reader.close")} onClick={() => setOpen(false)} className="grid size-8 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:bg-sunk hover:text-ink">
                <X size={16} />
              </button>
            </div>
            <div className="mt-5 flex min-h-[44px] justify-center">
              {failed ? (
                <p role="alert" className="text-center text-[12.5px] leading-relaxed text-rubric-text">{t("auth.scriptFailed")}</p>
              ) : clientId === "" ? (
                <p role="alert" className="text-center text-[12.5px] leading-relaxed text-rubric-text">{t("auth.notConfigured")}</p>
              ) : (
                <div ref={buttonRef} />
              )}
            </div>
            <p className="mt-4 text-center text-[11.5px] leading-relaxed text-ink-4">{t("auth.googleOnly")}</p>
          </div>
        </div>
      )}
    </>
  );
}
