
import { useRef, useEffect, useCallback, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { carlaApi } from "@/lib/carla-api";
import { useActorStore } from "@/stores/actorStore";
import { cn } from "@/lib/utils";

const SEND_INTERVAL_MS = 50; // 20Hz; coalesced so stale REST writes do not pile up

const KEY_MAP: Record<string, string> = {
  w: "throttle", W: "throttle", ArrowUp: "throttle",
  s: "brake", S: "brake", ArrowDown: "brake",
  a: "steer_left", A: "steer_left", ArrowLeft: "steer_left",
  d: "steer_right", D: "steer_right", ArrowRight: "steer_right",
  " ": "handbrake",
  r: "reverse", R: "reverse",
};

interface VehicleControlsProps {
  actorId: number;
  enabled: boolean;
}

export function VehicleControls({ actorId, enabled }: VehicleControlsProps) {
  const activeKeysRef = useRef(new Set<string>());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightRef = useRef(false);
  const queuedControlRef = useRef<null | {
    throttle: number;
    brake: number;
    steer: number;
    hand_brake: boolean;
    reverse: boolean;
  }>(null);
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());
  const [hudState, setHudState] = useState({
    throttle: 0,
    brake: 0,
    steer: 0,
    reverse: false,
    handbrake: false,
  });
  const actor = useActorStore((s) => s.actors.get(actorId));
  const speed = actor ? Math.sqrt(actor.velocity.x ** 2 + actor.velocity.y ** 2 + actor.velocity.z ** 2) * 3.6 : 0;

  const shiftHeldRef = useRef(false);

  const flushRealtimeControl = useCallback(async () => {
    if (inFlightRef.current || queuedControlRef.current == null) return;
    inFlightRef.current = true;
    const payload = queuedControlRef.current;
    queuedControlRef.current = null;
    try {
      await carlaApi.applyRealtimeControl(payload);
    } catch {
      // Best-effort interactive control path: drop stale requests on failure.
    } finally {
      inFlightRef.current = false;
      if (queuedControlRef.current != null) {
        void flushRealtimeControl();
      }
    }
  }, []);

  const sendControl = useCallback(() => {
    const keys = activeKeysRef.current;
    const boost = shiftHeldRef.current;
    const throttle = keys.has("throttle") ? (boost ? 1.0 : 0.7) : 0.0;
    const brake = keys.has("brake") ? (boost ? 1.0 : 0.5) : 0.0;
    let steer = 0;
    if (keys.has("steer_left")) steer = boost ? -1.0 : -0.5;
    if (keys.has("steer_right")) steer = boost ? 1.0 : 0.5;
    const hand_brake = keys.has("handbrake");
    const reverse = keys.has("reverse");

    setHudState({ throttle, brake, steer, handbrake: hand_brake, reverse });
    queuedControlRef.current = { throttle, steer, brake, hand_brake, reverse };
    void flushRealtimeControl();
  }, [flushRealtimeControl]);

  useEffect(() => {
    if (!enabled) return;
    let autopilotDisabled = false;

    function startSendingIfNeeded() {
      if (!intervalRef.current) {
        sendControl();
        intervalRef.current = setInterval(sendControl, SEND_INTERVAL_MS);
        return;
      }
      sendControl();
    }

    function stopSendingIfIdle() {
      sendControl();
      if (activeKeysRef.current.size === 0 && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Shift") { shiftHeldRef.current = true; return; }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const action = KEY_MAP[e.key];
      if (action) {
        e.preventDefault();
        if (!autopilotDisabled && useActorStore.getState().egoAutopilot) {
          autopilotDisabled = true;
          useActorStore.setState({ egoAutopilot: false });
        }
        if (action === "reverse") {
          if (activeKeysRef.current.has("reverse")) activeKeysRef.current.delete("reverse");
          else activeKeysRef.current.add("reverse");
        } else {
          activeKeysRef.current.add(action);
        }
        setPressedKeys(new Set(activeKeysRef.current));
        startSendingIfNeeded();
      }
    }

    function handleKeyUp(e: KeyboardEvent) {
      if (e.key === "Shift") { shiftHeldRef.current = false; return; }
      const action = KEY_MAP[e.key];
      if (action) {
        if (action === "reverse") return; // toggle, don't release
        activeKeysRef.current.delete(action);
        setPressedKeys(new Set(activeKeysRef.current));
        stopSendingIfIdle();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    const keys = activeKeysRef.current;
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        // startSendingIfNeeded() bails if the ref is truthy; without
        // nulling we'd survive the effect's re-run (actorId change, etc.)
        // holding a stale interval id, and the next keydown would never
        // re-arm the 20Hz tick.
        intervalRef.current = null;
      }
      keys.clear();
    };
  }, [enabled, sendControl, actorId]);

  if (!enabled) return null;

  return (
    <div className="pointer-events-none absolute bottom-14 left-1/2 -translate-x-1/2" aria-hidden="true">
      <div className="flex items-center gap-3 rounded-md border border-border/60 bg-background/80 p-2 backdrop-blur-sm">
        {/* Speed readout */}
        <div className="flex flex-col items-center px-3">
          <span className="font-mono text-2xl font-semibold tabular-nums leading-none tracking-tight">{Math.round(speed)}</span>
          <span className="mt-0.5 text-2xs font-medium uppercase tracking-wider text-muted-foreground">km/h</span>
        </div>
        <div className="w-px self-stretch bg-border/60" />
        {/* Controls */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3 text-2xs text-muted-foreground">
            <span className="font-mono tabular-nums">T {Math.round(hudState.throttle * 100)}%</span>
            <span className="font-mono tabular-nums">B {Math.round(hudState.brake * 100)}%</span>
            <span className="font-mono tabular-nums">S {hudState.steer.toFixed(0)}</span>
            <Badge variant={hudState.reverse ? "destructive" : "secondary"} className="h-4 px-1 text-2xs font-mono">
              {hudState.reverse ? "R" : "D"}
            </Badge>
          </div>
        <div className="h-1.5 overflow-hidden rounded bg-muted" role="progressbar" aria-label="Throttle" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(hudState.throttle * 100)}>
          <div className="h-full bg-success transition-all" style={{ width: `${hudState.throttle * 100}%` }} />
        </div>
        <div className="h-1.5 overflow-hidden rounded bg-muted" role="progressbar" aria-label="Brake" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(hudState.brake * 100)}>
          <div className="h-full bg-destructive transition-all" style={{ width: `${hudState.brake * 100}%` }} />
        </div>
        <div className="flex gap-1">
        {(["W", "A", "S", "D", "Space", "R"] as const).map((key) => (
          <Badge
            key={key}
            variant="secondary"
            className={cn(
              "h-6 justify-center border border-border/60 bg-background font-mono text-2xs text-muted-foreground transition-colors",
              key === "Space" ? "w-12" : "w-8",
              ((key === "W" && pressedKeys.has("throttle")) ||
                (key === "S" && pressedKeys.has("brake")) ||
                (key === "A" && pressedKeys.has("steer_left")) ||
                (key === "D" && pressedKeys.has("steer_right")) ||
                (key === "Space" && pressedKeys.has("handbrake")) ||
                (key === "R" && pressedKeys.has("reverse"))) &&
                "bg-primary text-primary-foreground",
            )}
          >
            {key}
          </Badge>
        ))}
        </div>
        </div>
      </div>
    </div>
  );
}
