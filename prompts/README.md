# CARLA Web Prompts

AI 에이전트(omx, codex 등)가 CARLA 웹 버전 구현 시 참조하는 가이드 문서 모음.

## 문서 목록

| File | Purpose |
|------|---------|
| `00-overview.md` | 프로젝트 아키텍처 전체 개요, 데이터 흐름, 포트/경로 맵 |
| `01-bridge-backend.md` | carla-web-bridge Python 백엔드 완전 해부 (모든 파일, 함수, 프로토콜) |
| `02-frontend.md` | carla-web React 프론트엔드 구조 (컴포넌트, 스토어, 워커, 타입) |
| `03-binary-protocol.md` | WebSocket 바이너리 프로토콜 바이트 레벨 명세 |
| `04-sensor-pipeline.md` | CARLA 센서 → JPEG 압축 → WebSocket → 브라우저 렌더링 전체 파이프라인 |
| `05-testing-checklist.md` | 레이어별 독립 테스트 + E2E 검증 체크리스트 (셀프 테스트용) |
| `06-common-pitfalls.md` | 자주 발생하는 오류와 해결법 |
| `07-multi-agent-guide.md` | 멀티 에이전트 분업 가이드 (omx team/ralph 모드) |
| `08-ui-constraints.md` | **[MANDATORY]** React + shadcn/ui + Tailwind 강제 제약조건 |
| `09-plan-b-threejs-renderer.md` | Plan B: UE5 렌더링 실패 시 Three.js 브라우저 렌더링 전환 가이드 |
| `10-self-evolving-guide.md` | Self-evolving 개발 루프 가이드 (HOT RELOAD, 작업 방식, 품질 규칙) |
| **specs/** | |
| `specs/phase0-camera-feed-must-work.md` | **[BLOCKER]** Phase 0: Camera feed MUST show real frames before anything else |
| `specs/phase1-ui-audit-and-fix.md` | Phase 1: shadcn audit, dark mode, raw HTML replacement |
| `specs/phase2-sensor-views.md` | Phase 2: 14개 센서 시각화 컴포넌트 명세 (데이터 훅, UI, 프로토콜) |
| `specs/phase3-3d-viewport.md` | Phase 3: Three.js 3D 뷰포트 명세 (Actor 메시, 카메라 모드, 좌표 변환) |
| `specs/phase4-control-panels.md` | Phase 4: 컨트롤 패널 명세 (날씨, 맵, 액터, 트래픽, 녹화) |
| `specs/phase5-ux-polish.md` | Phase 5: UX 명세 (Telemetry, HUD, 키보드, 반응형, 연결 UX) |
| `specs/phase6-advanced.md` | Phase 6: 고급 기능 명세 (녹화/재생, 내보내기, 시나리오, WS 최적화) |
| `specs/rendering-quality-fix.md` | **[CRITICAL]** 렌더링 어둠 문제 근본 원인 분석 + 해결 (날씨, 노출, 해상도) |
| `specs/realtime-vehicle-control.md` | **[CRITICAL]** WASD 실시간 차량 조작 구현 (키보드→REST→CARLA 20Hz 루프) |
| `specs/browser-native-rendering.md` | **[ARCHITECTURE]** JPEG 제거, Three.js 브라우저 네이티브 렌더링 전환 |
| `specs/ui-ux-50-improvements.md` | **[COMPREHENSIVE]** 50개 UI/UX 개선 항목 — 레이아웃, 카메라, 컨트롤, 비주얼, 데이터 |

## 사용법

에이전트에게 작업 시작 전 이 폴더를 먼저 읽으라고 지시:

```
Before writing any code, read all files in prompts/ directory to understand the architecture.
```
