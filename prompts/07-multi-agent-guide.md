# Multi-Agent Implementation Guide

## Overview

CARLA web 구현은 3개의 독립적인 레이어로 분리 가능:
1. **Backend Agent** — carla-web-bridge Python 코드
2. **Frontend Agent** — carla-web React/TypeScript 코드
3. **QA Agent** — 테스트, 검증, 모니터링

## omx Team Mode 분업 전략

### Agent 1: Bridge Engineer (Backend)
**Scope**: `carla-web-bridge/` 전체
**Responsibilities**:
- CARLA Python API 연결 안정화
- 센서 스폰/콜백/인코딩 파이프라인
- WebSocket 바이너리 프로토콜 구현
- REST API 엔드포인트
- TurboJPEG 압축 최적화
- CORS, 에러 핸들링

**Test command**:
```bash
cd carla-web-bridge && source .venv/bin/activate
python3 -c "import carla; c=carla.Client('localhost',58338); c.set_timeout(5); print(c.get_server_version())"
uvicorn src.main:app --host 0.0.0.0 --port 58337 --reload
curl http://localhost:58337/health
curl http://localhost:58337/api/realtime/session
```

**Success criteria**: `curl /health` returns `carla_connected: true`, `session_ready: true`

### Agent 2: UI Engineer (Frontend)
**Scope**: `carla-web/` 전체
**Responsibilities**:
- WebSocket 연결 및 바이너리 프레임 파싱
- Web Worker 기반 이미지 디코딩
- Camera feed 캔버스 렌더링
- Three.js 3D viewport (actor positions)
- Zustand 스토어 관리
- UI 컴포넌트/레이아웃

**Test command**:
```bash
cd carla-web && npm install && npx vite --port 58336 --host 0.0.0.0
# Open http://localhost:58336 in browser
# Check DevTools Console + Network → WS tab
```

**Success criteria**: 브라우저에서 라이브 카메라 피드 + 액터 위치 표시

### Agent 3: QA / Integration Tester
**Scope**: 전체 스택 검증
**Responsibilities**:
- 레이어별 독립 테스트 (05-testing-checklist.md 참조)
- E2E 스모크 테스트 실행
- 바이너리 프로토콜 바이트 정합성 확인
- 60초 안정성 테스트
- 메모리 누수 모니터링
- 에러 로그 분석

**Test command**:
```bash
# Run the smoke test from prompts/05-testing-checklist.md
# Monitor logs:
tail -f /tmp/bridge.log &
tail -f /tmp/frontend.log &
```

---

## omx Ralph Loop 셀프 테스트

Ralph 모드에서 에이전트가 스스로 반복적으로 테스트하면서 문제를 발견하고 수정하는 패턴:

### Ralph Loop 구현 단계

```
Phase 1: Diagnose
  → Read prompts/ docs to understand architecture
  → Check prerequisites (Layer 0)
  → Identify which layer is broken

Phase 2: Fix
  → Fix the identified issue
  → Write minimal test for the fix

Phase 3: Verify
  → Run layer-specific test
  → If pass → move to next layer
  → If fail → back to Phase 2

Phase 4: E2E
  → All layers passing independently
  → Run full stack (run_local.sh or manual)
  → Run smoke test
  → 60-second stability check

Phase 5: Polish
  → Review error handling
  → Check for memory leaks
  → Optimize frame rate
  → Clean up debug logs
```

### Ralph Loop 자동 실행 명령어

omx에 아래와 같이 전달:

```
Read all files in prompts/ to understand the architecture. Then execute a ralph loop:

1. Run prerequisite checks from prompts/05-testing-checklist.md Layer 0
2. Fix any missing dependencies
3. Start CARLA bridge and verify Layer 2 tests pass
4. Start frontend and verify Layer 4 tests pass
5. Run the Layer 3 WebSocket test script
6. Run the smoke test from prompts/05-testing-checklist.md
7. If any test fails, diagnose from prompts/06-common-pitfalls.md, fix, and re-run
8. Repeat until all tests pass and system is stable for 60 seconds

You have full permission to rewrite any file in carla-web-bridge/ and carla-web/.
```

---

## Team Mode 명령어 (omx team)

```bash
# omx team mode로 3 에이전트 동시 실행
omx team \
  --leader "Coordinate backend, frontend, and QA agents for CARLA web streaming. Read prompts/ first." \
  --agent backend "Fix and verify carla-web-bridge/. Read prompts/01-bridge-backend.md and prompts/04-sensor-pipeline.md first. Ensure bridge connects to CARLA, spawns vehicle+camera, and broadcasts JPEG frames over WebSocket." \
  --agent frontend "Fix and verify carla-web/. Read prompts/02-frontend.md first. Ensure WebSocket connects, frames are decoded in Web Worker, and rendered to canvas." \
  --agent qa "Run tests from prompts/05-testing-checklist.md. Report failures to leader. Verify binary protocol byte alignment using prompts/03-binary-protocol.md."
```

---

## Codex 단독 실행 명령어

```bash
codex --dangerously-bypass-approvals-and-sandbox \
  "Read all files in prompts/ directory first to understand the CARLA web architecture. \
   Then implement and test the full CARLA web streaming pipeline: \
   CARLA server (port 58338) → carla-web-bridge (port 58337) → carla-web (port 58336). \
   Follow the testing checklist in prompts/05-testing-checklist.md layer by layer. \
   If any layer fails, consult prompts/06-common-pitfalls.md for diagnosis. \
   You can fully rewrite files in carla-web-bridge/ and carla-web/. \
   Do not stop until browser shows live camera feed for 60+ seconds."
```

---

## 에이전트 간 인터페이스 계약

### Backend → Frontend 계약
- WebSocket endpoint: `ws://localhost:58337/ws`
- Binary protocol: `prompts/03-binary-protocol.md` 준수
- REST endpoint: `GET /api/realtime/session` → `{default_camera_id: number, session_ready: boolean}`
- Subscribe: JSON text message `{"action":"subscribe","sensor_id":<N>}`

### Frontend → Backend 계약
- WebSocket 연결 시 자동으로 `/api/realtime/session` 호출하여 camera_id 획득
- camera_id로 subscribe 메시지 전송
- World tick (0x10)은 subscribe 없이 자동 수신

### QA → Both 계약
- QA 에이전트는 코드 수정하지 않음
- 실패한 테스트와 에러 로그를 리포트
- 어느 레이어가 고장인지 명확하게 지정

---

## 작업 순서 의존성

```
CARLA Server (must be running first)
    │
    ├── Backend Agent starts here
    │   ├── [1] Prerequisites (carla import, turbojpeg)
    │   ├── [2] carla_client.py → connect to CARLA
    │   ├── [3] realtime_session.py → spawn vehicle + camera
    │   ├── [4] sensor_manager.py → callback + encode
    │   └── [5] ws_broadcaster.py → broadcast to clients
    │
    ├── Frontend Agent starts here (can work in parallel)
    │   ├── [1] ws-protocol.ts → frame parser
    │   ├── [2] ws-receiver.worker.ts → WebSocket + decode
    │   ├── [3] Camera component → canvas rendering
    │   └── [4] Stores → state management
    │
    └── QA Agent starts after both
        ├── [1] Layer-by-layer tests
        ├── [2] Protocol byte alignment check
        ├── [3] E2E smoke test
        └── [4] 60-second stability test
```

Backend [1-3]은 Frontend 작업과 **병렬** 가능. Backend [4-5]와 Frontend [2-3]은 프로토콜 호환이 필요하므로 `03-binary-protocol.md`를 공유 계약으로 사용.
