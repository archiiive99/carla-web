# CARLA Production Server Setup — Complete Guide

From a **fresh Ubuntu 22.04 machine** to a **fully running CARLA Web production stack** — every single step, no shortcuts.

## What You Will Build

```
┌─────────────────────────────────────────────────────────────────┐
│  Your Machine (GPU required)                                     │
│                                                                 │
│  ┌──────────────────────┐  ┌─────────────────────────────────┐  │
│  │ CARLA UE5 Server     │  │ Pixel Streaming Signaling       │  │
│  │ (Unreal Engine 5.5)  │  │ (Node.js WebRTC relay)          │  │
│  │ Port: 2000 (RPC)     │  │ Port: 42680 (HTTP)              │  │
│  │ Port: 2001 (Stream)  │  │ Port: 42688 (Stream)            │  │
│  └──────────┬───────────┘  └─────────────────────────────────┘  │
│             │                                                    │
│  ┌──────────┴───────────┐                                       │
│  │ Python Bridge         │                                       │
│  │ (FastAPI middleware)  │                                       │
│  │ Port: 42692 (REST+WS)│                                       │
│  └──────────┬───────────┘                                       │
│             │                                                    │
│  ┌──────────┴───────────┐                                       │
│  │ React Frontend         │                                       │
│  │ (React + shadcn)     │                                       │
│  │ Port: 42691 (HTTP)    │                                       │
│  └──────────────────────┘                                       │
└─────────────────────────────────────────────────────────────────┘
```

## Guide Sequence

Execute these guides **in order**. Each one depends on the previous.

| # | Guide | What It Does | Time |
|---|-------|-------------|------|
| 01 | [Prerequisites](01_prerequisites.md) | System packages, GPU drivers, Python, Node.js | 30 min |
| 02 | [Build UE5 + CARLA](02_build_ue5_carla.md) | Clone and build Unreal Engine 5.5 + CARLA from source | 3-6 hours |
| 03 | [Pixel Streaming](03_pixel_streaming.md) | Enable Pixel Streaming plugin + signaling server | 30-60 min |
| 04 | [CARLA Python API](04_carla_python_api.md) | Build and install the `carla` pip package | 15 min |
| 05 | [Docker Alternative](05_docker_deployment.md) | Skip 02-04: use pre-built Docker image instead | 30 min |
| 06 | [Production Integration](06_production_integration.md) | Configure bridge, frontend, and CARLA to work together | 30 min |
| 07 | [Run Everything](07_run_production.md) | Single script that launches the full stack | 5 min |

## Two Paths

**Path A — Build from source** (full control, Pixel Streaming support):
→ 01 → 02 → 03 → 04 → 06 → 07

**Path B — Docker** (faster, no Pixel Streaming, camera fallback for viewport):
→ 01 → 05 → 06 → 07

## Hardware Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| OS | Ubuntu 22.04 | Ubuntu 22.04 LTS |
| CPU | Intel i7 gen9+ / AMD Ryzen 7 | Intel i9 / AMD Ryzen 9 |
| RAM | 32 GB | 64 GB |
| GPU | NVIDIA RTX 3070 (8GB VRAM) | NVIDIA RTX 4090 (24GB VRAM) |
| GPU Driver | 550+ | 560+ |
| Disk | 130 GB free (source build) | 250+ GB NVMe SSD |
| Network | 100 Mbps | 1 Gbps |

**Windows 11 is also supported** for the CARLA server build — see notes in each guide. But Linux is the recommended production platform.
