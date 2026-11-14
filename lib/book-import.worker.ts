import { epubToArticle } from "./epub";
import { textToArticle } from "./article";

// Parsing and base64 image conversion belong off the interactive UI thread.
self.onmessage = async (event: MessageEvent<File>) => {
  try {
    const file = event.data;
    const epub = file.name.toLowerCase().endsWith(".epub") || file.type === "application/epub+zip";
    const article = epub
      ? await epubToArticle(file, (progress, label) => self.postMessage({ progress, label }))
      : textToArticle(await file.text(), { origin: "file" });
    if (!epub) {
      if (article.title === "Untitled") article.title = file.name.replace(/\.(txt|md|markdown|text)$/i, "").replace(/[_-]+/g, " ");
      article.source = file.name;
    }
    self.postMessage({ article });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "Could not read that book." });
  }
};
