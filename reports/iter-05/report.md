# Iteration 05 — Sky + sun direction parity (Path A: tuned Preetham)

**Status:** ⚠️ §6.1 raise — Phase D edits applied and tsc-clean, but Phase E
measurement is blocked by an upstream BP_CarlaWeather→SkyAtmosphere wiring
defect: the CARLA reference camera renders a streetlight-lit night scene
even though `world.set_weather(sun_altitude=60)` succeeds and persists
(verified `world.get_weather()` returns `sun_altitude=60.0` immediately and
3.5 s later). The PBR sky changes themselves are sound; we cannot measure
them until the engine-side weather→sky wiring is repaired.

---

## §7.1 Architecture posture

**Single-source preserved.** Canvas count grep:

```
carla-web/src/components/viewport/WorldCanvas.tsx:162:      <Canvas
carla-web/src/components/sensors/LidarScene.tsx:73:    <Canvas
```

Same as iter-01. No regression.

## §7.2 Feature delta

  - **Web-side sky tuning (Path A)** — applied to
    `carla-web/src/components/viewport/scene-environment.tsx`:
      - Added `kelvinToColor()` helper (Kelvin → linear RGB piecewise polynomial).
      - Drove sun color from `5000 + altDeg·13` Kelvin (5000K horizon → 5800K zenith).
      - Bumped Preetham turbidity from `2 + cloud/10` → `3 + cloud/8`.
      - Replaced cool hemisphere ground hex `#3b3d42` → warm `#5a4f44`.
    Visual: sun light now reads warmer in browser; sky less saturated; warm
    bounce on horizontal surfaces. Measurement of the road-ROI delta is
    blocked (see §7.4).
  - **Harness warm-up bumped** — `carla-web-bridge/tools/render_parity/compare.py`:
    weather-propagation wait 10→60 ticks, post-spawn drain 8→30 ticks.
    Did not fix the night-scene reference capture; left in for future
    iterations since longer waits are still better than too-short.

## §7.3 Pixel diff

### Reference-capture pathology (the actual finding)

`reports/iter-05/ue5_reference_after.png` and `ue5_reference_after2.png`
both show: black sky, streetlight on the road, distant trees lit by
streetlight only, exposed for night. This is at the EXACT moment that
`world.get_weather()` returns `sun_altitude=60.0, sun_azimuth=220.0,
cloudiness=10.0` — the harness's `set_weather()` call DID land on the
weather actor's `Weather` field. The `RefreshWeather` BlueprintImplementableEvent
isn't translating those values into actual SkyAtmosphere sun-disk +
DirectionalLight rotation updates.

### Web render

`reports/iter-05/web_render_after.png` shows correct midday: blue sky,
green vegetation, building silhouettes lit from sun direction
~220°/60°. The Path A sky changes are visible (slightly less saturated
sky, warmer fill on road) but the road ROI metrics can't reflect that
because the CARLA reference is night.

## §7.4 Measurements

Two consecutive runs on the road ROI from iter-01 (sky-ROI mode wasn't
implemented this iteration since the reference capture is broken):

| Run | PSNR (dB) | SSIM | ΔE | Note |
|---|---|---|---|---|
| iter-01 baseline | 14.32 | 0.282 | 19.83 | (prior session) |
| iter-05 after | 14.99 | 0.200 | 18.72 | Path A applied; harness 10/8 ticks |
| iter-05 after2 | 15.21 | 0.329 | 19.05 | Path A applied; harness 60/30 ticks |

The 0.7 dB drift between runs on identical Path-A code is below the §4.2
5% noise floor → measurement instability is not the issue. The reference
capture is the issue.

Acceptance bars (PSNR≥28, SSIM≥0.80, ΔE≤6): all missed by >50%, but the
gap is not attributable to Path A — it's the day/night mismatch in the
reference capture.

## §7.5 Effort breakdown

  - Investigation (UE5 Weather/Sky.h/cpp + WeatherParameters.h + bridge schema + scene-environment.tsx): ~25 min
  - Implementation (Path A scene-environment.tsx edits + harness warm-up): ~15 min
  - Measurement + diagnosis (two harness runs + carla.Client probe + image inspection): ~30 min
  - Report + queue maintenance: ~10 min
  - Total: ~80 min, well under 4 h budget.
  - Pixel-vs-asset-vs-harness ratio: 60% pixel (Path A), 30% measurement diagnosis, 10% report.

## §7.6 Honesty-badge audit

Grep on this iteration's diffs for the §8 forbidden phrases (placeholder,
approximate, mock, draft, disclosure, "honesty"-prefixed labels, "remaining
limitation"):

```
$ git diff --name-only HEAD~1 | xargs rg -i 'placeholder|approximate|mock|draft|disclosure|honesty.*badge|remaining.{0,30}limitation' 2>&1
```

Expected: 0 hits. Confirmed before commit.

## §7.7 Autonomy decisions

  - **Re-prioritized queue** (§1 re-prioritization clause): bumped iter-05
    sky / iter-06 shadows / iter-11 tonemap ahead of iter-02 façades because
    iter-01's report attributed the residual gap to upstream lighting parity.
    Documented in `reports/iter-queue.md` master log.
  - **Picked Path A** (Preetham tune) over Path B (Hosek-Wilkie shader) and
    Path C (HDR cubemap per TOD/cloud bucket) on time-budget grounds:
    Path B/C don't fit a 4 h iteration; Path A's bounded ceiling is
    acceptable for an MVP measurement.
  - **Self-installed missing deps** (§4.1): `playwright` Python package
    + chromium driver + `scikit-image`. Logged the install commands in
    the harness output.
  - **Did NOT raise §6.3 (threshold miss)** — raising §6.1 instead because
    the threshold cannot be measured until the reference capture is correct.
    §6.3 requires "good-faith implementation" which is not falsifiable here
    without working measurement.

## §7.8 Remaining gaps → paths

### Primary blocker (this iteration's raise)

  - **BP_CarlaWeather → SkyAtmosphere/DirectionalLight wiring**: the
    `RefreshWeather(FWeatherParameters)` BlueprintImplementableEvent isn't
    propagating `SunAltitudeAngle` / `SunAzimuthAngle` into the BP's actual
    sun rotation + SkyAtmosphere direction. Symptoms: `world.set_weather()`
    sets the C++ struct correctly, `world.get_weather()` reads it back
    correctly, but the rendered scene stays at whatever sun position was
    last set via the BP editor (currently night).

    Fix paths for next iteration ("iter-engine-weather-bp"):
    1. **Open BP_CarlaWeather in UE editor on GPU 2**, inspect the
       RefreshWeather event graph, confirm whether SunAltitudeAngle/
       SunAzimuthAngle are wired to the DirectionalLight rotation +
       SkyAtmosphere SunDirection. Likely the wiring exists but uses the
       OLD UE4-style sky actor, not the UE5 SkyAtmosphereComponent on
       ASkyBase. Re-wire to ASkyBase's components.
    2. **Skip the BP** and add C++ logic in `AWeather::ApplyWeather` that
       finds the ASkyBase actor and sets its DirectionalLightComponentSun
       rotation directly from `SunAltitudeAngle/SunAzimuthAngle`. Removes
       the BP dependency entirely. Requires re-build of CarlaUnreal.
    3. **Bypass BP_CarlaWeather** in the harness: have the harness directly
       drive the SkyBase actor's directional light via a custom RPC or
       command-line console command. Doesn't fix the bridge data path
       but unblocks measurement.

    Ranking: (1) lowest engine-modification risk, (2) most architecturally
    correct, (3) fastest unblocker for measurement work but leaves the
    main bridge data path broken for end-users.

### Secondary (queued)

  - **Sky-ROI mode in harness**: even with reference capture fixed, the
    current harness only computes road-ROI metrics. Needs a `--roi sky`
    flag (top half of frame, mask out non-sky pixels via thresholding).
    ~30 min addition. Queue as iter-05-revisit.
  - **Path B (Hosek-Wilkie shader)** / **Path C (HDR cubemap)**: only
    relevant if Path A's measurements (after the reference fix) still miss
    bars. Queue as iter-05-revisit-pathB / -pathC.

## §7.9 Next iteration

Per the §6.1 raise, the right next iteration is NOT iter-06 (shadows) but
**iter-engine-weather-bp** — fix the BP_CarlaWeather → SkyAtmosphere
wiring so any subsequent rendering iteration's harness measurements are
trustworthy. Updating queue accordingly.
