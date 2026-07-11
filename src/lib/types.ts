export interface Book {
  id: string;
  name: string;
  size: number;
  pages: number; // best-effort total page count (0 if unknown)
  lastPage: number; // last saved page (1-based); 1 if never opened
  addedAt: number;
  lastOpenedAt: number;
  // accent color seed derived from name, used for the gradient cover
  hue: number;
}

export interface BookWithUrl extends Book {
  url: string; // object URL for the PDF blob
}

export type PaneState = {
  bookId: string | null;
};

export type View = "library" | "reader";
