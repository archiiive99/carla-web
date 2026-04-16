// Three.js material palette — single source of truth for inline scene
// colors that previously lived as scattered string literals across the
// viewport components. ui-design-system-adherence.md §1.3 exempts canvas
// fillStyle and three.js material colors from the Tailwind/shadcn semantic
// token requirement (CSS variables don't reach WebGL), so we centralize
// them here instead.
//
// Palette is split into LIGHTING / SURFACE / VEHICLE / WALKER /
// TRAFFIC_LIGHT / DEBUG sections so future per-section tuning iterations
// can edit one block.
//
// SegmentationView's palette is intentionally NOT here — that one is
// spec-locked to CARLA server output (must match `sensor.camera.semantic_segmentation`
// per-class colors).

// ──────────────────────────────────────────────────────────────────────
// Lighting / sky-driven fills
// ──────────────────────────────────────────────────────────────────────
/** Cool-blue overhead glow used as a residual lunar/skyglow term when sun
 *  is below the horizon — keeps top-facing surfaces from going pitch-black. */
export const NIGHT_SKY_GLOW = "#6a7a9c";

/** Headlight beam tint — warm tungsten ~3500K. */
export const HEADLIGHT_BEAM = "#fff4d0";

/** Streetlamp beam tint — HPS amber ~2200K, distinct from vehicle
 *  low-beam so the two read as different light sources at night. */
export const STREETLAMP_BEAM = "#ffb063";

// ──────────────────────────────────────────────────────────────────────
// Ground / surface
// ──────────────────────────────────────────────────────────────────────
/** Diagrammatic ground-plane base color — neutral cool grey at 50m
 *  checker spacing. NOT the road; that's road-materials.ts. */
export const GROUND_REFERENCE = "#4a4d52";

/** Generic desaturated steel-grey for sidewalks / curbs / utility surfaces. */
export const SURFACE_NEUTRAL = "#3a4552";

// ──────────────────────────────────────────────────────────────────────
// Structures (procedural buildings & vegetation)
// ──────────────────────────────────────────────────────────────────────
/** Wall / roof default — warm-grey stone tone. */
export const WALL_DEFAULT = "#71717a";

/** Alternative wall tone for variation between adjacent buildings. */
export const WALL_WARM = "#78716c";

/** Light wall accent (e.g. a brighter facade). */
export const WALL_LIGHT = "#a8a29e";

/** Pole / signpost / utility metal. */
export const POLE_DARK = "#374151";

/** Pole secondary (slightly lighter). */
export const POLE_MID = "#4b5563";

/** Sign plate or generic mid-grey panel. */
export const SIGN_PLATE = "#9ca3af";

/** Sign post connector material. */
export const SIGN_POST = "#71717a";

/** Tree-trunk brown. */
export const TREE_TRUNK = "#3d2b1f";

/** Default wall fallback for procedural buildings (slightly darker than WALL_DEFAULT). */
export const PROCEDURAL_WALL = "#4a4a4a";

// ──────────────────────────────────────────────────────────────────────
// Vehicle fallback colors (used when no GLB asset / extracted color)
// ──────────────────────────────────────────────────────────────────────
/** Generic vehicle body fallback grey. */
export const VEHICLE_DEFAULT = "#9ca3af";

/** Brake-light glow (red-orange). */
export const VEHICLE_BRAKE = "#f59e0b";

/** Reverse-light glow (warm green-amber). */
export const VEHICLE_REVERSE = "#22c55e";

// ──────────────────────────────────────────────────────────────────────
// Walker (pedestrian) fallback colors
// ──────────────────────────────────────────────────────────────────────
/** Walker body capsule (placeholder mesh) primary color. */
export const WALKER_BODY = "#f97316";

/** Walker torso emissive tint — slight warm glow so the safety-vis
 *  body still reads on dark backgrounds without a direct light. */
export const WALKER_EMISSIVE = "#9a3412";

/** Walker body capsule secondary (limbs). */
export const WALKER_LIMB = "#fb923c";

/** Walker proximity-warning sphere. */
export const WALKER_WARNING = "#f59e0b";

/** Per-actor deterministic body-color variations — safety-vis hue band
 *  (high-visibility orange/amber/red range). walkerBodyColor() picks one
 *  by `abs(actorId) % length` so a crowd reads as distinct individuals. */
export const WALKER_BODY_VARIATIONS = [
  WALKER_BODY, // "#f97316" — orange (default)
  "#ea580c",   // darker orange-red
  "#fb923c",   // light orange
  "#f59e0b",   // amber
  "#fbbf24",   // yellow-orange
  "#dc2626",   // red-orange
] as const;

/** iter-08-clothes-pattern: pants-layer color variations for walker
 *  legs. Darker neutral-to-deep palette so the shirt/pants separation
 *  reads as clothing instead of uniform body-color. Picked with a
 *  different modulus (actor.id % length × prime) so pants don't
 *  always track with shirt color. */
export const WALKER_PANTS_VARIATIONS = [
  "#1e293b",   // slate navy (jeans)
  "#292524",   // warm black
  "#44403c",   // brown-gray
  "#78716c",   // khaki gray
  "#374151",   // charcoal
  "#422006",   // deep brown
] as const;

// ──────────────────────────────────────────────────────────────────────
// Traffic lights
// ──────────────────────────────────────────────────────────────────────
/** Traffic-light bulb in red phase. */
export const TRAFFIC_RED = "#ef4444";
/** Traffic-light bulb in yellow phase. */
export const TRAFFIC_YELLOW = "#eab308";
/** Traffic-light bulb in green phase. */
export const TRAFFIC_GREEN = "#22c55e";
/** Traffic-light bulb when off / unknown state. */
export const TRAFFIC_OFF = "#4b5563";
/** Traffic-light housing (the post-and-frame around the bulbs). */
export const TRAFFIC_HOUSING = "#374151";

// ──────────────────────────────────────────────────────────────────────
// Debug / overlay markers
// ──────────────────────────────────────────────────────────────────────
/** Lane-centerline debug dots. */
export const DEBUG_LANE_DOT = "#eab308";

/** Magenta wireframe — stock "missing asset" marker per CARLA convention. */
export const MISSING_ASSET = "#ff00ff";
