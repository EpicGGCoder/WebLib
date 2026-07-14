"use client";

import * as React from "react";
import { Settings, MousePointerClick } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useSettingsStore, type PanButton } from "@/lib/use-settings";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const panButton = useSettingsStore((s) => s.panButton);
  const setPanButton = useSettingsStore((s) => s.setPanButton);

  const useRightClick = panButton === "right";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="size-5 text-primary" />
            Settings
          </DialogTitle>
          <DialogDescription>
            Customize how WebLib behaves.
          </DialogDescription>
        </DialogHeader>

        {/* Shortcuts section */}
        <div className="space-y-3 py-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <MousePointerClick className="size-4 text-primary" />
            Shortcuts
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card/50 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                Use right-click to pan
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Drag the PDF with the right mouse button instead of the middle
                (scroll-wheel) button. Handy if your middle button is stiff.
              </p>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {useRightClick ? (
                  <>
                    On — <span className="text-foreground">right-click + drag</span> to
                    pan. The browser context menu is suppressed while panning.
                  </>
                ) : (
                  <>
                    Off — <span className="text-foreground">middle-click + drag</span> to
                    pan.
                  </>
                )}
              </p>
            </div>
            <Switch
              checked={useRightClick}
              onCheckedChange={(checked) =>
                setPanButton(checked ? "right" : "middle")
              }
              aria-label="Use right-click to pan"
              className="mt-0.5 shrink-0"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Convenience hook for components that only need the panButton value. */
export function usePanButton(): PanButton {
  return useSettingsStore((s) => s.panButton);
}
