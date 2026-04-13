# Environment Setup Guide

다른 서버에서 CARLA Web을 처음부터 세팅하는 완전한 가이드.

---

## 시스템 요구사항

| 항목 | 최소 | 권장 |
|------|------|------|
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| GPU | NVIDIA GPU (8GB+ VRAM) | NVIDIA RTX 3080+ (12GB+) |
| GPU 드라이버 | 535+ | 570+ |
| RAM | 32GB | 64GB |
| 디스크 | 100GB | 200GB SSD |
| CPU | 8 cores | 16+ cores |

## 1단계: 시스템 패키지

```bash
sudo apt update && sudo apt install -y \
  build-essential \
  cmake \
  git \
  python3 \
  python3-pip \
  python3-venv \
  libturbojpeg0 \
  libturbojpeg0-dev \
  vulkan-tools \
  libvulkan1 \
  nvidia-driver-570
```

### Vulkan 확인
```bash
vulkaninfo --summary 2>/dev/null | head -5
# GPU가 보여야 함
```

## 2단계: Node.js (v20+)

```bash
# nvm 설치
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.bashrc

# Node 20 LTS 또는 24
nvm install 20
nvm use 20

# 확인
node --version   # v20.x 이상
npm --version    # 10.x 이상
```

**현재 사용 버전**: Node v24.11.0, npm 11.6.2

## 3단계: Python 3.10

Ubuntu 22.04에 기본 포함:
```bash
python3 --version  # Python 3.10.12
```

다른 OS에서:
```bash
# conda 사용 시
conda create -n carla-web python=3.10
conda activate carla-web
```

## 4단계: UE5 CARLA 빌드

### UE5 소스 빌드 (필수)
```bash
# Epic Games 라이센스 동의 후
git clone https://github.com/CarlaUnreal/UnrealEngine5-carla.git ~/UnrealEngine5_carla
cd ~/UnrealEngine5_carla
./Setup.sh
./GenerateProjectFiles.sh
make -j$(nproc)
```

### CARLA 소스 빌드
```bash
git clone https://github.com/carla-simulator/carla.git ~/carla
cd ~/carla
export CARLA_UNREAL_ENGINE_PATH=~/UnrealEngine5_carla

# CMake 빌드
mkdir Build && cd Build
cmake .. -DCMAKE_BUILD_TYPE=Release
cmake --build . --target CarlaUnreal -j$(nproc)
```

### CARLA Python API 설치
```bash
# 빌드된 .whl 또는 .egg 파일 찾기
pip install carla==0.10.0
# 또는 빌드된 패키지에서:
# pip install ~/carla/PythonAPI/carla/dist/carla-*.whl

# 확인
python3 -c "import carla; print('OK')"
```

## 5단계: Frontend 세팅 (`carla-web/`)

```bash
cd ~/carla/carla-web
npm install
```

### 주요 npm 패키지 (package.json에 이미 정의됨)

| 패키지 | 버전 | 용도 |
|--------|------|------|
| react | ^19.2.4 | UI |
| vite | ^8.0.1 | 빌드 |
| typescript | ^5.x | 타입 체크 |
| tailwindcss | ^4.2.2 | CSS |
| @tailwindcss/vite | ^4.x | Vite 플러그인 |
| zustand | ^5.0.12 | 상태 관리 |
| react-router-dom | ^7.13.1 | 라우팅 |
| three | ^0.183.2 | 3D 렌더링 (LiDAR) |
| @react-three/fiber | ^9.x | React Three.js |
| @react-three/drei | ^10.x | Three.js 헬퍼 |
| recharts | ^2.15.4 | 차트 (IMU) |
| react-resizable-panels | ^2.x | 패널 리사이즈 |
| sonner | ^2.x | 토스트 알림 |
| lucide-react | ^0.x | 아이콘 |
| class-variance-authority | ^0.x | shadcn 의존성 |
| clsx | ^2.x | 클래스 결합 |
| tailwind-merge | ^3.x | Tailwind 클래스 병합 |

### shadcn/ui 컴포넌트 (이미 설치됨)

재설치 필요 시:
```bash
npx shadcn@latest init --defaults --preset vega
npx shadcn@latest add button badge card tabs accordion collapsible dialog sheet \
  input label select slider switch toggle toggle-group field \
  table scroll-area skeleton spinner progress chart \
  sidebar command dropdown-menu context-menu navigation-menu breadcrumb \
  alert alert-dialog sonner tooltip hover-card popover \
  resizable separator aspect-ratio calendar checkbox radio-group \
  kbd input-group textarea menubar
```

### Playwright (E2E 테스트)
```bash
npm install -D @playwright/test
npx playwright install chromium
```

### 빌드 확인
```bash
npm run build      # dist/ 생성, ~1.5초
npx tsc --noEmit   # 타입 에러 0
```

## 6단계: Backend 세팅 (`carla-web-bridge/`)

```bash
cd ~/carla/carla-web-bridge

# venv 생성
python3 -m venv .venv
source .venv/bin/activate

# 의존성 설치
pip install -r requirements.txt
```

### 주요 pip 패키지

| 패키지 | 버전 | 용도 |
|--------|------|------|
| fastapi | >=0.104.0 | REST API |
| uvicorn[standard] | >=0.24.0 | ASGI 서버 |
| websockets | >=12.0 | WebSocket |
| carla | 0.10.0 | CARLA Python API |
| Pillow | >=10.0.0 | 이미지 (폴백) |
| PyTurboJPEG | >=1.7.0,<2.0.0 | 고속 JPEG (**2.0 미만!**) |
| numpy | >=1.24.0 | 배열 연산 |
| pydantic | >=2.0 | 데이터 검증 |
| python-dotenv | >=1.0.0 | 환경변수 |
| httpx | >=0.25.0 | 테스트 |
| pytest | >=7.4.0 | 테스트 |
| pytest-asyncio | >=0.21.0 | 비동기 테스트 |

**주의**: `PyTurboJPEG>=2.0`은 `libjpeg-turbo 3.0+` 필요. Ubuntu 22.04에는 2.x만 있으므로 **반드시 `<2.0.0`**

### 테스트 확인
```bash
python -m pytest tests/ -v   # 29 passed
```

## 7단계: 포트 설정

세 서비스의 기본 포트:

| 서비스 | 포트 | 설정 파일 |
|--------|------|-----------|
| Frontend (Vite) | 58336 | `carla-web/vite.config.ts` |
| Bridge (FastAPI) | 58337 | `carla-web-bridge/src/config.py` |
| CARLA RPC | 58338 | `run_carla.sh` |
| CARLA Streaming | 58339 | CARLA 자동 (RPC+1) |
| CARLA Secondary | 58340 | CARLA 자동 (RPC+2) |

포트 변경 시 수정할 파일:
```
carla-web/vite.config.ts               # server.port
carla-web/src/stores/simulationStore.ts # bridgeUrl 기본값
carla-web/src/lib/carla-api.ts         # getBridgeUrl() 기본값
carla-web/src/constants/index.ts       # BRIDGE_URL_DEFAULT
carla-web/src/routes/SettingsPage.tsx   # 기본값
carla-web-bridge/src/config.py         # CARLA_PORT, BRIDGE_PORT
carla-web/playwright.config.ts         # baseURL
carla-web/e2e/full-stack.spec.ts       # BRIDGE_URL
run_carla.sh                           # CARLA_PORT
carla-web/run_local.sh                 # 모든 PORT 변수
run_local.sh                           # 모든 PORT 변수
kill_all.sh                            # grep 패턴
```

## 8단계: 실행 확인

```bash
# 1. CARLA 서버 시작
cd ~/carla && ./run_carla.sh
# "✓ CARLA ready!" 대기 (1~2분)

# 2. Bridge + Frontend 시작
cd ~/carla/carla-web && ./run_local.sh

# 3. 브라우저
http://localhost:58336

# 4. 확인
curl http://localhost:58337/health
# {"status":"ok","carla_connected":true,...}
```

## 트러블슈팅

### `npm install` 실패
```bash
rm -rf node_modules package-lock.json
npm install
```

### `pip install carla` 실패
CARLA Python API가 PyPI에 없으면 직접 빌드:
```bash
cd ~/carla
pip install -e PythonAPI/carla/
```

### Vulkan 에러
```bash
# NVIDIA Vulkan ICD 확인
ls /usr/share/vulkan/icd.d/
# nvidia_icd.json이 있어야 함

# 없으면:
sudo apt install nvidia-vulkan-icd
```

### libturbojpeg 없음
```bash
sudo apt install libturbojpeg0
```

### CARLA `std::exception`
- Bridge 재시작: `cd carla-web && ./run_local.sh` (Ctrl+C 후 다시)
- CARLA 재시작: `./run_carla.sh --kill && ./run_carla.sh`
