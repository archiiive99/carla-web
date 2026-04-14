# Rendering Quality Fix — Dark/Dim Camera Feed

## Problem Statement

The RGB camera feed from CARLA appears extremely dark — nearly black. This is NOT a brightness slider issue. The raw pixel data from CARLA UE5 is already near-black before any compression or transmission occurs.

**Measured evidence** (from direct CARLA Python API raw pixel analysis):
```
Raw RGB mean brightness: 0.2 out of 255
99.6% of all pixels have RGB sum < 30
R channel: max=201, mean=0.3
G channel: max=126, mean=0.2
B channel: max=106, mean=0.1
```

This means the UE5 rendering pipeline is producing near-black frames. The JPEG compression, WebSocket transmission, and browser rendering are all fine — the problem is at the source.

## Root Causes (in order of likelihood)

### Cause 1: CARLA Auto-Exposure is Disabled + Bad Weather

**DefaultEngine.ini** has:
```ini
r.DefaultFeature.AutoExposure=False
```

This means UE5's automatic exposure compensation is OFF globally. Combined with the current weather settings:
```
cloudiness: 100.0    ← fully overcast
fog_density: 7.0     ← heavy fog
fog_distance: 0.75   ← fog starts at 0.75m from camera
sun_altitude: 45.0   ← sun is up but hidden behind clouds
```

Without auto-exposure, the camera cannot adapt to the dim lighting conditions. The scene IS dark because of the weather, and the camera cannot compensate.

**Fix approach**: Set weather to clear conditions via the Python API. The bridge or frontend should set good default weather on startup.

### Cause 2: RenderOffScreen + Low Resolution Viewport

CARLA is launched with:
```
-RenderOffScreen -ResX=640 -ResY=480
```

`-RenderOffScreen` uses a software-emulated display, which on some GPU drivers can produce incorrect tonemapping or gamma. The low viewport resolution (640x480) is separate from the camera sensor resolution but may affect the render target quality.

**Fix approach**: Try removing `-ResX=640 -ResY=480` or increasing to `-ResX=1920 -ResY=1080`. The sensor resolution is independent, but the viewport affects the scene capture render target.

### Cause 3: Post-Processing Pipeline State

CARLA's `PostProcessConfig.cpp` controls what UE5 features are enabled for the camera sensor:

When `enable_postprocess_effects` is `true` (the default), these are ON:
- `EyeAdaptation` (auto-exposure per camera)
- `ColorGrading`
- `Bloom`
- `AmbientOcclusion`
- `GlobalIllumination`
- `Tonemapper`

When `enable_postprocess_effects` is `false`, ALL of these are disabled including **Lighting, DirectionalLights, SkyLighting, Tonemapper** — which would make the scene completely dark.

**The camera sensor's `enable_postprocess_effects` attribute MUST be `true`** for proper lighting. Check `realtime_session.py` to make sure it's not being set to `false`.

### Cause 4: omx Added a Broken Normalization Hack

The file `compression/image.py` contains `_normalize_low_light_bgra()` which applies a gain boost to dark frames:
```python
def _normalize_low_light_bgra(self, arr):
    rgb = arr[:, :, :3].astype(np.float32)
    mean_value = float(rgb.mean())
    if mean_value >= 8.0:
        return arr  # Only applies if mean < 8
    gain = min(48.0, max(8.0, 96.0 / max(mean_value, 0.5)))
    lifted = np.clip(rgb * gain, 0, 255).astype(np.uint8)
```

This is a BAND-AID, not a fix. With mean=0.2, gain becomes 48x, which amplifies noise and produces ugly washed-out colors. The root cause must be fixed, not masked with post-hoc gain.

**This function should be removed** once the root cause is fixed.

---

## Fix Plan (in priority order)

### Fix 1: Set Clear Weather on Startup [BRIDGE]

**File**: `carla-web-bridge/src/realtime_session.py`

After spawning the ego vehicle, immediately set the weather to a well-lit preset:

```python
import carla

def _ensure_vehicle_sync(self) -> int:
    # ... existing vehicle spawn code ...
    
    # Set clear daytime weather for proper lighting
    weather = carla.WeatherParameters(
        cloudiness=10.0,
        precipitation=0.0,
        precipitation_deposits=0.0,
        wind_intensity=5.0,
        sun_azimuth_angle=220.0,
        sun_altitude_angle=60.0,   # High sun = bright scene
        fog_density=0.0,
        fog_distance=0.0,
        fog_falloff=0.0,
        wetness=0.0,
    )
    world.set_weather(weather)
    logger.info("Set default clear daytime weather for camera visibility")
    
    return int(vehicle.id)
```

This alone should fix 80% of the darkness problem.

### Fix 2: Ensure Camera Post-Processing is Enabled [BRIDGE]

**File**: `carla-web-bridge/src/realtime_session.py`

When spawning the camera sensor, ensure `enable_postprocess_effects` is `true`:

```python
self._camera_id = await self._sensor_manager.spawn_sensor(
    "sensor.camera.rgb",
    transform={...},
    parent_id=self._vehicle_id,
    attributes={
        "image_size_x": DEFAULT_CAMERA_WIDTH,
        "image_size_y": DEFAULT_CAMERA_HEIGHT,
        "fov": DEFAULT_CAMERA_FOV,
        "sensor_tick": DEFAULT_CAMERA_SENSOR_TICK,
        "enable_postprocess_effects": "true",    # ← CRITICAL
        "gamma": "2.2",                           # ← Standard sRGB gamma
        "exposure_mode": "histogram",             # ← Auto-exposure (if available)
        "exposure_compensation": "0.0",           # ← No manual bias
    },
)
```

Available camera attributes for exposure control (check CARLA docs for your version):
- `enable_postprocess_effects`: "true" / "false" — MUST be "true"
- `gamma`: "2.2" (default) — standard sRGB gamma correction
- `exposure_mode`: "histogram" or "manual"
- `exposure_compensation`: float, 0.0 = neutral, positive = brighter
- `exposure_min_bright`: minimum brightness for auto-exposure
- `exposure_max_bright`: maximum brightness for auto-exposure

### Fix 3: Increase Camera Resolution [BRIDGE]

**File**: `carla-web-bridge/src/config.py`

Current defaults are 320x240 which is unacceptably low:

```python
DEFAULT_CAMERA_WIDTH: int = int(os.getenv("DEFAULT_CAMERA_WIDTH", "1280"))
DEFAULT_CAMERA_HEIGHT: int = int(os.getenv("DEFAULT_CAMERA_HEIGHT", "720"))
DEFAULT_CAMERA_SENSOR_TICK: str = os.getenv("DEFAULT_CAMERA_SENSOR_TICK", "0.05")  # 20 FPS
```

After changing, the existing camera sensor must be destroyed and re-created. Call:
```bash
curl -X POST http://127.0.0.1:58337/api/simulation/reload
```

Or add a `/api/realtime/reset` endpoint that destroys and re-creates the session.

### Fix 4: Increase CARLA Viewport Resolution [STARTUP SCRIPT]

**File**: `start_streaming.sh`

Change the CARLA launch parameters:
```bash
# Before (low res):
-ResX=640 -ResY=480

# After (match camera resolution):
-ResX=1280 -ResY=720
```

This affects the offscreen render target size. A larger viewport can improve scene capture quality even though the sensor resolution is set independently.

### Fix 5: Remove the Normalization Hack [BRIDGE]

**File**: `carla-web-bridge/src/compression/image.py`

Once the above fixes make CARLA produce properly-lit frames, REMOVE the `_normalize_low_light_bgra` method entirely:

```python
# DELETE this entire method:
def _normalize_low_light_bgra(self, arr):
    ...

# And remove calls to it in _turbojpeg_encode and _pillow_encode:
# Before:
arr = self._normalize_low_light_bgra(arr)
# After:
# (just remove the line)
```

This hack amplifies noise and produces ugly washed-out colors. With proper lighting, it's unnecessary.

### Fix 6: Increase JPEG Quality [BRIDGE]

**File**: `carla-web-bridge/src/config.py`

```python
JPEG_QUALITY: int = int(os.getenv("JPEG_QUALITY", "85"))  # was 80
```

Higher quality = larger frames but better color accuracy, especially in shadow areas where JPEG quantization can crush dark details.

---

## Verification

After applying fixes, verify with raw pixel analysis:

```python
import carla, numpy as np, queue

c = carla.Client('localhost', 58338)
c.set_timeout(10)
w = c.get_world()

# Check weather
weather = w.get_weather()
print(f"Sun altitude: {weather.sun_altitude_angle}")  # Should be > 30
print(f"Cloudiness: {weather.cloudiness}")            # Should be < 50

# Get a raw frame
actors = w.get_actors()
cam = [a for a in actors if 'camera.rgb' in a.type_id][0]
q_frames = queue.Queue()
cam.listen(lambda img: q_frames.put(img))
img = q_frames.get(timeout=5)
cam.stop()

raw = np.frombuffer(img.raw_data, dtype=np.uint8).reshape(img.height, img.width, 4)
r, g, b = raw[:,:,2], raw[:,:,1], raw[:,:,0]

brightness = (r.astype(float) + g.astype(float) + b.astype(float)).mean() / 3
print(f"Mean brightness: {brightness:.1f}")  # Should be > 40 for a daylight scene
print(f"R: mean={r.mean():.1f} max={r.max()}")
print(f"G: mean={g.mean():.1f} max={g.max()}")
print(f"B: mean={b.mean():.1f} max={b.max()}")

dark_pct = ((r.astype(int) + g.astype(int) + b.astype(int)) < 30).mean() * 100
print(f"Dark pixels: {dark_pct:.1f}%")  # Should be < 50% for a daylight scene
```

**Expected results after fix:**
- Mean brightness > 40 (was 0.2)
- Dark pixels < 50% (was 99.6%)
- R/G/B channels have reasonable range (mean > 30)

**Playwright visual verification:**
- Camera feed shows recognizable CARLA scene: roads, buildings, sky, vegetation
- Colors are natural — not washed out, not neon, not all-gray
- Sky is visible (blue/white, not black)
- Road surface is visible (gray, not black)
- Buildings have distinct colors and textures
- Shadows exist but don't crush to pure black

---

## What NOT To Do

- **Do NOT just multiply all pixels by a constant gain** — that washes out highlights and amplifies noise
- **Do NOT add a CSS brightness/contrast filter on the canvas** — that masks the symptom, doesn't fix the source
- **Do NOT change UE5 C++ source code** — fix via weather settings, camera attributes, and launch parameters
- **Do NOT disable post-processing** — that makes things WORSE (no tonemapping = no proper exposure)

## Summary

The fix order is:
1. Set clear weather → instant daylight
2. Enable camera post-processing + auto-exposure → camera adapts to scene
3. Increase resolution → 1280x720
4. Increase viewport → match camera
5. Remove normalization hack → clean colors
6. Increase JPEG quality → preserve shadow detail

Steps 1-2 are the critical ones. Steps 3-6 are quality improvements.
