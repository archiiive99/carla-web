import { useCallback, useEffect, useRef } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import type { Layout } from "react-resizable-panels";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { LeftPanel } from "./LeftPanel";
import { RightPanel } from "./RightPanel";
import { BottomPanel } from "./BottomPanel";
import { MainViewport } from "@/components/viewport/MainViewport";
import { useUIStore } from "@/stores/uiStore";

const LAYOUT_VERSION = 5;
const STORAGE_KEY_H = `carla-layout-h-v${LAYOUT_VERSION}`;
const STORAGE_KEY_V = `carla-layout-v-v${LAYOUT_VERSION}`;

function getSavedLayout(key: string): Layout | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      const layout = JSON.parse(saved) as Layout;
      // Sanity check: the horizontal layout's "left" panel is collapsible
      // with minSize=10. Layouts saved with left < 10 collapse the actor
      // list to a sliver; drop the stored value and fall back to defaults.
      // (Previously this read `Object.values(layout)[0]`, which works only
      // while insertion order happens to put "left" first — fragile across
      // browsers/serializers.)
      const leftSize = layout["left"];
      if (typeof leftSize === "number" && leftSize < 10) {
        localStorage.removeItem(key);
        return undefined;
      }
      return layout;
    }
  } catch {
    // Ignore malformed persisted layout and fall back to defaults.
  }
  return undefined;
}

// Clean up all old layout keys on load
if (typeof window !== "undefined") {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("carla-layout") && !key.includes(`v${LAYOUT_VERSION}`)) {
      localStorage.removeItem(key);
    }
  }
}

export function ResizableLayout() {
  const leftPanelOpen = useUIStore((s) => s.leftPanelOpen);
  const rightPanelOpen = useUIStore((s) => s.rightPanelOpen);
  const bottomPanelOpen = useUIStore((s) => s.bottomPanelOpen);
  const leftPanelRef = useRef<PanelImperativeHandle | null>(null);
  const rightPanelRef = useRef<PanelImperativeHandle | null>(null);
  const bottomPanelRef = useRef<PanelImperativeHandle | null>(null);

  const onHorizontalLayoutChanged = useCallback((layout: Layout) => {
    try {
      localStorage.setItem(STORAGE_KEY_H, JSON.stringify(layout));
    } catch {
      // Ignore storage write failures (private mode / quota).
    }
  }, []);

  const onVerticalLayoutChanged = useCallback((layout: Layout) => {
    try {
      localStorage.setItem(STORAGE_KEY_V, JSON.stringify(layout));
    } catch {
      // Ignore storage write failures (private mode / quota).
    }
  }, []);

  useEffect(() => {
    if (!leftPanelRef.current) return;
    if (leftPanelOpen) leftPanelRef.current.expand();
    else leftPanelRef.current.collapse();
  }, [leftPanelOpen]);

  useEffect(() => {
    if (!rightPanelRef.current) return;
    if (rightPanelOpen) rightPanelRef.current.expand();
    else rightPanelRef.current.collapse();
  }, [rightPanelOpen]);

  useEffect(() => {
    if (!bottomPanelRef.current) return;
    if (bottomPanelOpen) bottomPanelRef.current.expand();
    else bottomPanelRef.current.collapse();
  }, [bottomPanelOpen]);

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      defaultLayout={getSavedLayout(STORAGE_KEY_H)}
      onLayoutChanged={onHorizontalLayoutChanged}
    >
      {/* Left Panel — Actor list, spawn controls */}
      <ResizablePanel
        id="left"
        panelRef={leftPanelRef}
        defaultSize={14}
        minSize={10}
        collapsedSize={0}
        collapsible
      >
        <LeftPanel />
      </ResizablePanel>

      <ResizableHandle
        withHandle
        aria-label="Resize actor panel"
        className={!leftPanelOpen ? "pointer-events-none opacity-0" : undefined}
      />

      {/* Center: Viewport + Bottom */}
      <ResizablePanel id="center" defaultSize={61} minSize={40}>
        <ResizablePanelGroup
          orientation="vertical"
          defaultLayout={getSavedLayout(STORAGE_KEY_V)}
          onLayoutChanged={onVerticalLayoutChanged}
        >
          <ResizablePanel id="viewport" defaultSize={70} minSize={30}>
            <MainViewport />
          </ResizablePanel>

          <ResizableHandle
            withHandle
            aria-label="Resize bottom panel"
            className={!bottomPanelOpen ? "pointer-events-none opacity-0" : undefined}
          />

          <ResizablePanel
            id="bottom"
            panelRef={bottomPanelRef}
            defaultSize={30}
            minSize={15}
            collapsedSize={0}
            collapsible
          >
            <BottomPanel />
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>

      <ResizableHandle
        withHandle
        aria-label="Resize properties panel"
        className={!rightPanelOpen ? "pointer-events-none opacity-0" : undefined}
      />

      {/* Right Panel — Properties, actor details */}
      <ResizablePanel
        id="right"
        panelRef={rightPanelRef}
        defaultSize={25}
        minSize={18}
        collapsedSize={0}
        collapsible
      >
        <RightPanel />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
