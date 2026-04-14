import { create } from "zustand";

interface PerformanceState {
  fps: number;
  latency: number;
  bandwidth: number;
  droppedFrames: number;
  peakFps: number;
  peakBandwidth: number;
  peakLatency: number;
  connectedSince: number | null;
  fpsHistory: number[];
  latencyHistory: number[];
  bandwidthHistory: number[];

  update: (metrics: Partial<PerformanceState>) => void;
  markConnected: () => void;
  markDisconnected: () => void;
}

export const usePerformanceStore = create<PerformanceState>((set) => ({
  fps: 0,
  latency: 0,
  bandwidth: 0,
  droppedFrames: 0,
  peakFps: 0,
  peakBandwidth: 0,
  peakLatency: 0,
  connectedSince: null,
  fpsHistory: [],
  latencyHistory: [],
  bandwidthHistory: [],

  update: (metrics) =>
    set((s) => {
      const newFps = metrics.fps ?? s.fps;
      const newLatency = metrics.latency ?? s.latency;
      const newBandwidth = metrics.bandwidth ?? s.bandwidth;
      const pushCapped = (arr: number[], v: number) => {
        const next = [...arr, v];
        if (next.length > 60) next.shift();
        return next;
      };
      return {
        ...s,
        ...metrics,
        fpsHistory: pushCapped(s.fpsHistory, newFps),
        latencyHistory: pushCapped(s.latencyHistory, newLatency),
        bandwidthHistory: pushCapped(s.bandwidthHistory, newBandwidth),
        peakFps: Math.max(s.peakFps, newFps),
        peakBandwidth: Math.max(s.peakBandwidth, newBandwidth),
        peakLatency: Math.max(s.peakLatency, newLatency),
      };
    }),

  markConnected: () => set({ connectedSince: Date.now() }),
  markDisconnected: () => set({ connectedSince: null }),
}));
