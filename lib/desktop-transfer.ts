/** Runs only in the original WebKit origin or the dedicated Chromium profile. */
export async function transferClient(mode: string, token: string) {
  const status = document.getElementById("status")!;
  const call = async (body: object) => {
    const r = await fetch("/desktop-transfer", { method: "POST", headers: { "Content-Type": "application/json", "x-gloss-transfer": token }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`Local transfer failed (${r.status}). Your original library is unchanged.`);
    return r.json();
  };
  const open = (name: string, version: number, stores: string[]) => new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(name, version);
    r.onupgradeneeded = () => { for (const store of stores) if (!r.result.objectStoreNames.contains(store)) r.result.createObjectStore(store); };
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
  const databases = [{ name: "gloss", version: 2, stores: ["docs", "files"] }, { name: "gloss-covers", version: 1, stores: ["covers"] }];
  try {
    if (mode === "export") {
      let index = 0;
      const put = async (record: object) => { await call({ action: "record", index, record }); status.textContent = `Backed up ${++index} records…`; };
      for (const key of Object.keys(localStorage).filter(k => k.startsWith("gloss:"))) await put({ kind: "local", key, value: localStorage.getItem(key) });
      for (const spec of databases) {
        const db = await open(spec.name, spec.version, spec.stores);
        for (const store of spec.stores) {
          const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
            const r = db.transaction(store).objectStore(store).getAllKeys(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
          });
          for (const key of keys) {
            const value = await new Promise<unknown>((resolve, reject) => {
              const r = db.transaction(store).objectStore(store).get(key); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
            });
            const blob = value instanceof Blob;
            const data = blob ? await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error); r.readAsDataURL(value); }) : value;
            await put({ kind: "idb", db: spec.name, store, key, blob, value: data });
          }
        }
        db.close();
      }
      await call({ action: "exported", count: index });
      status.textContent = `Backup complete (${index} records). Opening Chromium…`;
    } else {
      const manifest = await call({ action: "manifest" });
      const dbs = new Map<string, IDBDatabase>();
      for (const spec of databases) dbs.set(spec.name, await open(spec.name, spec.version, spec.stores));
      for (let index = 0; index < manifest.count; index++) {
        const record = await call({ action: "read", index });
        if (record.kind === "local") {
          if (!record.key.startsWith("gloss:")) throw new Error("Invalid settings record");
          localStorage.setItem(record.key, record.value);
          if (localStorage.getItem(record.key) !== record.value) throw new Error("Settings verification failed");
        } else {
          const db = dbs.get(record.db);
          if (!db || !db.objectStoreNames.contains(record.store)) throw new Error("Unknown database record");
          const value = record.blob ? await (await fetch(record.value)).blob() : record.value;
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(record.store, "readwrite"); tx.objectStore(record.store).put(value, record.key);
            tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
          });
          const saved = await new Promise<unknown>((resolve, reject) => {
            const r = db.transaction(record.store).objectStore(record.store).get(record.key); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
          });
          if (record.blob ? !(saved instanceof Blob) || saved.size !== value.size : JSON.stringify(saved) !== JSON.stringify(value)) throw new Error("Saved record verification failed");
        }
        status.textContent = `Restored and verified ${index + 1} of ${manifest.count} records…`;
      }
      for (const db of dbs.values()) db.close();
      await call({ action: "imported", count: manifest.count });
      location.replace("/library");
    }
  } catch (error) { status.textContent = `Migration paused: ${error instanceof Error ? error.message : String(error)} Close and reopen Gloss to retry. The WebKit profile and backup are preserved.`; }
}
