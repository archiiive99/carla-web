import type { CarlaActor } from "@/types/carla";
import type { MapPalette } from "./palette";

// One canvas-draw call per actor. Split out of MiniMap so the component can
// focus on pan/zoom/click handlers and data fetching instead of carrying a
// 70-line switch on actor.type in the middle of its render loop.
export function drawActor(
  ctx: CanvasRenderingContext2D,
  palette: MapPalette,
  actor: CarlaActor,
  x: number,
  y: number,
  size: number,
  isEgo = false,
) {
  const heading = (actor.transform.rotation.yaw * Math.PI) / 180;

  switch (actor.type) {
    case "vehicle": {
      // Ego (bridge-managed) stands out in green; other vehicles blue.
      ctx.fillStyle = isEgo ? palette.vehicleEgo : palette.vehicle;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(heading);
      ctx.beginPath();
      ctx.moveTo(size, 0);
      ctx.lineTo(-size * 0.6, -size * 0.5);
      ctx.lineTo(-size * 0.6, size * 0.5);
      ctx.closePath();
      ctx.fill();
      if (isEgo) {
        ctx.strokeStyle = palette.overlayFg;
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      break;
    }
    case "walker": {
      ctx.fillStyle = palette.walker;
      ctx.beginPath();
      ctx.arc(x, y, size * 0.6, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "sensor": {
      ctx.fillStyle = palette.sensor;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(heading);
      ctx.beginPath();
      ctx.moveTo(size * 0.7, 0);
      ctx.lineTo(-size * 0.4, -size * 0.4);
      ctx.lineTo(-size * 0.4, size * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }
    case "traffic_light": {
      const state = actor.traffic_light_state;
      ctx.fillStyle =
        state === "Red"
          ? palette.trafficRed
          : state === "Yellow"
            ? palette.trafficYellow
            : state === "Green"
              ? palette.trafficGreen
              : palette.mutedFg;
      ctx.beginPath();
      ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    default: {
      ctx.fillStyle = palette.mutedFg;
      ctx.fillRect(x - size * 0.3, y - size * 0.3, size * 0.6, size * 0.6);
    }
  }
}
