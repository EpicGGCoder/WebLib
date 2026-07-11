"use client";

import * as React from "react";
import { UploadCloud, Loader2, FileText, HardDrive, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  saveBook,
  countPdfPages,
  isFileSystemAccessSupported,
  pickPdfHandles,
} from "@/lib/pdf-store";
import { hueFromName, stripPdfExt } from "@/lib/format";
import type { Book } from "@/lib/types";
import { toast } from "sonner";
import { v4 as uuid } from "uuid";

interface UploadZoneProps {
  variant?: "hero" | "compact";
  onAdded: () => void;
  className?: string;
}

export function UploadZone({
  variant = "hero",
  onAdded,
  className,
}: UploadZoneProps) {
  const [dragging, setDragging] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [fsaSupported] = React.useState(() => isFileSystemAccessSupported());
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Shared: build a Book record from a file name + size, computing pages.
  const buildBook = async (
    name: string,
    size: number,
    file: Blob,
    source: "handle" | "blob"
  ): Promise<Book> => {
    const pages = await countPdfPages(file);
    return {
      id: uuid(),
      name: stripPdfExt(name),
      size,
      pages,
      lastPage: 1,
      addedAt: Date.now(),
      lastOpenedAt: Date.now(),
      hue: hueFromName(name),
      source,
    };
  };

  // ---- File System Access API path (Chrome/Edge): link, don't copy ----
  const handlePickFsa = React.useCallback(async () => {
    setBusy(true);
    try {
      const handles = await pickPdfHandles();
      if (handles.length === 0) return;
      let added = 0;
      for (const handle of handles) {
        try {
          const file = await handle.getFile();
          const book = await buildBook(file.name, file.size, file, "handle");
          await saveBook(book, handle);
          added++;
        } catch (e) {
          console.error(e);
          toast.error(`Could not add a file from the picker`);
        }
      }
      if (added > 0) {
        toast.success(
          added === 1
            ? "Book linked from your disk"
            : `${added} books linked from your disk`,
          {
            description: fsaSupported
              ? "Files stay in place — WebLib reads them on demand."
              : undefined,
          }
        );
        onAdded();
      }
    } catch (e) {
      const err = e as { name?: string };
      if (err?.name === "AbortError") {
        // user cancelled the picker — silent
      } else {
        console.error(e);
        toast.error("Could not open the file picker");
      }
    } finally {
      setBusy(false);
    }
  }, [onAdded, fsaSupported]);

  // ---- Drag & drop path ----
  const handleDropItems = React.useCallback(
    async (dataTransfer: DataTransfer) => {
      setBusy(true);
      let added = 0;
      const items = Array.from(dataTransfer.items).filter(
        (i) => i.kind === "file"
      );
      for (const item of items) {
        // Prefer a file-system handle (link mode) when available.
        const asHandle = (
          item as unknown as { getAsFileSystemHandle?: () => Promise<unknown> }
        ).getAsFileSystemHandle;
        let file: File | null = null;
        let entry: Blob | FileSystemFileHandle | null = null;
        let source: "handle" | "blob" = "blob";

        if (typeof asHandle === "function") {
          try {
            const h = await asHandle.call(item);
            if (h && (h as { getFile?: unknown }).getFile) {
              const handle = h as FileSystemFileHandle;
              file = await handle.getFile();
              entry = handle;
              source = "handle";
            }
          } catch {
            /* fall through to blob */
          }
        }
        if (!file) {
          file = item.getAsFile();
          if (file) {
            entry = file;
            source = "blob";
          }
        }
        if (!file || !entry) continue;
        if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name))
          continue;
        try {
          const book = await buildBook(file.name, file.size, file, source);
          await saveBook(book, entry);
          added++;
        } catch (e) {
          console.error(e);
          toast.error(`Failed to add "${file.name}"`);
        }
      }
      setBusy(false);
      if (added > 0) {
        toast.success(
          added === 1 ? "Book added to your library" : `${added} books added`
        );
        onAdded();
      } else {
        toast.error("Please drop PDF files");
      }
    },
    [onAdded]
  );

  // ---- Fallback path (no File System Access API): copy bytes ----
  const handleFilesInput = React.useCallback(
    async (files: FileList | File[]) => {
      const pdfs = Array.from(files).filter(
        (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name)
      );
      if (pdfs.length === 0) {
        toast.error("Please choose PDF files");
        return;
      }
      setBusy(true);
      let added = 0;
      for (const file of pdfs) {
        try {
          const book = await buildBook(file.name, file.size, file, "blob");
          await saveBook(book, file);
          added++;
        } catch (e) {
          console.error(e);
          toast.error(`Failed to save "${file.name}"`);
        }
      }
      setBusy(false);
      if (added > 0) {
        toast.success(
          added === 1 ? "Book added to your library" : `${added} books added`,
          {
            description: "Copied into this browser (File System Access unavailable).",
          }
        );
        onAdded();
      }
    },
    [onAdded]
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (busy) return;
    void handleDropItems(e.dataTransfer);
  };

  const openPicker = () => {
    if (busy) return;
    if (fsaSupported) {
      void handlePickFsa();
    } else {
      inputRef.current?.click();
    }
  };

  if (variant === "compact") {
    return (
      <>
        <Button
          variant="outline"
          onClick={openPicker}
          disabled={busy}
          className={cn("gap-2", className)}
          title={
            fsaSupported
              ? "Link a PDF from your disk (no copy)"
              : "Upload a PDF (copied into this browser)"
          }
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : fsaSupported ? (
            <Link2 className="size-4" />
          ) : (
            <UploadCloud className="size-4" />
          )}
          {fsaSupported ? "Link PDF" : "Upload PDF"}
        </Button>
        {!fsaSupported && (
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void handleFilesInput(e.target.files);
              e.target.value = "";
            }}
          />
        )}
      </>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={openPicker}
      className={cn(
        "group relative cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all sm:p-12",
        dragging
          ? "border-primary bg-accent/50 scale-[1.01]"
          : "border-border hover:border-primary/50 hover:bg-accent/30",
        className
      )}
    >
      {!fsaSupported && (
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void handleFilesInput(e.target.files);
            e.target.value = "";
          }}
        />
      )}
      <div className="mx-auto flex max-w-md flex-col items-center gap-3">
        <div
          className={cn(
            "flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-transform",
            dragging && "scale-110",
            "group-hover:scale-105"
          )}
        >
          {busy ? (
            <Loader2 className="size-7 animate-spin" />
          ) : fsaSupported ? (
            <Link2 className="size-7" />
          ) : (
            <UploadCloud className="size-7" />
          )}
        </div>
        <div>
          <p className="font-display text-lg font-semibold text-foreground">
            {busy
              ? "Adding to your library…"
              : dragging
                ? "Drop to link to your library"
                : fsaSupported
                  ? "Drop PDFs here, or click to link from disk"
                  : "Drop PDFs here, or click to browse"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {fsaSupported ? (
              <>
                Files stay where they are — WebLib just remembers them and reads
                on demand.
              </>
            ) : (
              <>
                Books are copied into this browser (File System Access API
                unavailable).
              </>
            )}
          </p>
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          {fsaSupported ? (
            <>
              <HardDrive className="size-3.5" />
              <span>Reads from your disk · no copies · 40MB+ fine</span>
            </>
          ) : (
            <>
              <FileText className="size-3.5" />
              <span>Supports multiple PDF files</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
