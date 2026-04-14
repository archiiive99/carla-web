import { createContext, useContext } from "react";

// Only workers consumed via useWorkers() are exposed here. telemetryWorker
// is created by WorkerProvider too, but its onmessage handler wires directly
// into the stores — no external consumers hold a ref.
export interface WorkerRefs {
  wsReceiverWorker: Worker | null;
  imageDecoderWorker: Worker | null;
  lidarProcessorWorker: Worker | null;
}

export const EMPTY_WORKERS: WorkerRefs = {
  wsReceiverWorker: null,
  imageDecoderWorker: null,
  lidarProcessorWorker: null,
};

export const WorkerContext = createContext<WorkerRefs>(EMPTY_WORKERS);

export function useWorkers() {
  return useContext(WorkerContext);
}
