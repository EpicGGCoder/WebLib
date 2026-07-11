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
  ShieldCheck,
  Unplug,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getBook,
  getFileEntry,
  resolveFile,
  saveBook,
  updateBook,
  isFileSystemAccessSupported,
  pickPdfHandles,
  isHandle,
} from "@/lib/pdf-store";
import type { Book } from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PdfPaneProps {
  bookId: string;
  paneIndex: number;
  onClose: () => void;
  onChangeBook: () => void;
}

type PaneStatus =
  | "loading"
  | "needs-permission"
  | "ready"
  | "permission-denied"
  | "not-found"
  | "error";

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
  const [status, setStatus] = React.useState<PaneStatus>("loading");

  // Load book + resolve file entry whenever bookId changes.
  const loadBook = React.useCallback(async () => {
    setStatus("loading");
    setBook(null);
    // revoke any previous object url
    setUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });

    try {
      const b = await getBook(bookId);
      if (!b) {
        setStatus("error");
        return;
      }
      setBook(b);
      setPageInput(String(b.lastPage));
      setDisplayPage(b.lastPage);

      const entry = await getFileEntry(bookId);
      if (!entry) {
        setStatus("not-found");
        return;
      }

      const isHandleEntry = isHandle(entry);
      // For handles, do NOT auto-prompt on first load — show a clean
      // "allow access" button so the user controls the permission prompt.
      const result = await resolveFile(entry, { autoPrompt: false });

      if (result.ok) {
        const u = URL.createObjectURL(result.file);
        setUrl(u);
        setReloadKey((k) => k + 1);
        setStatus("ready");
        void updateBook(b.id, { lastOpenedAt: Date.now() });
      } else if (
        result.reason === "permission-denied" &&
        isHandleEntry
      ) {
        setStatus("needs-permission");
      } else if (result.reason === "not-found") {
        setStatus("not-found");
      } else {
        setStatus("permission-denied");
      }
    } catch (e) {
      console.error(e);
      setStatus("error");
    }
  }, [bookId]);

  React.useEffect(() => {
    void loadBook();
  }, [loadBook]);

  // Cleanup object URL on unmount / book change.
  React.useEffect(() => {
    return () => {
      setUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, []);

  const grantPermission = async () => {
    try {
      const entry = await getFileEntry(bookId);
      if (!isHandle(entry)) {
        setStatus("error");
        return;
      }
      const result = await resolveFile(entry, { autoPrompt: true });
      if (result.ok) {
        const u = URL.createObjectURL(result.file);
        setUrl(u);
        setReloadKey((k) => k + 1);
        setStatus("ready");
        void updateBook(bookId, { lastOpenedAt: Date.now() });
      } else if (result.reason === "not-found") {
        setStatus("not-found");
      } else {
        setStatus("permission-denied");
      }
    } catch (e) {
      console.error(e);
      setStatus("permission-denied");
    }
  };

  const reLink = async () => {
    if (!isFileSystemAccessSupported()) {
      toast.error("Re-linking needs Chrome or Edge");
      return;
    }
    try {
      const handles = await pickPdfHandles();
      if (!handles[0]) return;
      const handle = handles[0];
      const file = await handle.getFile();
      // keep the same book id, update name/size/pages if changed
      const patch: Partial<Book> = {
        size: file.size,
        name: book?.name ?? file.name.replace(/\.pdf$/i, ""),
      };
      // re-count pages (cheap-ish)
      const { countPdfPages } = await import("@/lib/pdf-store");
      const pages = await countPdfPages(file);
      if (pages > 0) patch.pages = pages;
      await saveBook({ ...(book as Book), ...patch } as Book, handle);
      await updateBook(bookId, patch);
      toast.success("Re-linked", { description: "File access restored." });
      await loadBook();
    } catch (e) {
      const err = e as { name?: string };
      if (err?.name !== "AbortError") {
        console.error(e);
        toast.error("Could not re-link this book");
      }
    }
  };

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
          {book?.source === "handle" && (
            <span
              className="hidden items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 sm:inline-flex"
              title="Reads from your disk — no copy"
            >
              <ShieldCheck className="size-2.5" />
              linked
            </span>
          )}
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

        {status === "needs-permission" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <ShieldCheck className="size-6" />
            </div>
            <div>
              <p className="font-medium">Allow WebLib to read this file</p>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                Your browser asks once per session for each linked file. WebLib
                reads it straight from your disk — nothing is uploaded.
              </p>
            </div>
            <Button onClick={() => void grantPermission()} className="gap-2">
              <ShieldCheck className="size-4" />
              Allow access to &ldquo;{book?.name}&rdquo;
            </Button>
          </div>
        )}

        {status === "permission-denied" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <ShieldCheck className="size-6" />
            </div>
            <div>
              <p className="font-medium">Access was blocked</p>
              <p className="mt-1 text-sm text-muted-foreground">
                You can retry — your browser will ask again.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void grantPermission()}
              className="gap-2"
            >
              <RefreshCw className="size-4" />
              Retry access
            </Button>
          </div>
        )}

        {status === "not-found" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Unplug className="size-6" />
            </div>
            <div>
              <p className="font-medium">Can&apos;t find this file on disk</p>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                It may have been moved, renamed, or deleted. Re-link it to a new
                location and your bookmarks stay intact.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void reLink()}
              className="gap-2"
            >
              <Unplug className="size-4" />
              Re-link file
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onChangeBook}
              className="gap-2 text-muted-foreground"
            >
              <ArrowLeftRight className="size-4" />
              Choose another book
            </Button>
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
