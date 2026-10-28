import { type KeyValueStorage } from "@nexus/core";

const DB_NAME = "pomodoro-nexus";
const STORE = "local-data";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB could not be opened."));
  });
}

export const webStorage: KeyValueStorage = {
  async get(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      request.onerror = () => { db.close(); reject(request.error ?? new Error("IndexedDB read failed.")); };
      request.onsuccess = () => { resolve(request.result as unknown); db.close(); };
    });
  },
  async set(key, value) {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).put(value, key);
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB write failed."));
      transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB write aborted."));
    });
  },
  async remove(key) {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).delete(key);
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB delete failed."));
    });
  }
};

export function registerServiceWorker(): void {
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    void navigator.serviceWorker.register("/sw.js").catch((error: unknown) => console.error("Service worker registration failed", error));
  }
}
