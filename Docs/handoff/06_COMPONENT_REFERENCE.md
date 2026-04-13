# Component Reference — 전체 컴포넌트 상세 설명

## Layout Components (`src/components/layout/`)

### `TopBar.tsx`
- 고정 높이 48px 헤더
- 포함 요소:
  - "CARLA Web" 로고 텍스트
  - 연결 상태 배지: `ConnectionBadge` (green=Connected, yellow=Connecting, red=Disconnected/Error)
  - 시뮬레이션 시간 (font-mono, `useRef` 직접 DOM 업데이트로 리렌더 방지)
  - 현재 tick 번호 (font-mono, `useRef`)
  - 현재 맵 이름 (`Badge`)
  - 활성 센서 수 (`Badge`, `useSensorStore.subscriptions.size`)
  - FPS 표시 (font-mono, `useRef`)
  - `SimulationControls` — Play/Pause/Step 버튼 + 속도 셀렉터 + Sync 토글
  - `WeatherControls` — 날씨 프리셋 + 14개 파라미터 슬라이더 (Popover)
  - `MapControls` — 맵 선택 + 로드 (Dialog)
  - `RecordingControls` — 녹화/재생 (Popover)
  - 키보드 단축키 도움말 (`?` 버튼 → Dialog)
  - 다크/라이트 테마 토글 (Sun/Moon 아이콘)
  - Settings 링크 (`/settings`)
- `useSimulationStore.subscribe()`로 tick/time 업데이트 (React 리렌더 없음)

### `StatusBar.tsx`
- 고정 높이 28px 푸터
- 포함 요소:
  - Latency (ms) — 색상 코딩: <50ms 초록, <100ms 노랑, >100ms 빨강
  - Bandwidth (KB/s 또는 MB/s)
  - Tick rate (Hz)
  - 현재 맵 이름
  - Sync/Async 배지
  - FPS + SVG 스파크라인 (최근 60개 값)
  - 연결 업타임 (Up: Xm XXs)
- `usePerformanceStore.subscribe()`로 업데이트 (React 리렌더 없음)

### `LeftPanel.tsx`
- 왼쪽 사이드바: 액터 목록 + 스폰 도구
- 기능:
  - 액터 검색 (Input, `/` 키보드 단축키로 포커스)
  - 타입 필터 버튼 (All / vehicle / walker / sensor)
  - `Collapsible` 그룹: Vehicles, Walkers, Sensors, Traffic Lights, Other
  - 각 그룹에 액터 수 Badge
  - 액터 클릭 → `actorStore.selectActor(id)`
  - 연결 시 로딩 중이면 `Skeleton` 5개 표시
  - 비연결 시 목데이터 6개 표시
  - `SpawnPanel` — 차량/보행자/센서 스폰 다이얼로그
  - `TrafficManagerPanel` — 트래픽 매니저 시트
  - "Destroy All" 버튼 (AlertDialog 확인)

### `RightPanel.tsx`
- 오른쪽 사이드바: 선택된 액터의 상세 정보
- `ActorDetails` 컴포넌트를 렌더링

### `BottomPanel.tsx`
- 하단 패널: 5개 탭
  - **Sensors** — `SensorPanel` (멀티 센서 그리드)
  - **Map** — `MiniMap` (2D 캔버스 액터 위치)
  - **Roads** — `OpenDriveViewer` (도로 네트워크)
  - **Telemetry** — 플레이스홀더
  - **Events** — `EventLog` (이벤트 로그, 필터링, CSV 내보내기)
- Events 탭에 이벤트 수 Badge 표시

### `ResizableLayout.tsx`
- `react-resizable-panels` 기반 4패널 레이아웃
- 수평: Left(12%) | Center(76%) | Right(12%)
- 수직 (Center 내부): Viewport(70%) | Bottom(30%)
- localStorage에 레이아웃 저장 (`LAYOUT_VERSION`으로 키 관리)
- **주의**: `collapsedSize` prop 사용 금지 (패널이 0%로 시작하는 버그)

---

## Viewport Components (`src/components/viewport/`)

### `MainViewport.tsx`
- 중앙 뷰포트 컨테이너
- 동작 순서:
  1. 연결 안 됨 → "Connect to a CARLA server" 플레이스홀더
  2. 연결됨 → PixelStreamingClient 시도 (5초 타임아웃)
  3. PS 실패 → CameraFallback으로 전환
  4. 스트리밍 중 → ViewportOverlay HUD 표시
- 풀스크린 토글 버튼 (좌상단)
- `localStorage.getItem("pixelStreamingUrl")` 또는 기본 `ws://localhost:58340`

### `PixelStreamingClient.tsx`
- UE5 Pixel Streaming WebRTC 클라이언트
- 시그널링 서버 → WebRTC negotiation → `<video>` 렌더링
- 마우스/키보드 입력을 RTCDataChannel로 전달
- **최대 3번 재시도** 후 포기 (Pixel Streaming 서버 없으면 콘솔 스팸 방지)
- `onConnectionChangeRef` / `onStatsRef`를 `useEffect`로 갱신 (React 19 ref 규칙)

### `CameraFallback.tsx`
- Pixel Streaming 실패 시 대체 뷰포트
- spectator RGB 카메라를 REST API로 스폰 (`sensor.camera.rgb`, 640x480)
- WebSocket으로 구독 → CameraView로 렌더링
- 스폰 실패 시 5초 후 자동 재시도
- 언마운트 시 센서 제거 + 구독 해제
- 우하단 "Camera Mode" 배지

### `ViewportOverlay.tsx`
- 투명 HUD 레이어 (`pointer-events-none`)
- 우상단: PS/CAM 모드 배지, FPS, 비트레이트, 지연시간
- 좌하단: 속도 (km/h) — 선택된 차량이 있을 때만
- 하단 중앙: 나침반 바 (N/NE/E/SE/S/SW/W/NW + 방향)
- 우하단: 좌표 (X, Y, Z)
- 좌상단: "Following #ID" 버튼 — 선택된 액터 있을 때
- 3초 마우스 비활동 시 자동 숨김 (`opacity: 0`, transition)
- 모든 수치 `useRef` + `useSimulationStore.subscribe()`로 업데이트

---

## Sensor Components (`src/components/sensors/`)

### `CameraView.tsx` (핵심)
- 모든 카메라 타입의 기본 컴포넌트
- `useCameraSensorData(sensorId)` → `bitmapRef`, `fpsRef`
- `requestAnimationFrame` 루프로 `ImageBitmap`을 `<canvas>`에 그림
- 첫 프레임 수신 전까지 "Waiting for sensor data..." 오버레이
- 해상도/FPS를 `useRef`로 표시 (React 리렌더 없음)
- 우클릭 `ContextMenu`: Save PNG, Save JPEG, Copy to Clipboard
- Props: `sensorId`, `label?`, `sensorType?`, `className?`

### Camera Variants (CameraView의 thin wrapper)
| 파일 | label | sensorType |
|------|-------|------------|
| `DepthView.tsx` | "Depth Camera" | `sensor.camera.depth` |
| `SegmentationView.tsx` | "Semantic Segmentation" | — (자체 UI + 범례 토글) |
| `InstanceSegView.tsx` | "Instance Segmentation" | `sensor.camera.instance_segmentation` |
| `OpticalFlowView.tsx` | "Optical Flow" | `sensor.camera.optical_flow` |
| `NormalsView.tsx` | "Surface Normals" | `sensor.camera.normals` |
| `DvsView.tsx` | "DVS Events" | `sensor.camera.dvs` |

### `LidarView.tsx` + `LidarScene.tsx`
- `LidarView`: Card 래퍼 + `ErrorBoundary` + `Suspense` + lazy `LidarScene`
- `LidarScene`: Three.js R3F 씬
  - `useLidarSensorData(sensorId)` → `positionsRef`, `colorsRef`, `pointCountRef`
  - `useState` 초기화자로 `Float32BufferAttribute` 한 번만 생성 (200K점 미리 할당)
  - `useFrame`에서 `positionAttr.array.set()` + `needsUpdate = true` + `setDrawRange`
  - **절대 프레임마다 새 geometry 생성하지 않음**
  - `OrbitControls` + `GizmoHelper` + `GridHelper`
  - 배경: `#0a0a0a`

### `RadarView.tsx`
- Canvas 2D 극좌표 플롯
- 동심원: 10m, 20m, 50m, 100m
- 방위각 선: 30도 간격
- 감지 포인트: 속도 기반 색상 (파랑=접근, 빨강=후퇴, 흰색=정지)
- `ResizeObserver`로 캔버스 자동 크기 조정

### `ImuChart.tsx`
- Recharts 기반 실시간 라인 차트
- `useImuSensorData(sensorId)` → `bufferRef`, `compassRef`
- 10Hz (100ms)로 버퍼를 Recharts 데이터로 플러시
- 가속도계 차트 (X/Y/Z) + 자이로스코프 차트 (X/Y/Z)
- 나침반 값 `useRef`로 표시
- `isAnimationActive={false}` (Recharts 애니메이션 비활성화)
- 슬라이딩 윈도우: 최근 200 샘플

### `GnssView.tsx`
- 위도/경도/고도 모노스페이스 표시
- Canvas 2D 위치 궤적 (최근 100개 위치, 페이딩 녹색 라인)
- `ResizeObserver`로 자동 크기 조정

### `CollisionLog.tsx`
- ScrollArea 기반 충돌 이벤트 목록
- 심각도 색상 바: 빨강(>1000N), 노랑(>100N), 초록(≤100N)
- 충돌 매개체 타입 + 임펄스 크기

### `LaneInvasionLog.tsx`
- ScrollArea 기반 차선 침범 이벤트 목록
- 마킹 타입 색상 바: 빨강(실선), 노랑(파선), 회색(기타)

### `SensorPanel.tsx`
- 멀티 센서 그리드 레이아웃
- 그리드 크기 선택: 1x1, 2x1, 2x2, 3x2, 3x3
- 빈 셀: 사용 가능한 센서 목록에서 선택
- 센서 셀: Maximize 버튼 (패널 전체 채움) + Remove 버튼
- 최대화 상태: `uiStore.maximizedSensorId`
- `ErrorBoundary`로 개별 센서 크래시 격리

---

## Actor Components (`src/components/actors/`)

### `ActorDetails.tsx`
- 선택된 액터의 상세 정보 (RightPanel에서 렌더링)
- 선택 안 됨 → "Select an actor" 플레이스홀더
- 헤더: 타입 아이콘 + type_id + ID 배지
- Accordion 섹션:
  - Transform: X/Y/Z 위치, P/Y/R 회전 (readonly Input)
  - Velocity: 속도 (km/h), 속도 벡터
  - Vehicle Controls: `VehicleDetails` (차량 타입일 때)
  - Sensor Config: `SensorDetails` (센서 타입일 때)
- 액션:
  - "Teleport Spectator Here" → `carlaApi.setSpectator(actor.transform)`
  - "Destroy Actor" → AlertDialog 확인 → `actorStore.destroyActor(id)`

### `VehicleDetails.tsx`
- Autopilot Switch
- Throttle/Steer/Brake Slider (readonly, 현재 상태 표시)
- 8개 라이트 Toggle (Position, LowBeam, HighBeam, Brake, 방향지시등 등)
- 4개 도어 Button (FL, FR, RL, RR) + Open All

### `SensorDetails.tsx`
- 센서 타입 Badge
- Subscribe/Unsubscribe 토글 Button
- "Open in Sensor Panel" Button

### `TrafficManagerPanel.tsx`
- Sheet (오른쪽 슬라이드) 패널
- 글로벌 속도 차이 Slider (-50% ~ +50%)
- Hybrid Physics Switch
- 차량별 Table: ID, Type, Speed%, Auto Lane (Switch)
- "Set All Autopilot" / "Reset Defaults" 버튼

---

## Control Components (`src/components/controls/`)

### `SimulationControls.tsx`
- Play 버튼: 실행 중이면 초록색
- Pause 버튼: 일시정지면 노란색
- Step 버튼: sync 모드에서만 활성
- 속도 Select: 0.5x/1x/2x/5x/10x → `carlaApi.setSettings({fixed_delta: 0.05/multiplier})`
- Sync 모드 Switch
- Tooltip에 키보드 단축키 표시 (Space, N)

### `WeatherControls.tsx`
- Popover로 열림
- 프리셋 Select: 22개 (Noon/Sunset/Night/Special 그룹)
- Collapsible 고급 설정: 14개 슬라이더
- 각 슬라이더: debounce 300ms → `simulationStore.setWeather()`
- "Reset to Clear Noon" 버튼

### `SpawnPanel.tsx`
- Dialog로 열림
- 3개 탭: Vehicles, Walkers, Sensors
- Vehicle 탭:
  - Command (검색형 콤보박스)으로 블루프린트 선택
  - 블루프린트 수 표시
  - "Random Spawn Point" 버튼
  - XYZ 위치 Input + PYR 회전 Input
  - Autopilot Checkbox
  - "Spawn Vehicle" 버튼 + "Spawn 10 with Autopilot" 버튼
- Sensor 탭:
  - 센서 타입 Select (Cameras/LiDAR/Radar/IMU/GNSS/Event 그룹)
  - 부모 액터 Select
  - Transform Input
  - Auto-subscribe Checkbox

### `MapControls.tsx`
- Dialog로 열림
- Command 검색으로 맵 선택
- 현재 맵에 체크 아이콘 + "(current)" 표시
- "Load Map" 버튼 (Spinner 로딩 상태)
- 맵 레이어 Checkbox (Buildings, Foliage, Props 등 9개)

### `VehicleControls.tsx`
- 키보드 차량 제어 (enabled prop으로 활성화)
- WASD: throttle/brake/steer
- Space: handbrake
- R: reverse
- 20Hz (50ms)로 API 호출
- Input 요소에 포커스되면 비활성

---

## Map Components (`src/components/map/`)

### `MiniMap.tsx`
- Canvas 2D 탑뷰 맵
- 액터 표시: 차량=화살표(초록), 보행자=점(노랑), 센서=삼각형(시안)
- 선택된 액터: 파랑 + 하이라이트 링
- 팬: 마우스 드래그
- 줌: 스크롤 휠
- 클릭: 가장 가까운 액터 선택 (`actorStore.selectActor`)
- 좌상단: 액터 수
- 우하단: 범례 (색상 설명)
- 하단: 축척 바
- `requestAnimationFrame` 루프

### `OpenDriveViewer.tsx`
- Canvas 2D 도로 네트워크 시각화
- `GET /api/map/topology`에서 데이터 로드
- 도로 구간: 회색 폴리라인
- 교차로: 앰버 색상
- 줌/팬 지원
- Road ID 라벨 (고배율에서만)
- "Refresh" 버튼 + "Junctions" 체크박스

### `RouteEditor.tsx`
- 웨이포인트 목록 관리
- 웨이포인트 삭제/클리어
- "Compute Route" → `POST /api/map/route`
- "Apply" → onApply 콜백
- JSON 내보내기

---

## Shared Components (`src/components/shared/`)

### `CommandPalette.tsx`
- `CommandDialog`로 열림 (커스텀 이벤트 `open-command-palette` 수신)
- 그룹: Simulation (play/pause/step), Weather (프리셋), Navigation (map/spawn/settings)
- 실행 시 바로 동작 + toast 알림

### `ErrorBoundary.tsx`
- React Class Component
- 자식 컴포넌트 크래시 시 에러 카드 표시
- "Try Again" 버튼으로 복구
- LidarView, SensorPanel에서 사용

### `EventLog.tsx`
- 이벤트 타입: collision, lane_invasion, spawn, destroy, connection, weather, map
- 타입별 아이콘 + 색상 Badge
- 필터 ToggleGroup
- 자동 스크롤 Switch
- CSV 내보내기 Button
- Clear Button
- `useEventLog()` 훅으로 상태 관리

### `NumericReadout.tsx`
- `useRef` 기반 고성능 숫자 표시
- `useNumericReadout(precision)` → `{ ref, trendRef, setValue }`
- 트렌드 표시: 5% 이상 변화 시 ↑/↓ 화살표
- font-mono tabular-nums 스타일
