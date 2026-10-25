"use client";

import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { EMPTY_PROVIDER, PROVIDER_STORAGE, normalizeProvider, readProvider, type ProviderConfig } from "@/lib/provider-config";
import { Popover, barBtn } from "./Popover";

export function KeyMenu() {
  const [config, setConfig] = useState<ProviderConfig>(EMPTY_PROVIDER);
  const [appModel, setAppModel] = useState<string | null>(null);
  useEffect(() => {
    setConfig(readProvider());
    fetch("/api/key").then((response) => response.json()).then((data) => setAppModel(data.model || null)).catch(() => {});
  }, []);
  return (
    <Popover label="AI settings" tip="Configure your AI provider" width={360} triggerClass={barBtn} openOn="gloss:key"
      trigger={<><KeyRound size={15} aria-hidden /><span className="hidden sm:inline">AI settings</span></>}>
      {(close) => <ProviderPanel current={config} appModel={appModel} onSave={setConfig} close={close} />}
    </Popover>
  );
}

function ProviderPanel({ current, appModel, onSave, close }: { appModel: string | null; current: ProviderConfig; onSave: (config: ProviderConfig) => void; close: () => void }) {
  const [draft, setDraft] = useState(current);
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
    try {
      const config = normalizeProvider(draft);
      localStorage.setItem(PROVIDER_STORAGE, JSON.stringify(config));
      window.dispatchEvent(new Event("gloss:provider"));
      onSave(config); close();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save AI settings."); }
  };
  const test = async () => {
    setChecking(true); setMessage("");
    try {
      const config = normalizeProvider(draft);
      const response = await fetch("/api/key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
      const result = await response.json();
      setMessage(result.ok ? "Connected. Model capabilities depend on your provider." : result.error || "Could not connect. You can still save if your provider does not support model listing.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not connect."); }
    finally { setChecking(false); }
  };
  return (
    <div className="max-h-[75vh] overflow-y-auto">
      <p className="text-[14px] font-medium text-ink">AI provider</p>
      <p className="mt-1 text-[12px] text-ink-3">Use an OpenAI-compatible API. Reading EPUBs and text PDFs needs no key.</p>
      {appModel && <p className="mt-2 text-[12px] text-ink-2">{current.baseUrl ? "App default available" : "Connected using app default"}: {appModel}. Clear device settings to use it.</p>}
      {field("baseUrl", "API base URL", "https://your-provider.example/v1")}
      {field("model", "Chat model", "Exact model ID")}
      {field("apiKey", "API key (optional for local servers)", "", true)}
      <details className="mt-3 text-[12px] text-ink-2">
        <summary className="cursor-pointer">Vision, voice, and images</summary>
        {field("visionModel", "Vision model", "Uses chat model if blank")}
        {field("speechModel", "Speech model", "Required for read aloud")}
        {field("speechVoice", "Speech voice", "Required for read aloud")}
        {field("imageModel", "Image model", "Required for painted covers")}
      </details>
      <p className="mt-3 text-[11px] text-ink-3">Saved on this device. AI requests send the relevant text or page images to the provider you choose.</p>
      {message && <p role="status" className="mt-2 text-[12px] text-ink-2">{message}</p>}
      <div className="mt-3 flex justify-between gap-2">
        <button type="button" className="text-[12px] text-ink-3" onClick={() => { localStorage.removeItem(PROVIDER_STORAGE); setDraft({ ...EMPTY_PROVIDER }); onSave({ ...EMPTY_PROVIDER }); window.dispatchEvent(new Event("gloss:provider")); setMessage("Device settings cleared."); }}>Clear</button>
        <button type="button" disabled={checking} className="text-[12px] text-ink-2" onClick={test}>{checking ? "Testing…" : "Test connection"}</button>
        <button type="button" onClick={save} className="rounded-lg bg-ink px-4 py-2 text-[12px] text-bg">Save</button>
      </div>
    </div>
  );
}
