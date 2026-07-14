"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type PanButton = "middle" | "right";

interface SettingsState {
  /** which mouse button initiates drag-pan in the PDF viewer */
  panButton: PanButton;
  setPanButton: (b: PanButton) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      panButton: "middle",
      setPanButton: (b) => set({ panButton: b }),
    }),
    { name: "weblib-settings" }
  )
);
