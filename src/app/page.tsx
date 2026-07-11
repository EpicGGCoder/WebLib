"use client";

import * as React from "react";
import { BookMarked, BookOpen, PlayCircle } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { LibraryView } from "@/components/library/library-view";
import { ReaderView } from "@/components/reader/reader-view";
import { useAppStore } from "@/lib/use-store";
import { getStorageEstimate } from "@/lib/pdf-store";
import { formatBytes } from "@/lib/format";
import { Button } from "@/components/ui/button";

export default function Home() {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);

  // Always land on the library when the page is freshly loaded.
  React.useEffect(() => {
    setView("library");
  }, []);

  if (view === "reader") {
    return <ReaderView />;
  }

  return (
    <div className="bg-paper flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <LibraryView />
      </main>
      <Footer />
    </div>
  );
}

function Header() {
  const panes = useAppStore((s) => s.panes);
  const setView = useAppStore((s) => s.setView);
  const setPaneCount = useAppStore((s) => s.setPaneCount);
  const hasOpenPanes = panes.some((p) => p.bookId);
  const openCount = panes.filter((p) => p.bookId).length;

  const resume = () => {
    let maxIndex = 0;
    panes.forEach((p, i) => {
      if (p.bookId) maxIndex = Math.max(maxIndex, i);
    });
    const needed = Math.max(2, maxIndex + 1);
    setPaneCount(Math.min(3, needed));
    setView("reader");
  };

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <BookMarked className="size-5" />
          </div>
          <div className="leading-none">
            <div className="font-display text-xl font-semibold tracking-tight">
              WebLib
            </div>
            <div className="text-[11px] text-muted-foreground">
              your personal PDF library
            </div>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {hasOpenPanes && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={resume}
            >
              <PlayCircle className="size-4" />
              <span className="hidden sm:inline">
                Resume reading{openCount > 1 ? ` · ${openCount} books` : ""}
              </span>
              <span className="sm:hidden">Resume</span>
            </Button>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function Footer() {
  const [storage, setStorage] = React.useState<{
    usage: number;
    quota: number;
  } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    getStorageEstimate()
      .then((s) => {
        if (!cancelled) setStorage(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <footer className="mt-auto border-t border-border/70 bg-card/50">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:px-6">
        <div className="flex items-center gap-1.5">
          <BookOpen className="size-3.5" />
          <span>WebLib — books are stored privately in this browser.</span>
        </div>
        {storage && storage.quota > 0 && (
          <div className="tabular-nums">
            Storage: {formatBytes(storage.usage)} used of ~
            {formatBytes(storage.quota)}
          </div>
        )}
      </div>
    </footer>
  );
}
