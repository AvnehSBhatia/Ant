#!/usr/bin/env bash
# Vast.ai onstart bootstrap for ant-tribe service.
# Runs as root inside the pytorch container at instance boot.
set -e
exec > /var/log/onstart.log 2>&1
echo "[onstart] $(date) starting"

apt-get update -y
apt-get install -y --no-install-recommends git ffmpeg curl wget ca-certificates

# uv (whisperx is invoked via `uvx whisperx` inside tribev2)
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="/root/.local/bin:/root/.cargo/bin:$PATH"
echo 'export PATH="/root/.local/bin:/root/.cargo/bin:$PATH"' >> /root/.bashrc

# Service code is uploaded later via scp; create the dir
mkdir -p /workspace/tribe
cd /workspace/tribe

# Python deps: stay close to what Ant/main.py uses.
# Try PyPI tribev2 first; fall back to github if missing.
python3 -m pip install --upgrade pip
python3 -m pip install \
  fastapi==0.115.0 \
  uvicorn[standard]==0.30.6 \
  numpy==1.26.4 \
  pandas==2.2.2 \
  moviepy==2.1.1 \
  nilearn==0.10.4 \
  ollama \
  huggingface_hub

# tribev2 + neuralset — try PyPI, then git fallback.
python3 -m pip install tribev2 neuralset || \
  python3 -m pip install \
    "git+https://github.com/facebookresearch/tribev2.git" \
    "git+https://github.com/facebookresearch/neuralset.git" || true

# uvx whisperx is downloaded on first call — pre-warm if uv is present.
/root/.local/bin/uv tool install whisperx || true

# Pre-create HF cache dir so model downloads land somewhere stable
mkdir -p /workspace/hf_cache
echo 'export HF_HOME=/workspace/hf_cache' >> /root/.bashrc
echo 'export TRANSFORMERS_CACHE=/workspace/hf_cache' >> /root/.bashrc
export HF_HOME=/workspace/hf_cache TRANSFORMERS_CACHE=/workspace/hf_cache

echo "[onstart] $(date) deps installed"

# Service files (main.py, service/) are uploaded after instance boot.
# Once present, start uvicorn under tmux on port 8080.
if [ -f /workspace/tribe/main.py ]; then
  apt-get install -y tmux
  tmux kill-session -t tribe 2>/dev/null || true
  tmux new-session -d -s tribe -c /workspace/tribe \
    "PYTHONPATH=/workspace/tribe HF_HOME=/workspace/hf_cache uvicorn main:app --host 0.0.0.0 --port 8080 2>&1 | tee /workspace/tribe/service.log"
  echo "[onstart] $(date) tribe service started on :8080"
fi

echo "[onstart] $(date) done"
