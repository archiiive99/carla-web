# 03 — Pixel Streaming Setup

Pixel Streaming lets the browser display **exactly** what Unreal Engine renders — Lumen GI, Nanite geometry, ray-traced reflections, dynamic weather, everything. The UE5 server encodes the viewport as H.264 video and streams it to the browser via WebRTC.

---

## 1. Enable Pixel Streaming Plugin

Edit the CARLA project file to add the Pixel Streaming plugins:

```bash
cd /home/$USER/carla
```

Edit `Unreal/CarlaUnreal/CarlaUnreal.uproject` and add these entries to the `"Plugins"` array:

```json
{
    "Name": "PixelStreaming",
    "Enabled": true
},
{
    "Name": "PixelStreamingPlayer",
    "Enabled": true
}
```

The `Plugins` array should look like this (existing entries + new ones):
```json
"Plugins": [
    {
        "Name": "Carla",
        "Enabled": true
    },
    {
        "Name": "PixelStreaming",
        "Enabled": true
    },
    {
        "Name": "PixelStreamingPlayer",
        "Enabled": true
    },
    ... (other existing plugins)
]
```

---

## 2. Rebuild CARLA with Pixel Streaming

After modifying the `.uproject`, rebuild:

```bash
cd /home/$USER/carla

# Reconfigure (picks up plugin change)
cmake -G Ninja -S . -B Build \
  --toolchain=$PWD/CMake/Toolchain.cmake \
  -DCMAKE_BUILD_TYPE=Release

# Rebuild
cmake --build Build -j$(nproc)

# Repackage (if using packaged deployment)
cmake --build Build --target package
```

---

## 3. Set Up the Signaling Server

The signaling server is a Node.js application that relays WebRTC connections between the UE5 server and browsers. It ships with UE5's Pixel Streaming samples.

### Locate it:

```bash
# It's inside your UE5 build:
SIGNALING_DIR="$CARLA_UNREAL_ENGINE_PATH/Samples/PixelStreaming/WebServers/SignallingWebServer"

# Verify it exists:
ls "$SIGNALING_DIR/cirrus.js"
```

If the directory doesn't exist (some UE5 forks strip samples), install the standalone version:

```bash
cd /home/$USER
git clone https://github.com/EpicGames/PixelStreamingInfrastructure.git
cd PixelStreamingInfrastructure/SignallingWebServer
npm install
SIGNALING_DIR="$(pwd)"
```

### Install dependencies:

```bash
cd "$SIGNALING_DIR"
npm install
```

### Configure:

Create or edit `config.json` in the signaling server directory:

```json
{
    "HttpPort": 42680,
    "StreamerPort": 42688,
    "SFUPort": 42689,
    "MaxPlayerCount": -1,
    "LogToFile": true
}
```

| Port | Purpose |
|------|---------|
| 42680 | HTTP — serves the Pixel Streaming player page and handles WebRTC signaling |
| 42688 | Stream — UE5 server connects here to push its video stream |
| 42689 | SFU — Selective Forwarding Unit for multi-viewer (optional) |

---

## 4. Launch Pixel Streaming

You need to start **two processes**: the signaling server and the CARLA server with Pixel Streaming flags.

### Terminal 1: Signaling Server

```bash
cd "$SIGNALING_DIR"
node cirrus.js \
  --HttpPort 42680 \
  --StreamerPort 42688
```

Expected output:
```
Http listening on *:42680
Streamer listening on *:42688
```

### Terminal 2: CARLA Server with Pixel Streaming

```bash
cd /home/$USER/carla/Build/Package

./CarlaUnreal.sh \
  -PixelStreamingIP=127.0.0.1 \
  -PixelStreamingPort=42688 \
  -RenderOffScreen \
  -ResX=1920 -ResY=1080 \
  -GraphicsAdapter=0 \
  -nosound \
  -unattended
```

**Flag reference:**

| Flag | Purpose |
|------|---------|
| `-PixelStreamingIP` | IP of the signaling server |
| `-PixelStreamingPort` | Stream port on the signaling server |
| `-RenderOffScreen` | No local window (headless GPU rendering) |
| `-ResX` / `-ResY` | Rendering resolution |
| `-GraphicsAdapter=0` | Use first GPU (for multi-GPU systems) |
| `-nosound` | Disable audio (reduces CPU usage) |
| `-unattended` | No interactive prompts |

### Verify:

1. Open `http://localhost:42680` in a browser
2. You should see the UE5 Pixel Streaming player page
3. Click "Click to start" — you should see the CARLA simulation rendered in real-time
4. Mouse/keyboard input should control the spectator camera

---

## 5. Performance Tuning

### Encoder Settings

Add these flags to the CARLA launch command for better streaming performance:

```bash
./CarlaUnreal.sh \
  -PixelStreamingIP=127.0.0.1 \
  -PixelStreamingPort=42688 \
  -RenderOffScreen \
  -ResX=1920 -ResY=1080 \
  -PixelStreamingEncoderRateControl=CBR \
  -PixelStreamingEncoderTargetBitrate=15000000 \
  -PixelStreamingEncoderMinQP=0 \
  -PixelStreamingEncoderMaxQP=51 \
  -PixelStreamingWebRTCFps=30 \
  -nosound -unattended
```

| Setting | Value | Effect |
|---------|-------|--------|
| RateControl CBR | Constant bitrate | More predictable bandwidth |
| TargetBitrate 15M | 15 Mbps | Good quality at 1080p30 |
| WebRTCFps 30 | 30 FPS cap | Reduces GPU encoding load |

### For Low Bandwidth (< 10 Mbps):

```bash
-ResX=1280 -ResY=720 \
-PixelStreamingEncoderTargetBitrate=5000000 \
-PixelStreamingWebRTCFps=24
```

### For High Quality LAN:

```bash
-ResX=2560 -ResY=1440 \
-PixelStreamingEncoderTargetBitrate=30000000 \
-PixelStreamingWebRTCFps=60
```

---

## 6. Multi-Viewer Support

By default, Pixel Streaming supports **one viewer at a time**. For multiple simultaneous viewers, enable the SFU (Selective Forwarding Unit):

The signaling server handles this automatically when multiple clients connect. Each client gets its own WebRTC stream re-encoded from the single source.

To explicitly enable SFU mode:
```bash
node cirrus.js \
  --HttpPort 42680 \
  --StreamerPort 42688 \
  --SFUPort 42689 \
  --UseMatchmaker false
```

**Note:** Each additional viewer adds ~30% CPU load for re-encoding. For 5+ viewers, consider running multiple CARLA instances behind a load balancer.

---

## 7. Frontend Integration

The CARLA Web frontend (built in Prompts 01-09) connects to Pixel Streaming via the signaling server URL.

In the frontend configuration, set:
```
PIXEL_STREAMING_URL=ws://localhost:42680
```

The `PixelStreamingClient.tsx` component:
1. Connects to the signaling server WebSocket at `ws://localhost:42680`
2. Performs WebRTC handshake (SDP offer/answer + ICE candidates)
3. Receives H.264 video stream
4. Renders to a `<video>` element
5. Forwards mouse/keyboard input back through the WebRTC data channel

---

## 8. Troubleshooting

### "Pixel Streaming is not available" in UE5 logs
→ Plugin not enabled. Verify `CarlaUnreal.uproject` has `PixelStreaming` in the plugins list and rebuild.

### Signaling server shows "Streamer disconnected"
→ CARLA server can't reach the signaling server. Check:
- Signaling server is running on the correct port
- `-PixelStreamingPort` matches `--StreamerPort`
- No firewall blocking the connection

### Browser shows black screen
→ Check browser console for WebRTC errors. Common causes:
- HTTPS required for some browsers (use `--HttpsPort` on signaling server)
- Hardware video decode disabled in browser (check `chrome://gpu`)
- Wrong codec: try adding `-PixelStreamingEncoderCodec=H264` to CARLA flags

### High latency (> 200ms)
→ Reduce resolution and bitrate. Check if GPU is thermal throttling (`nvidia-smi -l 1`).

### Multiple viewers cause lag
→ Each viewer adds encoding overhead. Reduce resolution or use fewer concurrent viewers.

---

Proceed to [04 — CARLA Python API](04_carla_python_api.md).
