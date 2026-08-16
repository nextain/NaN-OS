param(
  [Parameter(Mandatory=$true)][string]$BundleRoot,
  [Parameter(Mandatory=$true)][string]$RuntimeRoot
)

$ErrorActionPreference = "Stop"
$manifestPath = Join-Path $BundleRoot "manifest.json"
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$uv = Join-Path $BundleRoot "uv.exe"
$actualUv = (Get-FileHash -LiteralPath $uv -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualUv -ne $manifest.uv.windowsX64Sha256) {
  throw "Bundled uv checksum mismatch"
}

New-Item -ItemType Directory -Force -Path $RuntimeRoot | Out-Null
  $env:UV_CACHE_DIR = Join-Path $RuntimeRoot ".uv-cache"
  $env:HF_HOME = Join-Path $RuntimeRoot "hf-cache"
  $env:HF_HUB_DISABLE_XET = "1"
  $venv = Join-Path $RuntimeRoot ".venv-voice-trt"
  $python = Join-Path $venv "Scripts\python.exe"

  & $uv python install $manifest.python
  if ($LASTEXITCODE -ne 0) { throw "Managed Python install failed" }
  & $uv venv --python $manifest.python $venv
  if ($LASTEXITCODE -ne 0) { throw "Voice environment creation failed" }

  & $uv pip install --python $python --index-url https://download.pytorch.org/whl/cu121 `
    "torch==$($manifest.packages.torch)" "torchaudio==$($manifest.packages.torchaudio)"
  if ($LASTEXITCODE -ne 0) { throw "CUDA PyTorch install failed" }
  & $uv pip install --python $python `
    "voxcpm==$($manifest.packages.voxcpm)" `
    "tensorrt-cu12==$($manifest.packages.'tensorrt-cu12')" `
    "fastapi==$($manifest.packages.fastapi)" "uvicorn==$($manifest.packages.uvicorn)" `
    "httpx==$($manifest.packages.httpx)" "numpy==$($manifest.packages.numpy)" `
    "soundfile==$($manifest.packages.soundfile)" `
    "huggingface-hub==$($manifest.packages.'huggingface-hub')" `
    "safetensors==$($manifest.packages.safetensors)" `
    "onnx==$($manifest.packages.onnx)"
  if ($LASTEXITCODE -ne 0) { throw "VoxCPM2 dependency install failed" }

  $service = Join-Path $BundleRoot "repos\projects\naia-labs\avatar\service"
  $builder = Join-Path $service "build_voxcpm2_trt.py"
  $engine = Join-Path $RuntimeRoot "checkpoints\voxcpm2_trt"
  & $python $builder --model $manifest.model.id --revision $manifest.model.revision --output-dir $engine --workspace-gib 1.0
  if ($LASTEXITCODE -ne 0) { throw "VoxCPM2 TensorRT engine build failed" }

  $env:PYTHONPATH = "$service"
  & $python -c "import torch,voxcpm,soundfile,tensorrt,onnx; assert torch.cuda.is_available()"
  if ($LASTEXITCODE -ne 0) { throw "Installed voice runtime verification failed" }
  if (-not (Test-Path -LiteralPath (Join-Path $engine "manifest.json"))) {
    throw "TensorRT engine manifest missing"
  }
  [IO.File]::WriteAllText(
    (Join-Path $RuntimeRoot "voxcpm2-runtime-ready.json"),
    ($manifest | ConvertTo-Json -Depth 8),
    [Text.UTF8Encoding]::new($false)
  )
  Write-Output "VOXCPM2_RUNTIME_READY"
