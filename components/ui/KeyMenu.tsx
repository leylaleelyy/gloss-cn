"use client";

import { useEffect, useRef, useState } from "react";
import { VisionSettings } from "./VisionSettings";
import { KeyRound } from "lucide-react";
import { EMPTY_PROVIDER, PROVIDER_STORAGE, normalizeProvider, readProvider, type ProviderConfig } from "@/lib/provider-config";
import { Popover, barBtn } from "./Popover";
import { useI18n } from "@/lib/ui-lang";

const PRESETS = [
  { id: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com", model: "deepseek-flash" },
  { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini" },
];
const presetFor = (config: ProviderConfig) => PRESETS.find((preset) =>
  config.baseUrl.replace(/\/+$/, "") === preset.baseUrl ||
  (preset.id === "deepseek" && config.baseUrl.replace(/\/+$/, "") === `${preset.baseUrl}/v1`)
)?.id ?? (config.baseUrl ? "custom" : "deepseek");
const initialDraft = (config: ProviderConfig) => config.baseUrl ? config : { ...EMPTY_PROVIDER, baseUrl: PRESETS[0].baseUrl, model: PRESETS[0].model };

export function KeyMenu() {
  const { t } = useI18n();
  const [config, setConfig] = useState<ProviderConfig>(EMPTY_PROVIDER);
  const [appModel, setAppModel] = useState<string | null>(null);
  useEffect(() => {
    setConfig(readProvider());
    fetch("/api/key").then((response) => response.json()).then((data) => setAppModel(data.model || null)).catch(() => {});
  }, []);
  return (
    <Popover label={t("key.settings")} tip={t("key.provider")} width={360} panelClass="provider-popover" triggerClass={barBtn} openOn="gloss:key"
      trigger={<><KeyRound size={18} strokeWidth={1.8} aria-hidden /><span className="toolbar-label">{t("key.settings")}</span></>}>
      {(close) => <ProviderPanel current={config} appModel={appModel} onSave={setConfig} close={close} />}
    </Popover>
  );
}

function ProviderPanel({ current, appModel, onSave, close }: { appModel: string | null; current: ProviderConfig; onSave: (config: ProviderConfig) => void; close: () => void }) {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  const validFields = () => Array.from(panelRef.current?.querySelectorAll<HTMLInputElement>("input[required]") ?? []).every(input => input.reportValidity());
  const [draft, setDraft] = useState<ProviderConfig>(() => initialDraft(current));
  const [selected, setSelected] = useState(() => presetFor(current));
  const choose = (id: string) => {
    const preset = PRESETS.find((item) => item.id === id);
    setSelected(id);
    // Never carry a credential to a different provider.
    setDraft(preset ? { ...EMPTY_PROVIDER, baseUrl: preset.baseUrl, model: preset.model } : { ...EMPTY_PROVIDER });
    setMessage("");
  };
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState(false);
  const field = (key: keyof ProviderConfig, label: string, placeholder = "", secret = false) => (
    <label className="mt-3 block text-[12px] text-ink-2">
      {label}
      <input aria-label={label} type={secret ? "password" : "text"} value={draft[key]} placeholder={placeholder}
        autoComplete="off" spellCheck={false} onChange={(event) => { setDraft({ ...draft, [key]: event.target.value }); setMessage(""); }}
        className="mt-1 h-9 w-full rounded-lg border border-rule bg-bg px-3 text-[13px] text-ink outline-none focus:border-rule-strong" />
    </label>
  );
  const save = () => {
    if (!validFields()) return;
    try {
      if (selected !== "custom" && !draft.apiKey.trim()) throw new Error("Enter your API key / 请填写 API 密钥。");
      const config = normalizeProvider(draft);
      localStorage.setItem(PROVIDER_STORAGE, JSON.stringify(config));
      window.dispatchEvent(new Event("gloss:provider"));
      onSave(config); close();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save AI settings."); }
  };
  const test = async () => {
    if (!validFields()) return;
    setChecking(true); setMessage("");
    try {
      if (selected !== "custom" && !draft.apiKey.trim()) throw new Error("Enter your API key / 请填写 API 密钥。");
      const config = normalizeProvider(draft);
      const response = await fetch("/api/key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
      const result = await response.json();
      setMessage(result.ok ? "Connected. Model capabilities depend on your provider." : result.error || "Could not connect. You can still save if your provider does not support model listing.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not connect."); }
    finally { setChecking(false); }
  };
  return (
    <div ref={panelRef} className="provider-panel">
      <div className="provider-scroll">
      <p className="text-[14px] font-medium text-ink">{t("key.provider")}</p>
      <p className="mt-1 text-[12px] text-ink-3">{t("key.description")}</p>
      {appModel && <p className="mt-2 text-[12px] text-ink-2">{current.baseUrl ? "App default available" : "Connected using app default"}: {appModel}. Clear device settings to use it.</p>}
      <label className="mt-3 block text-[12px] text-ink-2">
        Provider / 服务商
        <select aria-label="AI provider" value={selected} disabled={checking} onChange={(event) => choose(event.target.value)}
          className="mt-1 h-10 w-full rounded-lg border border-rule bg-bg px-3 text-[13px] text-ink outline-none focus:border-rule-strong">
          {PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
          <option value="custom">{t("key.custom")}</option>
        </select>
      </label>
      {field("apiKey", selected === "custom" ? "API key (optional for local servers)" : "API key / 密钥", "Paste your API key", true)}
      {selected === "custom" && <>
        {field("baseUrl", "API base URL", "https://your-provider.example/v1")}
        {field("model", "Chat model", "Exact model ID")}
      </>}
      <details className="mt-3 text-[12px] text-ink-2">
        <summary className="cursor-pointer">{t("key.advanced")}</summary>
        {selected !== "custom" && field("model", "Chat model", "Exact model ID")}
        <VisionSettings key={selected} value={draft} onChange={config => { setDraft(config); setMessage(""); }} />
        {field("speechModel", "Speech model", "Required for read aloud")}
        {field("speechVoice", "Speech voice", "Required for read aloud")}
        {field("imageModel", "Image model", "Required for painted covers")}
      </details>
      <p className="mt-3 text-[11px] text-ink-3">{t("key.savedNote")}</p>
      </div>
      <footer className="provider-footer">
      {message && <p role="status" className="mb-2 max-h-20 overflow-y-auto text-[12px] text-ink-2">{message}</p>}
      <div className="flex items-center justify-between gap-2">
        <button type="button" className="text-[12px] text-ink-3" onClick={() => { localStorage.removeItem(PROVIDER_STORAGE); setDraft(initialDraft(EMPTY_PROVIDER)); setSelected("deepseek"); onSave({ ...EMPTY_PROVIDER }); window.dispatchEvent(new Event("gloss:provider")); setMessage(t("key.cleared")); }}>{t("key.clear")}</button>
        <button type="button" disabled={checking} className="text-[12px] text-ink-2" onClick={test}>{checking ? "Testing…" : "Test chat connection"}</button>
        <button type="button" onClick={save} className="rounded-lg bg-ink px-4 py-2 text-[12px] text-bg">{t("key.save")}</button>
      </div>
      </footer>
    </div>
  );
}
