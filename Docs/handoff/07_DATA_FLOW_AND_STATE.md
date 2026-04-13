# Data Flow & State Management — 완전 가이드

## 전체 데이터 플로우 다이어그램

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CARLA UE5 Server                                  │
│  - 물리 시뮬레이션, 렌더링, 센서 데이터 생성                                 │
│  - RPC Port: 58338 / Streaming Port: 58339                                  │
└────────────┬────────────────────────────────────────────────────────────────┘
             │ carla Python API (TCP, MessagePack)
             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Python Bridge (FastAPI)                               │
│                                                                             │
│  carla_client.py ◄──── 5초마다 heartbeat, 자동 재연결                        │
│       │                                                                     │
│       ├── sensor_manager.py                                                 │
│       │     sensor.listen(callback)                                         │
│       │       ├── Camera: BGRA → TurboJPEG 압축 → 바이너리 프레임            │
│       │       ├── LiDAR: raw Float32 → 바이너리 프레임                       │
│       │       ├── IMU/GNSS/Radar: struct.pack → 바이너리 프레임              │
│       │       └── Collision/Lane: struct.pack → 바이너리 프레임               │
│       │                                                                     │
│       ├── ws_broadcaster.py ──── 클라이언트별 구독 관리                       │
│       │     broadcast_sensor_data() / broadcast_world_tick()                │
│       │                                                                     │
│       └── _world_tick_loop() ──── 20Hz, 모든 액터 transform 브로드캐스트      │
│                                                                             │
│  REST API (/api/*) ──── 30+ 엔드포인트                                      │
│  WebSocket (/ws) ──── 바이너리 멀티플렉스                                    │
└────────────┬──────────────────────────────────┬─────────────────────────────┘
             │ REST (fetch)                      │ WebSocket (binary frames)
             ▼                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        React Frontend (Browser)                              │
│                                                                             │
│  ┌─── carla-api.ts ◄────────── REST 요청 (fetch, typed)                     │
│  │      30+ 메서드                                                          │
│  │                                                                          │
│  ├─── WorkerContext.tsx ──── 4개 Worker 생성 + MessageChannel 와이어링        │
│  │      │                                                                   │
│  │      ├── ws-receiver.worker ◄──── WebSocket 연결, 바이너리 파싱            │
│  │      │     │  채널 0x01-0x03 ──imagePort──▶ image-decoder.worker          │
│  │      │     │  채널 0x04-0x05 ──lidarPort──▶ lidar-processor.worker        │
│  │      │     │  채널 0x10 ──telemetryPort──▶ telemetry-aggregator.worker     │
│  │      │     │  채널 0x06-0x0A ──postMessage──▶ main thread (sensor_event)   │
│  │      │     └  상태/통계 ──postMessage──▶ main thread (status/stats)        │
│  │      │                                                                   │
│  │      ├── image-decoder.worker                                            │
│  │      │     JPEG ArrayBuffer → createImageBitmap → postMessage(bitmap)    │
│  │      │     ──▶ useCameraSensorData() → bitmapRef → CameraView canvas     │
│  │      │                                                                   │
│  │      ├── lidar-processor.worker                                          │
│  │      │     Float32 raw → downsample(200K) + height color → Float32Array  │
│  │      │     ──▶ useLidarSensorData() → positionsRef → LidarScene useFrame │
│  │      │                                                                   │
│  │      └── telemetry-aggregator.worker                                     │
│  │            world tick → batch 10Hz → actor transforms                     │
│  │            ──▶ actorStore.updateActorTransforms()                         │
│  │            ──▶ simulationStore.updateFromTick()                           │
│  │                                                                          │
│  ├─── Zustand Stores ────────────────────────────────────────────────────── │
│  │      simulationStore: 연결, 날씨, play/pause, tick/time                  │
│  │      actorStore: Map<id, Actor>, 선택, spawn/destroy                     │
│  │      sensorStore: Map<id, Config>, 구독 Set                              │
│  │      uiStore: 패널 상태, 테마, localStorage 영속                          │
│  │      performanceStore: FPS, 대역폭, 지연시간, 피크                        │
│  │                                                                          │
│  └─── React Components ──────────────────────────────────────────────────── │
│         TopBar ◄── simulationStore (subscribe, no re-render)                │
│         StatusBar ◄── performanceStore (subscribe, no re-render)            │
│         LeftPanel ◄── actorStore.actors (re-render on change)               │
│         RightPanel ◄── actorStore.selectedActorId                           │
│         CameraView ◄── useCameraSensorData (ref, no re-render)              │
│         LidarScene ◄── useLidarSensorData (ref, useFrame)                   │
│         ImuChart ◄── useImuSensorData (ref → state flush 10Hz)              │
│         MiniMap ◄── actorStore.actors (RAF loop)                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 센서 구독 흐름 (상세)

### 구독 시작
```
1. 사용자가 SensorPanel에서 센서 셀 클릭
2. SensorPanel → sensorStore.subscribe(sensorId)
3. sensorStore → getGlobalWsWorker()로 Worker 참조 획득
4. Worker.postMessage({ type: "subscribe", data: { sensorId } })
5. ws-receiver.worker → ws.send(JSON.stringify({ action: "subscribe", sensor_id: N }))
6. Bridge ws_broadcaster → 해당 클라이언트의 구독 세트에 추가
7. Bridge sensor_manager → 콜백에서 구독자 있는 센서만 데이터 전송
8. 바이너리 프레임이 WebSocket으로 클라이언트에 전달
9. ws-receiver.worker → 채널별 MessagePort로 라우팅
10. 처리 Worker → main thread postMessage
11. useSensorData 훅 → ref 업데이트
12. Component → RAF/useFrame 루프에서 ref 읽어서 렌더링
```

### 구독 해제
```
1. SensorPanel에서 센서 셀 제거 또는 컴포넌트 언마운트
2. sensorStore.unsubscribe(sensorId)
3. → Worker.postMessage({ type: "unsubscribe", ... })
4. → Bridge가 해당 센서 스트리밍 중지
```

## Zustand Store 상세

### simulationStore
```typescript
// 상태
connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'
bridgeUrl: string              // 기본: "http://localhost:58337"
isRunning: boolean
isPaused: boolean
syncMode: boolean
currentTick: number            // world tick 번호
elapsedTime: number            // 시뮬레이션 경과 시간(초)
fixedDeltaSeconds: number
currentMap: string             // e.g. "Carla/Maps/Town10HD_Opt"
serverVersion: string          // e.g. "0.10.0"
weather: CarlaWeatherParams    // 14개 float 파라미터

// 액션
connect(bridgeUrl)             // URL 설정만 (폴링은 useConnectionHealth가 담당)
play() / pause() / step()     // REST API 호출 + 상태 업데이트
setWeather(params)             // 부분 업데이트, debounce는 컴포넌트 책임
setWeatherPreset(preset)       // 프리셋 적용 + 날씨 재로드
loadMap(name)                  // 맵 로드 (30초 타임아웃)
updateFromTick(tick, time)     // Worker에서 호출 (리렌더 최소화)
```

**연결 흐름**: `connect()` → "connecting" 설정 → `useConnectionHealth`가 10초마다 `/health` 폴링 → `carla_connected: true`면 "connected" + 초기 데이터 fetch

### actorStore
```typescript
// 상태
actors: Map<number, CarlaActor>  // 전체 액터 맵
selectedActorId: number | null
actorsByType: { vehicles: number[], walkers: number[], sensors: number[], ... }

// 액션
selectActor(id | null)
updateActorTransforms(batch)   // telemetry worker에서 10Hz 호출
spawnVehicle(config)           // REST → Map 업데이트 → toast
spawnWalker(config)
destroyActor(id)               // REST → Map에서 제거 → toast
spawnMultipleVehicles(count, blueprint)  // 배치 스폰
destroyAll()                   // 전체 제거
refreshActors()                // GET /api/actors → 전체 동기화
applyControl(id, control)      // throttle/steer/brake
setAutopilot(id, enabled)
```

### sensorStore
```typescript
// 상태
sensors: Map<number, SensorConfig>  // 메타데이터만 (프레임 데이터는 절대 여기 안 들어감!)
subscriptions: Set<number>

// 액션
subscribe(sensorId)    // Worker에 WS subscribe 메시지 전송 + Set에 추가
unsubscribe(sensorId)  // Worker에 unsubscribe 전송 + Set에서 제거
spawnSensor(config)    // REST → Map 추가
destroySensor(id)      // unsubscribe + REST destroy + Map 제거
```

**중요**: 센서 **프레임 데이터**는 이 store를 절대 거치지 않음. `useSensorData` 훅의 `useRef`로만 전달.

### uiStore
```typescript
// 상태 (localStorage 영속)
leftPanelOpen: boolean
rightPanelOpen: boolean
bottomPanelOpen: boolean
bottomPanelTab: 'sensors' | 'map' | 'roads' | 'telemetry' | 'events'
theme: 'dark' | 'light'
maximizedSensorId: number | null
actorSelectionHistory: number[]
sensorGridLayout: string[][]
```

### performanceStore
```typescript
fps: number                    // RAF 기반
latency: number                // ms
bandwidth: number              // bytes/s (Worker stats에서)
droppedFrames: number
peakFps / peakBandwidth / peakLatency  // 최대값 추적
connectedSince: number | null  // Date.now() 타임스탬프
totalFramesReceived: number
sensorFps: Record<number, number>  // 센서별 FPS
fpsHistory: number[]           // 최근 60개 (스파크라인용)
```

## Worker 통신 프로토콜

### Main Thread → ws-receiver.worker
```typescript
// 연결
{ type: "connect", data: { url, imagePort, lidarPort, telemetryPort } }
// 연결 해제
{ type: "disconnect", data: {} }
// 센서 구독
{ type: "subscribe", data: { sensorId: number } }
// 센서 구독 해제
{ type: "unsubscribe", data: { sensorId: number } }
```

### ws-receiver.worker → Main Thread
```typescript
// 연결 상태
{ type: "status", status: "connecting" | "connected" | "disconnected" | "error" }
// 통계 (1초마다)
{ type: "stats", fps: number, bandwidth: number, frames: number }
// 센서 이벤트 (IMU/GNSS/Radar/Collision/Lane)
{ type: "sensor_event", channel: number, payload: ArrayBuffer }
```

### image-decoder.worker → Main Thread
```typescript
{ type: "camera", sensorId: number, frame: number, width: number, height: number, bitmap: ImageBitmap }
// bitmap은 Transferable로 전송 (zero-copy)
```

### lidar-processor.worker → Main Thread
```typescript
{ type: "lidar", sensorId: number, frame: number, pointCount: number, positions: Float32Array, colors: Float32Array }
// positions.buffer, colors.buffer는 Transferable로 전송
```

### telemetry-aggregator.worker → Main Thread
```typescript
{ type: "tick", frame: number, timestamp: number, actors: ActorTransform[] }
// 10Hz로 배치 전송
```

## 성능 고려사항

### 절대 하면 안 되는 것
1. **센서 프레임 데이터를 React state에 넣지 말 것** — `useRef`만 사용
2. **센서 프레임 데이터를 Zustand store에 넣지 말 것** — 리렌더 폭발
3. **프레임마다 Three.js BufferGeometry 새로 만들지 말 것** — GPU 메모리 누수
4. **`setInterval`로 렌더링하지 말 것** — `requestAnimationFrame` 사용
5. **JSON으로 센서 데이터 시리얼라이즈하지 말 것** — 바이너리 ArrayBuffer 사용

### 해야 하는 것
1. 고빈도 수치 표시 (FPS, tick, 좌표) → `useRef` + `element.textContent` 직접 조작
2. Store 구독 → `store.subscribe()` 사용 (컴포넌트 리렌더 없이 DOM 직접 업데이트)
3. Worker에서 main thread로 대용량 데이터 → `Transferable` 사용 (zero-copy)
4. Three.js 속성 업데이트 → `attr.needsUpdate = true` + `geo.setDrawRange()`
5. 이미지 디코딩 → Worker에서 `createImageBitmap()` (main thread 블로킹 방지)
