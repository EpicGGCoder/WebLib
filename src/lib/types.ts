export interface Book {
  id: string;
  name: string;
  size: number;
  pages: number; // best-effort total page count (0 if unknown)
  lastPage: number; // last saved page when opened SOLO (1-based)
  lastZoom: number; // last saved zoom when opened SOLO (1.0 = fit-width)
  lastScroll: number; // last saved scroll position (px) when opened SOLO
  addedAt: number;
  lastOpenedAt: number;
  hue: number;
  // how the file is referenced: 'handle' = File System Access handle
  // (reads from disk on demand, no copy); 'blob' = copied into IndexedDB
  // (fallback for browsers without the File System Access API)
  source: "handle" | "blob";
}

/** One slot inside a saved split layout. */
export interface SplitPane {
  bookId: string;
  page: number; // this pane's own remembered page (1-based)
  zoom: number; // this pane's own remembered zoom (1.0 = fit-width)
  scroll: number; // this pane's own remembered scroll position (px)
}

/** A saved multi-pane layout the user can reopen from the home screen. */
export interface Split {
  id: string;
  name: string;
  panes: SplitPane[];
  /** panel sizes in percent, one entry per pane (restored on reopen) */
  layout?: number[];
  createdAt: number;
  lastOpenedAt: number;
}

export type View = "library" | "reader";
