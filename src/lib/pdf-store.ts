import type { Book } from "./types";

const DB_NAME = "weblib-db";
const DB_VERSION = 1;
const META_STORE = "books";
const FILE_STORE = "files";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available in this environment"));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(FILE_STORE)) {
        db.createObjectStore(FILE_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        const r = fn(s);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      })
  );
}

export async function getAllBooks(): Promise<Book[]> {
  const books = await tx<Book[]>(META_STORE, "readonly", (s) => s.getAll());
  return books.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
}

export async function getBook(id: string): Promise<Book | undefined> {
  return tx<Book | undefined>(META_STORE, "readonly", (s) => s.get(id));
}

export async function getFile(id: string): Promise<Blob | undefined> {
  return tx<Blob | undefined>(FILE_STORE, "readonly", (s) => s.get(id));
}

export async function saveBook(book: Book, file: Blob): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction([META_STORE, FILE_STORE], "readwrite");
    t.objectStore(META_STORE).put(book);
    t.objectStore(FILE_STORE).put(file, book.id);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function updateBook(
  id: string,
  patch: Partial<Omit<Book, "id">>
): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(META_STORE, "readwrite");
    const s = t.objectStore(META_STORE);
    const getReq = s.get(id);
    getReq.onsuccess = () => {
      const existing = getReq.result as Book | undefined;
      if (existing) {
        s.put({ ...existing, ...patch, id });
      }
    };
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function deleteBook(id: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction([META_STORE, FILE_STORE], "readwrite");
    t.objectStore(META_STORE).delete(id);
    t.objectStore(FILE_STORE).delete(id);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function getStorageEstimate(): Promise<{ usage: number; quota: number }> {
  if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota };
  }
  return { usage: 0, quota: 0 };
}

/**
 * Best-effort PDF page counter. Scans the raw bytes for "/Type /Page" markers
 * (excluding "/Pages"). Falls back to the largest "/Count N" value. Returns 0
 * if it cannot determine the count.
 */
export async function countPdfPages(file: Blob): Promise<number> {
  try {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    // decode as latin1 so each byte maps to one char (PDFs are byte-oriented)
    let count = 0;
    const needle = "/Type";
    const chunk = 0x20000;
    let carry = "";
    for (let i = 0; i < bytes.length; i += chunk) {
      const sub = bytes.subarray(i, Math.min(i + chunk, bytes.length));
      let s = carry;
      for (let j = 0; j < sub.length; j++) s += String.fromCharCode(sub[j]);
      // search for /Type /Page not followed by 's'
      let idx = 0;
      while (idx < s.length) {
        const found = s.indexOf(needle, idx);
        if (found === -1) break;
        // look at what follows /Type
        let k = found + needle.length;
        while (k < s.length && (s[k] === " " || s[k] === "\t" || s[k] === "\n" || s[k] === "\r")) k++;
        if (s.startsWith("/Page", k) && s[k + 5] !== "s") {
          count++;
        }
        idx = found + needle.length;
      }
      // keep a tail to avoid splitting a needle across chunk boundary
      carry = s.slice(-needle.length);
    }
    if (count > 0) return count;

    // fallback: largest /Count N
    const buf2 = await file.arrayBuffer();
    const b2 = new Uint8Array(buf2);
    let s2 = "";
    for (let i = 0; i < b2.length; i += chunk) {
      const sub = b2.subarray(i, Math.min(i + chunk, b2.length));
      for (let j = 0; j < sub.length; j++) s2 += String.fromCharCode(sub[j]);
    }
    let maxCount = 0;
    const re = /\/Count\s+(\d+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s2)) !== null) {
      const n = parseInt(m[1], 10);
      if (n > maxCount) maxCount = n;
    }
    return maxCount;
  } catch {
    return 0;
  }
}
