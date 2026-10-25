export const RESPONSE_LANGUAGES = [
  { key: "zh-CN", label: "简体中文", instruction: "Simplified Chinese (简体中文)" },
  { key: "zh-TW", label: "繁體中文", instruction: "Traditional Chinese (繁體中文)" },
  { key: "en", label: "English", instruction: "English" },
  { key: "ja", label: "日本語", instruction: "Japanese" },
  { key: "ko", label: "한국어", instruction: "Korean" },
  { key: "auto", label: "Auto · 跟随提问语言", instruction: "the language of the reader's latest question, or the source text when no question is provided" },
] as const;
export type ResponseLanguage = (typeof RESPONSE_LANGUAGES)[number]["key"];
export function responseLanguage(value: unknown): ResponseLanguage {
  return RESPONSE_LANGUAGES.find((item) => item.key === value)?.key ?? "zh-CN";
}
export function languageInstruction(value: unknown): string {
  const language = RESPONSE_LANGUAGES.find((item) => item.key === responseLanguage(value))!;
  return `Response language: Write all explanations, answers, summaries, claims, caveats and section titles in ${language.instruction}. Follow this language even when the source text or earlier replies use another language. Preserve original quotations, proper names where helpful, paragraph citations such as [¶1], JSON property names and required formatting. For Chinese, use natural Chinese phrasing and punctuation; interpret requested length as a comparable concise amount of Chinese text.`;
}
