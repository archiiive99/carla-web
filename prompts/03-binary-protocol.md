# WebSocket Binary Protocol Specification

## Frame Format

Every WebSocket message is a single binary frame:

```
┌──────────┬───────────────┬─────────────────────┐
│ Channel  │ Payload Len   │ Payload             │
│ 1 byte   │ 4 bytes LE    │ variable            │
└──────────┴───────────────┴─────────────────────┘
  offset 0    offset 1        offset 5
```

- **All multi-byte integers are LITTLE-ENDIAN** (`struct.pack("<...")` in Python, `view.getUint32(n, true)` in JS)
- Total frame size = 5 + payload_length

## Channel IDs

| ID | Name | Data Type |
|----|------|-----------|
| 0x01 | CAMERA | JPEG image |
| 0x02 | DEPTH | Colorized depth JPEG |
| 0x03 | SEGMENTATION | Palette-colored JPEG |
| 0x04 | LIDAR | Raw float32 point cloud |
| 0x05 | SEMANTIC_LIDAR | Annotated point cloud |
| 0x06 | RADAR | Detection array |
| 0x07 | IMU | Accelerometer + gyro + compass |
| 0x08 | GNSS | Lat/lon/alt |
| 0x09 | COLLISION | Collision event |
| 0x0A | LANE_INVASION | Lane crossing event |
| 0x0B | DVS | Dynamic vision sensor events |
| 0x10 | WORLD_TICK | All actor transforms |
| 0x11 | TELEMETRY | Performance data |
| 0xF0 | SUBSCRIBE | Client → server subscribe request |
| 0xF1 | UNSUBSCRIBE | Client → server unsubscribe |
| 0xFE | CLIENT_STATS | Client → server performance stats |
| 0xFF | CONTROL | Control commands |

## Payload Formats

### Camera (0x01, 0x02, 0x03)

```
┌────────────┬────────┬─────────┬────────┬───────────┬──────────────┐
│ sensor_id  │ width  │ height  │ frame  │ timestamp │ jpeg_data    │
│ uint32 LE  │ u32 LE │ u32 LE  │ u32 LE │ float64LE │ bytes        │
│ 4 bytes    │ 4      │ 4       │ 4      │ 8         │ variable     │
└────────────┴────────┴─────────┴────────┴───────────┴──────────────┘
  offset 0     4        8         12       16          24
```

Python: `struct.pack("<IIIId", sensor_id, width, height, frame, timestamp) + jpeg`
JS: header size = 4+4+4+4+8 = 24 bytes

### LiDAR (0x04, 0x05)

```
┌────────────┬─────────────┬────────┬───────────┬─────────────┐
│ sensor_id  │ point_count │ frame  │ timestamp │ raw_points  │
│ uint32 LE  │ uint32 LE   │ u32 LE │ float64LE │ float32[]   │
│ 4 bytes    │ 4           │ 4      │ 8         │ variable    │
└────────────┴─────────────┴────────┴───────────┴─────────────┘
```

- Standard LiDAR: 4 floats per point (x, y, z, intensity) = 16 bytes/point
- Semantic LiDAR: 6 floats per point = 24 bytes/point

### Radar (0x06)

```
┌────────────┬─────────────────┬────────┬───────────┬──────────────┐
│ sensor_id  │ detection_count │ frame  │ timestamp │ raw_data     │
│ uint32 LE  │ uint32 LE       │ u32 LE │ float64LE │ 16B/detect   │
└────────────┴─────────────────┴────────┴───────────┴──────────────┘
```

### IMU (0x07)

```
┌────────────┬────────┬───────────┬──────────────────┬─────────────────┬─────────┐
│ sensor_id  │ frame  │ timestamp │ accel (x,y,z)    │ gyro (x,y,z)    │ compass │
│ uint32 LE  │ u32 LE │ float64LE │ 3x float32 LE    │ 3x float32 LE   │ f32 LE  │
│ 4          │ 4      │ 8         │ 12               │ 12              │ 4       │
└────────────┴────────┴───────────┴──────────────────┴─────────────────┴─────────┘
```

Python format: `"<IId3f3ff"` = 4+4+8+12+12+4 = 44 bytes

### GNSS (0x08)

```
┌────────────┬────────┬───────────┬──────────┬──────────┬──────────┐
│ sensor_id  │ frame  │ timestamp │ latitude │ longitude│ altitude │
│ uint32 LE  │ u32 LE │ float64LE │ float64  │ float64  │ float64  │
│ 4          │ 4      │ 8         │ 8        │ 8        │ 8        │
└────────────┴────────┴───────────┴──────────┴──────────┴──────────┘
```

Python format: `"<IId3d"` = 4+4+8+24 = 40 bytes

### Collision (0x09)

```
┌────────────┬────────┬───────────┬──────────────┬──────────────────┐
│ sensor_id  │ frame  │ timestamp │ other_id     │ impulse (x,y,z)  │
│ uint32 LE  │ u32 LE │ float64LE │ uint32 LE    │ 3x float32 LE    │
└────────────┴────────┴───────────┴──────────────┴──────────────────┘
```

Python format: `"<IIdI3f"` = 4+4+8+4+12 = 32 bytes

### Lane Invasion (0x0A)

```
┌────────────┬────────┬───────────┬──────────┬─────────────────────┐
│ sensor_id  │ frame  │ timestamp │ count    │ marking_types       │
│ uint32 LE  │ u32 LE │ float64LE │ uint32   │ count x uint32 LE   │
└────────────┴────────┴───────────┴──────────┴─────────────────────┘
```

### World Tick (0x10)

```
┌────────┬───────────┬──────────────┬──────────────────────────────────┐
│ frame  │ timestamp │ actor_count  │ actors[N]                        │
│ u32 LE │ float64LE │ uint32 LE    │ N x actor_record                 │
└────────┴───────────┴──────────────┴──────────────────────────────────┘

actor_record (40 bytes each):
┌──────────┬───────────────────┬─────────────────────────┬───────────────────┐
│ actor_id │ pos (x,y,z)       │ rot (pitch,yaw,roll)    │ vel (x,y,z)       │
│ u32 LE   │ 3x float32 LE     │ 3x float32 LE           │ 3x float32 LE     │
│ 4        │ 12                │ 12                      │ 12                │
└──────────┴───────────────────┴─────────────────────────┴───────────────────┘
```

Python: header `"<IdI"` (16 bytes), per-actor `"<I9f"` (40 bytes)
JS: header 16 bytes, per-actor 40 bytes

## Subscribe/Unsubscribe Messages

### Text JSON (simple)
```json
{"action": "subscribe", "sensor_id": 123}
{"action": "unsubscribe", "sensor_id": 123}
```

### Binary (wrapped in frame)
Channel 0xF0 (Subscribe) or 0xF1 (Unsubscribe), payload is JSON text:
```
[0xF0][4B len][JSON utf-8 bytes]
```

## Critical Alignment Notes

1. **Byte order**: ALWAYS little-endian. Python `<` prefix, JS `true` for littleEndian parameter.
2. **float64 alignment**: `struct.pack("<IIIId", ...)` — the `d` (float64) starts at byte 16, properly aligned.
3. **Camera header size**: Exactly 24 bytes (4+4+4+4+8), then JPEG data follows.
4. **World tick header**: 16 bytes (4+8+4), then 40 bytes per actor.
5. If you change ANY field size or order, you MUST update BOTH backend protocol.py AND frontend ws-protocol.ts.
