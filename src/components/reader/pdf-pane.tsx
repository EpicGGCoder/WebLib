"use client";

import * as React from "react";
import {
  X,
  Bookmark,
  CornerDownRight,
  ArrowLeftRight,
  Loader2,
  FileWarning,
  RotateCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getBook, getFile, updateBook } from "@/lib/pdf-store";
import type { Book } from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PdfPaneProps {
  bookId: string;
  paneIndex: number;
  onClose: () => void;
  onChangeBook: () => void;
}

function clampInt(v: string, min: number, max: number): number {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function PdfPane({
  bookId,
  paneIndex,
  onClose,
  onChangeBook,
}: PdfPaneProps) {
  const [book, setBook] = React.useState<Book | null>(null);
  const [url, setUrl] = React.useState<string | null>(null);
  const [pageInput, setPageInput] = React.useState("1");
  const [displayPage, setDisplayPage] = React.useState(1);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">(
    "loading"
  );

  // Load book + blob whenever bookId changes.
  React.useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    setStatus("loading");
    setBook(null);
    setUrl(null);

    (async () => {
      try {
        const [b, file] = await Promise.all([
          getBook(bookId),
          getFile(bookId),
        ]);
        if (cancelled) return;
        if (!b || !file) {
          setStatus("error");
          return;
        }
        const u = URL.createObjectURL(file);
        revoked = u;
        setBook(b);
        setUrl(u);
        setPageInput(String(b.lastPage));
        setDisplayPage(b.lastPage);
        setReloadKey((k) => k + 1);
        setStatus("ready");
        // bump lastOpenedAt quietly
        void updateBook(b.id, { lastOpenedAt: Date.now() });
      } catch (e) {
        console.error(e);
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [bookId]);

  const saveBookmark = async () => {
    if (!book) return;
    const max = book.pages > 0 ? book.pages : 999999;
    const n = clampInt(pageInput, 1, max);
    setPageInput(String(n));
    try {
      await updateBook(book.id, { lastPage: n });
      setBook({ ...book, lastPage: n });
      toast.success(`Bookmark saved · page ${n}`, {
        description: book.name,
      });
    } catch {
      toast.error("Could not save bookmark");
    }
  };

  const jumpToPage = async () => {
    if (!book || !url) return;
    const max = book.pages > 0 ? book.pages : 999999;
    const n = clampInt(pageInput, 1, max);
    setPageInput(String(n));
    setDisplayPage(n);
    setReloadKey((k) => k + 1);
    try {
      await updateBook(book.id, { lastPage: n });
      setBook({ ...book, lastPage: n });
    } catch {
      /* ignore */
    }
  };

  const reload = () => {
    setReloadKey((k) => k + 1);
  };

  return (
    <div className="flex h-full min-w-0 flex-col bg-card">
      {/* Pane header */}
      <div className="flex flex-col gap-2 border-b border-border bg-card/95 px-3 py-2 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[11px] font-semibold text-primary">
            {paneIndex + 1}
          </span>
          <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
            {book?.name ?? "Loading…"}
          </h3>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-muted-foreground"
            onClick={reload}
            title="Reload viewer"
            disabled={status !== "ready"}
          >
            <RotateCw className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-muted-foreground"
            onClick={onChangeBook}
            title="Change book"
            disabled={status === "loading"}
          >
            <ArrowLeftRight className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={onClose}
            title="Close pane"
          >
            <X className="size-4" />
          </Button>
        </div>

        {/* Page memory controls */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">
            Page
          </span>
          <Input
            value={pageInput}
            onChange={(e) =>
              setPageInput(e.target.value.replace(/[^0-9]/g, ""))
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void saveBookmark();
              }
            }}
            inputMode="numeric"
            className="h-7 w-14 px-2 text-sm tabular-nums"
            aria-label={`Page bookmark for ${book?.name ?? "book"}`}
            disabled={status !== "ready"}
          />
          {book && book.pages > 0 && (
            <span className="text-[11px] text-muted-foreground tabular-nums">
              / {book.pages}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-[11px]"
            onClick={() => void saveBookmark()}
            title="Save this page as your bookmark (Enter)"
            disabled={status !== "ready"}
          >
            <Bookmark className="size-3" />
            Save
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-[11px]"
            onClick={() => void jumpToPage()}
            title="Jump the viewer to this page"
            disabled={status !== "ready"}
          >
            <CornerDownRight className="size-3" />
            Go
          </Button>
          <span className="ml-auto hidden text-[10px] text-muted-foreground/70 sm:inline">
            type the page you&apos;re on, then Save
          </span>
        </div>
      </div>

      {/* Viewer body */}
      <div className="relative min-h-0 flex-1 bg-muted/30">
        {status === "loading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="size-7 animate-spin text-primary" />
            <p className="text-sm">Opening book…</p>
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <FileWarning className="size-6" />
            </div>
            <div>
              <p className="font-medium">Couldn&apos;t open this book</p>
              <p className="text-sm text-muted-foreground">
                It may have been removed from your library.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={onChangeBook} className="gap-2">
              <ArrowLeftRight className="size-4" />
              Choose another book
            </Button>
          </div>
        )}
        {status === "ready" && url && (
          <iframe
            key={reloadKey}
            src={`${url}#page=${displayPage}&toolbar=1&navpanes=1&view=FitH`}
            title={book?.name ?? "PDF viewer"}
            className={cn(
              "absolute inset-0 h-full w-full border-0 bg-white"
            )}
          />
        )}
      </div>
    </div>
  );
}
