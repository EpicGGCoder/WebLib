"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Split, View } from "./types";

interface PaneState {
  bookId: string | null;
  page: number; // this pane's own remembered page (1-based)
  zoom: number; // this pane's own remembered zoom (1.0 = fit-width)
  scroll: number; // this pane's own remembered scroll position (px)
}

interface AppState {
  view: View;
  /** id of the saved split currently open in the reader (null = unsaved/ad-hoc) */
  activeSplitId: string | null;
  activeSplitName: string | null;
  panes: PaneState[];
  paneCount: number;
  /** panel sizes in percent (live, also persisted to the active split) */
  paneLayout: number[];
  /** bumped to trigger library/splits refresh after changes */
  libraryVersion: number;

  setView: (v: View) => void;
  setPaneCount: (n: number) => void;
  setPaneBook: (
    index: number,
    bookId: string | null,
    page?: number,
    zoom?: number,
    scroll?: number
  ) => void;
  setPanePage: (index: number, page: number) => void;
  setPaneZoom: (index: number, zoom: number) => void;
  setPaneScroll: (index: number, scroll: number) => void;
  setPaneLayout: (sizes: number[]) => void;
  closePane: (index: number) => void;
  bumpLibrary: () => void;

  // open a single book solo (1 pane) at a given page/zoom/scroll
  openBookSolo: (
    bookId: string,
    page: number,
    zoom?: number,
    scroll?: number
  ) => void;
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
        : { bookId: null, page: 1, zoom: 1, scroll: 0 }
    );
  }
  return panes;
}

function equalLayout(count: number): number[] {
  return Array.from({ length: count }, () => 100 / count);
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      view: "library",
      activeSplitId: null,
      activeSplitName: null,
      panes: [
        { bookId: null, page: 1, zoom: 1, scroll: 0 },
        { bookId: null, page: 1, zoom: 1, scroll: 0 },
      ],
      paneCount: 2,
      paneLayout: equalLayout(2),
      libraryVersion: 0,

      setView: (v) => set({ view: v }),
      setPaneCount: (n) =>
        set((s) => ({
          paneCount: n,
          panes: makePanes(n, s.panes),
          paneLayout:
            s.paneLayout.length === n ? s.paneLayout : equalLayout(n),
        })),
      setPaneBook: (index, bookId, page = 1, zoom = 1, scroll = 0) =>
        set((s) => ({
          panes: s.panes.map((p, i) =>
            i === index
              ? {
                  bookId,
                  page: bookId ? page : 1,
                  zoom: bookId ? zoom : 1,
                  scroll: bookId ? scroll : 0,
                }
              : p
          ),
        })),
      setPanePage: (index, page) =>
        set((s) => ({
          panes: s.panes.map((p, i) => (i === index ? { ...p, page } : p)),
        })),
      setPaneZoom: (index, zoom) =>
        set((s) => ({
          panes: s.panes.map((p, i) => (i === index ? { ...p, zoom } : p)),
        })),
      setPaneScroll: (index, scroll) =>
        set((s) => ({
          panes: s.panes.map((p, i) => (i === index ? { ...p, scroll } : p)),
        })),
      setPaneLayout: (sizes) => set({ paneLayout: sizes }),
      closePane: (index) =>
        set((s) => ({
          panes: s.panes.map((p, i) =>
            i === index
              ? { bookId: null, page: 1, zoom: 1, scroll: 0 }
              : p
          ),
        })),
      bumpLibrary: () =>
        set((s) => ({ libraryVersion: s.libraryVersion + 1 })),
      openBookSolo: (bookId, page, zoom = 1, scroll = 0) =>
        set({
          view: "reader",
          activeSplitId: null,
          activeSplitName: null,
          paneCount: 1,
          panes: [
            {
              bookId,
              page: Math.max(1, page),
              zoom,
              scroll,
            },
          ],
          paneLayout: equalLayout(1),
        }),
      loadSplit: (split) => {
        const count = Math.min(3, Math.max(1, split.panes.length));
        set({
          view: "reader",
          activeSplitId: split.id,
          activeSplitName: split.name,
          paneCount: count,
          panes: makePanes(
            count,
            split.panes.map((p) => ({
              bookId: p.bookId,
              page: p.page,
              zoom: p.zoom ?? 1,
              scroll: p.scroll ?? 0,
            }))
          ),
          paneLayout:
            split.layout && split.layout.length === count
              ? [...split.layout]
              : equalLayout(count),
        });
      },
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
        paneLayout: s.paneLayout,
      }),
      // normalize older persisted state that lacked zoom/scroll/per-pane page
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        const rawPanes = (p.panes ?? []) as PaneState[];
        const panes = rawPanes.map((pane) => ({
          bookId: pane.bookId ?? null,
          page: typeof pane.page === "number" ? pane.page : 1,
          zoom: typeof pane.zoom === "number" ? pane.zoom : 1,
          scroll: typeof pane.scroll === "number" ? pane.scroll : 0,
        }));
        const pc = p.paneCount ?? current.paneCount;
        const layout =
          p.paneLayout && p.paneLayout.length === pc
            ? p.paneLayout
            : equalLayout(pc);
        return {
          ...current,
          ...p,
          panes:
            panes.length > 0
              ? panes
              : [
                  { bookId: null, page: 1, zoom: 1, scroll: 0 },
                  { bookId: null, page: 1, zoom: 1, scroll: 0 },
                ],
          paneLayout: layout,
        };
      },
    }
  )
);
