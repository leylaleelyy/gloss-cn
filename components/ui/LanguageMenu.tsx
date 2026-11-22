"use client";

import { Languages } from "lucide-react";
import { Popover, barBtn } from "./Popover";
import { UI_LANGUAGES, useI18n } from "@/lib/ui-lang";
import { useStore } from "@/lib/store";
import { applySettings } from "@/lib/settings";

/** A small menu to switch the interface language. English is the default. */
export function LanguageMenu() {
  const { lang, t } = useI18n();
  const setSettings = useStore((s) => s.setSettings);
  return (
    <Popover
      label={t("topbar.language")}
      tip={t("topbar.languageTip")}
      triggerClass={barBtn}
      width={180}
      trigger={<><Languages size={18} strokeWidth={1.8} aria-hidden /><span className="toolbar-label">{lang === "zh" ? "中文" : "EN"}</span></>}
    >
      {(close) => (
        <div role="radiogroup" aria-label={t("topbar.language")} className="grid gap-1">
          {UI_LANGUAGES.map((l) => (
            <button
              key={l.key}
              type="button"
              role="radio"
              aria-checked={lang === l.key}
              onClick={() => {
                setSettings({ uiLanguage: l.key });
                applySettings(useStore.getState().settings);
                close();
              }}
              className={`flex min-h-11 w-full items-center justify-between rounded-lg px-3 text-left text-sm transition-colors ${lang === l.key ? "bg-sunk font-medium text-ink" : "text-ink-2 hover:bg-sunk"}`}
            >
              {l.label}
              {lang === l.key && <span className="size-1.5 rounded-full bg-[var(--rubric)]" aria-hidden />}
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}
