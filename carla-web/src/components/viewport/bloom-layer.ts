// iter-09-revisit-bloom-v2: shared layer index for selective bloom.
// Objects added to this layer (via `mesh.layers.enable(BLOOM_LAYER)`)
// participate in the SelectiveBloom pass; the rest of the scene
// composition is preserved unmodified. Layer 0 is the default
// (everything renders to it), so we use layer 1 here.
//
// Why a constant module instead of inline 1: keeps the layer assignment
// consistent across every site that opts in (NightStreetLights lamp
// heads, future emissive bulb / window participants), and makes a
// future change (move to layer 2 etc.) one-line.
export const BLOOM_LAYER = 1;
