import type { Book } from "./types";

const DB_NAME = "weblib-db";
const DB_VERSION = 2;
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
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(FILE_STORE)) {
        db.createObjectStore(FILE_STORE);
      }
      // v1 -> v2: no structural change; file store may now hold
      // FileSystemFileHandle entries instead of (or alongside) Blobs.
      if (e.oldVersion < 1) {
        // first install
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

/** Returns the raw stored file entry — a FileSystemFileHandle or a Blob (fallback). */
export async function getFileEntry(id: string): Promise<unknown | undefined> {
  return tx<unknown>(FILE_STORE, "readonly", (s) => s.get(id));
}

/** Is the File System Access API (showOpenFilePicker) available in this browser? */
export function isFileSystemAccessSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as unknown as { showOpenFilePicker?: unknown })
      .showOpenFilePicker === "function"
  );
}

export function isHandle(entry: unknown): entry is FileSystemFileHandle {
  if (!entry) return false;
  // FileSystemFileHandle has getFile + queryPermission + requestPermission
  const e = entry as {
    getFile?: unknown;
    queryPermission?: unknown;
    requestPermission?: unknown;
  };
  return (
    typeof e.getFile === "function" &&
    typeof e.queryPermission === "function" &&
    typeof e.requestPermission === "function"
  );
}

export type PermissionState = "granted" | "denied" | "prompt" | "unknown";

export async function queryReadPermission(
  handle: FileSystemFileHandle
): Promise<PermissionState> {
  try {
    const h = handle as unknown as {
      queryPermission: (opts: { mode: string }) => Promise<string>;
    };
    const res = await h.queryPermission({ mode: "read" });
    return (res as PermissionState) ?? "unknown";
  } catch {
    return "unknown";
  }
}

export async function requestReadPermission(
  handle: FileSystemFileHandle
): Promise<PermissionState> {
  try {
    const h = handle as unknown as {
      requestPermission: (opts: { mode: string }) => Promise<string>;
    };
    const res = await h.requestPermission({ mode: "read" });
    return (res as PermissionState) ?? "unknown";
  } catch {
    return "denied";
  }
}

export type ResolvedFile =
  | { ok: true; file: File; source: "handle" | "blob" }
  | { ok: false; reason: "not-found" | "permission-denied"; source: "handle" | "blob" };

/**
 * Resolve a stored file entry into a File, requesting read permission for
 * handles when `prompt` permission is allowed. Returns a discriminated result
 * so callers can render the right UI (permission prompt / re-link / ready).
 */
export async function resolveFile(
  entry: unknown,
  opts: { autoPrompt?: boolean } = {}
): Promise<ResolvedFile> {
  if (isHandle(entry)) {
    const source = "handle" as const;
    let perm = await queryReadPermission(entry);
    if (perm !== "granted") {
      if (opts.autoPrompt) {
        perm = await requestReadPermission(entry);
      }
    }
    if (perm !== "granted") {
      return { ok: false, reason: "permission-denied", source };
    }
    try {
      const file = await entry.getFile();
      return { ok: true, file, source };
    } catch {
      // file moved / renamed / deleted on disk
      return { ok: false, reason: "not-found", source };
    }
  }
  // Blob fallback (browsers without File System Access API)
  if (entry instanceof Blob) {
    const file = new File([entry], "book.pdf", { type: entry.type || "application/pdf" });
    return { ok: true, file, source: "blob" };
  }
  return { ok: false, reason: "not-found", source: "blob" };
}

export async function saveBook(
  book: Book,
  fileEntry: Blob | FileSystemFileHandle
): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction([META_STORE, FILE_STORE], "readwrite");
    t.objectStore(META_STORE).put(book);
    t.objectStore(FILE_STORE).put(fileEntry, book.id);
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

/**
 * Best-effort PDF page counter. Scans the raw bytes for "/Type /Page" markers
 * (excluding "/Pages"). Falls back to the largest "/Count N" value. Returns 0
 * if it cannot determine the count.
 */
export async function countPdfPages(file: Blob): Promise<number> {
  try {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let count = 0;
    const needle = "/Type";
    const chunk = 0x20000;
    let carry = "";
    for (let i = 0; i < bytes.length; i += chunk) {
      const sub = bytes.subarray(i, Math.min(i + chunk, bytes.length));
      let s = carry;
      for (let j = 0; j < sub.length; j++) s += String.fromCharCode(sub[j]);
      let idx = 0;
      while (idx < s.length) {
        const found = s.indexOf(needle, idx);
        if (found === -1) break;
        let k = found + needle.length;
        while (k < s.length && (s[k] === " " || s[k] === "\t" || s[k] === "\n" || s[k] === "\r")) k++;
        if (s.startsWith("/Page", k) && s[k + 5] !== "s") {
          count++;
        }
        idx = found + needle.length;
      }
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

/** Open the native file picker and return handles (Chrome/Edge) — throws if unsupported. */
export async function pickPdfHandles(): Promise<FileSystemFileHandle[]> {
  const w = window as unknown as {
    showOpenFilePicker: (opts: {
      multiple: boolean;
      types: { description: string; accept: Record<string, string[]> }[];
      excludeAcceptAllOption?: boolean;
    }) => Promise<FileSystemFileHandle[]>;
  };
  return w.showOpenFilePicker({
    multiple: true,
    types: [
      {
        description: "PDF documents",
        accept: { "application/pdf": [".pdf"] },
      },
    ],
    excludeAcceptAllOption: true,
  });
}
