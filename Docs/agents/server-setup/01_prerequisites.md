# 01 — Prerequisites & System Setup

Everything you need installed before building CARLA. Run every command in this guide on a **fresh Ubuntu 22.04** machine.

---

## 1. System Packages

```bash
sudo apt update && sudo apt upgrade -y

sudo apt install -y \
  build-essential make ninja-build cmake \
  libvulkan1 libvulkan-dev vulkan-tools \
  libpng-dev libtiff5-dev libjpeg-dev \
  libxml2-dev libxerces-c-dev \
  libnss3-dev libatk-bridge2.0-dev libxkbcommon-dev \
  libgbm-dev libpango1.0-dev libasound2-dev \
  libsdl2-dev libsdl2-2.0-0 \
  python3 python3-dev python3-pip python3-venv \
  git git-lfs curl wget rsync unzip \
  libtool sed tzdata xdg-user-dirs \
  libturbojpeg0-dev
```

Verify CMake version (must be 3.28+):
```bash
cmake --version
# If < 3.28, install manually:
wget https://github.com/Kitware/CMake/releases/download/v3.28.3/cmake-3.28.3-linux-x86_64.tar.gz
sudo tar -xzf cmake-3.28.3-linux-x86_64.tar.gz -C /opt/
echo 'export PATH=/opt/cmake-3.28.3-linux-x86_64/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
cmake --version  # Should show 3.28.3
```

---

## 2. NVIDIA GPU Driver

Check if already installed:
```bash
nvidia-smi
```

If not installed:
```bash
sudo apt install -y nvidia-driver-550
sudo reboot
```

After reboot, verify:
```bash
nvidia-smi
# Should show driver version 550+ and your GPU model
```

---

## 3. NVIDIA Container Toolkit (for Docker path)

Only needed if you plan to use Docker (Path B). Skip if building from source.

```bash
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | \
  sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg

curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

sudo apt update
sudo apt install -y nvidia-container-toolkit docker.io
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
sudo usermod -aG docker $USER

# Log out and back in, then verify:
docker run --rm --gpus all nvidia/cuda:12.0.0-base-ubuntu22.04 nvidia-smi
```

---

## 4. Python Setup

CARLA requires Python 3.8-3.10. Ubuntu 22.04 ships with 3.10 by default.

```bash
python3 --version  # Should be 3.10.x

# Install CARLA Python dependencies
pip3 install --user psutil requests scikit-build-core wheel "numpy<2.0" setuptools build pygame
```

---

## 5. Node.js (for Pixel Streaming signaling server)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

node --version   # Should be 20.x
npm --version    # Should be 10.x
```

---

## 6. GitHub Account Setup

CARLA uses a private fork of Unreal Engine 5.5. You **must** link your GitHub account to Epic Games to get access.

### Step 1: Create Epic Games account
Go to https://www.unrealengine.com/ and create a free account.

### Step 2: Link GitHub to Epic Games
1. Go to https://www.unrealengine.com/en-US/ue-on-github
2. Click "Connect" and authorize with your GitHub account
3. You will be added to the `EpicGames` GitHub organization
4. Accept the organization invite email from GitHub

### Step 3: Verify access
```bash
# This should NOT return 404:
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: token YOUR_GITHUB_TOKEN" \
  https://api.github.com/repos/CarlaUnreal/UnrealEngine
# Should return 200
```

### Step 4: Create a Personal Access Token (for unattended builds)
1. Go to https://github.com/settings/tokens
2. Generate new token (classic)
3. Scopes: `repo` (full control)
4. Save the token — you'll need it in the next guide

```bash
# Save for use in build scripts:
echo 'export GIT_LOCAL_CREDENTIALS=YOUR_GITHUB_USERNAME@YOUR_GITHUB_TOKEN' >> ~/.bashrc
source ~/.bashrc
```

---

## 7. Vulkan Verification

CARLA UE5 requires Vulkan for rendering:
```bash
vulkaninfo --summary
# Should show your GPU and Vulkan 1.3 support
```

If `vulkaninfo` fails:
```bash
sudo apt install -y mesa-vulkan-drivers
# For NVIDIA: the driver package should include Vulkan support
```

---

## 8. Disk Space Check

```bash
df -h /home
# Ensure at least 130 GB free (250 GB recommended)
```

If building on a separate drive, make sure it's ext4 (not NTFS or exFAT) and has read/write/execute permissions.

---

## 9. Firewall / Ports

The following ports will be used. Open them if you have a firewall:

| Port | Service | Protocol |
|------|---------|----------|
| 2000 | CARLA RPC | TCP |
| 2001 | CARLA Streaming | TCP |
| 42680 | Pixel Streaming Signaling (HTTP) | TCP |
| 42688 | Pixel Streaming (WebRTC relay) | TCP |
| 42691 | Frontend (Vite + React) | TCP |
| 42692 | Bridge (FastAPI) | TCP |

```bash
# If using ufw:
sudo ufw allow 2000/tcp
sudo ufw allow 2001/tcp
sudo ufw allow 42680/tcp
sudo ufw allow 42688/tcp
sudo ufw allow 42691/tcp
sudo ufw allow 42692/tcp
```

---

## Verification Checklist

Run these commands — all must succeed:

```bash
cmake --version        # 3.28+
ninja --version        # 1.10+
python3 --version      # 3.10.x
pip3 --version         # 20.3+
node --version         # 20.x
git --version          # 2.25+
git lfs version        # 3.0+
nvidia-smi             # Shows GPU
vulkaninfo --summary   # Shows Vulkan
echo $GIT_LOCAL_CREDENTIALS  # Shows username@token
```

If all pass, proceed to [02 — Build UE5 + CARLA](02_build_ue5_carla.md).
