"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import {
  X,
  ArrowLeftRight,
  Loader2,
  FileWarning,
  ShieldCheck,
  Unplug,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getBook,
  getFileEntry,
  resolveFile,
  saveBook,
  updateBook,
  updateSplit,
  getSplit,
  isFileSystemAccessSupported,
  pickPdfHandles,
  isHandle,
  countPdfPages,
} from "@/lib/pdf-store";
import type { Book } from "@/lib/types";
import { useAppStore } from "@/lib/use-store";
import { usePanButton } from "@/components/reader/settings-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// pdf.js viewer is client-only (canvas, IntersectionObserver).
const PdfViewer = dynamic(
  () => import("./pdf-viewer").then((m) => m.PdfViewer),
  { ssr: false }
);

interface PdfPaneProps {
  bookId: string;
  paneIndex: number;
  page: number; // this pane's current remembered page
  zoom: number; // this pane's current remembered zoom
  scroll: number; // this pane's current remembered scroll
  activeSplitId: string | null;
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

export function PdfPane({
  bookId,
  paneIndex,
  page,
  zoom,
  scroll,
  activeSplitId,
  onClose,
  onChangeBook,
}: PdfPaneProps) {
  const setPanePage = useAppStore((s) => s.setPanePage);
  const setPaneZoom = useAppStore((s) => s.setPaneZoom);
  const setPaneScroll = useAppStore((s) => s.setPaneScroll);
  const panButton = usePanButton();
  const [book, setBook] = React.useState<Book | null>(null);
  const [file, setFile] = React.useState<Blob | null>(null);
  const [status, setStatus] = React.useState<PaneStatus>("loading");
  const [reloadKey, setReloadKey] = React.useState(0);

  const loadBook = React.useCallback(async () => {
    setStatus("loading");
    setBook(null);
    setFile(null);
    try {
      const b = await getBook(bookId);
      if (!b) {
        setStatus("error");
        return;
      }
      setBook(b);
      const entry = await getFileEntry(bookId);
      if (!entry) {
        setStatus("not-found");
        return;
      }
      const isHandleEntry = isHandle(entry);
      const result = await resolveFile(entry, { autoPrompt: false });
      if (result.ok) {
        setFile(result.file);
        setReloadKey((k) => k + 1);
        setStatus("ready");
        void updateBook(b.id, { lastOpenedAt: Date.now() });
      } else if (result.reason === "permission-denied" && isHandleEntry) {
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

  const grantPermission = async () => {
    try {
      const entry = await getFileEntry(bookId);
      if (!isHandle(entry)) {
        setStatus("error");
        return;
      }
      const result = await resolveFile(entry, { autoPrompt: true });
      if (result.ok) {
        setFile(result.file);
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
      const f = await handle.getFile();
      const patch: Partial<Book> = {
        size: f.size,
        name: book?.name ?? f.name.replace(/\.pdf$/i, ""),
      };
      const pages = await countPdfPages(f);
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

  /**
   * Auto-persist page + zoom + scroll for this pane. Called (debounced) by
   * the pdf.js viewer on scroll/zoom. Mirrors into the active saved split's
   * pane, or the book's solo bookmark when reading solo.
   */
  const handleStateChange = React.useCallback(
    async (state: { page: number; zoom: number; scroll: number }) => {
      setPanePage(paneIndex, state.page);
      setPaneZoom(paneIndex, state.zoom);
      setPaneScroll(paneIndex, state.scroll);
      if (activeSplitId) {
        try {
          const split = await getSplit(activeSplitId);
          if (split) {
            const panes = split.panes.map((p, i) =>
              i === paneIndex
                ? {
                    ...p,
                    page: state.page,
                    zoom: state.zoom,
                    scroll: state.scroll,
                  }
                : p
            );
            await updateSplit(activeSplitId, {
              panes,
              lastOpenedAt: Date.now(),
            });
          }
        } catch {
          /* ignore */
        }
      } else {
        const st = useAppStore.getState();
        const filledPanes = st.panes.filter((p) => p.bookId);
        const isSolo = filledPanes.length === 1;
        if (isSolo && book) {
          try {
            await updateBook(book.id, {
              lastPage: state.page,
              lastZoom: state.zoom,
              lastScroll: state.scroll,
            });
          } catch {
            /* ignore */
          }
        }
      }
    },
    [paneIndex, activeSplitId, setPanePage, setPaneZoom, setPaneScroll, book]
  );

  const reload = () => setReloadKey((k) => k + 1);

  return (
    <div className="flex h-full min-w-0 flex-col bg-card">
      {/* Slim single-row pane header */}
      <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-border bg-card/95 px-2 backdrop-blur">
        <span className="flex size-5 shrink-0 items-center justify-center rounded bg-primary/10 text-[10px] font-semibold text-primary">
          {paneIndex + 1}
        </span>
        <h3 className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
          {book?.name ?? "Loading…"}
        </h3>
        {book?.source === "handle" && (
          <span
            className="hidden items-center gap-1 rounded bg-emerald-500/10 px-1 py-0.5 text-[9px] font-medium text-emerald-600 dark:text-emerald-400 md:inline-flex"
            title="Reads from your disk — no copy"
          >
            <ShieldCheck className="size-2.5" />
            linked
          </span>
        )}
        <div className="mx-0.5 h-4 w-px bg-border" />
        <Button
          variant="ghost"
          size="icon"
          className="size-6 text-muted-foreground"
          onClick={reload}
          title="Reload viewer"
          disabled={status !== "ready"}
        >
          <RefreshCw className="size-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 text-muted-foreground"
          onClick={onChangeBook}
          title="Change book"
          disabled={status === "loading"}
        >
          <ArrowLeftRight className="size-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 text-muted-foreground hover:text-destructive"
          onClick={onClose}
          title="Close pane"
        >
          <X className="size-3.5" />
        </Button>
      </div>

      {/* Viewer body */}
      <div className="relative min-h-0 flex-1 bg-muted/30">
        {status === "loading" && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-neutral-200/50 dark:bg-neutral-900/50">
            <Loader2 className="size-7 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Opening book…</p>
          </div>
        )}
        {status === "needs-permission" && (
          <CenterMessage
            icon={<ShieldCheck className="size-6" />}
            tint="primary"
            title="Allow WebLib to read this file"
            body="Your browser asks once per session for each linked file. WebLib reads it straight from your disk — nothing is uploaded."
            action={
              <Button onClick={() => void grantPermission()} className="gap-2">
                <ShieldCheck className="size-4" />
                Allow access to &ldquo;{book?.name}&rdquo;
              </Button>
            }
          />
        )}
        {status === "permission-denied" && (
          <CenterMessage
            icon={<ShieldCheck className="size-6" />}
            tint="destructive"
            title="Access was blocked"
            body="You can retry — your browser will ask again."
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => void grantPermission()}
                className="gap-2"
              >
                <RefreshCw className="size-4" />
                Retry access
              </Button>
            }
          />
        )}
        {status === "not-found" && (
          <CenterMessage
            icon={<Unplug className="size-6" />}
            tint="amber"
            title="Can't find this file on disk"
            body="It may have been moved, renamed, or deleted. Re-link it to a new location and your bookmarks stay intact."
            action={
              <div className="flex flex-col items-center gap-2">
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
            }
          />
        )}
        {status === "error" && (
          <CenterMessage
            icon={<FileWarning className="size-6" />}
            tint="destructive"
            title="Couldn't open this book"
            body="It may have been removed from your library."
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={onChangeBook}
                className="gap-2"
              >
                <ArrowLeftRight className="size-4" />
                Choose another book
              </Button>
            }
          />
        )}
        {status === "ready" && file && (
          <PdfViewer
            key={reloadKey}
            file={file}
            initialPage={page}
            initialZoom={zoom}
            initialScroll={scroll}
            numPages={book?.pages ?? 0}
            panButton={panButton}
            onStateChange={(s) => void handleStateChange(s)}
          />
        )}
      </div>
    </div>
  );
}

function CenterMessage({
  icon,
  title,
  body,
  action,
  tint,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action: React.ReactNode;
  tint: "primary" | "destructive" | "amber";
}) {
  const tintCls =
    tint === "primary"
      ? "bg-primary/10 text-primary"
      : tint === "destructive"
        ? "bg-destructive/10 text-destructive"
        : "bg-amber-500/10 text-amber-600 dark:text-amber-400";
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 p-6 text-center">
      <div
        className={cn(
          "flex size-12 items-center justify-center rounded-2xl",
          tintCls
        )}
      >
        {icon}
      </div>
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">{body}</p>
      </div>
      {action}
    </div>
  );
}
