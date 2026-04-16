# iter-09-revisit-headlight-cone plan

Tune EgoHeadlights SpotLight params from generic 0.45-rad flood to
a low-beam-shaped narrow cone with longer throw: `angle 0.45→0.35`,
`penumbra 0.45→0.35`, `distance 40→55`, `intensity 4→5`.

Out of scope: real IES profiles, frustum shadow maps on headlights,
NPC headlights (cost of N shadow maps still applies).

Acceptance: tsc clean; harness byte-identical at street_clear_midday
(ego not spawned → light-null path unchanged); commit + push.
