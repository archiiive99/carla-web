import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useActorStore } from "@/stores/actorStore";
import { useSensorStore } from "@/stores/sensorStore";
import { carlaApi } from "@/lib/carla-api";
import { reportError } from "@/lib/utils";
import { SensorType, type CarlaTransform } from "@/types/carla";
import { TransformInputs } from "./TransformInputs";

export
function SensorSpawnTab() {
  const [sensorType, setSensorType] = useState("");
  const [parentId, setParentId] = useState("");
  const [transform, setTransform] = useState<CarlaTransform>({
    location: { x: 0, y: 0, z: 2.5 },
    rotation: { pitch: -15, yaw: 0, roll: 0 },
  });
  const [spawning, setSpawning] = useState(false);
  const [autoSubscribe, setAutoSubscribe] = useState(true);
  const spawnSensor = useSensorStore((s) => s.spawnSensor);
  const subscribe = useSensorStore((s) => s.subscribe);
  const actors = useActorStore((s) => s.actors);
  const vehicles = useActorStore((s) => s.actorsByType.vehicles);
  // IMU crashes in CARLA's InertialMeasurementUnit.cpp when ticked without a
  // valid owner — only block the world-attached spawn. Vehicle-parented IMU
  // works fine.
  const parsedParentId = parseInt(parentId);
  const isWorldParent = !parsedParentId || parsedParentId === 0;
  const isUnsupportedSensor = sensorType === SensorType.Imu && isWorldParent;

  const handleSpawn = useCallback(async () => {
    if (!sensorType) return;
    setSpawning(true);
    try {
      // sensorStore.spawnSensor emits its own "Sensor spawned: rgb" toast,
      // so don't duplicate here.
      const sensor = await spawnSensor({
        type: sensorType,
        transform,
        parent_id: parseInt(parentId) || 0,
        attributes: {},
      });
      if (autoSubscribe) subscribe(sensor.id);
    } catch (e) {
      reportError("Spawn", e);
    } finally {
      setSpawning(false);
    }
  }, [sensorType, transform, parentId, autoSubscribe, spawnSensor, subscribe]);

  return (
    <div className="space-y-4">
      {isUnsupportedSensor && (
        <Alert variant="destructive">
          <AlertDescription className="text-xs">
            IMU spawned at the world crashes CARLA (InertialMeasurementUnit.cpp requires a valid owner).
            Select a parent vehicle below and the spawn will be allowed.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="sensor-type" className="text-xs">Sensor Type</Label>
        <Select value={sensorType} onValueChange={(v) => setSensorType(v ?? "")}>
          <SelectTrigger id="sensor-type" className="w-full" aria-label="Sensor type">
            <SelectValue placeholder="Select sensor type..." />
          </SelectTrigger>
          <SelectContent>
            <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Cameras</div>
            <SelectItem value={SensorType.CameraRgb} className="text-xs">RGB Camera</SelectItem>
            <SelectItem value={SensorType.CameraDepth} className="text-xs">Depth Camera</SelectItem>
            <SelectItem value={SensorType.CameraSemanticSeg} className="text-xs">Semantic Segmentation</SelectItem>
            <div className="px-2 py-1 text-xs font-medium text-muted-foreground">LiDAR</div>
            <SelectItem value={SensorType.LidarRayCast} className="text-xs">LiDAR Ray-Cast</SelectItem>
            <SelectItem value={SensorType.LidarRayCastSemantic} className="text-xs">Semantic LiDAR</SelectItem>
            <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Other</div>
            <SelectItem value={SensorType.Radar} className="text-xs">Radar</SelectItem>
            <SelectItem value={SensorType.Imu} className="text-xs">IMU</SelectItem>
            <SelectItem value={SensorType.Gnss} className="text-xs">GNSS</SelectItem>
            <SelectItem value={SensorType.Collision} className="text-xs">Collision</SelectItem>
            <SelectItem value={SensorType.LaneInvasion} className="text-xs">Lane Invasion</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="sensor-parent" className="text-xs">Attach to Actor</Label>
        <Select value={parentId} onValueChange={(v) => setParentId(v ?? "")}>
          <SelectTrigger id="sensor-parent" className="w-full" aria-label="Parent actor">
            <SelectValue placeholder="Select parent actor..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0" className="text-xs">None (world)</SelectItem>
            {vehicles.map((id) => {
              const actor = actors.get(id);
              return (
                <SelectItem key={id} value={String(id)} className="text-xs">
                  #{id} {actor?.type_id.replace("vehicle.", "") ?? ""}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      <TransformInputs value={transform} onChange={setTransform} />

      <div className="flex items-center gap-2">
        <Checkbox id="auto-sub" checked={autoSubscribe} onCheckedChange={(c) => setAutoSubscribe(!!c)} />
        <Label htmlFor="auto-sub" className="text-xs">Auto-subscribe to feed</Label>
      </div>

      <Button className="w-full" onClick={handleSpawn} disabled={!sensorType || spawning || isUnsupportedSensor}>
        {isUnsupportedSensor ? "Unsupported in current runtime" : spawning ? "Spawning..." : "Spawn & Attach"}
      </Button>
    </div>
  );
}

