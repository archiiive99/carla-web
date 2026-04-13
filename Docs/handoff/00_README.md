# CARLA Web — Handoff Documentation

이 폴더는 다른 에이전트/개발자가 이 프로젝트를 완전히 이해하고 이어서 작업할 수 있도록 작성된 문서입니다.

## 문서 목록

| # | 파일 | 내용 | 분량 |
|---|------|------|------|
| 01 | [PROJECT_OVERVIEW.md](./01_PROJECT_OVERVIEW.md) | 프로젝트 개요, 3개 서비스, 실행 방법, 파일 규모 | 개요 |
| 02 | [FRONTEND_ARCHITECTURE.md](./02_FRONTEND_ARCHITECTURE.md) | 프론트엔드 기술 스택, 디렉토리 구조, 데이터 플로우, **shadcn v4 주의사항**, ResizablePanel 주의사항 | 상세 |
| 03 | [BACKEND_ARCHITECTURE.md](./03_BACKEND_ARCHITECTURE.md) | 백엔드 설정, REST API 목록, **WebSocket 바이너리 프로토콜**, 센서 구독 흐름, CARLA 연결 관리 | 상세 |
| 04 | [KNOWN_ISSUES.md](./04_KNOWN_ISSUES.md) | GPU 이슈, CARLA 크래시 패턴, WebSocket 폭주, localStorage 캐시, Vulkan 문제 | 필독 |
| 05 | [ENVIRONMENT_SETUP.md](./05_ENVIRONMENT_SETUP.md) | 처음부터 세팅: 시스템 패키지, Node.js, Python, UE5, CARLA 빌드, npm/pip 의존성, **모든 버전 명시**, 포트 설정, 트러블슈팅 | 상세 |
| 06 | [COMPONENT_REFERENCE.md](./06_COMPONENT_REFERENCE.md) | **42개 커스텀 컴포넌트** 전체 상세 설명: props, 동작 방식, 주의사항 | 매우 상세 |
| 07 | [DATA_FLOW_AND_STATE.md](./07_DATA_FLOW_AND_STATE.md) | **전체 데이터 플로우 다이어그램**, 5개 Zustand store 상세, Worker 통신 프로토콜, **성능 고려사항** | 매우 상세 |
| 08 | [API_REFERENCE.md](./08_API_REFERENCE.md) | **30+ REST API 엔드포인트** 전체 요청/응답 예시, WebSocket 채널, 에러 코드 | 매우 상세 |

## 읽는 순서

1. **01 → 05** — 프로젝트가 뭔지, 어떻게 세팅하는지
2. **04** — 반드시 읽어야 할 알려진 문제들
3. **02 → 03** — 프론트/백엔드 구조
4. **07** — 데이터가 어떻게 흘러가는지 (핵심!)
5. **06 → 08** — 개발 시 참조

## 빠른 시작 (이미 세팅된 서버)

```bash
cd ~/carla
./run_carla.sh                    # CARLA 서버 (1~2분)
cd carla-web && ./run_local.sh    # Bridge + Frontend
# http://localhost:58336
```

## 빠른 시작 (새 서버)

`05_ENVIRONMENT_SETUP.md`를 처음부터 끝까지 따라하세요.
