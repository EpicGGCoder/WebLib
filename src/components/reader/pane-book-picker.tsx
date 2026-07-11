"use client";

import * as React from "react";
import { Search, BookOpen, Clock, UploadCloud, HardDrive } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getAllBooks } from "@/lib/pdf-store";
import { coverGradient, timeAgo } from "@/lib/format";
import type { Book } from "@/lib/types";
import { useAppStore } from "@/lib/use-store";
import { cn } from "@/lib/utils";

interface PaneBookPickerProps {
  onPick: (bookId: string) => void;
}

export function PaneBookPicker({ onPick }: PaneBookPickerProps) {
  const [books, setBooks] = React.useState<Book[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const libraryVersion = useAppStore((s) => s.libraryVersion);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getAllBooks()
      .then((b) => {
        if (!cancelled) setBooks(b);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [libraryVersion]);

  const filtered = React.useMemo(() => {
    if (!query.trim()) return books;
    const q = query.toLowerCase();
    return books.filter((b) => b.name.toLowerCase().includes(q));
  }, [books, query]);

  const triggerUpload = () => {
    // dispatch a custom event the library upload isn't mounted here;
    // instead, send the user back to the library to upload.
    useAppStore.getState().setView("library");
  };

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="border-b border-border p-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
          <BookOpen className="size-4 text-primary" />
          Choose a book
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="h-8 pl-8 text-sm"
          />
        </div>
      </div>
      <div className="scroll-thin flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-12 animate-pulse rounded-lg bg-muted"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {books.length === 0
                ? "Your library is empty."
                : "No matches found."}
            </p>
            {books.length === 0 && (
              <Button
                variant="outline"
                size="sm"
                className="mt-1 gap-2"
                onClick={triggerUpload}
              >
                <UploadCloud className="size-4" />
                Go upload a PDF
              </Button>
            )}
          </div>
        ) : (
          <ul className="space-y-1">
            {filtered.map((b) => (
              <li key={b.id}>
                <button
                  onClick={() => onPick(b.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-accent"
                  )}
                >
                  <span
                    className="book-spine size-9 shrink-0 rounded-md"
                    style={{ background: coverGradient(b.hue) }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {b.name}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Clock className="size-2.5" />
                      {timeAgo(b.lastOpenedAt)}
                      {b.source === "handle" && (
                        <HardDrive
                          className="size-2.5 text-emerald-600 dark:text-emerald-400"
                        />
                      )}
                      {b.pages > 0 && (
                        <span className="text-foreground/40">·</span>
                      )}
                      {b.pages > 0 && <span>{b.pages}p</span>}
                      {b.lastPage > 1 && (
                        <>
                          <span className="text-foreground/40">·</span>
                          <span className="text-primary">p.{b.lastPage}</span>
                        </>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
