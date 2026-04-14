import { Badge } from "@/components/ui/badge";
import { Loader2, WifiOff } from "lucide-react";
import type { ConnectionStatus } from "@/stores/simulationStore";

// The bridge-CARLA connection pill shown in the TopBar's left cluster.
// Semantic fill colors map connection health 1:1 — no raw emerald/amber/red.
export function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  switch (status) {
    case "connected":
      return (
        <Badge
          className="gap-1.5 border-success/20 bg-success text-xs text-success-foreground hover:bg-success/90"
          aria-label="Connected to CARLA"
        >
          <span className="relative flex size-2">
            <span
              className="absolute inline-flex size-full animate-ping rounded-full bg-success-foreground/60"
              aria-hidden="true"
            />
            <span
              className="relative inline-flex size-2 rounded-full bg-success-foreground"
              aria-hidden="true"
            />
          </span>
          Connected
        </Badge>
      );
    case "connecting":
      return (
        <Badge
          className="gap-1.5 border-warning/20 bg-warning text-xs text-warning-foreground hover:bg-warning/90"
          aria-label="Connecting to CARLA"
        >
          <Loader2 className="size-3 animate-spin" aria-hidden="true" />
          Connecting
        </Badge>
      );
    case "error":
      return (
        <Badge
          className="gap-1.5 border-destructive/20 bg-destructive text-destructive-foreground hover:bg-destructive/90"
          aria-label="CARLA connection error"
        >
          <WifiOff className="size-3" aria-hidden="true" />
          Error
        </Badge>
      );
    default:
      return (
        <Badge
          className="gap-1.5 border-destructive/20 bg-destructive text-destructive-foreground hover:bg-destructive/90"
          aria-label="Disconnected from CARLA"
        >
          <WifiOff className="size-3" aria-hidden="true" />
          Disconnected
        </Badge>
      );
  }
}
