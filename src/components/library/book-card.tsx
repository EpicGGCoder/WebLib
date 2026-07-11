"use client";

import * as React from "react";
import {
  BookOpen,
  Columns2,
  Trash2,
  Bookmark,
  Clock,
  FileText,
  HardDrive,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
import type { Book } from "@/lib/types";
import { coverGradient, formatBytes, timeAgo } from "@/lib/format";

interface BookCardProps {
  book: Book;
  onOpen: (id: string) => void;
  onAddToSplit: (id: string) => void;
  onDelete: (id: string) => void;
  index: number;
}

export function BookCard({
  book,
  onOpen,
  onAddToSplit,
  onDelete,
  index,
}: BookCardProps) {
  const progress =
    book.pages > 0 ? Math.min(100, Math.round((book.lastPage / book.pages) * 100)) : 0;

  return (
    <div
      className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all hover:-translate-y-1 hover:shadow-md animate-float-in"
      style={{ animationDelay: `${Math.min(index * 40, 400)}ms` }}
    >
      {/* Cover */}
      <button
        onClick={() => onOpen(book.id)}
        className="book-spine relative block aspect-[3/4] w-full overflow-hidden text-left"
        style={{ background: coverGradient(book.hue) }}
        aria-label={`Open ${book.name}`}
      >
        <div className="absolute inset-0 flex flex-col justify-between p-4">
          <div className="flex items-start justify-between">
            <span className="rounded-md bg-black/25 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/90 backdrop-blur-sm">
              PDF
            </span>
            <div className="flex flex-col items-end gap-1">
              {book.lastPage > 1 && (
                <span className="flex items-center gap-1 rounded-md bg-black/25 px-2 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur-sm">
                  <Bookmark className="size-2.5" />
                  p.{book.lastPage}
                </span>
              )}
              {book.source === "handle" && (
                <span
                  className="flex items-center gap-1 rounded-md bg-emerald-400/30 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm"
                  title="Reads from your disk — no copy"
                >
                  <HardDrive className="size-2.5" />
                  linked
                </span>
              )}
            </div>
          </div>
          <div>
            <h3 className="line-clamp-4 font-display text-lg font-semibold leading-tight text-white drop-shadow-sm">
              {book.name}
            </h3>
            <p className="mt-1 text-[11px] font-medium text-white/70">
              {book.pages > 0 ? `${book.pages} pages` : "PDF"}
            </p>
          </div>
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-sm font-semibold text-foreground shadow-lg">
            <BookOpen className="size-4" />
            Open
          </span>
        </div>
      </button>

      {/* Meta */}
      <div className="flex flex-1 flex-col gap-3 p-3">
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {timeAgo(book.lastOpenedAt)}
          </span>
          <span className="flex items-center gap-1">
            <FileText className="size-3" />
            {formatBytes(book.size)}
          </span>
        </div>

        {book.pages > 0 && (
          <div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                Page {book.lastPage} / {book.pages}
              </span>
              <span>{progress}%</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        <div className="mt-auto flex items-center gap-1.5">
          <Button
            size="sm"
            className="h-8 flex-1 gap-1.5"
            onClick={() => onOpen(book.id)}
          >
            <BookOpen className="size-3.5" />
            Read
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            onClick={() => onAddToSplit(book.id)}
            title="Open in split view"
          >
            <Columns2 className="size-3.5" />
            Split
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                title="Delete"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove this book?</AlertDialogTitle>
                <AlertDialogDescription>
                  &ldquo;{book.name}&rdquo; will be permanently removed from
                  your library. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-white hover:bg-destructive/90"
                  onClick={() => onDelete(book.id)}
                >
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}
