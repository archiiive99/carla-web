/**
 * Global worker reference for non-React code (Zustand stores).
 * Set by WorkerContext, read by sensorStore.
 */
let _wsReceiverWorker: Worker | null = null;

export function setGlobalWsWorker(worker: Worker | null) {
  _wsReceiverWorker = worker;
}

export function getGlobalWsWorker(): Worker | null {
  return _wsReceiverWorker;
}
