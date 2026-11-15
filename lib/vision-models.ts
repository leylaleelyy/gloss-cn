import type { ProviderConfig } from "./provider-config";

// OpenAI-compatible vision APIs. Native-only APIs need a compatible gateway.
// https://help.aliyun.com/en/model-studio/qwen-vl-compatible-with-openai
// https://docs.siliconflow.cn/docs/userguide/capabilities/multimodal-vision
// https://ai.google.dev/gemini-api/docs/openai
export const VISION_PROVIDERS = [
  { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", models: [
    { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
    { id: "gpt-4.1", label: "GPT-4.1" },
    { id: "gpt-4o", label: "GPT-4o" },
  ] },
  { id: "qwen", label: "阿里云百炼 · 通义千问", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", models: [
    { id: "qwen3-vl-plus", label: "Qwen3 VL Plus" },
    { id: "qwen3-vl-flash", label: "Qwen3 VL Flash" },
    { id: "qwen-vl-max", label: "Qwen VL Max" },
  ] },
  { id: "siliconflow", label: "硅基流动 · SiliconFlow", baseUrl: "https://api.siliconflow.cn/v1", models: [
    { id: "Qwen/Qwen3-VL-32B-Instruct", label: "Qwen3 VL 32B Instruct" },
    { id: "Qwen/Qwen3-VL-8B-Instruct", label: "Qwen3 VL 8B Instruct" },
  ] },
  { id: "google", label: "Google · Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", models: [
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  ] },
];

export function visionProvider(config: ProviderConfig): ProviderConfig {
  return { ...config, model: config.visionModel || config.model,
    baseUrl: config.visionBaseUrl || config.baseUrl,
    // An independent endpoint must never inherit the chat provider's key.
    apiKey: config.visionBaseUrl ? config.visionApiKey : config.apiKey };
}
