import type { Article } from "./article";

export function parseBook(file: File, onProgress?: (p: number, label?: string) => void): Promise<Article> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./book-import.worker.ts", import.meta.url), { type: "module" });
    const fail = (message: string) => { worker.terminate(); reject(new Error(message)); };
    worker.onerror = () => fail("Could not start the book importer. Reload the app and try again.");
    worker.onmessageerror = () => fail("Could not receive the imported book.");
    worker.onmessage = ({ data }) => {
      if (data.error) fail(data.error);
      else if (data.article) { worker.terminate(); resolve(data.article); }
      else if (typeof data.progress === "number") onProgress?.(data.progress, data.label);
    };
    worker.postMessage(file);
  });
}
