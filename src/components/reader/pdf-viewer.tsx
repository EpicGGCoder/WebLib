"use client";

import * as React from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Minus, Plus, Maximize, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Configure the pdf.js worker from the static copy in /public.
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

type PdfDoc = Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;

interface PdfViewerProps {
  file: Blob;
  initialPage: number; // 1-based
  initialZoom: number; // 1.0 = fit-width
  initialScroll: number; // px
  numPages: number; // total (from metadata; 0 if unknown)
  onStateChange: (state: { page: number; zoom: number; scroll: number }) => void;
}

const RENDER_WINDOW = 2;

export function PdfViewer({
  file,
  initialPage,
  initialZoom,
  initialScroll,
  numPages,
  onStateChange,
}: PdfViewerProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const [doc, setDoc] = React.useState<PdfDoc | null>(null);
  const [pageWidths, setPageWidths] = React.useState<number[]>([]);
  const [containerWidth, setContainerWidth] = React.useState(0);
  const [zoom, setZoom] = React.useState(initialZoom);
  const [scrollTop, setScrollTop] = React.useState(0);
  const [viewportH, setViewportH] = React.useState(0);
  const [ready, setReady] = React.useState(false);
  const [realHeights, setRealHeights] = React.useState<Record<number, number>>(
    {}
  );
  const restoredRef = React.useRef(false);
  const saveRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // measure container
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      setContainerWidth(el.clientWidth);
      setViewportH(el.clientHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onDocLoad = async (d: PdfDoc) => {
    setDoc(d);
    const widths = await Promise.all(
      Array.from({ length: d.numPages }, async (_, i) => {
        const page = await d.getPage(i + 1);
        return page.getViewport({ scale: 1 }).width;
      })
    );
    setPageWidths(widths);
    setReady(true);
  };

  // real page heights from rendered pages (state-driven so layout recomputes)
  const registerPageHeight = React.useCallback((pageNum: number, h: number) => {
    setRealHeights((prev) => {
      if (prev[pageNum] === h) return prev;
      return { ...prev, [pageNum]: h };
    });
  }, []);

  // layout: per-page heights + offsets, using real heights when available
  const layout = React.useMemo(() => {
    if (!pageWidths.length || containerWidth === 0)
      return { heights: [] as number[], offsets: [] as number[], total: 0 };
    const heights = pageWidths.map((w, i) => {
      const real = realHeights[i + 1];
      if (real) return real;
      const scale = (containerWidth * zoom) / w;
      return w * Math.SQRT2 * scale; // fallback aspect ratio
    });
    const offsets: number[] = [];
    let acc = 0;
    for (const h of heights) {
      offsets.push(acc);
      acc += h + 12;
    }
    return { heights, offsets, total: acc };
  }, [pageWidths, containerWidth, zoom, realHeights]);

  const visiblePages = React.useMemo(() => {
    if (!layout.heights.length) return [];
    const top = scrollTop;
    const bottom = scrollTop + viewportH;
    let first = layout.offsets.findIndex((o) => o > top);
    if (first === -1) first = 0;
    first = Math.max(0, first - 1 - RENDER_WINDOW);
    let last = first;
    for (let i = first; i < layout.heights.length; i++) {
      if (layout.offsets[i] <= bottom + 400) last = i;
      else break;
    }
    last = Math.min(layout.heights.length - 1, last + RENDER_WINDOW);
    const out: { pageNum: number; top: number; height: number }[] = [];
    for (let i = first; i <= last; i++) {
      out.push({
        pageNum: i + 1,
        top: layout.offsets[i],
        height: layout.heights[i],
      });
    }
    return out;
  }, [layout, scrollTop, viewportH]);

  const currentPage = React.useMemo(() => {
    if (!layout.heights.length) return initialPage;
    const mid = scrollTop + viewportH / 3;
    for (let i = 0; i < layout.heights.length; i++) {
      if (mid >= layout.offsets[i] && mid < layout.offsets[i] + layout.heights[i])
        return i + 1;
    }
    return 1;
  }, [layout, scrollTop, viewportH, initialPage]);

  // ref holding the latest page so debounced save callbacks read the
  // current value (not a stale closure from the render that created them)
  const currentPageRef = React.useRef(currentPage);
  const zoomRef = React.useRef(zoom);
  React.useEffect(() => {
    currentPageRef.current = currentPage;
    zoomRef.current = zoom;
  });

  // restore initial scroll
  React.useEffect(() => {
    if (!ready || restoredRef.current || !scrollRef.current) return;
    restoredRef.current = true;
    if (initialScroll > 0) {
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = Math.min(
            initialScroll,
            scrollRef.current.scrollHeight
          );
        }
      });
    } else if (initialPage > 1) {
      const offset = layout.offsets[initialPage - 1];
      if (offset != null) {
        requestAnimationFrame(() => {
          if (scrollRef.current) scrollRef.current.scrollTop = offset;
        });
      }
    }
  }, [ready, initialScroll, initialPage, layout.offsets]);

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const st = e.currentTarget.scrollTop;
    setScrollTop(st);
    if (saveRef.current) clearTimeout(saveRef.current);
    saveRef.current = setTimeout(() => {
      onStateChange({
        page: currentPageRef.current,
        zoom: zoomRef.current,
        scroll: st,
      });
    }, 400);
  };

  /**
   * Zoom anchored to a specific screen point (cursor or viewport center).
   * Keeps the document point under that screen point stationary, so the
   * content doesn't drift up/down. Uses a layout effect to correct scroll
   * synchronously before the browser paints (no flicker).
   *
   * Strategy: record (scrollTop, clientY) before zoom; after zoom the same
   * document fraction is at fraction = oldScrollPos / oldScrollMax; but to
   * anchor the CURSOR we need the document point under the cursor. We
   * compute: docPointUnderCursor = scrollTop + (cursorY - 0) in document
   * coords... actually simpler: the content scales by (next/zoom), so a
   * document point at old offset `o` moves to `o * (next/zoom)`. We keep
   * the point under the cursor fixed:
   *   oldCursorDocY = scrollTop + cursorY
   *   newScrollTop  = oldCursorDocY * (next/zoom) - cursorY
   */
  const anchorRef = React.useRef<{
    zoom: number;
    next: number;
    cursorY: number | null; // null = viewport center
    oldScrollTop: number;
    oldScrollHeight: number;
  } | null>(null);

  const applyZoomAnchored = (
    next: number,
    cursorY: number | null
  ) => {
    const el = scrollRef.current;
    if (!el) {
      setZoom(next);
      return;
    }
    anchorRef.current = {
      zoom,
      next,
      cursorY,
      oldScrollTop: el.scrollTop,
      oldScrollHeight: el.scrollHeight,
    };
    setZoom(next);
  };

  // Synchronously correct scroll position after zoom state changes, before
  // paint, so there's no visible flicker/jump.
  React.useLayoutEffect(() => {
    const a = anchorRef.current;
    if (!a) return;
    const el = scrollRef.current;
    if (!el) return;
    anchorRef.current = null;
    if (a.zoom === 0) return;
    const scale = a.next / a.zoom;
    const cursorY =
      a.cursorY != null
        ? a.cursorY
        : el.clientHeight / 2;
    // document point under the cursor before zoom
    const docPoint = a.oldScrollTop + cursorY;
    // after zoom that point is at docPoint * scale; set scrollTop so it's
    // under the cursor again: scrollTop = docPoint*scale - cursorY
    const target = Math.max(0, docPoint * scale - cursorY);
    el.scrollTop = target;
    setScrollTop(el.scrollTop);
    if (saveRef.current) clearTimeout(saveRef.current);
    saveRef.current = setTimeout(() => {
      onStateChange({
        page: currentPageRef.current,
        zoom: a.next,
        scroll: el.scrollTop,
      });
    }, 400);
  }, [zoom, onStateChange]);

  const zoomIn = () =>
    applyZoomAnchored(Math.min(4, +(zoom + 0.25).toFixed(2)), null);
  const zoomOut = () =>
    applyZoomAnchored(Math.max(0.25, +(zoom - 0.25).toFixed(2)), null);
  const fitWidth = () => applyZoomAnchored(1, null);

  // ---- Ctrl+scroll = smooth zoom anchored at the cursor ----
  // Native non-passive listener so preventDefault stops browser page zoom.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      if (!containerWidth) return;
      const factor = Math.exp(-e.deltaY * 0.0015);
      const next = Math.max(0.25, Math.min(4, +(zoom * factor).toFixed(3)));
      if (next === zoom) return;
      const rect = el.getBoundingClientRect();
      const cursorY = e.clientY - rect.top;
      applyZoomAnchored(next, cursorY);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [zoom, containerWidth]);

  // ---- middle-click drag pan (auto-scroll) ----
  const [panning, setPanning] = React.useState(false);
  const panStateRef = React.useRef<{
    panning: boolean;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
    moved: boolean;
  }>({ panning: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0, moved: false });

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // middle button (button === 1) initiates pan
    if (e.button !== 1) return;
    const el = scrollRef.current;
    if (!el) return;
    e.preventDefault();
    panStateRef.current = {
      panning: true,
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
      moved: false,
    };
    setPanning(true);
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = panStateRef.current;
    if (!st.panning) return;
    const el = scrollRef.current;
    if (!el) return;
    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) st.moved = true;
    el.scrollLeft = st.scrollLeft - dx;
    el.scrollTop = st.scrollTop - dy;
  };

  const endPan = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = panStateRef.current;
    if (!st.panning) return;
    st.panning = false;
    setPanning(false);
    try {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const [pageInput, setPageInput] = React.useState(String(currentPage));
  React.useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);
  const gotoPage = (val: string) => {
    const n = parseInt(val, 10);
    if (Number.isNaN(n)) return;
    const total = doc?.numPages ?? numPages;
    const clamped = Math.max(1, Math.min(total || n, n));
    const offset = layout.offsets[clamped - 1];
    if (offset != null && scrollRef.current) {
      scrollRef.current.scrollTo({ top: offset, behavior: "smooth" });
    }
  };

  React.useEffect(() => {
    return () => {
      if (saveRef.current) clearTimeout(saveRef.current);
      if (doc) doc.destroy();
    };
  }, [doc]);

  const total = doc?.numPages ?? numPages;
  const renderWidth = containerWidth > 0 ? containerWidth * zoom : undefined;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-neutral-200 dark:bg-neutral-900"
    >
      {!ready && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={onScroll}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerLeave={endPan}
        className={cn(
          "scroll-thin weblib-pdf-scroll h-full w-full overflow-auto",
          panning ? "cursor-grabbing" : "cursor-default"
        )}
        style={{ paddingBottom: 72 }}
      >
        <div
          className="relative mx-auto"
          style={{
            width: renderWidth ?? "100%",
            height: layout.total || undefined,
            maxWidth: "100%",
          }}
        >
          <Document
            file={file}
            onLoadSuccess={onDocLoad}
            loading=""
            className="absolute inset-0"
          >
            {visiblePages.map(({ pageNum, top, height }) => (
              <div
                key={pageNum}
                className="absolute left-0 right-0 mx-auto"
                style={{ top, height }}
              >
                <div
                  className="relative mx-auto bg-white shadow-lg shadow-black/10"
                  style={{ width: renderWidth ?? "100%" }}
                >
                  <MeasuredPage
                    pageNumber={pageNum}
                    width={renderWidth}
                    onHeight={(h) => registerPageHeight(pageNum, h)}
                  />
                  <div className="pointer-events-none absolute bottom-1 right-2 rounded bg-black/40 px-1.5 py-0.5 text-[9px] font-medium text-white/90">
                    {pageNum}
                  </div>
                </div>
              </div>
            ))}
          </Document>
        </div>
      </div>

      {/* Floating glass toolbar */}
      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-black/10 bg-white/80 px-1.5 py-1 shadow-lg shadow-black/10 backdrop-blur-md dark:border-white/10 dark:bg-neutral-800/80">
          <ToolbarBtn onClick={zoomOut} disabled={!ready} title="Zoom out">
            <Minus className="size-3.5" />
          </ToolbarBtn>
          <button
            onClick={fitWidth}
            className="min-w-[44px] rounded-full px-2 py-1 text-center text-[11px] font-semibold tabular-nums text-neutral-700 transition-colors hover:bg-black/5 dark:text-neutral-200 dark:hover:bg-white/10"
            title="Fit width (reset zoom)"
          >
            {Math.round(zoom * 100)}%
          </button>
          <ToolbarBtn onClick={zoomIn} disabled={!ready} title="Zoom in">
            <Plus className="size-3.5" />
          </ToolbarBtn>
          <div className="mx-1 h-4 w-px bg-black/10 dark:bg-white/10" />
          <ToolbarBtn
            onClick={() =>
              gotoPage(String(Math.max(1, currentPage - 1)))
            }
            disabled={!ready || currentPage <= 1}
            title="Previous page"
          >
            <ChevronUp className="size-3.5" />
          </ToolbarBtn>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              gotoPage(pageInput);
            }}
            className="flex items-center"
          >
            <input
              value={pageInput}
              onChange={(e) =>
                setPageInput(e.target.value.replace(/[^0-9]/g, ""))
              }
              inputMode="numeric"
              className="h-6 w-9 rounded-full bg-transparent text-center text-[11px] font-semibold tabular-nums text-neutral-700 outline-none focus:bg-black/5 dark:text-neutral-200 dark:focus:bg-white/10"
              aria-label="Go to page"
              disabled={!ready}
            />
          </form>
          <span className="px-1 text-[10px] tabular-nums text-neutral-400">
            / {total || "…"}
          </span>
          <ToolbarBtn
            onClick={() =>
              gotoPage(
                String(Math.min(total || currentPage, currentPage + 1))
              )
            }
            disabled={!ready || (total > 0 && currentPage >= total)}
            title="Next page"
          >
            <ChevronDown className="size-3.5" />
          </ToolbarBtn>
          <div className="mx-1 h-4 w-px bg-black/10 dark:bg-white/10" />
          <ToolbarBtn onClick={fitWidth} disabled={!ready} title="Fit width">
            <Maximize className="size-3.5" />
          </ToolbarBtn>
        </div>
      </div>
    </div>
  );
}

function ToolbarBtn({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "flex size-6 items-center justify-center rounded-full text-neutral-600 transition-colors hover:bg-black/5 disabled:opacity-30 disabled:hover:bg-transparent dark:text-neutral-300 dark:hover:bg-white/10"
      )}
    >
      {children}
    </button>
  );
}

function MeasuredPage({
  pageNumber,
  width,
  onHeight,
}: {
  pageNumber: number;
  width?: number;
  onHeight: (h: number) => void;
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (ref.current) onHeight(ref.current.offsetHeight);
  });
  return (
    <div ref={ref}>
      <Page
        pageNumber={pageNumber}
        width={width}
        renderTextLayer={false}
        renderAnnotationLayer={false}
        loading={
          <div
            style={{ height: width ? width * Math.SQRT2 : 400, width }}
            className="animate-pulse bg-neutral-100"
          />
        }
      />
    </div>
  );
}
