# WebLib — Work Log

Project: A beautiful PDF library web app ("WebLib") where users upload PDFs from
local storage, browse their library, open PDFs in Chrome's native viewer, open
2–3 PDFs in split view, and remember the last-opened page for every book.

Architecture decisions:
- Storage: client-side IndexedDB (stores PDF blobs + metadata). No backend DB
  needed — matches "from my local storage" requirement and persists across
  sessions.
- PDF viewer: native Chrome PDF viewer via `<iframe src="blob:...#page=N">`.
  Chrome's viewer runs in an isolated origin so the current page CANNOT be read
  back programmatically. Page memory is therefore handled with a clean manual
  "page" input per pane (Enter to save bookmark; jump button to navigate).
- Split view: `react-resizable-panels` (already installed) for 1/2/3 panes.
- State: Zustand store persisted to localStorage for the open reader panes.

---
Task ID: 1
Agent: main
Task: Create IndexedDB storage layer + types + PDF page counter

Work Log:
- (in progress)

Stage Summary (Task 1–8, completed by main agent):
- Storage layer (src/lib/pdf-store.ts): IndexedDB wrapper with two object stores
  (books metadata + files blobs), CRUD ops, storage estimate, and a best-effort
  PDF page counter (scans /Type /Page markers, falls back to /Count). Verified:
  correctly counted 12/10/14 pages for test PDFs.
- Types (src/lib/types.ts): Book, PaneState, View.
- Zustand store (src/lib/use-store.ts): view, panes, paneCount, libraryVersion;
  persisted to localStorage so the reader layout survives reloads.
- Theme (globals.css, layout.tsx, theme-provider.tsx, theme-toggle.tsx): warm
  amber/stone "library" palette in light + dark, Fraunces display font for
  headings, paper-texture backdrop, custom thin scrollbars, book-spine effect.
- Library view (library/*): sticky header (brand + Resume + theme toggle),
  hero upload zone (drag&drop + click, multi-file), search, responsive book grid
  with gradient covers + progress bars + Read/Split/Delete, empty state.
- Reader view (reader/*): resizable 1/2/3 panes (react-resizable-panels,
  responsive vertical on mobile), each pane shows Chrome's NATIVE PDF viewer via
  <iframe src="blob:...#page=N&toolbar=1&navpanes=1&view=FitH"> so all of
  Chrome's doodle/annotation tools remain available. Each pane has its own page
  input + Save (bookmark, no reload) + Go (jump) + reload/swap/close controls.
  Empty panes show a searchable book picker.
- Page memory: because Chrome's PDF viewer runs in an isolated origin, the
  current page cannot be read back programmatically. Solution: a clean per-pane
  "Page [input] / N · Save · Go" control. Save persists the bookmark (Enter);
  Go reloads the viewer at the typed page. Opening a book loads it at its saved
  page via #page=N.
- Persistence verified end-to-end: reload → library → "Resume reading · 3 books"
  → 3-pane split restored with each book at its saved page (5/12, 8/14, 3/10).
- Lint clean (0 errors/warnings). Dev server compiles & serves 200s, no runtime
  errors. Agent Browser verified: upload, grid, single read, 2-pane split,
  3-pane split, per-book page memory, reload+resume, dark mode, delete dialog.
