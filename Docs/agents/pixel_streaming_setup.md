# UE5 Pixel Streaming Setup for CARLA Web

This guide explains how to enable and configure UE5 Pixel Streaming so the CARLA Web frontend can display the full 3D viewport in the browser with identical rendering quality to the native client.

---

## Prerequisites

- CARLA built from source with UE5 (see `build_linux_ue5.md`)
- NVIDIA GPU with NVENC support (for hardware video encoding)
- Node.js 18+ (for the signaling server)

---

## 1. Enable the Pixel Streaming Plugin

Edit the project file to include the Pixel Streaming plugin:

**File:** `Unreal/CarlaUnreal/CarlaUnreal.uproject`

Add to the `"Plugins"` array:

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

## 2. Rebuild CARLA

After enabling the plugin, rebuild:

```bash
# From the carla root
make CarlaUnreal
```

Or if using CMake:

```bash
cd Build && cmake --build . --target CarlaUnreal
```

## 3. Run CARLA with Pixel Streaming

Launch the CARLA server with Pixel Streaming arguments:

```bash
./Unreal/CarlaUnreal/Binaries/Linux/CarlaUnreal-Linux-Shipping \
  -PixelStreamingIP=0.0.0.0 \
  -PixelStreamingPort=8888 \
  -RenderOffScreen \
  -ResX=1920 -ResY=1080 \
  -GraphicsAdapter=0
```

Key parameters:

| Parameter | Description | Default |
|-----------|-------------|---------|
| `-PixelStreamingIP` | IP to bind the streaming server | `0.0.0.0` |
| `-PixelStreamingPort` | Port for Pixel Streaming | `8888` |
| `-RenderOffScreen` | No desktop window (headless GPU rendering) | — |
| `-ResX`, `-ResY` | Render resolution | `1920x1080` |
| `-GraphicsAdapter` | GPU index (multi-GPU systems) | `0` |
| `-NvEncFrameRateNum` | Target encode FPS numerator | `30` |
| `-NvEncFrameRateDen` | Target encode FPS denominator | `1` |
| `-PixelStreamingEncoderBitrate` | Max bitrate in bps | `20000000` (20 Mbps) |

## 4. Run the Signaling Server

UE5 includes a signaling server. It acts as a WebSocket relay between the browser and UE5.

```bash
# Navigate to the UE5 Pixel Streaming infrastructure
cd /path/to/UnrealEngine/Samples/PixelStreaming/WebServers/SignallingWebServer

# Install dependencies
npm install

# Run
node cirrus.js --httpPort 80 --streamPort 8888
```

Parameters:

| Parameter | Description | Default |
|-----------|-------------|---------|
| `--httpPort` | HTTP/WebSocket port for browser clients | `80` |
| `--streamPort` | Port to receive stream from UE5 | `8888` |
| `--peerConnectionOptions` | WebRTC config (STUN/TURN servers) | Built-in STUN |

The signaling server will:
1. Accept WebSocket connections from browsers on port 80
2. Accept the stream from UE5 on port 8888
3. Facilitate WebRTC negotiation between them

## 5. Configure the CARLA Web Frontend

In the CARLA Web frontend, the Pixel Streaming signaling URL is configured in the MainViewport component. The default is `ws://localhost:80`.

To change it, update `src/components/viewport/MainViewport.tsx`:

```typescript
const signalingUrl = "ws://your-server-ip:80";
```

Or make it configurable via the settings page / environment variable.

## 6. Network Architecture

```
Browser (CARLA Web)
  │
  ├── WebSocket ──→ Signaling Server (port 80)
  │                     │
  │                     ├── WebSocket ──→ UE5 CARLA (port 8888)
  │                     │
  │   WebRTC (P2P or TURN relay)
  ├── ◄─── Video stream ───► UE5 CARLA
  └── ──── Input events ───► UE5 CARLA
```

## 7. Fallback Behavior

If Pixel Streaming is unavailable (plugin not enabled, signaling server not running, network issues), the CARLA Web frontend automatically falls back to camera-based rendering after 5 seconds:

1. A high-resolution RGB camera is spawned via the REST API
2. Camera frames stream through the WebSocket sensor pipeline
3. Displayed on a `<canvas>` element
4. Spectator movement via WASD + mouse (API calls to move spectator actor)

This fallback has:
- Lower visual quality (JPEG compression artifacts)
- Higher latency (~100-200ms vs ~50ms for Pixel Streaming)
- Lower FPS (20-30 vs 30-60)
- No post-processing effects or real-time shadows

## 8. Troubleshooting

| Issue | Solution |
|-------|----------|
| Black screen | Check GPU supports NVENC. Run `nvidia-smi` to verify GPU is detected |
| "Connection refused" | Ensure signaling server is running on the correct port |
| High latency | Check network between browser and server. Use wired connection for LAN |
| Low FPS | Reduce resolution (`-ResX=1280 -ResY=720`) or increase bitrate |
| No audio | Audio streaming is disabled by default. Add `-PixelStreamingEnableAudio` if needed |
| CORS errors | Signaling server must allow the frontend origin. Check CORS headers |
| WebRTC fails behind NAT | Configure a TURN server in `--peerConnectionOptions` |

## 9. Performance Tuning

For optimal quality/latency balance:

```bash
# High quality, higher latency
-NvEncFrameRateNum=60 -PixelStreamingEncoderBitrate=40000000

# Low latency, lower quality
-NvEncFrameRateNum=30 -PixelStreamingEncoderBitrate=10000000 -NvEncMinQP=20

# Bandwidth-constrained (remote access)
-ResX=1280 -ResY=720 -NvEncFrameRateNum=24 -PixelStreamingEncoderBitrate=5000000
```
