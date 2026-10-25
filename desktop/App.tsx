import { mount, signal, Text, View, WebView, type YNode } from "nsh";

// Sync the native surface before page paint, and whenever the reader changes theme.
// This message contains only an allowlisted theme name, never page content.
const THEME_BRIDGE = `(() => {
  const send = () => {
    let theme = document.documentElement?.dataset.theme;
    if (!theme) { try { theme = JSON.parse(localStorage.getItem("gloss:settings") || "{}").theme; } catch {} }
    if (!theme || theme === "auto") theme = matchMedia("(prefers-color-scheme: dark)").matches ? "night" : "paper";
    window.nsh.postMessage("gloss:theme:" + theme);
  };
  send();
  const observe = () => { send(); new MutationObserver(send).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] }); };
  if (document.documentElement) observe(); else document.addEventListener("DOMContentLoaded", observe, { once: true });
})();`;
const GROUNDS: Record<string, string> = { paper: "#f6f3ec", sepia: "#f1e6cf", snow: "#fdfdfc", night: "#151412", ink: "#0f1319" };

function App() {
  let reader!: YNode;
  const background = signal(GROUNDS.paper);
  const status = signal("Opening your library…");
  return (
    <View style={{ flex: 1, backgroundColor: background() }}>
      <View style={{ backgroundColor: "#f6f3ec", flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, gap: 16 }}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: "#29251f" }}>Gloss Desktop</Text>
        <Text style={{ flex: 1, fontSize: 12, color: "#70695f" }}>{status()}</Text>
        <View role="button" onPress={() => reader?.reload()} style={{ padding: 6 }}>
          <Text style={{ fontSize: 13, color: "#923a2c" }}>Reload</Text>
        </View>
      </View>
      <WebView
        ref={reader}
        injectedJavaScriptBeforeContentLoaded={THEME_BRIDGE}
        onMessage={(event) => {
          const theme = event.data.startsWith("gloss:theme:") ? event.data.slice(12) : "";
          if (Object.hasOwn(GROUNDS, theme)) background.set(GROUNDS[theme]);
        }}
        src="http://127.0.0.1:3101/desktop-transfer?mode=export"
        style={{ flex: 1, backgroundColor: background() }}
        onLoadStart={() => status.set("Loading…")}
        onLoad={() => { status.set("Local library"); console.log("Gloss WebView loaded"); }}
        onError={(event) => { status.set("Could not load Gloss. Press Reload to retry."); console.error(event.message); }}
      />
    </View>
  );
}

mount(App);
