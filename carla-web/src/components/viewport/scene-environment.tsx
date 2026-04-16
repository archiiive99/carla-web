import { useMemo, useRef } from "react";
import { Environment, Sky } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useSimulationStore } from "@/stores/simulationStore";
import { useActorStore } from "@/stores/actorStore";
import { BRIDGE_EGO_ROLE } from "@/constants";
import { GROUND_REFERENCE, NIGHT_SKY_GLOW } from "./scene-palette";

/** Shared reference ground plane — a diagrammatic low-contrast checker at
 *  50 m spacing, so roads/curbs read against it without the plane pretending
 *  to be photographed terrain. Used by the main WorldScene and the sensor
 *  panel 3D preview so every browser-approximation canvas lands on the same
 *  neutral surface rather than drifting to its own stylised colour. */
export function GroundPlane() {
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: GROUND_REFERENCE,
      roughness: 0.98,
      metalness: 0,
    });
    m.onBeforeCompile = (shader) => {
      shader.vertexShader =
        `varying vec3 vGroundWorld;\n` +
        shader.vertexShader.replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>\nvGroundWorld = (modelMatrix * vec4(position, 1.0)).xyz;`,
        );
      shader.fragmentShader =
        `varying vec3 vGroundWorld;\n` +
        shader.fragmentShader.replace(
          "#include <map_fragment>",
          `
          vec2 wXZ = vGroundWorld.xz;
          vec2 g = step(vec2(0.5), fract(wXZ / 50.0));
          float tile = mod(g.x + g.y, 2.0);
          vec3 base = vec3(0.29, 0.30, 0.33);
          vec3 alt  = vec3(0.32, 0.33, 0.36);
          float d = length(wXZ);
          float fade = 1.0 - smoothstep(250.0, 800.0, d);
          diffuseColor.rgb = mix(base, alt, tile * fade);
          `,
        );
    };
    m.customProgramCacheKey = () => "ground-reference-v1";
    return m;
  }, []);

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -0.05, 0]}
      receiveShadow
      material={material}
    >
      <planeGeometry args={[4000, 4000]} />
    </mesh>
  );
}

/** Weather-driven CARLA fog, neutral grey tint (no stylised cool-blue haze
 *  that previously made the approximation look nothing like real
 *  atmospheric scattering). Returns null when density is 0 so the fog
 *  fixture doesn't persist across weather changes. */
/** iter-11: weather-driven exposure driver. Writes
 *  gl.toneMappingExposure each frame per a tuned formula that:
 *    - At midday-clear (sunAlt=60, cloud=10): 0.82 (matches the
 *      prior static constant that visually worked for sensor captures).
 *    - At dusk (sunAlt=0): 1.6 (brightens to keep the frame readable
 *      as natural lighting dims).
 *    - At night (sunAlt<0): 1.6 + cloud×0.0015 (floor so night
 *      doesn't crush to pure black; cloud adds tiny lift).
 *
 *  Linear interp between midday and dusk:
 *    base = 0.82 + (1.6 - 0.82) × (1 − clamp(sunAlt, 0, 60) / 60)
 *
 *  Replaces the prior static 0.82 constant in WorldCanvas's gl
 *  config with weather-adaptive exposure. */
const EXPOSURE_MIDDAY = 0.82;
const EXPOSURE_DUSK_NIGHT = 1.6;
export function ExposureDriver() {
  const weather = useSimulationStore((s) => s.weather);
  useFrame(({ gl }) => {
    const sunAlt = weather.sun_altitude_angle ?? 60;
    const cloudiness = weather.cloudiness ?? 0;
    const base =
      sunAlt <= 0
        ? EXPOSURE_DUSK_NIGHT
        : EXPOSURE_MIDDAY +
          (EXPOSURE_DUSK_NIGHT - EXPOSURE_MIDDAY) *
            (1 - Math.min(Math.max(sunAlt, 0), 60) / 60);
    gl.toneMappingExposure = base + cloudiness * 0.0015;
  });
  return null;
}

export function WeatherFog() {
  const weather = useSimulationStore((s) => s.weather);
  const density = weather.fog_density ?? 0;
  if (density <= 0) return null;
  const near = Math.max(10, weather.fog_distance || 50);
  const far = Math.max(near + 50, near + (1 - density / 100) * 2500);
  const tintL = Math.max(0.45, 1 - density / 220);
  const hex = `hsl(210, 4%, ${Math.round(tintL * 100)}%)`;
  return <fog attach="fog" args={[hex, near, far]} />;
}

interface WeatherLightingOptions {
  /** Enable casting shadows from the directional sun light. Default on. */
  shadows?: boolean;
  /** Skip the IBL Environment (lighter variant for mini scenes). Default keeps it. */
  skipEnvironment?: boolean;
}

// Standard piecewise polynomial mapping Kelvin → linear RGB. Drives the
// directional sun color so a 60° altitude reads warm-white instead of pure
// white, matching UE5's SkyAtmosphere sun-disc color shift.
function kelvinToColor(kelvin: number): THREE.Color {
  const t = Math.max(1000, Math.min(40000, kelvin)) / 100;
  let r: number, g: number, b: number;
  if (t <= 66) {
    r = 1;
    g = Math.min(1, Math.max(0, (99.4708 * Math.log(t) - 161.1196) / 255));
    b = t <= 19 ? 0 : Math.min(1, Math.max(0, (138.5177 * Math.log(t - 10) - 305.0448) / 255));
  } else {
    r = Math.min(1, Math.max(0, (329.6987 * Math.pow(t - 60, -0.1332)) / 255));
    g = Math.min(1, Math.max(0, (288.122 * Math.pow(t - 60, -0.0755)) / 255));
    b = 1;
  }
  return new THREE.Color(r, g, b);
}

/** Weather-driven lighting rig used by every browser-approximation canvas.
 *  Cloudiness drives direct-sun attenuation, fill-hemisphere boost, ambient
 *  lift, and Rayleigh desaturation so overcast scenes actually soften the
 *  way CARLA/UE renders them rather than keeping crisp hard shadows.
 *  Negative sun altitudes (CARLA "Night" presets) genuinely darken the
 *  scene instead of clamping to a bright floor — previously the rig
 *  kept the sun at min-intensity 0.5 even at midnight, so night presets
 *  looked like overcast daytime. Mini-night fill keeps the scene readable
 *  but clearly dim. */
export function WeatherLighting({
  shadows = true,
  skipEnvironment = false,
}: WeatherLightingOptions = {}) {
  const weather = useSimulationStore((s) => s.weather);
  const sunAlt = (weather.sun_altitude_angle * Math.PI) / 180;
  const sunAz = (weather.sun_azimuth_angle * Math.PI) / 180;
  const sunX = Math.cos(sunAlt) * Math.sin(sunAz) * 200;
  const sunY = Math.sin(sunAlt) * 200;
  const sunZ = Math.cos(sunAlt) * Math.cos(sunAz) * 200;
  const sunRef = useRef<THREE.DirectionalLight | null>(null);

  // Shadow frustum tracks the ego vehicle so sensor-cell cameras viewing
  // the ego from long baselines (chase, rear, birdseye) still receive
  // correct shadows. Without this, the frustum sits at world origin with
  // ±200m bounds — any scene 400m+ from origin falls outside the shadow
  // map and reads as flat-lit. Bounds widened to ±350m so a wider ring of
  // mapped area around ego casts/receives shadows for every active
  // viewport's camera, not just the primary follow-cam.
  useFrame(() => {
    const light = sunRef.current;
    if (!light) return;
    const actors = useActorStore.getState().actors;
    const egoId = useActorStore.getState().egoVehicleId;
    const ego =
      (egoId !== null ? actors.get(egoId) : null) ??
      Array.from(actors.values()).find(
        (a) => a.type === "vehicle" && a.role_name === BRIDGE_EGO_ROLE,
      );
    if (!ego) return;
    const tx = ego.transform.location.x;
    // Carla Y -> Three Z (negated). Shadow target sits on ground plane.
    const tz = -ego.transform.location.y;
    if (!light.target.parent) {
      light.parent?.add(light.target);
    }
    light.target.position.set(tx, 0, tz);
    light.target.updateMatrixWorld();
    // Keep the light positioned at a fixed world offset from the target
    // so its shadow-view direction stays aligned with the sun angle even
    // as the ego moves.
    light.position.set(tx + sunX, sunY, tz + sunZ);
  });
  const cloudFactor = weather.cloudiness / 100;
  // Sun altitude in [-π/2, π/2]. Daytime drives the direct light via
  // sin(sunAlt); dusk/dawn blends to zero; night clamps to a tiny residual
  // lunar/skyglow term so the scene doesn't go pitch-black. Street lights
  // and NPC headlights are a follow-up — see rendering-100-percent-parity.
  const daylight = Math.max(0, Math.sin(sunAlt));
  const directIntensity = daylight * (1 - cloudFactor * 0.55);
  const isNight = sunAlt < 0;
  const nightFactor = Math.max(0, Math.min(1, -sunAlt / (Math.PI / 4)));
  const fillBoost = 0.12 + cloudFactor * 0.28 + nightFactor * 0.06;
  const ambientBase = 0.02 + cloudFactor * 0.05 + nightFactor * 0.03;
  // Preetham→SkyAtmosphere parity (iter-05 Path A): bumped turbidity floor
  // dilutes Preetham's saturated mid-altitude blue toward UE5
  // SkyAtmosphereComponent's less-saturated output. Iter-01 ROI showed
  // R/B inversion (UE5 warm 1.46, web cool 0.55); raising turbidity narrows
  // the sky-blue dominance so IBL captures less cool fill.
  const turbidity = 3 + weather.cloudiness / 8;
  const rayleigh = Math.max(0.15, 0.4 - cloudFactor * 0.25);
  // Sun color temperature shift with altitude. Horizon ≈ 5000K (warm
  // amber), zenith ≈ 5800K (slightly warm white). Matches UE5
  // SkyAtmosphere's sun-disc color shift; eliminates the iter-01 gap
  // where web's pure-white directional sun produced cool-shifted bounce.
  const altDeg = (weather.sun_altitude_angle ?? 0);
  const sunKelvin = 5000 + Math.max(0, Math.min(60, altDeg)) * 13;
  const sunColor = useMemo(() => kelvinToColor(sunKelvin), [sunKelvin]);
  // IBL intensity collapses along with the sun; tiny floor keeps PBR
  // materials from reading as fully unlit matte at night.
  const envIntensity = (0.18 + cloudFactor * 0.08) * (0.2 + 0.8 * daylight) +
    (isNight ? 0.04 : 0);

  return (
    <>
      <directionalLight
        ref={sunRef}
        position={[sunX, sunY, sunZ]}
        color={sunColor}
        intensity={directIntensity * 1.7}
        castShadow={shadows && daylight > 0.05}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-far={900}
        shadow-camera-left={-350}
        shadow-camera-right={350}
        shadow-camera-top={350}
        shadow-camera-bottom={-350}
      />
      {isNight && (
        // Cool night sky glow: a second, dim, overhead directional so
        // top-facing surfaces (car roofs, road) still catch a faint
        // rim without casting hard shadows.
        <directionalLight
          position={[sunX * 0.3, 180, sunZ * 0.3]}
          intensity={0.05 + nightFactor * 0.08}
          color={NIGHT_SKY_GLOW}
          castShadow={false}
        />
      )}
      <hemisphereLight
        args={[
          isNight ? "#5a6575" : "#a5a8ae",
          // Warm ground-bounce hex (was cool #3b3d42) so asphalt + horizontal
          // car panels receive the warm fill UE5 produces from its
          // SkyAtmosphere ground-color reflectance term. Closes part of the
          // iter-01 R/B inversion gap on the road ROI.
          isNight ? "#1c1f26" : "#5a4f44",
          fillBoost,
        ]}
      />
      <ambientLight intensity={ambientBase} color={isNight ? "#6a7080" : "#ffffff"} />
      <Sky
        sunPosition={[sunX, sunY, sunZ]}
        turbidity={turbidity}
        rayleigh={rayleigh}
      />
      {!skipEnvironment && (
        <Environment
          resolution={256}
          frames={1}
          near={0.1}
          far={1000}
          background={false}
          environmentIntensity={envIntensity}
        >
          <Sky
            sunPosition={[sunX, sunY, sunZ]}
            turbidity={turbidity}
            rayleigh={rayleigh}
          />
        </Environment>
      )}
    </>
  );
}
