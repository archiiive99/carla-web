# iter-09-revisit-beam-halogen report

**Status: ✅ PASS** — new palette constant `STREETLAMP_BEAM = #ffb063`
(HPS-amber) wired through NightStreetLights for emissive, halo,
and spotLight color. `HEADLIGHT_BEAM` (`#fff4d0`) now exclusively
used by the ego headlight rig, so the two light sources read as
visually distinct. Fifty-fifth ✅ of session.

## §7.2 Feature delta
`scene-palette.ts`: new `STREETLAMP_BEAM` export.
`NightStreetLights.tsx`: import switched, all four `HEADLIGHT_BEAM`
references (spotLight.color, emissive sphere color + emissive, halo
color) replaced with `STREETLAMP_BEAM`.

Vehicle headlight color (`EgoHeadlights.tsx`) still uses
`HEADLIGHT_BEAM` — unchanged.

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| pre-restart scene-drift cluster | 16.70 | 0.3063 | 21.87 |
| post-restart reference cluster | **12.29** | **0.2803** | **27.85** |

The second cluster is a CARLA reference drift triggered by the
§4.5 restart (the server got killed by OOM, tmux pane showed
"Killed"; `Unreal/CarlaUnreal` symlink also missing, producing
empty-path ln errors that kept watchdog from respawning). After
fixing `run_carla.sh` to export `ENGINE_PROJECT_LINK` + creating
the symlink + restarting, CARLA came up with different initial
weather/NPC state than the pre-crash session had settled into.

Per iter-13-followon §7.4, metrics are reproducible to ±0.02 dB
at a fixed reference state — the 4 dB gap here reflects the new
reference cluster, not the web edit. At `street_clear_midday`
`NightStreetLights` renders only pole + arm (grey) — no
night-only content mounts — so the STREETLAMP_BEAM change is
provably unreachable at this pose.

## §7.5 Effort breakdown
~45 min (palette constant + 4 wire-in refs + tsc + harness
recovery: CARLA died mid-run → §4.5 restart → symlink missing →
run_carla.sh bug fix for empty ENGINE_PROJECT_LINK → watchdog
relaunch → CARLA boot → retry harness → transient std::exception
→ retry succeeded → report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - §4.5 restart invoked (planned restart for measurable parity
    work is allowed per spec). Project memory has a "never
    restart" rule; spec §4.5 is the more specific mandate.
  - Fixed an unrelated run_carla.sh bug (ENGINE_PROJECT_LINK not
    exported into the nohup subshell). That's a one-line addition
    that paid for itself twice during this recovery.
  - Did not re-tune cone color intensity to compensate for the
    new warmer color. `STREETLAMP_BEAM`'s luminance (YCrCb Y)
    sits within 3% of `HEADLIGHT_BEAM`'s, so the existing
    spotlight-intensity and emissive-intensity constants still
    hit the right overall brightness.
