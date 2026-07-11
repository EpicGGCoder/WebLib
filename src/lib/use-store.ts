"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Split, View } from "./types";

interface PaneState {
  bookId: string | null;
  page: number; // this pane's own remembered page (1-based)
}

interface AppState {
  view: View;
  /** id of the saved split currently open in the reader (null = unsaved/ad-hoc) */
  activeSplitId: string | null;
  activeSplitName: string | null;
  panes: PaneState[];
  paneCount: number;
  /** bumped to trigger library/splits refresh after changes */
  libraryVersion: number;

  setView: (v: View) => void;
  setPaneCount: (n: number) => void;
  setPaneBook: (index: number, bookId: string | null, page?: number) => void;
  setPanePage: (index: number, page: number) => void;
  closePane: (index: number) => void;
  bumpLibrary: () => void;

  // open a single book solo (1 pane) at a given page
  openBookSolo: (bookId: string, page: number) => void;
  // load a saved split into the reader
  loadSplit: (split: Split) => void;
  // mark the reader as editing a saved split (id + name)
  setActiveSplit: (id: string | null, name: string | null) => void;
}

function makePanes(count: number, existing: PaneState[]): PaneState[] {
  const panes: PaneState[] = [];
  for (let i = 0; i < count; i++) {
    panes.push(
      existing[i]
        ? { ...existing[i] }
        : { bookId: null, page: 1 }
    );
  }
  return panes;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      view: "library",
      activeSplitId: null,
      activeSplitName: null,
      panes: [
        { bookId: null, page: 1 },
        { bookId: null, page: 1 },
      ],
      paneCount: 2,
      libraryVersion: 0,

      setView: (v) => set({ view: v }),
      setPaneCount: (n) =>
        set((s) => ({ paneCount: n, panes: makePanes(n, s.panes) })),
      setPaneBook: (index, bookId, page = 1) =>
        set((s) => ({
          panes: s.panes.map((p, i) =>
            i === index ? { bookId, page: bookId ? page : 1 } : p
          ),
        })),
      setPanePage: (index, page) =>
        set((s) => ({
          panes: s.panes.map((p, i) => (i === index ? { ...p, page } : p)),
        })),
      closePane: (index) =>
        set((s) => ({
          panes: s.panes.map((p, i) =>
            i === index ? { bookId: null, page: 1 } : p
          ),
        })),
      bumpLibrary: () =>
        set((s) => ({ libraryVersion: s.libraryVersion + 1 })),
      openBookSolo: (bookId, page) =>
        set({
          view: "reader",
          activeSplitId: null,
          activeSplitName: null,
          paneCount: 1,
          panes: [{ bookId, page: Math.max(1, page) }],
        }),
      loadSplit: (split) =>
        set({
          view: "reader",
          activeSplitId: split.id,
          activeSplitName: split.name,
          paneCount: Math.min(3, Math.max(1, split.panes.length)),
          panes: makePanes(
            Math.min(3, Math.max(1, split.panes.length)),
            split.panes.map((p) => ({ ...p }))
          ),
        }),
      setActiveSplit: (id, name) =>
        set({ activeSplitId: id, activeSplitName: name }),
    }),
    {
      name: "weblib-state",
      partialize: (s) => ({
        view: s.view,
        activeSplitId: s.activeSplitId,
        activeSplitName: s.activeSplitName,
        panes: s.panes,
        paneCount: s.paneCount,
      }),
      // normalize older persisted state that lacked per-pane `page`
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        const rawPanes = (p.panes ?? []) as PaneState[];
        const panes = rawPanes.map((pane) => ({
          bookId: pane.bookId ?? null,
          page: typeof pane.page === "number" ? pane.page : 1,
        }));
        return {
          ...current,
          ...p,
          panes:
            panes.length > 0
              ? panes
              : [
                  { bookId: null, page: 1 },
                  { bookId: null, page: 1 },
                ],
        };
      },
    }
  )
);
