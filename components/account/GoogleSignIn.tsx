"use client";

import { LogIn } from "lucide-react";
import { accountsEnabled } from "@/lib/accounts";
import { openGoogleSignIn } from "@/lib/google-auth";
import { useI18n } from "@/lib/ui-lang";

/** A Google-branded entry point that opens the shared identity dialog. */
export function GoogleSignIn({ className = "", label, onStart }: { className?: string; label?: string; onStart?: () => void }) {
  const { t } = useI18n();
  if (!accountsEnabled) return null;
  return (
    <button
      type="button"
      onClick={() => {
        onStart?.();
        openGoogleSignIn();
      }}
      aria-label={label ?? t("auth.google")}
      className={`inline-flex h-10 w-full items-center justify-center gap-2.5 rounded-full border border-rule-strong bg-white px-4 text-[13.5px] font-medium text-[#1f1f1f] shadow-[0_1px_2px_rgb(0_0_0/0.06)] transition-[border-color,transform] hover:border-[#8a8a8a] active:scale-[0.98] ${className}`}
    >
      <GoogleMark />
      {label ?? t("auth.google")}
    </button>
  );
}

export function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.7 1.22 9.2 3.6l6.85-6.85C35.9 2.38 30.4 0 24 0 14.62 0 6.5 5.38 2.56 13.22l7.98 6.2C12.44 13.7 17.74 9.5 24 9.5Z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.14-3.09-.4-4.55H24v9.02h12.94c-.56 2.96-2.26 5.46-4.78 7.14l7.73 6c4.52-4.17 7.09-10.3 7.09-17.61Z" />
      <path fill="#FBBC05" d="M10.53 28.42a14.5 14.5 0 0 1 0-8.84l-7.97-6.2a24 24 0 0 0 0 21.24l7.97-6.2Z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.84l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.56-4.2-13.46-9.92l-7.98 6.2C6.5 42.62 14.62 48 24 48Z" />
    </svg>
  );
}
