import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSimulationStore } from "@/stores/simulationStore";
import { useActorStore } from "@/stores/actorStore";
import { usePerformanceStore } from "@/stores/performanceStore";
import { setGlobalWsWorker } from "@/lib/worker-ref";
import { bridgeUrlToWebSocketUrl, normalizeBridgeUrl } from "@/lib/bridge-url";
import { toast } from "sonner";
import type { WorkerStatus } from "@/types/ws";
import { EMPTY_WORKERS, WorkerContext, type WorkerRefs } from "@/contexts/workers";

export function WorkerProvider({ children }: { children: ReactNode }) {
  const [refs, setRefs] = useState<WorkerRefs>(EMPTY_WORKERS);
  const bridgeUrl = useSimulationStore((s) => s.bridgeUrl);
  const activeBridgeUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!bridgeUrl) return;

    const normalizedBridgeUrl = normalizeBridgeUrl(bridgeUrl);
    if (activeBridgeUrlRef.current === normalizedBridgeUrl) return;
    activeBridgeUrlRef.current = normalizedBridgeUrl;

    const wsUrl = bridgeUrlToWebSocketUrl(normalizedBridgeUrl);

    const wsReceiver = new Worker(
      new URL("@/workers/ws-receiver.worker.ts", import.meta.url),
      { type: "module" },
    );
    const imageDecoder = new Worker(
      new URL("@/workers/image-decoder.worker.ts", import.meta.url),
      { type: "module" },
    );
    const lidarProcessor = new Worker(
      new URL("@/workers/lidar-processor.worker.ts", import.meta.url),
      { type: "module" },
    );
    const telemetryAgg = new Worker(
      new URL("@/workers/telemetry-aggregator.worker.ts", import.meta.url),
      { type: "module" },
    );

    wsReceiver.onerror = (e) => console.error("[ws-receiver]", e);
    imageDecoder.onerror = (e) => console.error("[image-decoder]", e);
    lidarProcessor.onerror = (e) => console.error("[lidar-processor]", e);
    telemetryAgg.onerror = (e) => console.error("[telemetry]", e);

    // Inter-worker channels
    const imageChannel = new MessageChannel();
    const lidarChannel = new MessageChannel();
    const telemetryChannel = new MessageChannel();

    imageDecoder.postMessage(
      { type: "init", port: imageChannel.port2 },
      [imageChannel.port2],
    );
    lidarChannel.port2.onmessage = (e) => {
      lidarProcessor.postMessage(e.data, e.data.payload ? [e.data.payload] : []);
    };
    telemetryChannel.port2.onmessage = (e) => {
      telemetryAgg.postMessage(e.data, e.data.payload ? [e.data.payload] : []);
    };

    // Connect ws-receiver (it will auto-reconnect internally)
    wsReceiver.postMessage(
      {
        type: "connect",
        data: {
          url: wsUrl,
          imagePort: imageChannel.port1,
          lidarPort: lidarChannel.port1,
          telemetryPort: telemetryChannel.port1,
        },
      },
      [imageChannel.port1, lidarChannel.port1, telemetryChannel.port1],
    );

    let toastShown = false;
    wsReceiver.onmessage = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === "status") {
        const status = msg.status as WorkerStatus;
        useSimulationStore.getState().setConnectionStatus(status);
        if (status === "connected") {
          usePerformanceStore.getState().markConnected();
          if (!toastShown) {
            toast.success("Connected to CARLA bridge");
            toastShown = true;
          }
        } else if (status === "disconnected" || status === "error") {
          usePerformanceStore.getState().markDisconnected();
          toastShown = false;
        }
      } else if (msg.type === "stats") {
        usePerformanceStore.getState().update({
          bandwidth: msg.bandwidth,
          droppedFrames: msg.droppedFrames ?? 0,
        });
      }
    };

    // Tick data from telemetry worker
    telemetryAgg.onmessage = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === "tick") {
        useSimulationStore.getState().updateFromTick(msg.frame, msg.timestamp);
        useActorStore.getState().updateActorTransforms(msg.actors);
      }
    };

    setGlobalWsWorker(wsReceiver);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRefs({
      wsReceiverWorker: wsReceiver,
      imageDecoderWorker: imageDecoder,
      lidarProcessorWorker: lidarProcessor,
    });

    return () => {
      activeBridgeUrlRef.current = null;
      setGlobalWsWorker(null);
      wsReceiver.postMessage({ type: "disconnect", data: {} });
      wsReceiver.terminate();
      imageDecoder.terminate();
      lidarProcessor.terminate();
      telemetryAgg.terminate();
      setRefs(EMPTY_WORKERS);
    };
  }, [bridgeUrl]);

  return (
    <WorkerContext.Provider value={refs}>{children}</WorkerContext.Provider>
  );
}
