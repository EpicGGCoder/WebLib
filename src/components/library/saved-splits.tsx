"use client";

import * as React from "react";
import { LayoutGrid, Trash2, Layers, Clock, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { Book, Split } from "@/lib/types";
import { coverGradient, timeAgo } from "@/lib/format";
import { useAppStore } from "@/lib/use-store";
import { deleteSplit } from "@/lib/pdf-store";
import { toast } from "sonner";

interface SavedSplitsProps {
  splits: Split[];
  books: Book[];
  onChanged: () => void;
}

export function SavedSplits({
  splits,
  books,
  onChanged,
}: SavedSplitsProps) {
  const loadSplit = useAppStore((s) => s.loadSplit);
  const bumpLibrary = useAppStore((s) => s.bumpLibrary);

  const bookMap = React.useMemo(() => {
    const m = new Map<string, Book>();
    books.forEach((b) => m.set(b.id, b));
    return m;
  }, [books]);

  const handleDelete = async (id: string) => {
    await deleteSplit(id);
    bumpLibrary();
    toast.success("Split removed");
    onChanged();
  };

  if (splits.length === 0) return null;

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center gap-2">
        <Layers className="size-4 text-primary" />
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Saved splits
        </h2>
        <span className="text-xs text-muted-foreground">
          {splits.length} {splits.length === 1 ? "layout" : "layouts"}
        </span>
      </div>
      <div className="scroll-thin -mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
        {splits.map((split) => {
          const panesWithBooks = split.panes
            .map((p) => ({ ...p, book: bookMap.get(p.bookId) }))
            .filter((p) => p.book);
          return (
            <div
              key={split.id}
              className="group relative flex w-64 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <button
                onClick={() => loadSplit(split)}
                className="flex flex-1 flex-col gap-3 p-3 text-left"
              >
                {/* mini spines preview */}
                <div className="flex items-center gap-1.5">
                  {panesWithBooks.slice(0, 3).map((p, i) => (
                    <div
                      key={i}
                      className="book-spine h-12 flex-1 overflow-hidden rounded-md"
                      style={{ background: coverGradient(p.book!.hue) }}
                    >
                      <div className="flex h-full items-end p-1">
                        <span className="line-clamp-2 text-[8px] font-semibold leading-tight text-white/90">
                          {p.book!.name}
                        </span>
                      </div>
                    </div>
                  ))}
                  {panesWithBooks.length === 0 && (
                    <div className="flex h-12 flex-1 items-center justify-center rounded-md bg-muted text-[10px] text-muted-foreground">
                      missing
                    </div>
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <LayoutGrid className="size-3 shrink-0 text-primary" />
                    <h3 className="truncate text-sm font-semibold text-foreground">
                      {split.name}
                    </h3>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>
                      {panesWithBooks.length}{" "}
                      {panesWithBooks.length === 1 ? "pane" : "panes"}
                    </span>
                    <span className="text-foreground/30">·</span>
                    <span className="flex items-center gap-0.5">
                      <Clock className="size-2.5" />
                      {timeAgo(split.lastOpenedAt)}
                    </span>
                  </div>
                  {/* per-pane pages */}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {panesWithBooks.map((p, i) => (
                      <span
                        key={i}
                        className="flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground"
                        title={`${p.book!.name} → page ${p.page}`}
                      >
                        <Bookmark className="size-2 text-primary" />
                        p.{p.page}
                      </span>
                    ))}
                  </div>
                </div>
              </button>
              <div className="flex items-center justify-end border-t border-border/60 px-2 py-1">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-6 text-muted-foreground hover:text-destructive"
                      title="Delete split"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this split?</AlertDialogTitle>
                      <AlertDialogDescription>
                        &ldquo;{split.name}&rdquo; will be removed. Your books
                        and their solo bookmarks are not affected.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-white hover:bg-destructive/90"
                        onClick={() => void handleDelete(split.id)}
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
