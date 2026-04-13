# Known Issues & Gotchas

## CARLA 서버

### GPU 선택 불가
- `CUDA_VISIBLE_DEVICES`는 UE5 Vulkan 렌더러에 **안 먹힘**
- `-GraphicsAdapter=N`은 `libvulkan_lvp.so` (소프트웨어 렌더러) 크래시 유발
- **현재 해결책**: GPU 0을 사용 (UE5가 자동 선택하는 첫 번째 GPU)
- 다른 GPU 강제 사용 필요 시: Vulkan 디바이스 설정 필요 (`VK_ICD_FILENAMES` 등)

### CARLA 크래시 패턴
- **GPU VRAM 부족**: `Failed to allocate Device Memory` → 해상도 낮추기 (`-ResX=320 -ResY=240`)
- **Signal 11 (SIGSEGV)**: Vulkan 셰이더 컴파일 중 크래시 → 재시도하면 보통 해결
- **hang (프로세스 살아있지만 RPC 응답 없음)**: kill -9 후 재시작
- `run_carla.sh`에 자동 재시작(30초 헬스체크) 내장

### World 객체 stale
- CARLA 재시작 후 Bridge의 `world` 객체가 stale 상태
- `carla_client.py`에서 `world` 프로퍼티가 매번 `get_world()` 재호출하도록 수정됨
- 그래도 간혹 `std::exception` 발생 → Bridge 재시작 필요

## Frontend

### WebSocket 연결 폭주
- **원인**: React StrictMode에서 useEffect 2번 실행 → Worker 중복 생성
- **해결**: StrictMode 제거 + WorkerContext에 `initializedRef` 가드
- Worker는 `bridgeUrl` 변경 시만 재생성, `connectionStatus` 변경에는 재생성 안 함

### `collapsedSize={0}` 버그
- `react-resizable-panels`에서 `collapsedSize={0}`을 주면 패널이 0%로 시작
- **해결**: `collapsedSize` 프롭 제거, `collapsible`만 사용

### localStorage 캐시
- 패널 사이즈가 localStorage에 캐시됨
- `defaultSize` 변경해도 기존 캐시가 우선
- **해결**: `LAYOUT_VERSION` 상수 올려서 키 무효화
- 사용자에게 Ctrl+Shift+R 또는 `localStorage.clear()` 안내

### Pixel Streaming
- UE5 Pixel Streaming 플러그인이 빌드에 포함되지 않음
- PixelStreamingClient가 `ws://localhost:58340`에 연결 시도 → 실패
- 3번 재시도 후 포기 → CameraFallback으로 전환
- CameraFallback: spectator 카메라를 스폰하고 WebSocket으로 프레임 수신

## Bridge

### 센서 스폰 실패
- `spawn_sensor` 500 에러 → `world.get_blueprint_library()`에서 `std::exception`
- Bridge-CARLA 연결이 stale할 때 발생
- Bridge 재시작으로 해결

### CORS 주의
- `config.py`의 `CORS_ORIGINS`에 프론트엔드 URL 포함 필요
- 기본: `http://localhost:58336,http://127.0.0.1:58336`

### `--reload` 모드 포트 충돌
- `uvicorn --reload`로 실행 시 코드 변경하면 프로세스 재시작
- 간혹 `Address already in use` 에러 → 이전 프로세스가 포트 해제 안 됨
- `lsof -ti:58337 | xargs kill -9`로 해결
