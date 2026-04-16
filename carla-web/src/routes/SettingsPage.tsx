
import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle, XCircle, RotateCcw } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useSimulationStore } from "@/stores/simulationStore";
import { CarlaApi } from "@/lib/carla-api";
import { normalizeBridgeUrl } from "@/lib/bridge-url";

interface AppSettings {
  bridgeUrl: string;
}

export default function SettingsPage() {
  // Seed the editable fields from the zustand store, which mirrors the
  // authoritative BRIDGE_URL_KEY. Previously an APP_SETTINGS_KEY localStorage
  // entry shadowed this: every keystroke wrote to APP_SETTINGS_KEY and
  // loadSettings() read from it on mount, but `carlaApi` only ever consulted
  // BRIDGE_URL_KEY. Editing + reloading without "Save & Connect" left the
  // field showing a URL the app wasn't actually using. The draft stays
  // in-memory only now; on reload the field reflects what's in effect.
  const storeBridgeUrl = useSimulationStore((s) => s.bridgeUrl);
  const [settings, setSettings] = useState<AppSettings>(() => ({
    bridgeUrl: storeBridgeUrl,
  }));
  const [testResult, setTestResult] = useState<"idle" | "ok" | "fail">("idle");
  const connectionStatus = useSimulationStore((s) => s.connectionStatus);
  const serverVersion = useSimulationStore((s) => s.serverVersion);
  const setBridgeUrl = useSimulationStore((s) => s.setBridgeUrl);
  const connect = useSimulationStore((s) => s.connect);

  const update = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    // A successful / failed result is bound to the URL that was tested
    // — when the user edits the URL, the icon next to Test Connection
    // would otherwise linger as a green checkmark for a different URL
    // (or a red X for one they've since corrected).
    if (patch.bridgeUrl !== undefined) {
      setTestResult("idle");
    }
  }, []);

  const handleTestConnection = useCallback(async () => {
    try {
      const health = await new CarlaApi(normalizeBridgeUrl(settings.bridgeUrl)).getHealth();
      if (health.status === "ok") {
        setTestResult("ok");
        toast.success(`Bridge OK. CARLA: ${health.carla_connected ? "connected" : "not connected"}`);
      } else {
        // Bridge responded but reported a non-ok status. Previously the icon
        // flipped to the fail-X but the toast still said "Bridge OK", which
        // was self-contradictory feedback.
        setTestResult("fail");
        toast.error(`Bridge reported status: ${health.status}`);
      }
    } catch {
      setTestResult("fail");
      toast.error("Cannot reach bridge");
    }
  }, [settings.bridgeUrl]);

  const handleSaveAndConnect = useCallback(() => {
    const normalized = normalizeBridgeUrl(settings.bridgeUrl);
    setBridgeUrl(normalized);
    connect(normalized).catch(() => {});
    toast.success("Bridge URL updated, connecting...");
  }, [settings.bridgeUrl, setBridgeUrl, connect]);

  const handleResetLayout = useCallback(() => {
    // Layout keys are versioned (carla-layout-h-v<N>, carla-layout-v-v<N>);
    // remove every key that starts with "carla-layout" to cover current and
    // any stale versions. The bridge URL lives in BRIDGE_URL_KEY and the
    // UI prefs in UI_STATE_KEY — both survive a layout reset because the
    // narrow startsWith filter leaves them alone.
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("carla-layout")) {
        localStorage.removeItem(key);
      }
    }
    // ResizableLayout reads defaultLayout from localStorage once at mount, so
    // the reset doesn't visibly apply until the component remounts. Forcing a
    // reload is the simplest way to make the button actually do what it says.
    toast.success("Layout reset. Reloading…");
    setTimeout(() => window.location.reload(), 400);
  }, []);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <Link
          to="/"
          className="inline-flex size-9 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Back to simulation"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </Link>
        <span className="text-sm font-semibold">Settings</span>
      </header>

      <div className="flex flex-1 justify-center overflow-y-auto p-6">
        <div className="w-full max-w-lg space-y-6">
          {/* Connection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Connection</CardTitle>
              <CardDescription className="text-xs">
                Configure the connection to the CARLA bridge
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="bridge-url" className="text-xs">Bridge URL</Label>
                <Input
                  id="bridge-url"
                  value={settings.bridgeUrl}
                  onChange={(e) => update({ bridgeUrl: e.target.value })}
                  className="text-xs"
                />
                <p className="text-2xs text-muted-foreground">
                  HTTP + WebSocket origin for the bridge process. Polling reconnects within ~2s of saving.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleTestConnection}>
                  Test Connection
                </Button>
                {testResult === "ok" && <CheckCircle className="size-4 text-success" aria-label="Connection succeeded" />}
                {testResult === "fail" && <XCircle className="size-4 text-destructive" aria-label="Connection failed" />}
                <div className="ml-auto">
                  <Button size="sm" onClick={handleSaveAndConnect}>Save &amp; Connect</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* UI */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Interface</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5 text-xs"
                onClick={handleResetLayout}
              >
                <RotateCcw className="size-3" /> Reset Layout
              </Button>
            </CardContent>
          </Card>

          {/* About */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">About</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge
                  variant={connectionStatus === "connected" ? "default" : "secondary"}
                  className="h-5 px-2 text-2xs capitalize"
                >
                  {connectionStatus}
                </Badge>
              </div>
              {serverVersion && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Server</span>
                  <span className="font-mono">{serverVersion}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Client</span>
                <span className="font-mono">0.1.0</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
