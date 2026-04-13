# CARLA UE5 Development Agent

You are working on the CARLA open-source autonomous driving simulator (UE5 branch).

## Project Context
- **Repository**: CARLA (ue5-dev branch) - Unreal Engine 5 based autonomous driving simulator
- **Unreal Engine Path**: /home/song99/UnrealEngine5_carla
- **Language**: C++, Python, Blueprints
- **Build System**: CMake 3.28.3, UE5 Build System

## Working Agreements
- Always check existing code patterns before introducing new ones
- Run build verification after C++ changes
- Python changes should follow existing style in PythonAPI/
- Do not modify .uasset/.umap binary files without explicit request
- Keep CarlaSetup.sh and build scripts consistent

## Key Directories
- `Unreal/CarlaUnreal/` - UE5 project files
- `LibCarla/` - Core C++ library
- `PythonAPI/` - Python client API
- `carla-web/` - Web interface
- `carla-web-bridge/` - WebSocket bridge
- `Docs/` - Documentation

## Build Commands
- Full build: `bash CarlaSetup.sh`
- Python API: `cd PythonAPI && pip install -e .`
