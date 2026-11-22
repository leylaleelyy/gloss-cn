"use client";

import { LogOut } from "lucide-react";
import { Popover, barBtn } from "@/components/ui/Popover";
import { accountsEnabled } from "@/lib/accounts";
import { openGoogleSignIn, signOutGoogle, useGoogleAuth } from "@/lib/google-auth";
import { useSyncStatus } from "@/lib/sync-status";
import { useI18n } from "@/lib/ui-lang";

/** Signed out: a quiet sign-in menu led by Google. Signed in: the avatar, the account, and a sync dot. */
export function Account() {
  const { t } = useI18n();
  const { loaded, configured, user } = useGoogleAuth();
  const sync = useSyncStatus((s) => s.state);
  if (!accountsEnabled || !loaded || configured !== true) return null;

  if (!user) {
    return (
      <button
        type="button"
        onClick={openGoogleSignIn}
        className={`${barBtn} !px-3 whitespace-nowrap`}
        data-tip={t("auth.syncTitle")}
      >
        {t("auth.signIn")}
      </button>
    );
  }

  const state = sync === "synced" ? t("auth.syncOn") : sync === "syncing" ? t("auth.syncing") : t("auth.syncOff");
  return (
    <Popover
      label={t("auth.account")}
      tip={state}
      width={280}
      triggerClass="relative grid size-9 place-items-center rounded-full"
      trigger={
        <span className="relative grid size-9 place-items-center">
          {user.picture ? (
            // Google avatars are served from googleusercontent.com and need no referrer.
            <img src={user.picture} alt="" referrerPolicy="no-referrer" className="size-7 rounded-full" />
          ) : (
            <span className="grid size-7 place-items-center rounded-full bg-sunk text-[12px] font-semibold text-ink-2">{user.name.slice(0, 1).toUpperCase()}</span>
          )}
          <span
            role="status"
            aria-label={state}
            title={state}
            className={`absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-bg ${
              sync === "synced" ? "bg-[var(--good)]" : sync === "syncing" ? "animate-pulse bg-[var(--rubric)]" : sync === "error" ? "bg-[var(--rubric)]" : "bg-ink-4"
            }`}
          />
        </span>
      }
    >
      {() => (
        <div>
          <div className="flex items-center gap-3">
            {user.picture ? (
              <img src={user.picture} alt="" referrerPolicy="no-referrer" className="size-10 rounded-full" />
            ) : (
              <span className="grid size-10 place-items-center rounded-full bg-sunk font-semibold text-ink-2">{user.name.slice(0, 1).toUpperCase()}</span>
            )}
            <div className="min-w-0">
              <p className="truncate text-[14px] font-medium text-ink">{user.name}</p>
              <p className="truncate text-[12px] text-ink-3">{user.email}</p>
            </div>
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[12px] text-ink-3">
            <span className={`size-1.5 rounded-full ${sync === "synced" ? "bg-[var(--good)]" : sync === "syncing" ? "animate-pulse bg-[var(--rubric)]" : "bg-ink-4"}`} aria-hidden />
            {state}
          </p>
          <button
            type="button"
            onClick={signOutGoogle}
            className="mt-3 flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] text-ink-2 transition-colors hover:bg-sunk hover:text-ink"
          >
            <LogOut size={15} /> {t("auth.signOut")}
          </button>
        </div>
      )}
    </Popover>
  );
}
