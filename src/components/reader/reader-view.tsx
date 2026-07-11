"use client";

import * as React from "react";
import { ArrowLeft, Columns2, Square, Columns3, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { useAppStore } from "@/lib/use-store";
import { PdfPane } from "./pdf-pane";
import { PaneBookPicker } from "./pane-book-picker";
import { cn } from "@/lib/utils";

export function ReaderView() {
  const setView = useAppStore((s) => s.setView);
  const paneCount = useAppStore((s) => s.paneCount);
  const setPaneCount = useAppStore((s) => s.setPaneCount);
  const panes = useAppStore((s) => s.panes);
  const setPaneBook = useAppStore((s) => s.setPaneBook);
  const closePane = useAppStore((s) => s.closePane);

  const [direction, setDirection] = React.useState<
    "horizontal" | "vertical"
  >("horizontal");

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setDirection(mq.matches ? "vertical" : "horizontal");
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const counts = [1, 2, 3] as const;

  return (
    <div className="flex h-screen flex-col">
      {/* Top bar */}
      <header className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-3 py-2">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2"
          onClick={() => setView("library")}
        >
          <ArrowLeft className="size-4" />
          <span className="hidden sm:inline">Library</span>
        </Button>
        <div className="mx-1 hidden h-5 w-px bg-border sm:block" />
        <span className="hidden font-display text-sm font-semibold sm:inline">
          WebLib
        </span>

        <div className="ml-auto flex items-center gap-1 rounded-lg border border-border bg-background p-0.5">
          {counts.map((c) => {
            const Icon = c === 1 ? Square : c === 2 ? Columns2 : Columns3;
            const active = paneCount === c;
            return (
              <button
                key={c}
                onClick={() => setPaneCount(c)}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
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
      </header>

      {/* Panes */}
      <div className="min-h-0 flex-1">
        <ResizablePanelGroup
          key={`${direction}-${paneCount}`}
          direction={direction}
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
                defaultSize={100 / paneCount}
                minSize={18}
              >
                {pane.bookId ? (
                  <PdfPane
                    bookId={pane.bookId}
                    paneIndex={i}
                    onClose={() => closePane(i)}
                    onChangeBook={() => setPaneBook(i, null)}
                  />
                ) : (
                  <EmptyPane
                    paneIndex={i}
                    onPick={(id) => setPaneBook(i, id)}
                  />
                )}
              </ResizablePanel>
            </React.Fragment>
          ))}
        </ResizablePanelGroup>
      </div>
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
      <div className="flex items-center gap-2 border-b border-border bg-card/95 px-3 py-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-semibold text-muted-foreground">
          {paneIndex + 1}
        </span>
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <PanelLeft className="size-3.5" />
          Empty slot
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <PaneBookPicker onPick={onPick} />
      </div>
    </div>
  );
}
