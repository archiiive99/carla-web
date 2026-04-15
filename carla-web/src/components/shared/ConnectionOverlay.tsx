import { useEffect, useState } from "react";
import { RefreshCw, Settings, WifiOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSimulationStore } from "@/stores/simulationStore";
import { carlaApi } from "@/lib/carla-api";

export function ConnectionOverlay() {
  const navigate = useNavigate();
  const connectionStatus = useSimulationStore((s) => s.connectionStatus);
  const bridgeUrl = useSimulationStore((s) => s.bridgeUrl);
  const refreshStatus = useSimulationStore((s) => s.refreshStatus);
  const [disconnectedAt, setDisconnectedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [wasEverConnected, setWasEverConnected] = useState(false);

  useEffect(() => {
    if (connectionStatus === "connected") {
      setWasEverConnected(true);
      setDisconnectedAt(null);
      return;
    }
    setDisconnectedAt((prev) => prev ?? Date.now());
  }, [connectionStatus]);

  useEffect(() => {
    if (connectionStatus === "connected") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [connectionStatus]);

  const disconnectedFor = disconnectedAt ? now - disconnectedAt : 0;
  // Two thresholds:
  //  - wasEverConnected (brief drop / HMR reload): 60s grace so we don't flash
  //    during uvicorn --reload bounces.
  //  - Never connected (first visit, bridge not running): 10s so the user gets
  //    a clear "bridge unreachable" signal instead of a blank blinking UI.
  const threshold = wasEverConnected ? 60_000 : 10_000;
  const show = connectionStatus !== "connected" && disconnectedFor > threshold;

  if (!show) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm">
      <Card className="max-w-md shadow-xl">
        <CardContent className="p-6 text-center">
          <WifiOff className="mx-auto mb-6 size-14 animate-pulse text-muted-foreground" aria-hidden="true" />
          <h2 className="mb-2 text-xl font-semibold">
            {connectionStatus === "connecting"
              ? "Bridge up — waiting for CARLA"
              : wasEverConnected
                ? "Connection lost"
                : "Can't reach the bridge"}
          </h2>
          <p className="mb-6 text-sm text-muted-foreground">
            {connectionStatus === "connecting" ? (
              <>
                The bridge is responding but cannot reach the CARLA server.
                <br />
                If the UE5 Editor crashed, restart it; the bridge will reconnect
                automatically.
              </>
            ) : wasEverConnected ? (
              <>
                Bridge went quiet at
                <br />
                <code className="mt-2 inline-block rounded bg-muted px-1.5 py-0.5 text-xs">
                  {bridgeUrl}
                </code>
                <br />
                Usually recovers within a few seconds of a reload.
              </>
            ) : (
              <>
                Tried to reach the CARLA bridge at
                <br />
                <code className="mt-2 inline-block rounded bg-muted px-1.5 py-0.5 text-xs">
                  {bridgeUrl}
                </code>
                <br />
                Is <code className="inline-block rounded bg-muted px-1.5 py-0.5 text-xs">./start_streaming.sh</code> running?
              </>
            )}
          </p>
          {/* Primary action on the right matches AlertDialog convention used
              elsewhere ([Cancel | Action]). Secondary nav on the left. */}
          <div className="flex justify-center gap-3">
            <Button variant="outline" onClick={() => navigate("/settings")}>
              <Settings className="mr-2 size-4" aria-hidden="true" />
              Settings
            </Button>
            <Button
              onClick={() => {
                refreshStatus().catch(() => {});
                carlaApi.getHealth().catch(() => {});
              }}
            >
              <RefreshCw className="mr-2 size-4" aria-hidden="true" />
              Retry Connection
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
