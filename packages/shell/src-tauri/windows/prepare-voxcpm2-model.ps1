param(
  [Parameter(Mandatory=$true)][string]$BundleRoot,
  [Parameter(Mandatory=$true)][string]$RuntimeRoot
)

$ErrorActionPreference = "Stop"

function ConvertFrom-VerbatimPath([string]$Path) {
  if ($Path.StartsWith('\\?\UNC\', [StringComparison]::OrdinalIgnoreCase)) {
    return '\\' + $Path.Substring(8)
  }
  if ($Path.StartsWith('\\?\', [StringComparison]::OrdinalIgnoreCase)) {
    return $Path.Substring(4)
  }
  return $Path
}

$BundleRoot = ConvertFrom-VerbatimPath $BundleRoot
$RuntimeRoot = ConvertFrom-VerbatimPath $RuntimeRoot
$manifestPath = Join-Path $BundleRoot "manifest.json"
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$python = Join-Path $BundleRoot "python\python.exe"
$service = Join-Path $BundleRoot "service"
if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
  throw "Bundled VoxCPM2 TensorRT Python runtime is missing"
}

New-Item -ItemType Directory -Force -Path $RuntimeRoot | Out-Null
$env:HF_HOME = Join-Path $RuntimeRoot "hf-cache"
$env:HF_HUB_DISABLE_XET = "1"
$env:PYTHONPATH = $service
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"

# The app release must carry these dependencies. This command is an offline
# verification and must never install packages on the user's machine.
& $python -I -c "import torch,voxcpm,soundfile,tensorrt,onnx; assert torch.cuda.is_available()"
if ($LASTEXITCODE -ne 0) { throw "Bundled VoxCPM2 TensorRT runtime verification failed" }

$checkpoints = Join-Path $RuntimeRoot "checkpoints"
$modelDir = Join-Path $RuntimeRoot "models\VoxCPM2"
$engine = Join-Path $checkpoints "voxcpm2_trt"
$pending = Join-Path $checkpoints "voxcpm2_trt.pending"
$backup = Join-Path $checkpoints "voxcpm2_trt.backup"
if (Test-Path -LiteralPath $pending) {
  Remove-Item -LiteralPath $pending -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $pending | Out-Null
$builder = Join-Path $service "build_voxcpm2_trt.py"
& $python $builder --model $manifest.model.id --revision $manifest.model.revision --model-dir $modelDir --output-dir $pending --workspace-gib 1.0
if ($LASTEXITCODE -ne 0) { throw "VoxCPM2 TensorRT engine preparation failed" }
if (-not (Test-Path -LiteralPath (Join-Path $pending "manifest.json") -PathType Leaf)) {
  throw "TensorRT engine manifest missing"
}

if (Test-Path -LiteralPath $backup) {
  Remove-Item -LiteralPath $backup -Recurse -Force
}
if (Test-Path -LiteralPath $engine) {
  Move-Item -LiteralPath $engine -Destination $backup
}
try {
  Move-Item -LiteralPath $pending -Destination $engine
} catch {
  if ((-not (Test-Path -LiteralPath $engine)) -and (Test-Path -LiteralPath $backup)) {
    Move-Item -LiteralPath $backup -Destination $engine
  }
  throw
}
if (Test-Path -LiteralPath $backup) {
  Remove-Item -LiteralPath $backup -Recurse -Force
}

$readyPath = Join-Path $RuntimeRoot "voxcpm2-runtime-ready.json"
$readyPending = "$readyPath.pending"
[IO.File]::WriteAllText(
  $readyPending,
  ($manifest | ConvertTo-Json -Depth 8),
  [Text.UTF8Encoding]::new($false)
)
Move-Item -LiteralPath $readyPending -Destination $readyPath -Force
Write-Output "VOXCPM2_MODEL_READY"
