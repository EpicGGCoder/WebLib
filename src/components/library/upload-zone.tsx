"use client";

import * as React from "react";
import { UploadCloud, Loader2, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { saveBook, countPdfPages } from "@/lib/pdf-store";
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
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleFiles = React.useCallback(
    async (files: FileList | File[]) => {
      const pdfs = Array.from(files).filter(
        (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name)
      );
      if (pdfs.length === 0) {
        toast.error("Please drop PDF files");
        return;
      }
      setBusy(true);
      let added = 0;
      for (const file of pdfs) {
        try {
          const pages = await countPdfPages(file);
          const book: Book = {
            id: uuid(),
            name: stripPdfExt(file.name),
            size: file.size,
            pages,
            lastPage: 1,
            addedAt: Date.now(),
            lastOpenedAt: Date.now(),
            hue: hueFromName(file.name),
          };
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
          added === 1 ? "Book added to your library" : `${added} books added`
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
    void handleFiles(e.dataTransfer.files);
  };

  if (variant === "compact") {
    return (
      <>
        <Button
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className={cn("gap-2", className)}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <UploadCloud className="size-4" />
          )}
          Upload PDF
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
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
      onClick={() => !busy && inputRef.current?.click()}
      className={cn(
        "group relative cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all sm:p-12",
        dragging
          ? "border-primary bg-accent/50 scale-[1.01]"
          : "border-border hover:border-primary/50 hover:bg-accent/30",
        className
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
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
          ) : (
            <UploadCloud className="size-7" />
          )}
        </div>
        <div>
          <p className="font-display text-lg font-semibold text-foreground">
            {busy
              ? "Saving to your library…"
              : dragging
                ? "Drop to add to your library"
                : "Drop PDFs here, or click to browse"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Books are stored locally in your browser — they stay here, privately.
          </p>
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <FileText className="size-3.5" />
          <span>Supports multiple PDF files</span>
        </div>
      </div>
    </div>
  );
}
