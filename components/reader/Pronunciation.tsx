"use client";
import { useEffect, useRef, useState } from "react";
let stopCurrent: (() => void) | undefined;
const clips = new Map<string, Blob>();
/** One shared player at a time; audio is loaded only when the reader clicks. */
export function Pronunciation({ word }: { word: string }) {
  const [state, setState] = useState<{ accent?: string; loading?: boolean; error?: string }>({});
  const ownStop = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DESKTOP_LOCAL !== "1" && "speechSynthesis" in window) window.speechSynthesis.getVoices();
    const stop = () => ownStop.current?.();
    window.addEventListener("gloss:stop-pronunciation", stop);
    return () => { stop(); window.removeEventListener("gloss:stop-pronunciation", stop); };
  }, [word]);
  async function play(accent: "us" | "uk") {
    const toggle = state.accent === accent;
    stopCurrent?.(); if (toggle) return;
    if (process.env.NEXT_PUBLIC_DESKTOP_LOCAL !== "1") {
      if (!("speechSynthesis" in window)) { setState({ error: "This browser does not support speech. · 浏览器不支持发音。" }); return; }
      const speech = window.speechSynthesis;
      const language = accent === "us" ? "en-US" : "en-GB";
      const voice = speech.getVoices().find(v => v.lang.replace("_", "-").toLowerCase() === language.toLowerCase());
      if (!voice) { setState({ error: `Install an ${language} voice in your system, then retry. · 请安装对应英语语音后重试。` }); return; }
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.voice = voice; utterance.lang = language; utterance.rate = 0.85;
      const stop = () => {
        utterance.onend = null; utterance.onerror = null; speech.cancel(); setState({});
        if (stopCurrent === stop) stopCurrent = undefined;
        if (ownStop.current === stop) ownStop.current = undefined;
      };
      ownStop.current = stop; stopCurrent = stop;
      utterance.onend = stop;
      utterance.onerror = () => { stop(); setState({ error: "Could not play audio. · 音频播放失败。" }); };
      setState({ accent }); speech.speak(utterance);
      return;
    }
    const controller = new AbortController(), audio = new Audio(); let url = "";
    const stop = () => { controller.abort(); audio.onended = null; audio.onerror = null; audio.pause(); audio.removeAttribute("src"); if (url) URL.revokeObjectURL(url); setState({}); if (stopCurrent === stop) stopCurrent = undefined; if (ownStop.current === stop) ownStop.current = undefined; };
    ownStop.current = stop; stopCurrent = stop;
    setState({ accent, loading: true });
    try {
      if (process.env.NEXT_PUBLIC_DESKTOP_LOCAL === "1") {
        setState({ accent });
        const response = await fetch("/api/pronounce", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ word, accent, playback: true }),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
        });
        const result = await response.json();
        if (!response.ok || !result.played) throw new Error(result.error || "System playback failed. · 系统播放失败。");
        if (!controller.signal.aborted) stop();
        return;
      }
      const key = `${accent}:${word}`;
      let blob = clips.get(key);
      if (!blob) {
        const response = await fetch("/api/pronounce", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ word, accent }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
        if (!response.ok) { const result = await response.json(); throw new Error(result.error || "Pronunciation unavailable · 发音不可用"); }
        blob = await response.blob(); clips.set(key, blob); if (clips.size > 32) clips.delete(clips.keys().next().value!);
      }
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(blob); audio.src = url;
      audio.onended = stop;
      audio.onerror = () => { stop(); setState({ error: "Could not play audio. Retry. · 音频播放失败，请重试。" }); };
      await audio.play(); if (!controller.signal.aborted) setState({ accent });
    } catch (e) { if (controller.signal.aborted) return; stop(); setState({ error: e instanceof Error ? e.message : "Pronunciation unavailable · 发音不可用" }); }
  }
  return <div className="pronunciation"><div className="flex items-center gap-2">{(["us", "uk"] as const).map(accent => <button type="button" key={accent} aria-label={`Play ${accent.toUpperCase()} pronunciation of ${word}`} aria-pressed={state.accent === accent} onClick={() => void play(accent)}>{accent.toUpperCase()} {state.accent === accent ? state.loading ? "…" : "■" : "▶"}</button>)}</div><span role="status" className="study-muted">{state.error || (state.accent ? state.loading ? "Loading · 加载中" : "Playing · 播放中" : "")}</span></div>;
}
