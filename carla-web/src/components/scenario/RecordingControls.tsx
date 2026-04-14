
import { useState, useCallback, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Circle, Square, Play, Pause, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useIsConnected } from "@/stores/simulationStore";
import { carlaApi } from "@/lib/carla-api";
import { cn , errorMessage , reportError } from "@/lib/utils";

function normalizeRecordings(value: string[]): string[] {
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    const joined = value.join("\n");
    const lines = joined
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const candidates = lines.filter((line) => line.endsWith(".log") || line.includes("recording"));
    return candidates.length > 0 ? [...new Set(candidates)] : lines.slice(0, 20);
  }
  return [];
}

export function RecordingControls() {
  const isConnected = useIsConnected();
  const [recording, setRecording] = useState(false);
  const [filename, setFilename] = useState(`recording_${Date.now()}`);
  const [replaying, setReplaying] = useState(false);
  const [recordings, setRecordings] = useState<string[]>([]);
  const [selectedRecording, setSelectedRecording] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const listedRecordings = useMemo(() => normalizeRecordings(recordings), [recordings]);

  useEffect(() => {
    if (!isConnected) return;
    carlaApi.getRecordings().then(setRecordings).catch(() => {});
  }, [isConnected, refreshKey]);

  const handleStartRecording = useCallback(async () => {
    try {
      await carlaApi.startRecording(filename);
      setRecording(true);
      toast.success("Recording started");
    } catch (e) {
      reportError("Start recording", e);
    }
  }, [filename]);

  const handleStopRecording = useCallback(async () => {
    try {
      await carlaApi.stopRecording();
      setRecording(false);
      setRefreshKey((value) => value + 1);
      toast.success("Recording stopped");
    } catch (e) {
      reportError("Stop recording", e);
    }
  }, []);

  const handleStartReplay = useCallback(async () => {
    if (!selectedRecording) return;
    try {
      await carlaApi.startReplay({ filename: selectedRecording, start_time: 0, duration: 0, camera_id: 0 });
      setReplaying(true);
      toast.success(`Replay started: ${selectedRecording}`);
    } catch (e) {
      reportError("Replay", e);
    }
  }, [selectedRecording]);

  const handleStopReplay = useCallback(async () => {
    try {
      await carlaApi.stopReplay();
      setReplaying(false);
      toast.success("Replay stopped");
    } catch (e) {
      reportError("Stop replay", e);
    }
  }, []);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant={recording ? "destructive" : "outline"}
            size="sm"
            className="gap-1.5 text-xs"
            disabled={!isConnected}
            title={isConnected ? "Recording & replay" : "Connect to CARLA first"}
          >
            <Circle
              className={cn(
                "size-3",
                recording && "animate-pulse fill-current",
              )}
            />
            {recording ? "Recording" : "Record"}
          </Button>
        }
      />
      <PopoverContent className="w-72" align="end">
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Recording & Replay</h4>

          {/* Record section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="recording-filename" className="text-xs">Filename</Label>
              <Badge variant={recording ? "destructive" : "secondary"} className="h-4 px-1.5 text-2xs">
                {recording ? "Recording..." : "Idle"}
              </Badge>
            </div>
            <div className="flex gap-2">
              <Input
                id="recording-filename"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                className="h-8 text-xs"
                disabled={recording}
              />
              {recording ? (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleStopRecording}
                  title="Stop recording"
                  aria-label="Stop recording"
                >
                  <Square className="size-3" aria-hidden="true" />
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleStartRecording}
                  title="Start recording"
                  aria-label="Start recording"
                >
                  <Circle className="size-3 fill-current" aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>

          <Separator />

          {/* Replay section */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="text-xs">Replay</Label>
              <span className="text-3xs uppercase tracking-wide text-muted-foreground">
                scrubber not wired
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="icon-xs"
                onClick={() => (replaying ? handleStopReplay() : handleStartReplay())}
                disabled={!selectedRecording}
                title={replaying ? "Stop replay" : "Start replay of selected file"}
                aria-label={replaying ? "Stop replay" : "Start replay"}
              >
                {replaying ? <Pause className="size-3" aria-hidden="true" /> : <Play className="size-3" aria-hidden="true" />}
              </Button>
              <Slider min={0} max={100} step={1} value={[0]} className="flex-1" disabled aria-label="Replay scrubber (not yet wired)" />
            </div>
          </div>

          <Separator />

          <ScrollArea className="max-h-32">
            <div className="space-y-1">
              <div className="mb-2 flex items-center justify-between">
                <Label className="text-xs">Files</Label>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setRefreshKey((value) => value + 1)}
                  title="Refresh recording list"
                  aria-label="Refresh recordings"
                >
                  <RotateCcw className="size-3" aria-hidden="true" />
                </Button>
              </div>
              {listedRecordings.length === 0 ? (
                <div className="flex flex-col items-center gap-1.5 py-3 text-center">
                  <Circle className="size-6 text-muted-foreground" aria-hidden="true" />
                  <p className="text-xs text-muted-foreground">No recordings yet</p>
                  <p className="text-2xs text-muted-foreground">Start a recording to capture simulation data.</p>
                </div>
              ) : (
                listedRecordings.map((recordingName) => (
                  <Button
                    key={recordingName}
                    variant={selectedRecording === recordingName ? "secondary" : "ghost"}
                    size="sm"
                    className="h-auto w-full justify-between px-2 py-1.5 text-left text-xs"
                    onClick={() => setSelectedRecording(recordingName)}
                  >
                    <span className="truncate font-mono">{recordingName}</span>
                    <Play className="size-3 shrink-0" aria-hidden="true" />
                  </Button>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  );
}
