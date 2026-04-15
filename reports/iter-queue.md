# Rendering iteration queue

Live work-list for the harness in `prompts/specs/rendering-iteration-harness.md`.
Status legend: `[ ]` queued, `[~]` in-progress (with UTC timestamp), `[x]` done,
`✅` parity bar met, `⚠️` parity bar missed but documented gap, `❌` raised §6.

---

## Active queue (re-ordered 2026-04-15)

Re-ordering rationale (harness §1 re-prioritization clause): iter-01's after-numbers
report (`reports/iter01/report.md` + commit `369009cc6`) attributes the residual
gap (PSNR 14.3 dB vs 28 bar, ΔE 19.8 vs 6) to **upstream lighting parity** —
inverted color balance (UE5 warm vs web cool) and missing directional-shadow
contrast (no tree shadows on web road). Building façades (iter-02) cannot improve
those numbers; sky+sun (iter-05), shadows (iter-06), and tonemap (iter-11) can.
Bumped lighting-stack rows ahead of geometry rows.

```
[x] iter-01  Road surface PBR + parity harness MVP                (⚠️ measured FAIL >±10% — §6.3 raised in 369009cc6, see report)
[~] iter-05  Sky + sun direction parity (Hosek-Wilkie or HDR)     (opened 2026-04-15T07:50:51Z, Phase A)
[ ] iter-06  Shadows from sun — cascaded SM tuning                (depends on iter-05 sun pose)
[ ] iter-11  Post-process calibration — tonemap, exposure, bloom   (closes warm/cool color balance)
[ ] iter-02  Building façades — windows, materials, silhouettes
[ ] iter-03  Vehicle silhouettes — extracted GLBs for every blueprint
[ ] iter-04  Lane markings — texture authoring or decal pipeline
[ ] iter-07  Vegetation — extracted trees / bushes / grass instances
[ ] iter-08  Walker silhouettes — extracted skeletal meshes + walk cycle
[ ] iter-09  Street lights — emissive + point-light contribution at night
[ ] iter-10  Traffic lights — emissive bulb + correct hue
[ ] iter-12  Wet-surface response — driven by CARLA wetness param
[ ] iter-13  Scene-palette unification — three.js material constants module
[ ] iter-14  LOD pipeline — distant geometry impostors / decimated meshes
[ ] iter-15  IBL cubemaps per weather/TOD pair — replace gradient sky
```

## Master log

| Time (UTC) | Iter | Event | Commit |
|---|---|---|---|
| 2026-04-15 prior session | iter-01 | closed ⚠️ (§6.3 raise, gap attributed to upstream lighting) | 369009cc6 |
| 2026-04-15 this session | queue | bootstrap + re-order: lighting stack (05/06/11) before geometry stack (02/03/04) | (this commit) |
