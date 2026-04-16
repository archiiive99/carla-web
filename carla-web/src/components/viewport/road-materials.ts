import * as THREE from "three"
import { ROAD_ASSETS, ASPHALT_TILE_METERS, GRUNGE_TILE_METERS } from "./carla-assets/road-assets"

// Textures shared by road + junction materials. Loaded once; THREE uses a
// 1x1 white tex until the PNG arrives so the first few frames render flat
// charcoal instead of magenta.
const loader = new THREE.TextureLoader()

function loadTiling(url: string, { srgb = false }: { srgb?: boolean } = {}) {
  const tex = loader.load(url)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

const ASPHALT_D = loadTiling(ROAD_ASSETS.asphalt.albedo, { srgb: true })
const ASPHALT_N = loadTiling(ROAD_ASSETS.asphalt.normal)
const ASPHALT_R = loadTiling(ROAD_ASSETS.asphalt.roughness)
const ASPHALT_AO = loadTiling(ROAD_ASSETS.asphalt.ao)
const MARKING_GRUNGE = loadTiling(ROAD_ASSETS.markings.grunge)

// Shared wetness uniform (0 = dry, 1 = soaked). Object identity preserved
// so onBeforeCompile registers it once and React mutates .value every
// render without triggering a shader recompile.
export const ROAD_UNIFORMS = {
  uWetness: { value: 0.0 },
}

// GLSL prelude — value-noise helpers used by macro-variation (replaces the
// bulk of the old procedural albedo generator) and the sparse wear dither.
const ROAD_SHADER_PATCH = /* glsl */ `
  float rhash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float rValueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = rhash21(i);
    float b = rhash21(i + vec2(1.0, 0.0));
    float c = rhash21(i + vec2(0.0, 1.0));
    float d = rhash21(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float rFbm(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 3; i++) {
      v += rValueNoise(p) * amp;
      p *= 2.07;
      amp *= 0.5;
    }
    return v;
  }
`

const ASPHALT_TILE = (1.0 / ASPHALT_TILE_METERS).toFixed(5)
const GRUNGE_TILE = (1.0 / GRUNGE_TILE_METERS).toFixed(5)

export function createRoadMaterial(baseHex: string, junction: boolean) {
  const mat = new THREE.MeshStandardMaterial({
    color: baseHex,
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide,
  })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWetness = ROAD_UNIFORMS.uWetness
    shader.uniforms.uAsphaltD = { value: ASPHALT_D }
    shader.uniforms.uAsphaltN = { value: ASPHALT_N }
    shader.uniforms.uAsphaltR = { value: ASPHALT_R }
    shader.uniforms.uAsphaltAO = { value: ASPHALT_AO }
    shader.uniforms.uMarkingGrunge = { value: MARKING_GRUNGE }

    shader.vertexShader =
      `attribute float edgeStyle;
       attribute float distToJunction;
       attribute float arrowDist;
       attribute vec2 forwardXZ;
       varying vec3 vRoadWorldPos;
       varying vec2 vRoadUv;
       varying float vEdgeStyle;
       varying float vDistJ;
       varying float vArrowD;
       varying vec2 vForwardXZ;
      ` +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         vRoadUv = uv;
         vEdgeStyle = edgeStyle;
         vDistJ = distToJunction;
         vArrowD = arrowDist;
         vForwardXZ = forwardXZ;
         vRoadWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;`
      )

    shader.fragmentShader =
      `varying vec3 vRoadWorldPos;
       varying vec2 vRoadUv;
       varying float vEdgeStyle;
       varying float vDistJ;
       varying float vArrowD;
       varying vec2 vForwardXZ;
       uniform float uWetness;
       uniform sampler2D uAsphaltD;
       uniform sampler2D uAsphaltN;
       uniform sampler2D uAsphaltR;
       uniform sampler2D uAsphaltAO;
       uniform sampler2D uMarkingGrunge;
       ${ROAD_SHADER_PATCH}
      ` +
      shader.fragmentShader
        .replace(
          "#include <normal_fragment_maps>",
          `#include <normal_fragment_maps>
           // Normal-map perturbation removed: normalMatrix is not declared
           // in the fragment shader (MeshStandardMaterial only exposes it
           // in the vertex shader). Road micro-bumps come from roughness
           // variation instead. Real normal mapping needs the normal map
           // wired through MeshStandardMaterial.normalMap with a tangent
           // frame rather than a manual perturb.
          `
        )
        .replace(
          "#include <map_fragment>",
          `
          vec2 wXZ = vRoadWorldPos.xz;
          vec2 tuv = wXZ * ${ASPHALT_TILE};

          // === Base asphalt: sample the PBR albedo at the tile UV ===
          // Replaces the old fbm-generated charcoal. Texture is sRGB in
          // the loader → linear once sampled, so no manual gamma here.
          vec3 asphalt = texture2D(uAsphaltD, tuv).rgb;

          // Macro variation (synthesized per spec path (c): no real macro-
          // variation texture this iteration; low-frequency procedural
          // multiplied into brightness breaks the 4 m tile so the eye
          // doesn't lock onto the repeat.
          float macro = rValueNoise(wXZ * 0.045);
          asphalt *= mix(0.85, 1.12, macro);

          // Coarse patch overlay — simulates resurfacing. Kept from the
          // previous shader because the CC0 set has no explicit patch
          // layer; this provides the darker-then-lighter zones that
          // CARLA's T_Asphalt_worn blend gives for free.
          float patchM = smoothstep(0.55, 0.75, rValueNoise(wXZ * 0.22));
          asphalt = mix(asphalt, asphalt * 0.74, patchM * 0.5);

          // Junction surface gets a subtle lift because it tends to be
          // lighter-colored intersection concrete-over-asphalt in CARLA.
          ${junction ? "asphalt += vec3(0.010);" : ""}

          // === Dirt gradient toward the curb ===
          // Same principle as before: real asphalt accumulates tire-dust
          // and grit where rain doesn't wash it. Curb distance derived
          // from vRoadUv.x (lane cross-section).
          float u = vRoadUv.x;
          float curbDist = min(u, 1.0 - u);
          float curbDirt = (1.0 - smoothstep(0.06, 0.22, curbDist)) * mix(0.55, 1.0, rValueNoise(wXZ * 1.6));
          vec3 dirtTint = vec3(0.075, 0.065, 0.050);
          asphalt = mix(asphalt, asphalt * 0.78 + dirtTint * 0.45, curbDirt * 0.50);

          // === Ambient-occlusion shadowing ===
          float aoSample = texture2D(uAsphaltAO, tuv).r;
          asphalt *= mix(1.0, aoSample, 0.65);

          // === Tonemap-matching tint ===
          // Harness measurements against the UE5 reference (clear midday,
          // Town01 street_clear_midday pose) showed the web road averaged
          // (R=23, G=32, B=41) where UE5 gave (R=26, G=22, B=18). Web
          // trended ~1.4x too bright and significantly cooler. A constant
          // warm multiply + exposure nudge closes the gross tonemap gap.
          // Local contrast (shadow variance) still lags — that's a
          // directional-light / tree-shadow parity problem for a later
          // iteration, not this one's scope.
          asphalt *= vec3(1.20, 1.02, 0.82);
          asphalt *= 0.78;

          // === Lane markings (procedural shape, textured wear overlay) ===
          // Shape calculation stays procedural so marking positions follow
          // OpenDRIVE-derived per-vertex attributes — see road-mesh-
          // generator.ts. Wear is added by multiplying the stripe mask
          // against a CC0 scratches alpha so crisp shader lines chip and
          // fade at world-scale frequencies.
          int style = int(vEdgeStyle + 0.5);
          float s = dot(wXZ, vForwardXZ);
          float distEdge = min(u, 1.0 - u);
          float stripeMask = 0.0;
          vec3 paintColor = vec3(0.94, 0.92, 0.86);
          float STRIPE_INNER = 0.022;
          float STRIPE_OUTER = 0.038;
          if (style == 1) {
            stripeMask = 1.0 - smoothstep(STRIPE_INNER, STRIPE_OUTER, distEdge);
          } else if (style == 2) {
            float dashPhase = fract(s / 6.0);
            float dashOn = step(dashPhase, 0.5);
            stripeMask = (1.0 - smoothstep(STRIPE_INNER, STRIPE_OUTER, distEdge)) * dashOn;
          } else if (style == 3) {
            float lineA = 1.0 - smoothstep(0.010, 0.016, abs(distEdge - 0.014));
            float lineB = 1.0 - smoothstep(0.010, 0.016, abs(distEdge - 0.034));
            stripeMask = max(lineA, lineB);
            paintColor = vec3(0.98, 0.78, 0.22);
          }
          // Grunge: sampled grayscale opacity at a smaller tile than
          // asphalt so the wear pattern doesn't echo the road texture
          // repetition. High threshold means rare, visible chips.
          float grunge = texture2D(uMarkingGrunge, wXZ * ${GRUNGE_TILE}).r;
          float wear = 1.0 - smoothstep(0.35, 0.85, grunge) * 0.50;
          stripeMask *= wear;

          vec3 paint = mix(paintColor, paintColor * 0.55, rFbm(wXZ * 4.0) * 0.30);
          asphalt = mix(asphalt, paint, stripeMask);

          // === Junction-approach markings (stop line + zebra crosswalk) ===
          vec3 jPaint = mix(vec3(0.90, 0.88, 0.82), vec3(0.55), rFbm(wXZ * 5.0) * 0.28);
          float laneInset = smoothstep(0.04, 0.07, u) * smoothstep(0.04, 0.07, 1.0 - u);
          float jMask = 0.0;
          if (vDistJ < 0.45) {
            jMask = max(jMask, 1.0 - smoothstep(0.30, 0.45, vDistJ));
          }
          if (vDistJ > 0.65 && vDistJ < 3.65) {
            float crossDepth = smoothstep(0.65, 0.95, vDistJ) * (1.0 - smoothstep(3.35, 3.65, vDistJ));
            float zebraPhase = fract(u * 7.0);
            float zebraOn = step(zebraPhase, 0.50);
            jMask = max(jMask, zebraOn * crossDepth);
          }
          jMask *= laneInset * wear;
          asphalt = mix(asphalt, jPaint, jMask);

          // === Forward turn-arrow ===
          float arrowMask = 0.0;
          if (vArrowD > 4.5 && vArrowD < 8.0) {
            float du = abs(u - 0.5);
            if (vArrowD < 5.5) {
              float tipHalfWidth = (vArrowD - 4.5) * 0.20;
              arrowMask = 1.0 - smoothstep(tipHalfWidth, tipHalfWidth + 0.018, du);
            } else {
              arrowMask = 1.0 - smoothstep(0.07, 0.085, du);
            }
            arrowMask *= smoothstep(4.5, 4.7, vArrowD) * (1.0 - smoothstep(7.7, 8.0, vArrowD));
          }
          arrowMask *= wear;
          asphalt = mix(asphalt, jPaint, arrowMask);

          // === Wet asphalt ===
          float pool = smoothstep(0.55, 0.78, rValueNoise(wXZ * 0.45));
          float wetMix = clamp(uWetness, 0.0, 1.0);
          asphalt *= mix(1.0, 0.55, wetMix);
          asphalt *= mix(1.0, 0.78, pool * wetMix);

          diffuseColor.rgb = asphalt;
          `
        )
        .replace(
          "#include <roughnessmap_fragment>",
          `
          // Sample the asphalt roughness map at the same tile UV the
          // albedo uses. Paint (lane markings + junction + arrow) reads
          // as lower roughness = glossier, matching CARLA's lane-marking
          // material which uses T_LaneMarking_orm (green channel).
          vec2 ruv = vRoadWorldPos.xz * ${ASPHALT_TILE};
          float rough = texture2D(uAsphaltR, ruv).r;
          // Clamp to a plausible band so the texture can't accidentally
          // produce chrome-level smooth surfaces.
          rough = clamp(rough, 0.60, 0.98);
          float roughnessFactor = rough;

          int styleR = int(vEdgeStyle + 0.5);
          float distEdgeR = min(vRoadUv.x, 1.0 - vRoadUv.x);
          float paintMask = 0.0;
          if (styleR == 1) {
            paintMask = 1.0 - smoothstep(0.022, 0.038, distEdgeR);
          } else if (styleR == 2) {
            float sR = dot(vRoadWorldPos.xz, vForwardXZ);
            float dashPhase = fract(sR / 6.0);
            float dashOn = step(dashPhase, 0.5);
            paintMask = (1.0 - smoothstep(0.022, 0.038, distEdgeR)) * dashOn;
          } else if (styleR == 3) {
            float lA = 1.0 - smoothstep(0.010, 0.016, abs(distEdgeR - 0.014));
            float lB = 1.0 - smoothstep(0.010, 0.016, abs(distEdgeR - 0.034));
            paintMask = max(lA, lB);
          }
          // Apply the same grunge wear to roughness so chipped paint
          // reverts to asphalt roughness rather than keeping a glossy
          // roughness reading under a faded stripe.
          float grungeR = texture2D(uMarkingGrunge, vRoadWorldPos.xz * ${GRUNGE_TILE}).r;
          float wearR = 1.0 - smoothstep(0.35, 0.85, grungeR) * 0.50;
          paintMask *= wearR;
          roughnessFactor = mix(roughnessFactor, 0.38, paintMask);

          float jMaskR = 0.0;
          float laneInsetR = smoothstep(0.04, 0.07, vRoadUv.x) * smoothstep(0.04, 0.07, 1.0 - vRoadUv.x);
          if (vDistJ < 0.45) {
            jMaskR = max(jMaskR, 1.0 - smoothstep(0.30, 0.45, vDistJ));
          }
          if (vDistJ > 0.65 && vDistJ < 3.65) {
            float crossDepth = smoothstep(0.65, 0.95, vDistJ) * (1.0 - smoothstep(3.35, 3.65, vDistJ));
            float zebraOn = step(fract(vRoadUv.x * 7.0), 0.50);
            jMaskR = max(jMaskR, zebraOn * crossDepth);
          }
          jMaskR *= laneInsetR * wearR;
          roughnessFactor = mix(roughnessFactor, 0.38, jMaskR);

          float arrowMaskR = 0.0;
          if (vArrowD > 4.5 && vArrowD < 8.0) {
            float duR = abs(vRoadUv.x - 0.5);
            if (vArrowD < 5.5) {
              float tipHalfWidth = (vArrowD - 4.5) * 0.20;
              arrowMaskR = 1.0 - smoothstep(tipHalfWidth, tipHalfWidth + 0.018, duR);
            } else {
              arrowMaskR = 1.0 - smoothstep(0.07, 0.085, duR);
            }
            arrowMaskR *= smoothstep(4.5, 4.7, vArrowD) * (1.0 - smoothstep(7.7, 8.0, vArrowD));
          }
          arrowMaskR *= wearR;
          roughnessFactor = mix(roughnessFactor, 0.38, arrowMaskR);

          // Wet asphalt: sharp roughness drop + extra drop inside pooled
          // regions so direct sun reflects cleanly on puddles.
          float poolR = smoothstep(0.55, 0.78, rValueNoise(vRoadWorldPos.xz * 0.45));
          float wetR = clamp(uWetness, 0.0, 1.0);
          roughnessFactor = mix(roughnessFactor, 0.22, wetR * 0.85);
          roughnessFactor = mix(roughnessFactor, 0.08, poolR * wetR);
          `
        )
  }
  mat.customProgramCacheKey = () => (junction ? "road-junction-pbr-v3" : "road-surface-pbr-v3")
  return mat
}

export const ROAD_MATERIAL = createRoadMaterial("#1a1a1a", false)
export const JUNCTION_MATERIAL = createRoadMaterial("#1e1e1e", true)

// Sidewalk / curb materials stay procedural; this iteration's scope is
// only the road surface. Untouched from the pre-iter-01 shader.
const SIDEWALK_SHADER_PATCH = /* glsl */ `
  float hash21s(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float vnoiseS(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash21s(i);
    float b = hash21s(i + vec2(1.0, 0.0));
    float c = hash21s(i + vec2(0.0, 1.0));
    float d = hash21s(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
`

export function createSidewalkMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    color: "#9a978f",
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide,
  })
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader =
      `varying vec3 vSwWorld;\nvarying vec2 vSwUv;\n` +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         vSwUv = uv;
         vSwWorld = (modelMatrix * vec4(position, 1.0)).xyz;`
      )
    shader.fragmentShader =
      `varying vec3 vSwWorld;\nvarying vec2 vSwUv;\n${SIDEWALK_SHADER_PATCH}\n` +
      shader.fragmentShader
        .replace(
          "#include <map_fragment>",
          `
          vec2 wXZ = vSwWorld.xz;
          float n = vnoiseS(wXZ * 1.4) * 0.5 + vnoiseS(wXZ * 4.5) * 0.35 + vnoiseS(wXZ * 12.0) * 0.15;
          vec3 concrete = mix(vec3(0.42, 0.41, 0.39), vec3(0.58, 0.57, 0.55), n);
          float panelIdx = floor(vSwUv.y);
          float panelTone = (hash21s(vec2(panelIdx, 17.5)) - 0.5) * 0.16;
          concrete *= clamp(1.0 + panelTone, 0.78, 1.18);
          float aggrS = vnoiseS(wXZ * 16.0);
          concrete *= mix(0.93, 1.07, aggrS);
          float joint = abs(fract(vSwUv.y) - 0.5);
          float jointLine = 1.0 - smoothstep(0.46, 0.49, joint);
          concrete *= mix(1.0, 0.55, jointLine);
          float curbDirt = 1.0 - smoothstep(0.0, 0.25, vSwUv.x);
          concrete *= mix(1.0, 0.72, curbDirt * 0.5);
          diffuseColor.rgb = concrete;
          `
        )
        .replace(
          "#include <roughnessmap_fragment>",
          `
          float roughnessFactor = roughness;
          roughnessFactor = clamp(roughnessFactor + (vnoiseS(vSwWorld.xz * 2.0) - 0.5) * 0.08, 0.8, 0.99);
          `
        )
  }
  mat.customProgramCacheKey = () => "sidewalk-v2"
  return mat
}

export const SIDEWALK_MATERIAL = createSidewalkMaterial()

export function createCurbMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    color: "#6d6a63",
    roughness: 0.88,
    metalness: 0,
    side: THREE.DoubleSide,
  })
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader =
      `varying vec3 vCurbWorld;\n` +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>\nvCurbWorld = (modelMatrix * vec4(position, 1.0)).xyz;`
      )
    shader.fragmentShader =
      `varying vec3 vCurbWorld;\n` +
      `float ch21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}\n` +
      `float cnoise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);float a=ch21(i),b=ch21(i+vec2(1,0)),c=ch21(i+vec2(0,1)),d=ch21(i+vec2(1,1));vec2 u=f*f*(3.-2.*f);return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);}\n` +
      shader.fragmentShader.replace(
        "#include <map_fragment>",
        `
        vec2 wXZ = vCurbWorld.xz;
        float n = cnoise(wXZ * 1.4) * 0.5 + cnoise(wXZ * 5.0) * 0.3 + cnoise(wXZ * 14.0) * 0.2;
        float streak = cnoise(vec2(vCurbWorld.x * 6.0 + vCurbWorld.z * 6.0, vCurbWorld.y * 1.5));
        vec3 base = mix(vec3(0.27, 0.26, 0.23), vec3(0.42, 0.41, 0.37), n);
        base *= mix(0.78, 1.0, streak);
        diffuseColor.rgb = base;
        `
      )
  }
  mat.customProgramCacheKey = () => "curb-concrete-v1"
  return mat
}

export const CURB_MATERIAL = createCurbMaterial()
