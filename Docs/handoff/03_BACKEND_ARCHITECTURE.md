# Backend Architecture — `carla-web-bridge/`

## Tech Stack

- **Python 3.10** (시스템 Python, venv 사용)
- **FastAPI** — REST API + WebSocket
- **uvicorn** — ASGI 서버
- **CARLA Python API** (`carla` 패키지)
- **PyTurboJPEG** — 고속 JPEG 인코딩 (Pillow 폴백)
- **NumPy** — 센서 데이터 변환

## 디렉토리 구조

```
carla-web-bridge/
├── src/
│   ├── main.py              # FastAPI 앱, 라이프사이클, 미들웨어
│   ├── config.py            # 환경변수 기반 설정
│   ├── carla_client.py      # CARLA 연결 관리 (자동 재연결, 하트비트)
│   ├── sensor_manager.py    # 센서 스폰/제거/콜백 처리
│   ├── ws_broadcaster.py    # WebSocket 클라이언트 관리 + 브로드캐스트
│   ├── routes/
│   │   ├── simulation.py    # GET/POST /api/simulation/*
│   │   ├── world.py         # GET/POST /api/world/* (날씨, 맵, 스폰포인트, 스펙테이터)
│   │   ├── actors.py        # CRUD /api/actors/* (스폰, 제거, 제어)
│   │   ├── sensors.py       # GET/POST /api/sensors/*
│   │   ├── traffic.py       # POST /api/traffic/*
│   │   ├── blueprints.py    # GET /api/blueprints/*
│   │   ├── recording.py     # POST /api/recording/*, /api/replay/*
│   │   └── navigation.py    # GET/POST /api/map/*
│   ├── ws/
│   │   ├── handler.py       # WebSocket /ws 엔드포인트
│   │   ├── protocol.py      # 바이너리 프로토콜 인코더/디코더
│   │   └── channels.py      # 채널 ID 상수 (0x01~0xFF)
│   ├── compression/
│   │   └── image.py         # JPEG/WebP 압축, 깊이 컬러맵, 세그멘테이션 팔레트
│   ├── models/
│   │   └── schemas.py       # Pydantic 모델 (요청/응답 검증)
│   └── utils/
│       └── serialization.py # CARLA 타입 → JSON 변환
├── tests/
│   ├── test_protocol.py     # 바이너리 프로토콜 테스트 (9개)
│   ├── test_compression.py  # 이미지 압축 벤치마크 (6개)
│   └── test_routes.py       # API 엔드포인트 테스트 (14개)
├── requirements.txt
├── pyproject.toml
├── Dockerfile
├── docker-compose.yml
└── run_local.sh
```

## 설정 (`config.py`)

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `CARLA_HOST` | `localhost` | CARLA 서버 주소 |
| `CARLA_PORT` | `58338` | CARLA RPC 포트 |
| `BRIDGE_PORT` | `58337` | Bridge HTTP/WS 포트 |
| `CORS_ORIGINS` | `http://localhost:58336` | 허용 오리진 |
| `JPEG_QUALITY` | `80` | 카메라 JPEG 품질 |
| `MAX_CLIENTS` | `50` | 최대 WebSocket 클라이언트 |
| `MAX_SENSORS` | `20` | 최대 활성 센서 |
| `HEARTBEAT_INTERVAL` | `5.0` | CARLA 헬스체크 주기(초) |

## REST API 엔드포인트 (30+개)

### 시뮬레이션
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/health` | 브릿지 상태 |
| GET | `/api/info` | 버전 정보 |
| GET | `/api/simulation/status` | 시뮬레이션 상태 전체 |
| GET | `/api/simulation/tick` | 현재 틱 번호만 |
| POST | `/api/simulation/play` | 시뮬레이션 시작 |
| POST | `/api/simulation/pause` | 일시정지 |
| POST | `/api/simulation/step` | 1틱 진행 |
| POST | `/api/simulation/settings` | 설정 변경 (sync mode 등) |
| POST | `/api/simulation/reload` | 맵 리로드 |

### 월드
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/world/maps` | 사용 가능한 맵 목록 |
| POST | `/api/world/load` | 맵 로드 |
| GET/POST | `/api/world/weather` | 날씨 가져오기/설정 |
| GET | `/api/world/weather/presets` | 22개 프리셋 |
| GET | `/api/world/spawn-points` | 스폰 포인트 |
| POST | `/api/world/map-layers` | 맵 레이어 로드/언로드 |
| GET/POST | `/api/world/spectator` | 스펙테이터 위치 |

### 액터
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/actors` | 모든 액터 목록 |
| GET | `/api/actors/count` | 액터 수 |
| GET | `/api/actors/:id` | 상세 정보 |
| POST | `/api/actors/spawn/vehicle` | 차량 스폰 (`try_spawn_actor` 사용) |
| POST | `/api/actors/spawn/walker` | 보행자 스폰 |
| POST | `/api/actors/spawn/sensor` | 센서 스폰 |
| DELETE | `/api/actors/:id` | 액터 제거 |
| DELETE | `/api/actors/all` | 모든 스폰 액터 제거 |
| POST | `/api/actors/:id/control` | 차량 제어 |
| POST | `/api/actors/:id/autopilot` | 오토파일럿 |
| POST | `/api/actors/:id/transform` | 위치 변경 |

### 기타
- `/api/blueprints/*` — 블루프린트 목록
- `/api/traffic/*` — 트래픽 매니저
- `/api/sensors/*` — 센서 타입/설정
- `/api/map/*` — 토폴로지, 경로 계산
- `/api/recording/*` — 녹화/재생

## WebSocket 바이너리 프로토콜

단일 WebSocket 연결 (`ws://host:58337/ws`)으로 모든 센서 데이터 스트리밍.

### 프레임 포맷
```
[1B 채널ID][4B 페이로드길이][N바이트 페이로드]
```

### 채널 ID
| ID | 이름 | 방향 | 페이로드 |
|----|------|------|----------|
| 0x01 | Camera | S→C | sensor_id, width, height, frame, timestamp, JPEG |
| 0x02 | Depth | S→C | 위와 동일 |
| 0x03 | Segmentation | S→C | 위와 동일 |
| 0x04 | LiDAR | S→C | sensor_id, point_count, frame, timestamp, Float32 xyzI |
| 0x05 | Semantic LiDAR | S→C | 위와 동일 (6 floats/point) |
| 0x06 | Radar | S→C | sensor_id, count, frame, timestamp, Float32 vel/az/alt/depth |
| 0x07 | IMU | S→C | sensor_id, frame, timestamp, accel xyz, gyro xyz, compass |
| 0x08 | GNSS | S→C | sensor_id, frame, timestamp, lat, lon, alt |
| 0x09 | Collision | S→C | sensor_id, frame, timestamp, other_id, impulse xyz |
| 0x0A | Lane Invasion | S→C | sensor_id, frame, timestamp, count, marking types |
| 0x10 | World Tick | S→C | frame, timestamp, actor_count, per-actor transforms |
| 0xF0 | Subscribe | C→S | JSON: `{"action":"subscribe","sensor_id":123}` |
| 0xF1 | Unsubscribe | C→S | JSON |
| 0xFE | Client Stats | C→S | JSON |

### 센서 구독 흐름
1. 프론트엔드: `sensorStore.subscribe(sensorId)`
2. → `worker-ref.ts`의 글로벌 Worker에 메시지 전송
3. → ws-receiver.worker가 JSON `{"action":"subscribe","sensor_id":N}` 전송
4. → Bridge가 해당 센서의 데이터 스트리밍 시작
5. → Bridge가 바이너리 프레임 전송
6. → ws-receiver.worker가 채널별로 라우팅

## CARLA 연결 관리 (`carla_client.py`)

- `connect()`: 지수 백오프 재시도 (1s → 2s → 4s → ... → 30s max)
- `_heartbeat_loop()`: 5초마다 `get_server_version()` + `get_world()` 갱신
- 하트비트 실패 시: `connected = False` → 자동 `connect()` 재호출
- `world` 프로퍼티: 매 접근마다 `get_world()` 재호출 (맵 리로드 대응)
- `track_actor(id)` / `untrack_actor(id)`: 스폰한 액터 추적 → 종료 시 정리

## World Tick 브로드캐스트 (`main.py`)

```python
async def _world_tick_loop():
    while True:
        await asyncio.sleep(0.05)  # 20Hz
        if not carla_manager.is_connected or ws_broadcaster.client_count == 0:
            continue
        tick_data = await asyncio.to_thread(_get_tick_data)
        await ws_broadcaster.broadcast_world_tick(tick_data)
```

모든 액터의 transform/velocity를 20Hz로 브로드캐스트.

## 주의사항

1. **`spawn_actor` 대신 `try_spawn_actor` 사용** — 위치 충돌 시 크래시 방지
2. **`set_autopilot(True)` try/except 감싸야 함** — TrafficManager 없으면 크래시
3. **`bp_lib.find()` try/except 감싸야 함** — 없는 블루프린트에서 RuntimeError
4. **모든 CARLA API 호출은 `asyncio.to_thread()` 안에서** — 블로킹 호출이므로
5. **센서 콜백은 CARLA 내부 스레드에서 실행** — asyncio 루프로 핸드오프 필요

## 테스트

```bash
cd carla-web-bridge
source .venv/bin/activate
python -m pytest tests/ -v   # 29개 테스트
```

CARLA 없이도 프로토콜/압축/라우트 테스트 가능.
