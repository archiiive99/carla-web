import { create } from "zustand";
import { EVENT_LOG_MAX_ITEMS } from "@/constants";

export type EventType =
  | "collision"
  | "lane_invasion"
  | "spawn"
  | "destroy"
  | "connection"
  | "weather"
  | "map";

export interface LogEvent {
  id: number;
  timestamp: number;
  type: EventType;
  message: string;
}

interface EventLogState {
  events: LogEvent[];
  addEvent: (type: EventType, message: string) => void;
  clearEvents: () => void;
}

let nextEventId = 0;

export const useEventStore = create<EventLogState>((set) => ({
  events: [],

  addEvent: (type, message) =>
    set((state) => {
      const next = [
        ...state.events,
        { id: nextEventId++, timestamp: Date.now() / 1000, type, message },
      ];
      // Cap at EVENT_LOG_MAX_ITEMS to avoid runaway memory with busy simulations
      if (next.length > EVENT_LOG_MAX_ITEMS) next.splice(0, next.length - EVENT_LOG_MAX_ITEMS);
      return { events: next };
    }),

  clearEvents: () => set({ events: [] }),
}));

/**
 * Convenience hook: bundles `events` / `addEvent` / `clearEvents` selectors.
 * Lives with the store (not the EventLog component file) so Vite Fast Refresh
 * doesn't invalidate on every EventLog edit — mixing hooks + components in
 * one file breaks Fast Refresh's component-boundary heuristic.
 */
export function useEventLog() {
  const events = useEventStore((s) => s.events);
  const addEvent = useEventStore((s) => s.addEvent);
  const clearEvents = useEventStore((s) => s.clearEvents);
  return { events, addEvent, clearEvents };
}
