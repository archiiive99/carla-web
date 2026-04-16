# iter-03-revisit-windshield-tint plan

VehicleMesh preserves authored GLB materials as-is for non-paint
slots. The CARLA vehicle GLBs ship with glass materials (windshield,
side/rear windows) that default to the GLB's authored color —
often a flat unrealistic gray that reads as opaque painted panels,
not glass.

Detect materials whose name matches `/glass|window|windscreen|windshield/i`
and replace with a tinted transparent MeshStandardMaterial: dark
blue-grey color `#262c38`, opacity 0.55, `transmission`-style
gloss via `roughness=0.08`, `metalness=0.6`, `envMapIntensity=0.8`
(higher than paint for sky reflection).

Keep paint-replacement pattern from iter-03-revisit-attribute-color
untouched. No-op on GLBs without glass-named materials (tested by
the name-regex miss).

Out of scope: real IOR/transmission via MeshPhysicalMaterial,
windshield tint per-vehicle type (tinted SUV vs clear sedan).

Acceptance: tsc clean; midday byte-identical (no vehicle in road
ROI).
