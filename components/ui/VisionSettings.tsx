"use client";

import { useState } from "react";
import { VISION_PROVIDERS } from "@/lib/vision-models";
import type { ProviderConfig } from "@/lib/provider-config";

const control = "mt-1 h-10 w-full min-w-0 rounded-lg border border-rule bg-bg px-2 text-[13px] text-ink";
export function VisionSettings({ value, onChange }: { value: ProviderConfig; onChange: (config: ProviderConfig) => void }) {
  const [customProvider, setCustomProvider] = useState(false);
  const [customModel, setCustomModel] = useState(false);
  const provider = VISION_PROVIDERS.find(p => p.baseUrl === value.visionBaseUrl);
  const selected = customProvider ? "custom" : provider?.id ?? (value.visionBaseUrl ? "custom" : "shared");
  const models = (selected === "shared" ? VISION_PROVIDERS.find(p => p.baseUrl === value.baseUrl) : provider)?.models;
  const groups = models ? [{ label: provider?.label ?? "Models", models }] : VISION_PROVIDERS;
  const knownModel = groups.some(group => group.models.some(m => m.id === value.visionModel));
  const manual = customModel || Boolean(value.visionModel && !knownModel);
  return <div className="mt-3 border-t border-rule pt-3">
    <p className="font-medium">图片理解 · Vision</p>
    <p className="mt-1 text-[11px] text-ink-3">用于书中图片解读和扫描 PDF 识别。</p>
    <label className="mt-3 block">识图服务商
      <select aria-label="Vision provider" className={control} value={selected} onChange={event => {
        const next = VISION_PROVIDERS.find(p => p.id === event.target.value);
        setCustomProvider(event.target.value === "custom"); setCustomModel(false);
        onChange({ ...value, visionBaseUrl: next?.baseUrl ?? "", visionApiKey: "", visionModel: next?.models[0].id ?? "" });
      }}>
        <option value="shared">使用聊天服务 / Same as chat</option>
        {VISION_PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        <option value="custom">自定义兼容服务 / Custom</option>
      </select>
    </label>
    {selected === "custom" && <label className="mt-3 block">Vision API base URL
      <input aria-label="Vision API base URL" className={control} value={value.visionBaseUrl} placeholder="https://your-provider.example/v1" type="url" required autoComplete="off" spellCheck={false}
        onChange={event => onChange({ ...value, visionBaseUrl: event.target.value, visionApiKey: "" })} />
    </label>}
    {selected !== "shared" && <label className="mt-3 block">识图 API 密钥
      <input aria-label="Vision API key" className={control} type="password" autoComplete="off" value={value.visionApiKey} placeholder="所选识图服务商的 API key"
        onChange={event => onChange({ ...value, visionApiKey: event.target.value })} />
    </label>}
    <label className="mt-3 block">图片理解模型 / Vision model
      <select aria-label="Vision model" className={control} value={manual ? "custom" : value.visionModel} onChange={event => {
        setCustomModel(event.target.value === "custom");
        onChange({ ...value, visionModel: event.target.value === "custom" ? "" : event.target.value });
      }}>
        <option value="">{selected === "shared" ? "使用聊天模型 / Same as chat" : "请选择模型"}</option>
        {groups.map(group => <optgroup key={group.label} label={group.label}>{group.models.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</optgroup>)}
        <option value="custom">自定义模型 / Custom model</option>
      </select>
    </label>
    {manual && <label className="mt-3 block">自定义识图模型 ID
      <input aria-label="Custom vision model ID" className={control} value={value.visionModel} autoComplete="off" spellCheck={false}
        onChange={event => onChange({ ...value, visionModel: event.target.value })} />
    </label>}
    <p className="mt-2 text-[11px] text-ink-3">模型需由所选服务商提供，并在账号中开通。独立识图服务使用独立密钥。</p>
    {selected === "custom" && !value.visionBaseUrl.trim() && <p role="alert" className="mt-1 text-[11px]">请填写识图服务地址。</p>}
  </div>;
}
