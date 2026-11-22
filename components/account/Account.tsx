"use client";

import { Show, SignInButton, UserButton } from "@/components/account/Auth";
import { GoogleSignIn } from "@/components/account/GoogleSignIn";
import { Popover, barBtn } from "@/components/ui/Popover";
import { accountsEnabled } from "@/lib/accounts";
import { useSyncStatus } from "@/lib/sync-status";
import { useI18n } from "@/lib/ui-lang";

/** Signed out: a quiet sign-in menu led by Google. Signed in: the avatar, with Clerk's account menu and a sync dot. */
export function Account() {
  const { t } = useI18n();
  const sync = useSyncStatus((s) => s.state);
  if (!accountsEnabled) return null;
  return (
    <>
      <Show when="signed-out">
        <Popover
          label={t("auth.signIn")}
          tip={t("auth.syncTitle")}
          width={300}
          triggerClass={`${barBtn} !px-3 whitespace-nowrap`}
          trigger={<span>{t("auth.signIn")}</span>}
        >
          {(close) => (
            <div>
              <p className="text-[15px] font-medium leading-tight text-ink">{t("auth.syncTitle")}</p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-3">{t("auth.syncBody")}</p>
              <div className="mt-3.5">
                <GoogleSignIn onStart={close} />
              </div>
              <div className="mt-3 border-t border-rule pt-2.5 text-center">
                <SignInButton mode="modal">
                  <button type="button" className="min-h-9 rounded-full px-2 text-[12.5px] font-medium text-ink-3 transition-colors hover:bg-sunk hover:text-ink">
                    {t("auth.other")}
                  </button>
                </SignInButton>
              </div>
            </div>
          )}
        </Popover>
      </Show>
      <Show when="signed-in">
        <span className="relative grid size-9 place-items-center">
          <UserButton appearance={{ elements: { avatarBox: "size-7" } }} />
          <span
            role="status"
            aria-label={sync === "synced" ? t("auth.syncOn") : sync === "syncing" ? t("auth.syncing") : t("auth.syncOff")}
            title={sync === "synced" ? t("auth.syncOn") : sync === "syncing" ? t("auth.syncing") : t("auth.syncOff")}
            className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-bg ${
              sync === "synced" ? "bg-[var(--good)]" : sync === "syncing" ? "animate-pulse bg-[var(--rubric)]" : sync === "error" ? "bg-[var(--rubric)]" : "bg-ink-4"
            }`}
          />
        </span>
      </Show>
    </>
  );
}
