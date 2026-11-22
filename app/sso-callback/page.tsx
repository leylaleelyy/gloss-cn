"use client";

import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";
import { LoaderCircle } from "lucide-react";
import { accountsEnabled } from "@/lib/accounts";
import { useI18n } from "@/lib/ui-lang";

export default function SsoCallbackPage() {
  const { t } = useI18n();
  if (!accountsEnabled) {
    return (
      <main className="grid min-h-dvh place-items-center px-6 text-center">
        <p className="max-w-[420px] text-[14px] leading-relaxed text-ink-2">{t("auth.accountsOff")}</p>
      </main>
    );
  }
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <LoaderCircle size={22} className="animate-spin text-ink-3" aria-hidden />
        <p role="status" className="text-[14px] text-ink-2">{t("auth.finishing")}</p>
        <div className="hidden"><AuthenticateWithRedirectCallback /></div>
      </div>
    </main>
  );
}
