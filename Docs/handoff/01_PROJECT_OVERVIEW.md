# CARLA Web — Project Overview

## What This Is

CARLA Web은 CARLA 자율주행 시뮬레이터(UE5)를 웹 브라우저에서 제어하고 시각화하는 풀스택 애플리케이션입니다.

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  CARLA UE5      │────▶│  Python Bridge   │────▶│  React Frontend │
│  (시뮬레이터)    │     │  (FastAPI)       │     │  (Vite + React) │
│  Port: 58338    │     │  Port: 58337     │     │  Port: 58336    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
   GPU 렌더링             REST + WebSocket         브라우저 UI
```

## 3개 서비스

| 서비스 | 위치 | 기술 스택 | 포트 |
|--------|------|-----------|------|
| CARLA Server | UE5 바이너리 | Unreal Engine 5 + CARLA 플러그인 | 58338 (RPC), 58339 (streaming), 58340 (secondary) |
| Python Bridge | `carla-web-bridge/` | Python 3.10, FastAPI, uvicorn, WebSocket | 58337 |
| React Frontend | `carla-web/` | Vite 8, React 19, TypeScript, Tailwind v4, shadcn/ui v4, Zustand | 58336 |

## 실행 방법

```bash
# 1. CARLA 서버 (별도 터미널, 1~2분 소요)
cd ~/carla && ./run_carla.sh

# 2. Bridge + Frontend (별도 터미널)
cd ~/carla/carla-web && ./run_local.sh

# 3. 브라우저에서 접속
http://localhost:58336

# 종료
./kill_all.sh              # 전부
./run_carla.sh --kill      # CARLA만
Ctrl+C                    # Bridge+Frontend
```

## GPU 요구사항

- CARLA Town10HD: **~8-10GB VRAM** 필요
- 640x480 해상도: ~6-8GB
- `CUDA_VISIBLE_DEVICES`는 UE5 Vulkan에 안 먹힘 (GPU 0을 강제로 사용)
- `-GraphicsAdapter=N` 플래그도 이 환경에서는 lavapipe 크래시 유발
- **결론: GPU 0에 여유 VRAM이 8GB 이상 있어야 함**

## 파일 규모

| 카테고리 | 파일 수 |
|----------|---------|
| Frontend TypeScript/TSX | 126 |
| Frontend 커스텀 컴포넌트 | 42 |
| Frontend shadcn UI 컴포넌트 | 44 |
| Backend Python | 25 |
| Backend 테스트 | 3 (29 test cases) |
| E2E Playwright 테스트 | 1 (33 test cases) |
| Shell 스크립트 | 6 |
