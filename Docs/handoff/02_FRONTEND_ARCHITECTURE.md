# Frontend Architecture — `carla-web/`

## Tech Stack

- **Vite 8** — 빌드 + 개발 서버
- **React 19** — UI (StrictMode 제거됨 — Worker 중복 생성 방지)
- **TypeScript** — strict mode
- **Tailwind CSS v4** — `@tailwindcss/vite` 플러그인
- **shadcn/ui v4** — base-ui 기반 (Radix가 아님! `asChild` 대신 `render` prop 사용)
- **Zustand** — 상태 관리 (5개 store)
- **react-router-dom** — SPA 라우팅
- **Web Workers** — 4개, 센서 데이터 처리
- **Three.js** — LiDAR 점군 렌더링 (lazy loaded)
- **Recharts** — IMU 차트 (lazy loaded)

## 디렉토리 구조

```
carla-web/src/
├── main.tsx              # 엔트리 포인트 (BrowserRouter)
├── App.tsx               # Routes + Toaster + TooltipProvider
├── index.css             # Tailwind + OKLch zinc 다크 테마
├── routes/
│   ├── SimulationPage.tsx # 메인 시뮬레이션 페이지
│   └── SettingsPage.tsx   # 설정 페이지
├── components/
│   ├── ui/               # shadcn 컴포넌트 44개 (건드리지 말 것)
│   ├── layout/           # TopBar, StatusBar, LeftPanel, RightPanel, BottomPanel, ResizableLayout
│   ├── viewport/         # MainViewport, PixelStreamingClient, CameraFallback, ViewportOverlay
│   ├── sensors/          # CameraView, LidarView, LidarScene, RadarView, ImuChart, GnssView 등 15개
│   ├── controls/         # SimulationControls, WeatherControls, SpawnPanel, VehicleControls, MapControls
│   ├── actors/           # ActorDetails, VehicleDetails, SensorDetails, TrafficManagerPanel
│   ├── map/              # MiniMap, OpenDriveViewer, RouteEditor
│   ├── scenario/         # RecordingControls
│   └── shared/           # CommandPalette, NumericReadout, EventLog, ErrorBoundary
├── contexts/
│   └── WorkerContext.tsx  # 4개 Worker를 Context로 제공
├── stores/
│   ├── simulationStore.ts # 연결 상태, 날씨, play/pause/step
│   ├── actorStore.ts      # 액터 Map, 선택, spawn/destroy
│   ├── sensorStore.ts     # 센서 구독, spawn (글로벌 worker ref 사용)
│   ├── uiStore.ts         # 패널 상태, 테마, localStorage 영속
│   └── performanceStore.ts # FPS, 대역폭, 지연시간, 피크 추적
├── hooks/
│   ├── useSensorData.ts   # 6개 훅: camera, lidar, imu, gnss, radar, collision, laneInvasion
│   ├── useKeyboardShortcuts.ts # Space/N/B/Escape/Cmd+K
│   ├── usePerformanceMonitor.ts # RAF 기반 FPS 추적
│   ├── useConnectionHealth.ts  # 10초 폴링으로 Bridge 상태 확인 + 자동 연결
│   ├── useAnimationFrame.ts
│   ├── useDocumentVisibility.ts
│   ├── useInterval.ts
│   ├── useLocalStorage.ts
│   ├── useMediaQuery.ts
│   ├── usePrevious.ts
│   └── useResizeObserver.ts
├── workers/
│   ├── ws-receiver.worker.ts     # WebSocket 연결 + 바이너리 파싱 + 라우팅
│   ├── image-decoder.worker.ts   # JPEG → ImageBitmap
│   ├── lidar-processor.worker.ts # 점군 다운샘플 + 높이 컬러링
│   └── telemetry-aggregator.worker.ts # 액터 변환 10Hz 배치
├── lib/
│   ├── carla-api.ts       # 30+ REST API 메서드 (fetch 래퍼)
│   ├── ws-protocol.ts     # 바이너리 프레임 인코더/디코더
│   ├── sensor-registry.ts # 센서 타입 → lazy 컴포넌트 매핑
│   ├── worker-ref.ts      # 글로벌 Worker 참조 (Zustand store용)
│   ├── data-export.ts     # PNG/JPEG/PLY/CSV/JSON 내보내기
│   ├── debounce.ts        # debounce + throttle 유틸
│   ├── format.ts          # 포맷팅 유틸 (속도, 좌표, 시간)
│   ├── detachable-window.ts # BroadcastChannel 기반 분리 창
│   └── utils.ts           # cn() (shadcn)
├── types/
│   ├── carla.ts           # CARLA 도메인 타입 (Actor, Weather, Sensor 등)
│   ├── ws.ts              # WebSocket 채널/프레임 타입
│   └── api.ts             # REST API 요청/응답 타입
└── constants/
    └── index.ts           # 매직 넘버 중앙화
```

## 핵심 데이터 플로우

```
CARLA Server
  → Bridge (JPEG 압축 + 바이너리 인코딩)
    → WebSocket (바이너리 프레임)
      → ws-receiver.worker (채널별 라우팅)
        ├── imagePort → image-decoder.worker → ImageBitmap → useCameraSensorData → CameraView canvas
        ├── lidarPort → lidar-processor.worker → Float32Array → useLidarSensorData → LidarScene useFrame
        ├── telemetryPort → telemetry-aggregator.worker → actorStore → MiniMap/LeftPanel
        └── main thread sensor_event →
              ├── useImuSensorData → ImuChart
              ├── useGnssSensorData → GnssView
              ├── useRadarSensorData → RadarView
              └── useCollisionData → CollisionLog
```

## 중요: shadcn/ui v4 주의사항

이 프로젝트의 shadcn/ui는 **base-ui 기반 v4**입니다. Radix 기반 v3과 다릅니다:

- **`asChild` 프롭 없음** → 대신 `render` 프롭 사용
  ```tsx
  // ❌ 안 됨
  <DialogTrigger asChild><Button>Open</Button></DialogTrigger>

  // ✅ 올바른 방법
  <DialogTrigger render={<Button>Open</Button>} />
  ```
- **Tooltip**: `TooltipTrigger`도 `render` 프롭 사용
- **Select**: `onValueChange`가 `string | null` 반환 (null 체크 필요)
- **Slider**: `onValueChange`가 `number | readonly number[]` 반환
- **Accordion**: `type="multiple"` 대신 `multiple` 불리언 프롭

## ResizablePanel 주의사항

`react-resizable-panels` 라이브러리:
- `collapsedSize={0}` 사용하면 **패널이 초기에 0%로 시작** → 사용 금지
- `collapsible`만 쓰면 정상 작동
- `defaultLayout`은 `{ [panelId]: flexGrow }` 형태
- localStorage에 레이아웃 캐시됨 → `LAYOUT_VERSION` 상수로 키 관리

## 빌드

```bash
cd carla-web
npm run build      # Vite 빌드 (~1.5초)
npx tsc --noEmit   # 타입 체크
npx playwright test # E2E 테스트 (33개)
```
