import React from "react";
import type { CarlaActor } from "@/types/carla";
import { BRIDGE_EGO_ROLE } from "@/constants";

/** Catches glTF / mesh load failures so one bad model doesn't take down
 *  the whole scene graph. Reports via `onError` so callers can fall back. */
export class ErrorBoundaryFallback extends React.Component<
  { children: React.ReactNode; onError?: () => void },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; onError?: () => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    this.props.onError?.();
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

/** CARLA world frame is (x=forward, y=right, z=up, left-handed).
 *  Three.js uses (x=right, y=up, z=back, right-handed). */
export function carlaToThree(loc: { x: number; y: number; z: number }) {
  return { x: loc.x, y: loc.z, z: -loc.y };
}

/** Pick the ego vehicle: explicit store id → bridge_ego role → first
 *  vehicle. */
export function resolveEgoId(
  storeEgoId: number | null,
  actors: Map<number, CarlaActor>,
): number | null {
  if (storeEgoId !== null && actors.has(storeEgoId)) return storeEgoId;
  for (const actor of actors.values()) {
    if (actor.type === "vehicle" && actor.role_name === BRIDGE_EGO_ROLE) {
      return actor.id;
    }
  }
  for (const actor of actors.values()) {
    if (actor.type === "vehicle") return actor.id;
  }
  return null;
}
