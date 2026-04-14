// Road asset manifest. Single source of truth for every texture the road
// material consumes, so the shader file doesn't hard-code "/assets/carla/..."
// strings and the iteration-02 swap (UE5-extracted → CC0 → back to UE5) only
// touches this file.
//
// PROVENANCE (iteration 01 — CC0 fallback):
//   Asphalt PBR set   — ambientCG.com / Asphalt026C, CC0 1.0 Universal.
//                       Downloaded 2026-04-15 from ambientcg.com/a/Asphalt026C
//   Grunge / scratch  — ambientCG.com / Scratches002 (Opacity channel only),
//                       CC0 1.0 Universal.
//
// Why CC0, not UE5 extraction:
//   The iteration's preferred path was a headless UE5 Python commandlet
//   running with `-nullrhi -graphicsadapter=2` per asset-extraction-pipeline
//   §2. GPU 2 is occupied by the live CARLA game process (tmux `carla-web`),
//   AND the on-disk UnrealEditor-Cmd binary is missing (the running process
//   was launched from a since-deleted copy — `readlink /proc/<pid>/exe`
//   reports "(deleted)"). Both paths blocked independently. Iteration 02
//   retries UE5 extraction once GPU 2 is free AND the engine binary is
//   redeployed, OR via a commandlet baked into a future cook — see
//   `prompts/specs/asset-extraction-pipeline.md` §4.1.
//
// These textures are visually close to CARLA's T_Asphalt01_* set (gray
// aggregate, similar color distribution, similar grain size). They are not
// byte-identical to the UE5 render; the parity harness measures that gap.

const ROOT = "/assets/carla/road";

export const ROAD_ASSETS = {
  asphalt: {
    albedo: `${ROOT}/asphalt/asphalt_d.png`,
    normal: `${ROOT}/asphalt/asphalt_n.png`,
    roughness: `${ROOT}/asphalt/asphalt_r.png`,
    ao: `${ROOT}/asphalt/asphalt_ao.png`,
  },
  markings: {
    // Grayscale opacity map — used as a multiplicative wear mask so painted
    // stripes chip and fade at world-scale frequencies rather than reading
    // as perfect shader-generated lines.
    grunge: `${ROOT}/markings/marking_grunge_a.png`,
  },
} as const;

// Real-world meters that one texture tile spans. Chosen to match the
// aggregate cell size captured in the ambientCG source (≈ 4 m / tile reads
// as ~5 mm per texel at 2048² albedo). UE5's T_Asphalt01 master uses a
// similar scale in M_RoadMaster's TexCoord*Scale node group.
export const ASPHALT_TILE_METERS = 4.0;
// Grunge tile is smaller so chips on lane markings read at proper scale.
export const GRUNGE_TILE_METERS = 2.5;
