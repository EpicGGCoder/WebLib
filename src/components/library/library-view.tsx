"use client";

import * as React from "react";
import { Library, Search, BookMarked, Inbox } from "lucide-react";
import { Input } from "@/components/ui/input";
import { UploadZone } from "./upload-zone";
import { BookCard } from "./book-card";
import { getAllBooks, deleteBook, updateBook } from "@/lib/pdf-store";
import { useAppStore } from "@/lib/use-store";
import type { Book } from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function LibraryView() {
  const [books, setBooks] = React.useState<Book[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const libraryVersion = useAppStore((s) => s.libraryVersion);
  const openBook = useAppStore((s) => s.openBook);
  const setPaneCount = useAppStore((s) => s.setPaneCount);
  const setPaneBook = useAppStore((s) => s.setPaneBook);
  const setView = useAppStore((s) => s.setView);
  const panes = useAppStore((s) => s.panes);
  const paneCount = useAppStore((s) => s.paneCount);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setBooks(await getAllBooks());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load, libraryVersion]);

  const handleAddToSplit = React.useCallback(
    (id: string) => {
      // find first empty pane; if none, replace the last pane
      let target = panes.findIndex((p) => !p.bookId);
      if (target === -1) target = Math.max(0, paneCount - 1);
      // ensure at least 2 panes
      if (paneCount < 2) {
        setPaneCount(2);
        target = Math.min(target, 1);
      }
      setPaneBook(target, id);
      setView("reader");
      // bump lastOpenedAt
      void updateBook(id, { lastOpenedAt: Date.now() }).then(load);
    },
    [panes, paneCount, setPaneCount, setPaneBook, setView, load]
  );

  const handleOpen = React.useCallback(
    (id: string) => {
      openBook(id);
      void updateBook(id, { lastOpenedAt: Date.now() }).then(load);
    },
    [openBook, load]
  );

  const handleDelete = React.useCallback(
    async (id: string) => {
      // remove from any open pane
      panes.forEach((p, i) => {
        if (p.bookId === id) setPaneBook(i, null);
      });
      await deleteBook(id);
      toast.success("Book removed");
      await load();
    },
    [panes, setPaneBook, load]
  );

  const filtered = React.useMemo(() => {
    if (!query.trim()) return books;
    const q = query.toLowerCase();
    return books.filter((b) => b.name.toLowerCase().includes(q));
  }, [books, query]);

  const readingCount = books.filter((b) => b.lastPage > 1).length;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6">
      {/* Hero */}
      <section className="mb-8 flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <BookMarked className="size-3.5 text-primary" />
              {books.length} {books.length === 1 ? "book" : "books"}
              {readingCount > 0 && (
                <span className="text-foreground/70">
                  · {readingCount} in progress
                </span>
              )}
            </div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Your library
            </h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Link PDFs from your disk — they stay in place and WebLib reads
              them on demand. Open one book or split two to three side by side;
              WebLib remembers every page.
            </p>
          </div>
          <UploadZone variant="compact" onAdded={load} />
        </div>

        <UploadZone onAdded={load} />
      </section>

      {/* Books */}
      {books.length > 0 && (
        <div className="mb-4 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your library…"
              className="pl-9"
            />
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[3/4] animate-pulse rounded-xl bg-muted"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        books.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
            <Inbox className="size-8 text-muted-foreground" />
            <p className="font-medium">No books match &ldquo;{query}&rdquo;</p>
            <p className="text-sm text-muted-foreground">
              Try a different search term.
            </p>
          </div>
        )
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filtered.map((book, i) => (
            <BookCard
              key={book.id}
              book={book}
              index={i}
              onOpen={handleOpen}
              onAddToSplit={handleAddToSplit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-2xl border border-border bg-card/50 py-16 text-center"
      )}
    >
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Library className="size-7" />
      </div>
      <div>
        <p className="font-display text-lg font-semibold">Your shelves are empty</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload your first PDF above to start building your library.
        </p>
      </div>
    </div>
  );
}
