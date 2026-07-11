"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PaneState, View } from "./types";

interface AppState {
  view: View;
  panes: PaneState[];
  // number of panes the reader is configured for (1, 2, or 3)
  paneCount: number;
  // a nonce bumped to trigger library refresh after a book is added/deleted
  libraryVersion: number;

  setView: (v: View) => void;
  setPaneCount: (n: number) => void;
  setPaneBook: (index: number, bookId: string | null) => void;
  closePane: (index: number) => void;
  bumpLibrary: () => void;
  // open a single book in the reader (1 pane)
  openBook: (bookId: string) => void;
  // open a book in a specific pane, switching to reader view
  openBookInPane: (bookId: string, paneIndex: number) => void;
}

function makePanes(count: number, existing: PaneState[]): PaneState[] {
  const panes: PaneState[] = [];
  for (let i = 0; i < count; i++) {
    panes.push(existing[i] ? { ...existing[i] } : { bookId: null });
  }
  return panes;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      view: "library",
      panes: [{ bookId: null }, { bookId: null }],
      paneCount: 2,
      libraryVersion: 0,

      setView: (v) => set({ view: v }),
      setPaneCount: (n) =>
        set((s) => ({ paneCount: n, panes: makePanes(n, s.panes) })),
      setPaneBook: (index, bookId) =>
        set((s) => ({
          panes: s.panes.map((p, i) => (i === index ? { bookId } : p)),
        })),
      closePane: (index) =>
        set((s) => ({
          panes: s.panes.map((p, i) => (i === index ? { bookId: null } : p)),
        })),
      bumpLibrary: () => set((s) => ({ libraryVersion: s.libraryVersion + 1 })),
      openBook: (bookId) =>
        set({ view: "reader", paneCount: 1, panes: [{ bookId }] }),
      openBookInPane: (bookId, paneIndex) =>
        set((s) => {
          const panes = s.panes.map((p, i) =>
            i === paneIndex ? { bookId } : p
          );
          return { view: "reader", panes };
        }),
    }),
    {
      name: "weblib-state",
      partialize: (s) => ({
        view: s.view,
        panes: s.panes,
        paneCount: s.paneCount,
      }),
    }
  )
);
