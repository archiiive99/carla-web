import * as THREE from "three"

// Shared uniform driven by the sun's altitude (CARLA weather). 0 when the
// sun is at/above horizon, ramps to 1 when the sun is ~10°+ below — this
// drives per-window emissive contribution so the procedural city genuinely
// lights up at night instead of reading as black cubes.
export const FACADE_UNIFORMS = {
  uNightFactor: { value: 0.0 },
}

/** Per-window procedural window grid + night emissive.
 *
 *  Fragment shader reads world-space position + world normal of the face,
 *  picks the in-wall horizontal axis from the normal, tiles a 3.0 m floor
 *  pitch vertically and a 2.2 m window pitch horizontally, darkens window
 *  panes vs wall, draws mullion bands at floor dividers and window edges,
 *  and emits warm emissive light from a pseudo-random subset of windows
 *  when `uNightFactor > 0`. The per-building seed is derived from the
 *  instance world-translation so adjacent buildings have distinct lighting
 *  patterns.
 *
 *  This is not a faithful CARLA/UE facade — it is a shader that gives
 *  procedural buildings a real building silhouette with real lit windows,
 *  replacing the flat textured boxes that read as Minecraft cubes. */
type FacadeShaderParams = Parameters<
  NonNullable<THREE.MeshStandardMaterial["onBeforeCompile"]>
>[0]

function patchFacadeShader(shader: FacadeShaderParams) {
  shader.uniforms.uNightFactor = FACADE_UNIFORMS.uNightFactor

  shader.vertexShader = shader.vertexShader
    .replace(
      `#include <common>`,
      `#include <common>
       varying vec3 vFacadeWorldPos;
       varying vec3 vFacadeWorldNormal;
       varying vec3 vFacadeInstanceOrigin;`,
    )
    .replace(
      `#include <worldpos_vertex>`,
      `#include <worldpos_vertex>
       vFacadeWorldPos = worldPosition.xyz;
       // World-space normal. For InstancedMesh we must compose modelMatrix
       // and instanceMatrix explicitly — Three normalMatrix is view-space,
       // not world. Use objectNormal after begin_normal_vertex so the
       // instance rotation is already applied.
       #ifdef USE_INSTANCING
         mat3 instRot = mat3(instanceMatrix);
         vec3 wN = normalize(mat3(modelMatrix) * (instRot * objectNormal));
         vec4 instCenter = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
       #else
         vec3 wN = normalize(mat3(modelMatrix) * objectNormal);
         vec4 instCenter = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
       #endif
       vFacadeWorldNormal = wN;
       vFacadeInstanceOrigin = instCenter.xyz;`,
    )

  shader.fragmentShader = shader.fragmentShader
    .replace(
      `#include <common>`,
      `#include <common>
       varying vec3 vFacadeWorldPos;
       varying vec3 vFacadeWorldNormal;
       varying vec3 vFacadeInstanceOrigin;
       uniform float uNightFactor;
       // fFacadeEmissive is computed in map_fragment and consumed in the
       // emissive chunk so lit windows contribute via the proper emissive
       // path (they stay bright when direct sun has fallen to zero).
       vec3 fFacadeEmissive = vec3(0.0);
       float facadeHash(vec2 p) {
         return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
       }`,
    )
    .replace(
      `#include <map_fragment>`,
      `
       vec3 fWN = normalize(vFacadeWorldNormal);
       // Roof / floor fragments keep the flat base colour — no window
       // pattern (the roof slab on top has its own material anyway).
       bool fIsWall = abs(fWN.y) < 0.55;
       if (fIsWall) {
         // Pick the horizontal in-wall axis from the normal. Walls whose
         // normal is dominated by X use world-Z as the along-wall axis
         // and vice versa.
         float fTangent = abs(fWN.x) > abs(fWN.z) ? vFacadeWorldPos.z : vFacadeWorldPos.x;
         // Vertical distance above the building base — subtract the
         // instance origin Y so buildings at different elevations still
         // start their floor 0 at their own ground.
         float fVert = vFacadeWorldPos.y - vFacadeInstanceOrigin.y;

         // Floor pitch is 3 m (CARLA residential story height); window
         // pitch is 2.2 m (typical street frontage).
         const float FLOOR_H = 3.0;
         const float WIN_W   = 2.2;

         float floorIdx = floor(fVert / FLOOR_H);
         float colIdx   = floor(fTangent / WIN_W);

         float localV = fract(fVert / FLOOR_H);
         float localH = fract(fTangent / WIN_W);

         // Window pane: the central box of each cell. Leaves sill + lintel
         // + mullion bands as wall.
         bool fInWinV = localV > 0.22 && localV < 0.80;
         bool fInWinH = localH > 0.18 && localH < 0.82;
         bool fIsWindow = fInWinV && fInWinH;

         // Darken window panes vs wall (tinted glass, recessed).
         float winDarken = fIsWindow ? 0.38 : 1.0;

         // Floor divider band near the cell boundary.
         float divider = smoothstep(0.97, 1.0, localV) + smoothstep(0.03, 0.0, localV);

         diffuseColor.rgb *= winDarken;
         diffuseColor.rgb *= (1.0 - divider * 0.35);

         // Per-building, per-window pseudo-random lit flag. Floor and
         // column indices combine with a per-building seed derived from
         // the instance origin so adjacent buildings have distinct patterns.
         vec2 seedXZ = floor(vFacadeInstanceOrigin.xz * 0.25);
         float litHash = facadeHash(
           vec2(floorIdx + seedXZ.x * 13.7, colIdx + seedXZ.y * 11.3)
         );
         float isLit = step(0.55, litHash) * float(fIsWindow);
         float warmHash = facadeHash(vec2(floorIdx * 7.1, colIdx * 3.3 + seedXZ.x));
         vec3 warmColor = mix(
           vec3(1.00, 0.80, 0.45),
           vec3(0.95, 0.93, 0.75),
           warmHash
         );
         fFacadeEmissive = warmColor * isLit * uNightFactor * 1.6;
       }
      `,
    )
    .replace(
      `#include <emissivemap_fragment>`,
      `#include <emissivemap_fragment>
       // Feed per-window lit contribution into the real emissive path so
       // it survives direct-light = 0 at full night.
       totalEmissiveRadiance += fFacadeEmissive;`,
    )
}

/** Build a MeshStandardMaterial with the facade shader patch applied.
 *  `kind` adjusts base roughness/metalness so the main body, setback, and
 *  ground floor read as their intended mass rather than identical walls.
 *  No diffuse map is attached — the shader drives the window grid and
 *  night-lit windows from world-space coordinates + the per-instance
 *  origin, so a canvas texture would only paint noise on top of a
 *  correctly-laid-out window pattern. */
export function createFacadeMaterial(
  kind: "main" | "setback" | "ground",
): THREE.MeshStandardMaterial {
  const roughness = kind === "ground" ? 0.9 : kind === "main" ? 0.85 : 0.82
  const metalness = kind === "ground" ? 0.02 : kind === "main" ? 0.05 : 0.08
  const mat = new THREE.MeshStandardMaterial({ roughness, metalness })
  mat.onBeforeCompile = patchFacadeShader
  // Unique cache key per kind so Three.js doesn't conflate them after
  // separate-uniform binding.
  mat.customProgramCacheKey = () => `facade-${kind}-v1`
  return mat
}
