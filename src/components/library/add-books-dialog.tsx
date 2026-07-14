"use client";

import * as React from "react";
import {
  UploadCloud,
  Loader2,
  FileText,
  Link2,
  FolderOpen,
  Files,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  saveBook,
  saveFolder,
  countPdfPages,
  pickPdfHandles,
  pickFolder,
  listPdfFilesInDir,
  isFileSystemAccessSupported,
} from "@/lib/pdf-store";
import { hueFromName, stripPdfExt } from "@/lib/format";
import type { Book, Folder } from "@/lib/types";
import { toast } from "sonner";
import { v4 as uuid } from "uuid";

interface AddBooksDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdded: () => void;
}

type Mode = "idle" | "linking-files" | "linking-folder";

export function AddBooksDialog({
  open,
  onOpenChange,
  onAdded,
}: AddBooksDialogProps) {
  const [dragging, setDragging] = React.useState(false);
  const [mode, setMode] = React.useState<Mode>("idle");
  const [progress, setProgress] = React.useState<{ done: number; total: number; name: string } | null>(null);
  const [fsaSupported] = React.useState(() => isFileSystemAccessSupported());

  const buildBook = async (
    name: string,
    size: number,
    file: Blob,
    source: "handle" | "blob",
    extra?: { folderId?: string; fileName?: string }
  ): Promise<Book> => {
    const pages = await countPdfPages(file);
    return {
      id: uuid(),
      name: stripPdfExt(name),
      size,
      pages,
      lastPage: 1,
      lastZoom: 1,
      lastScroll: 0,
      addedAt: Date.now(),
      lastOpenedAt: Date.now(),
      hue: hueFromName(name),
      source,
      ...extra,
    };
  };

  // ---- link individual files (picker) ----
  const handleBrowseFiles = async () => {
    if (!fsaSupported) {
      // fallback: trigger hidden input
      inputRef.current?.click();
      return;
    }
    setMode("linking-files");
    try {
      const handles = await pickPdfHandles();
      if (handles.length === 0) {
        setMode("idle");
        return;
      }
      let added = 0;
      for (let i = 0; i < handles.length; i++) {
        const handle = handles[i];
        try {
          const file = await handle.getFile();
          setProgress({ done: i, total: handles.length, name: file.name });
          const book = await buildBook(file.name, file.size, file, "handle");
          await saveBook(book, handle);
          added++;
        } catch (e) {
          console.error(e);
        }
      }
      setProgress(null);
      if (added > 0) {
        toast.success(
          added === 1 ? "Book linked" : `${added} books linked`
        );
        onAdded();
        onOpenChange(false);
      }
    } catch (e) {
      const err = e as { name?: string };
      if (err?.name !== "AbortError") {
        console.error(e);
        toast.error("Could not open the file picker");
      }
    } finally {
      setMode("idle");
    }
  };

  // ---- link a folder ----
  const handleLinkFolder = async () => {
    if (!fsaSupported) {
      toast.error("Linking a folder needs Chrome or Edge");
      return;
    }
    setMode("linking-folder");
    try {
      const dir = await pickFolder();
      const pdfNames = await listPdfFilesInDir(dir);
      if (pdfNames.length === 0) {
        toast.error("No PDFs found in that folder");
        setMode("idle");
        return;
      }
      const folderId = uuid();
      const folder: Folder = {
        id: folderId,
        name: dir.name,
        addedAt: Date.now(),
      };
      await saveFolder(folder, dir);
      let added = 0;
      for (let i = 0; i < pdfNames.length; i++) {
        const fileName = pdfNames[i];
        try {
          setProgress({ done: i, total: pdfNames.length, name: fileName });
          const fh = await dir.getFileHandle(fileName);
          const file = await fh.getFile();
          const book = await buildBook(fileName, file.size, file, "handle", {
            folderId,
            fileName,
          });
          // folder books don't store their own file entry; access is derived
          // from the folder handle at read time.
          await saveBook(book, file /* stored but unused for folder books */);
          added++;
        } catch (e) {
          console.error(e);
        }
      }
      setProgress(null);
      toast.success(
        `${added} book${added === 1 ? "" : "s"} linked from “${dir.name}”`,
        {
          description:
            "One access prompt per session covers the whole folder.",
        }
      );
      onAdded();
      onOpenChange(false);
    } catch (e) {
      const err = e as { name?: string };
      if (err?.name !== "AbortError") {
        console.error(e);
        toast.error("Could not link that folder");
      }
    } finally {
      setMode("idle");
    }
  };

  // ---- drag & drop ----
  const handleDropItems = async (dataTransfer: DataTransfer) => {
    setMode("linking-files");
    let added = 0;
    const items = Array.from(dataTransfer.items).filter(
      (i) => i.kind === "file"
    );
    const total = items.length;
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
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
          /* fall through */
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
        setProgress({ done: idx, total, name: file.name });
        const book = await buildBook(file.name, file.size, file, source);
        await saveBook(book, entry);
        added++;
      } catch (e) {
        console.error(e);
      }
    }
    setMode("idle");
    setProgress(null);
    if (added > 0) {
      toast.success(added === 1 ? "Book added" : `${added} books added`);
      onAdded();
      onOpenChange(false);
    } else {
      toast.error("Please drop PDF files");
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (mode !== "idle") return;
    void handleDropItems(e.dataTransfer);
  };

  // hidden input for the blob fallback
  const inputRef = React.useRef<HTMLInputElement>(null);
  const handleFilesInput = async (files: FileList | File[]) => {
    const pdfs = Array.from(files).filter(
      (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name)
    );
    if (pdfs.length === 0) {
      toast.error("Please choose PDF files");
      return;
    }
    setMode("linking-files");
    let added = 0;
    for (let i = 0; i < pdfs.length; i++) {
      const file = pdfs[i];
      try {
        setProgress({ done: i, total: pdfs.length, name: file.name });
        const book = await buildBook(file.name, file.size, file, "blob");
        await saveBook(book, file);
        added++;
      } catch (e) {
        console.error(e);
      }
    }
    setMode("idle");
    setProgress(null);
    if (added > 0) {
      toast.success(added === 1 ? "Book added" : `${added} books added`);
      onAdded();
      onOpenChange(false);
    }
  };

  const busy = mode !== "idle";

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Files className="size-5 text-primary" />
            Add books
          </DialogTitle>
          <DialogDescription>
            Link PDFs from your disk — they stay in place and WebLib reads them
            on demand. No copies.
          </DialogDescription>
        </DialogHeader>

        {/* Drop zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "rounded-xl border-2 border-dashed p-6 text-center transition-all",
            dragging
              ? "border-primary bg-accent/50"
              : "border-border hover:border-primary/40 hover:bg-accent/20"
          )}
        >
          <div className="mx-auto flex max-w-sm flex-col items-center gap-2">
            <div
              className={cn(
                "flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary",
                dragging && "scale-110"
              )}
            >
              {busy ? (
                <Loader2 className="size-6 animate-spin" />
              ) : (
                <UploadCloud className="size-6" />
              )}
            </div>
            <p className="text-sm font-medium">
              {progress
                ? `Linking ${progress.done + 1}/${progress.total}: ${progress.name}`
                : busy
                  ? "Working…"
                  : dragging
                    ? "Drop to link"
                    : "Drop PDFs here"}
            </p>
            {!busy && (
              <p className="text-xs text-muted-foreground">
                or use an option below
              </p>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="grid gap-2">
          <Button
            variant="default"
            className="h-10 justify-start gap-3"
            onClick={() => void handleBrowseFiles()}
            disabled={busy}
          >
            <Link2 className="size-4" />
            <span className="flex-1 text-left">
              {fsaSupported ? "Browse PDF files" : "Upload PDF files"}
            </span>
            <FileText className="size-4 opacity-60" />
          </Button>
          <Button
            variant="outline"
            className="h-10 justify-start gap-3"
            onClick={() => void handleLinkFolder()}
            disabled={busy}
          >
            <FolderOpen className="size-4" />
            <span className="flex-1 text-left">Link a whole folder</span>
            <span className="text-[10px] text-muted-foreground">
              {fsaSupported ? "all PDFs inside" : "Chrome/Edge only"}
            </span>
          </Button>
        </div>

        {!fsaSupported && (
          <p className="text-center text-[11px] text-muted-foreground">
            Your browser can&apos;t link files directly — PDFs will be copied
            into storage instead. Use Chrome or Edge for no-copy linking.
          </p>
        )}

        {/* hidden input for blob fallback */}
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
      </DialogContent>
    </Dialog>
  );
}
