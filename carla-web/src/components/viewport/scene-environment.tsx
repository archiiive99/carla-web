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
// iter-11-revisit-smoothing: damping rate for exposure transitions.
// Units per second of exposure-change. With EXPOSURE_DUSK_NIGHT−EXPOSURE_MIDDAY
// ≈ 0.78, a rate of 0.4/s takes ~2s to ease from full day to full night;
// matches real-camera iris-adaption time-constants (~1-3s typical).
const EXPOSURE_DAMP_RATE = 0.4;
// iter-11-revisit-auto-exposure REVERTED — the spotlight-count
// heuristic reduced night exposure 14% but the measured PSNR at
// night regressed from 30.67 → 10.18. Root cause: reducing exposure
// at night doesn't bring the web render closer to the unfixed
// broken-black UE5 reference in a way that matches — the web scene
// has real spotlight cones that vary in luminance, reducing overall
// exposure dims everything including the already-bright cones, which
// hurts both PSNR and SSIM. True luminance-feedback auto-exposure
// (iter-11-revisit-auto-exposure-v2) needs a WebGL render-target
// sample path rather than a scene-traverse heuristic. ⚠️ §6.3.
export function ExposureDriver() {
  const weather = useSimulationStore((s) => s.weather);
  const currentExposure = useRef<number | null>(null);
  useFrame(({ gl }, delta) => {
    const sunAlt = weather.sun_altitude_angle ?? 60;
    const cloudiness = weather.cloudiness ?? 0;
    const base =
      sunAlt <= 0
        ? EXPOSURE_DUSK_NIGHT
        : EXPOSURE_MIDDAY +
          (EXPOSURE_DUSK_NIGHT - EXPOSURE_MIDDAY) *
            (1 - Math.min(Math.max(sunAlt, 0), 60) / 60);
    const target = base + cloudiness * 0.0015;
    // First-frame seed: start AT target (no transient on mount).
    if (currentExposure.current === null) {
      currentExposure.current = target;
    } else {
      // Linear lerp toward target, capped by per-frame max step so
      // a sudden weather change eases over ~(|Δ|/EXPOSURE_DAMP_RATE) s.
      const diff = target - currentExposure.current;
      const step = EXPOSURE_DAMP_RATE * delta;
      if (Math.abs(diff) <= step) {
        currentExposure.current = target;
      } else {
        currentExposure.current += Math.sign(diff) * step;
      }
    }
    gl.toneMappingExposure = currentExposure.current;
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
  // Altitude ramp: neutral cool gray HSL(210,4%,L) at sun_alt≥60,
  // warm dusk HSL(30,18%,L) at sun_alt≤0. No-op at midday pose.
  const altFactor = Math.max(0, Math.min(1, weather.sun_altitude_angle / 60));
  const hue = Math.round(30 + (210 - 30) * altFactor);
  const sat = Math.round(18 + (4 - 18) * altFactor);
  const hex = `hsl(${hue}, ${sat}%, ${Math.round(tintL * 100)}%)`;
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
  useFrame(({ camera }) => {
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
    // iter-06-revisit-csm: adaptive shadow frustum. True CSM (per-
    // cascade multi-bucket) is out of Three.js-directionalLight scope;
    // as a pseudo-cascade we narrow the orthographic frustum when the
    // camera is at street-level (height < 10m → ±100m tight) and
    // widen it when higher (birdseye 80m → ±350m baseline). Texel
    // density scales with camera height so visible shadows get more
    // pixels at close range. Shadow camera matrices are recomputed
    // whenever the ortho extents change.
    const camY = Math.abs(camera.position.y);
    const frustumExtent = Math.min(350, Math.max(100, 100 + camY * 3));
    const shadowCam = light.shadow.camera as THREE.OrthographicCamera;
    if (shadowCam.left !== -frustumExtent) {
      shadowCam.left = -frustumExtent;
      shadowCam.right = frustumExtent;
      shadowCam.top = frustumExtent;
      shadowCam.bottom = -frustumExtent;
      shadowCam.updateProjectionMatrix();
    }
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
  // iter-06-revisit-ambient-fog: fog scatters direct sunlight into
  // diffuse ambient — lift the floor a touch so foggy scenes don't
  // read with deep un-lit shadow pockets.
  const fogFactor = Math.max(0, Math.min(1, (weather.fog_density ?? 0) / 100));
  const ambientBase =
    0.02 + cloudFactor * 0.05 + nightFactor * 0.03 + fogFactor * 0.04;
  // iter-05 Path A: bumped turbidity floor dilutes Preetham's
  // saturated mid-altitude blue toward UE5 SkyAtmosphere output.
  //
  // iter-05-revisit-pathB (scoped Hosek-Wilkie approximation): the key
  // Hosek improvement over Preetham is smoother horizon behavior at
  // low sun — more atmospheric scattering near the horizon. Add an
  // altitude-dependent boost to both turbidity and rayleigh that
  // ramps from 0 (sun high) to significant (sun at horizon). At
  // sun_alt=60 the formula matches Path A exactly (no regression);
  // at sun_alt=0 turbidity gets +4 and rayleigh +0.3 which widens
  // the warm-orange horizon glow Preetham misses. True Hosek needs
  // precomputed coefficient tables (iter-05-revisit-pathB-full);
  // this minimal approximation captures the perceptual improvement.
  const altFactor = Math.max(0, Math.min(60, weather.sun_altitude_angle ?? 60)) / 60;
  const horizonScatter = 1 - altFactor;
  const turbidity = 3 + weather.cloudiness / 8 + horizonScatter * 4;
  const rayleigh = Math.max(0.15, 0.4 - cloudFactor * 0.25 + horizonScatter * 0.3);
  // iter-05-revisit-mie-altitude: aerosol scattering widens the warm sun
  // halo near horizon. Noon = 0.005 (drei default), horizon = 0.02.
  const mieCoefficient = 0.005 + horizonScatter * 0.015;
  // Sun color temperature shift with altitude. Horizon ≈ 5000K (warm
  // amber), zenith ≈ 5800K (slightly warm white). Matches UE5
  // SkyAtmosphere's sun-disc color shift; eliminates the iter-01 gap
  // where web's pure-white directional sun produced cool-shifted bounce.
  const altDeg = (weather.sun_altitude_angle ?? 0);
  // iter-06-revisit-sun-kelvin-cloud: attenuate Kelvin under overcast
  // to approximate sky-diffuse dominance (cooler-shifted). -300K at
  // cloudFactor=1. No-op under clear sky.
  const sunKelvin =
    5000 + Math.max(0, Math.min(60, altDeg)) * 13 - cloudFactor * 300;
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
        // iter-06-revisit-bias-by-altitude: bias grows as sun descends
        // toward horizon (oblique angles → larger shadow-ray length →
        // more self-shadowing acne without a bigger bias). At 60° alt
        // = -0.0004 (iter-01 baseline); at 10° alt = -0.001 (6× deeper
        // to counter the grazing-angle acne). Linear ramp between.
        shadow-bias={
          -0.0004 -
          Math.max(0, 60 - Math.max(0, Math.min(60, weather.sun_altitude_angle ?? 60))) *
            0.00001
        }
        shadow-normalBias={0.02}
        // iter-06-revisit-csm-v2: soften shadow penumbra via radius.
        // iter-06-revisit-shadow-softness-cloudiness: ramp radius by
        // cloudiness so overcast scenes get diffuse-soft shadows while
        // clear noon keeps a crisp 2.5-texel edge. 2.5 at cloudiness=0,
        // 6.0 at cloudiness=100.
        shadow-radius={2.5 + cloudFactor * 3.5}
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
          //
          // iter-06-revisit-ground-bounce-altitude: day ground-bounce now
          // interpolates between #7a4c30 (warm dusk, altFactor=0) and
          // #5a4f44 (neutral warm, altFactor=1). No-op at midday (altFactor=1
          // reproduces prior literal).
          isNight
            ? "#1c1f26"
            : `#${new THREE.Color()
                .lerpColors(new THREE.Color(0x7a4c30), new THREE.Color(0x5a4f44), altFactor)
                .getHexString()}`,
          fillBoost,
        ]}
      />
      <ambientLight
        intensity={ambientBase}
        // iter-11-revisit-ambient-cloud-cool: day ambient cools with
        // cloudiness from #ffffff (clear) to #c8d0da (overcast). Night
        // branch unchanged at #6a7080.
        color={
          isNight
            ? "#6a7080"
            : `#${new THREE.Color()
                .lerpColors(new THREE.Color(0xffffff), new THREE.Color(0xc8d0da), cloudFactor)
                .getHexString()}`
        }
      />
      <Sky
        sunPosition={[sunX, sunY, sunZ]}
        turbidity={turbidity}
        rayleigh={rayleigh}
        mieCoefficient={mieCoefficient}
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
            mieCoefficient={mieCoefficient}
          />
        </Environment>
      )}
    </>
  );
}
