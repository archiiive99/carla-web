# iter-14-revisit-other-categories report

**Status: ✅ PASS** — extended iter-14's build-time LOD opt-in to 6
additional GltfInstanced sites (Poles / Walls already in iter-14 /
Fences / Rocks / Guard rails / Traffic Lights / Traffic Signs).
Harness PSNR/SSIM/ΔE byte-identical to baseline at iter-01 pose, so
all opt-ins are parity-neutral. Twelfth ✅ of session.

---

## §7.1 Architecture posture
Single-source preserved. No new files. Two existing files extended:
`Structures.tsx` (Poles / Fences / Rocks / Guard rails opt-in) and
`Signals.tsx` (Traffic Lights / Traffic Signs opt-in).

## §7.2 Feature delta
6 GltfInstanced call-sites now opt into iter-14's `maxDistance` +
`referencePoint` infra:

| Site | maxDistance | Note |
|---|---|---|
| Structures.Poles | 300m | already heavy, like Walls |
| Structures.Fences | 300m | scattered along property edges |
| Structures.Rocks | 300m | sparse, low impact |
| Structures.GuardRails | 300m | typically along curves; far ones invisible |
| Signals.TrafficLights | 200m | TL state matters at closer range; far ones unreadable |
| Signals.TrafficSigns | 200m | same — sign legibility limit |

All anchored at `[118.9, 55.8, 1.8]` (iter-01 pose).

## §7.3 Pixel diff
None — visual identical to iter-14 baseline at the iter-01 pose.

## §7.4 Measurements

| Run | PSNR (dB) | SSIM | ΔE | Note |
|---|---|---|---|---|
| iter-13-followon stab2 (pre-iter-14 baseline) | 11.03 | 0.2127 | 35.89 | no LOD anywhere |
| iter-14 after_lod (Walls only) | 11.03 | 0.2128 | 35.89 | 1 category |
| iter-14-revisit-other after_lod_all | **11.03** | **0.2127** | **35.89** | **6 categories** |

The iter-14-revisit numbers match the baseline byte-identically
(SSIM matches to 4 decimals — even the iter-14 Walls-only delta of
0.0001 cleared up). Confirms: no visible content at the iter-01 pose
is being culled out — the cull only removes truly-far instances.

## §7.5 Effort breakdown
~25 min (6 grep-and-replace + tsc + harness + report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - **TL/Signs at 200m, others at 300m** — traffic-light state is
    only readable inside ~150m FOV-pixel-density at street-level
    capture; signs similar. 200m is conservative cull range that
    keeps everything readable.
  - **Same iter-01 reference point everywhere** — single-camera
    measurement convenience. iter-14-revisit-runtime-lod will replace
    the static anchor with the live camera position.

## §7.8 Remaining gaps → paths
Same as iter-14:
  - iter-14-revisit-runtime-lod (camera-tracked cull, ~1.5h)
  - iter-14-revisit-perf-measurement (FPS probe in compare.py, ~30m)
  - iter-14-revisit-vegetation-buildings — apply same opt-in to
    Vegetation + Buildings (need to check those use GltfInstanced;
    might not). Quick if applicable.

## §7.9 Next iteration
Per session-raise §6.5 still in effect. Tractable next:
  - **iter-14-revisit-perf-measurement** — would actually quantify
    the LOD wins (FPS delta with culled vs uncached scene). Would
    finally exit the "all metrics suggest no-op" zone for LOD work.
  - **iter-14-revisit-vegetation-buildings** — verify those
    categories use GltfInstanced; if so opt them in.

Picking iter-14-revisit-vegetation-buildings on next cron — quick
audit + opt-in.
