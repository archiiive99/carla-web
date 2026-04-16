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

// Per-panel minSize floors for the sanity check below. Must track the
// minSize= props on each ResizablePanel in this file — if a saved value
// is non-zero but below the panel's minSize, the layout restores to a
// sliver (collapsible panels accept 0 = collapsed, so only values in
// the open range (0, minSize) are the bad-sliver case).
const H_MIN_CONSTRAINTS: Record<string, number> = { left: 10, right: 18 };
const V_MIN_CONSTRAINTS: Record<string, number> = { bottom: 15 };

function getSavedLayout(
  key: string,
  minConstraints: Record<string, number>,
): Layout | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      const layout = JSON.parse(saved) as Layout;
      // Sanity check: reject any panel whose saved size is in the
      // sliver range (0, minSize). Previously this only checked the
      // horizontal layout's "left" — vertical layouts could persist a
      // tiny "bottom" that the check missed, and the legacy version
      // before THAT read `Object.values(layout)[0]` which worked only
      // because insertion order happened to put "left" first.
      for (const [panel, minSize] of Object.entries(minConstraints)) {
        const size = layout[panel];
        if (typeof size === "number" && size > 0 && size < minSize) {
          localStorage.removeItem(key);
          return undefined;
        }
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

  // Debounce the localStorage writes. onLayoutChanged fires on every
  // pixel during a divider drag (~60Hz). localStorage.setItem is
  // main-thread blocking, so writing at 60Hz while the user is actively
  // dragging produced a ~1-frame stutter per write and measurably slowed
  // the drag. 250ms is past typical drag-settle time while still feeling
  // "saved immediately" to the user. Final state always lands because
  // the last change before settling gets its own flush.
  const hSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (hSaveTimerRef.current) clearTimeout(hSaveTimerRef.current);
      if (vSaveTimerRef.current) clearTimeout(vSaveTimerRef.current);
    };
  }, []);

  const onHorizontalLayoutChanged = useCallback((layout: Layout) => {
    if (hSaveTimerRef.current) clearTimeout(hSaveTimerRef.current);
    hSaveTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY_H, JSON.stringify(layout));
      } catch {
        // Ignore storage write failures (private mode / quota).
      }
    }, 250);
  }, []);

  const onVerticalLayoutChanged = useCallback((layout: Layout) => {
    if (vSaveTimerRef.current) clearTimeout(vSaveTimerRef.current);
    vSaveTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY_V, JSON.stringify(layout));
      } catch {
        // Ignore storage write failures (private mode / quota).
      }
    }, 250);
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
      defaultLayout={getSavedLayout(STORAGE_KEY_H, H_MIN_CONSTRAINTS)}
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
          defaultLayout={getSavedLayout(STORAGE_KEY_V, V_MIN_CONSTRAINTS)}
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
