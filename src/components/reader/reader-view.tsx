"use client";

import * as React from "react";
import {
  ArrowLeft,
  Columns2,
  Square,
  Columns3,
  PanelLeft,
  Save,
  Check,
  BookmarkCheck,
  Maximize,
  Minimize,
  ChevronsDownUp,
  ChevronsUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/lib/use-store";
import { saveSplit, updateSplit, getBook } from "@/lib/pdf-store";
import { PdfPane } from "./pdf-pane";
import { PaneBookPicker } from "./pane-book-picker";
import { cn } from "@/lib/utils";
import type { Split, SplitPane } from "@/lib/types";
import { toast } from "sonner";
import { v4 as uuid } from "uuid";

export function ReaderView() {
  const setView = useAppStore((s) => s.setView);
  const paneCount = useAppStore((s) => s.paneCount);
  const setPaneCount = useAppStore((s) => s.setPaneCount);
  const panes = useAppStore((s) => s.panes);
  const setPaneBook = useAppStore((s) => s.setPaneBook);
  const closePane = useAppStore((s) => s.closePane);
  const paneLayout = useAppStore((s) => s.paneLayout);
  const setPaneLayout = useAppStore((s) => s.setPaneLayout);
  const activeSplitId = useAppStore((s) => s.activeSplitId);
  const activeSplitName = useAppStore((s) => s.activeSplitName);
  const setActiveSplit = useAppStore((s) => s.setActiveSplit);
  const bumpLibrary = useAppStore((s) => s.bumpLibrary);

  const [direction, setDirection] = React.useState<
    "horizontal" | "vertical"
  >("horizontal");
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [splitName, setSplitName] = React.useState("");
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [topBarCollapsed, setTopBarCollapsed] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  // track fullscreen state changes (esc key, etc.)
  React.useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void rootRef.current?.requestFullscreen?.();
    }
  };

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setDirection(mq.matches ? "vertical" : "horizontal");
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const counts = [1, 2, 3] as const;

  // Debounced persistence of panel sizes into the active split.
  const layoutSaveRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const handleLayout = React.useCallback(
    (sizes: number[]) => {
      // update live state immediately (so save-as-split captures current sizes)
      setPaneLayout(sizes);
      // debounce-write to the saved split record
      if (!activeSplitId) return;
      if (layoutSaveRef.current) clearTimeout(layoutSaveRef.current);
      layoutSaveRef.current = setTimeout(() => {
        void updateSplit(activeSplitId, {
          layout: sizes,
          lastOpenedAt: Date.now(),
        });
      }, 400);
    },
    [activeSplitId, setPaneLayout]
  );

  React.useEffect(() => {
    return () => {
      if (layoutSaveRef.current) clearTimeout(layoutSaveRef.current);
    };
  }, []);

  // Auto-persist structure (books / pane count) into the active split.
  const syncSplitStructure = React.useCallback(
    async (nextPanes: typeof panes) => {
      if (!activeSplitId) return;
      const splitPanes: SplitPane[] = nextPanes
        .filter((p) => p.bookId)
        .map((p) => ({
          bookId: p.bookId as string,
          page: p.page,
          zoom: p.zoom,
          scroll: p.scroll,
        }));
      try {
        await updateSplit(activeSplitId, {
          panes: splitPanes,
          lastOpenedAt: Date.now(),
        });
      } catch {
        /* ignore */
      }
    },
    [activeSplitId]
  );

  const handleSetPaneBook = React.useCallback(
    async (index: number, bookId: string | null) => {
      let initialPage = 1;
      let initialZoom = 1;
      let initialScroll = 0;
      if (bookId) {
        try {
          const b = await getBook(bookId);
          if (b) {
            initialPage = b.lastPage;
            initialZoom = b.lastZoom ?? 1;
            initialScroll = b.lastScroll ?? 0;
          }
        } catch {
          /* ignore */
        }
      }
      setPaneBook(index, bookId, initialPage, initialZoom, initialScroll);
      // sync after state update
      setTimeout(() => {
        const latest = useAppStore.getState().panes;
        void syncSplitStructure(latest);
      }, 0);
    },
    [setPaneBook, syncSplitStructure]
  );

  const handleClosePane = React.useCallback(
    (index: number) => {
      closePane(index);
      setTimeout(() => {
        void syncSplitStructure(useAppStore.getState().panes);
      }, 0);
    },
    [closePane, syncSplitStructure]
  );

  const handleSetPaneCount = React.useCallback(
    (n: number) => {
      setPaneCount(n);
      setTimeout(() => {
        void syncSplitStructure(useAppStore.getState().panes);
      }, 0);
    },
    [setPaneCount, syncSplitStructure]
  );

  const openSaveDialog = () => {
    // prefill a sensible name from open books
    const filled = panes.filter((p) => p.bookId);
    if (filled.length === 0) {
      toast.error("Add a book to a pane first");
      return;
    }
    setSplitName(
      activeSplitName ??
        (filled.length === 1
          ? "Single read"
          : `${filled.length}-way split`)
    );
    setSaveOpen(true);
  };

  const confirmSave = async () => {
    const name = splitName.trim() || "Untitled split";
    const splitPanes: SplitPane[] = panes
      .filter((p) => p.bookId)
      .map((p) => ({
        bookId: p.bookId as string,
        page: p.page,
        zoom: p.zoom,
        scroll: p.scroll,
      }));
    if (splitPanes.length === 0) {
      toast.error("Add a book to a pane first");
      return;
    }
    const split: Split = {
      id: activeSplitId ?? uuid(),
      name,
      panes: splitPanes,
      layout: paneLayout.slice(0, splitPanes.length),
      createdAt: Date.now(),
      lastOpenedAt: Date.now(),
    };
    await saveSplit(split);
    setActiveSplit(split.id, name);
    bumpLibrary();
    setSaveOpen(false);
    toast.success("Split saved", {
      description: `“${name}” — reopen it anytime from the home screen.`,
    });
  };

  return (
    <div ref={rootRef} className="flex h-screen flex-col">
      {/* Slim top bar — collapses to a thin reveal strip when hidden */}
      {topBarCollapsed ? (
        <button
          onClick={() => setTopBarCollapsed(false)}
          className="group flex h-5 w-full shrink-0 items-center justify-center gap-1.5 border-b border-border/50 bg-card/80 text-[10px] text-muted-foreground backdrop-blur transition-colors hover:bg-card hover:text-foreground"
          title="Show top bar"
        >
          <ChevronsUpDown className="size-3" />
          <span className="hidden sm:inline">show bar</span>
        </button>
      ) : (
        <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-card px-2.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2"
            onClick={() => setView("library")}
          >
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Library</span>
          </Button>
          <div className="mx-0.5 hidden h-4 w-px bg-border sm:block" />

          {/* Split identity / save state */}
          {activeSplitId ? (
            <div className="flex min-w-0 items-center gap-1.5 text-xs">
              <BookmarkCheck className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span className="max-w-[40vw] truncate font-medium text-foreground">
                {activeSplitName}
              </span>
              <span className="hidden items-center gap-1 text-[10px] text-muted-foreground sm:inline-flex">
                <Check className="size-3 text-emerald-600 dark:text-emerald-400" />
                auto-saved
              </span>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2 text-xs"
              onClick={openSaveDialog}
              title="Save this layout to reopen from home"
            >
              <Save className="size-3.5" />
              <span className="hidden sm:inline">Save as split</span>
              <span className="sm:hidden">Save</span>
            </Button>
          )}

          <div className="ml-auto flex items-center gap-1">
            <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-0.5">
              {counts.map((c) => {
                const Icon = c === 1 ? Square : c === 2 ? Columns2 : Columns3;
                const active = paneCount === c;
                return (
                  <button
                    key={c}
                    onClick={() => handleSetPaneCount(c)}
                    className={cn(
                      "flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors",
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    title={`${c} pane${c > 1 ? "s" : ""}`}
                  >
                    <Icon className="size-3.5" />
                    <span className="hidden sm:inline">{c}</span>
                  </button>
                );
              })}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground"
              onClick={() => setTopBarCollapsed(true)}
              title="Hide top bar (more PDF space)"
            >
              <ChevronsDownUp className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground"
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? (
                <Minimize className="size-4" />
              ) : (
                <Maximize className="size-4" />
              )}
            </Button>
          </div>
        </header>
      )}

      {/* Panes — fill all remaining height */}
      <div className="min-h-0 flex-1">
        <ResizablePanelGroup
          key={`${direction}-${paneCount}`}
          direction={direction}
          onLayout={(sizes) => handleLayout(sizes)}
          className="h-full w-full"
        >
          {panes.slice(0, paneCount).map((pane, i) => (
            <React.Fragment key={i}>
              {i > 0 && (
                <ResizableHandle
                  withHandle
                  className={cn(
                    direction === "vertical" ? "h-px w-full" : "w-px"
                  )}
                />
              )}
              <ResizablePanel
                id={`pane-${i}`}
                order={i}
                defaultSize={
                  paneLayout && paneLayout.length === paneCount
                    ? paneLayout[i]
                    : 100 / paneCount
                }
                minSize={18}
              >
                {pane.bookId ? (
                  <PdfPane
                    bookId={pane.bookId}
                    paneIndex={i}
                    page={pane.page}
                    zoom={pane.zoom}
                    scroll={pane.scroll}
                    activeSplitId={activeSplitId}
                    onClose={() => handleClosePane(i)}
                    onChangeBook={() => handleSetPaneBook(i, null)}
                  />
                ) : (
                  <EmptyPane
                    paneIndex={i}
                    onPick={(id) => void handleSetPaneBook(i, id)}
                  />
                )}
              </ResizablePanel>
            </React.Fragment>
          ))}
        </ResizablePanelGroup>
      </div>

      {/* Save-as-split dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save this split</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-sm text-muted-foreground">
              Name it so you can reopen this exact layout — same books, same
              pages — from the home screen.
            </p>
            <Input
              value={splitName}
              onChange={(e) => setSplitName(e.target.value)}
              placeholder="e.g. Questions + Answer key"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void confirmSave();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSaveOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={() => void confirmSave()} className="gap-2">
              <Save className="size-4" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyPane({
  paneIndex,
  onPick,
}: {
  paneIndex: number;
  onPick: (id: string) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-border bg-card/95 px-2">
        <span className="flex size-5 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-semibold text-muted-foreground">
          {paneIndex + 1}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <PanelLeft className="size-3" />
          Empty slot
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <PaneBookPicker onPick={onPick} />
      </div>
    </div>
  );
}
