param(
  [Parameter(Mandatory=$true)][string]$BundleRoot,
  [Parameter(Mandatory=$true)][string]$RuntimeRoot
)

$ErrorActionPreference = "Stop"

function ConvertFrom-VerbatimPath([string]$Path) {
  if ($Path.StartsWith('\\?\UNC\', [StringComparison]::OrdinalIgnoreCase)) { return '\\' + $Path.Substring(8) }
  if ($Path.StartsWith('\\?\', [StringComparison]::OrdinalIgnoreCase)) { return $Path.Substring(4) }
  return $Path
}

function Invoke-Runtime([string[]]$Arguments, [string]$Failure) {
  & $script:Python @Arguments
  if ($LASTEXITCODE -ne 0) { throw $Failure }
}

function Test-Runtime([string[]]$Arguments) {
  # PowerShell 5 turns native stderr into a terminating NativeCommandError
  # when ErrorActionPreference is Stop. Verification probes intentionally
  # fail before first install, so observe only their process exit code.
  $PriorErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    & $script:Python @Arguments *> $null
    return $LASTEXITCODE -eq 0
  } finally {
    $ErrorActionPreference = $PriorErrorActionPreference
  }
}

$BundleRoot = ConvertFrom-VerbatimPath $BundleRoot
$RuntimeRoot = ConvertFrom-VerbatimPath $RuntimeRoot
$ArtifactRoot = Join-Path $BundleRoot "artifact"
$ManifestPath = Join-Path $ArtifactRoot "runtime-manifest.json"
$ArtifactManifestPath = Join-Path $ArtifactRoot "artifact-manifest.json"
$InstallerPackageLockPath = Join-Path $ArtifactRoot "installer-package-lock.json"
$script:Python = Join-Path $ArtifactRoot "python\python.exe"
if (-not (Test-Path -LiteralPath $script:Python -PathType Leaf)) { throw "Bundled VoxCPM2 TensorRT Python runtime is missing" }

$Manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
$ArtifactManifest = Get-Content -LiteralPath $ArtifactManifestPath -Raw | ConvertFrom-Json
$InstallerPackageLock = Get-Content -LiteralPath $InstallerPackageLockPath -Raw | ConvertFrom-Json
if ($Manifest.schemaVersion -ne 3 -or $Manifest.profile -ne "windows_trt_6g") { throw "Unsupported VoxCPM2 runtime manifest" }
if ($InstallerPackageLock.schemaVersion -ne 1 -or $InstallerPackageLock.policy -ne "automatic-installer-only") { throw "Unsupported VoxCPM2 installer package lock" }

New-Item -ItemType Directory -Force -Path $RuntimeRoot | Out-Null
$env:HF_HOME = Join-Path $RuntimeRoot "hf-cache"
$env:HF_HUB_DISABLE_XET = "1"
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONDONTWRITEBYTECODE = "1"
$env:NUMBA_CACHE_DIR = Join-Path $RuntimeRoot "state\cache\numba"
New-Item -ItemType Directory -Force -Path $env:NUMBA_CACHE_DIR | Out-Null
$env:NAIA_VOXCPM2_ARTIFACT_ROOT = $ArtifactRoot

Invoke-Runtime @("-B", "-I", "-c", "import os; from voxcpm2_tensorrt.artifact import verify_artifact; verify_artifact(os.environ['NAIA_VOXCPM2_ARTIFACT_ROOT'])") "Bundled VoxCPM2 artifact verification failed"

# TensorRT's Python/runtime distributions are acquired automatically from the
# NVIDIA-controlled index during this explicit online installer transaction.
# They are staged outside the immutable product artifact, verified by exact
# version, and recorded with pip's URL/archive-hash reports.
$NvidiaRoot = Join-Path $RuntimeRoot "python-packages"
$NvidiaPending = Join-Path $RuntimeRoot "python-packages.pending"
$NvidiaBackup = Join-Path $RuntimeRoot "python-packages.backup"
$NvidiaReceipt = Join-Path $NvidiaRoot "naia-nvidia-package-receipt.json"
$InstallerLockSha256 = (Get-FileHash -LiteralPath $InstallerPackageLockPath -Algorithm SHA256).Hash.ToLowerInvariant()
$VerifyNvidia = "import importlib.metadata as m, tensorrt; assert m.version('tensorrt-cu12') == '$($InstallerPackageLock.packages.'tensorrt-cu12')'; assert m.version('tensorrt-cu12-bindings') == '$($InstallerPackageLock.packages.'tensorrt-cu12-bindings')'; assert m.version('tensorrt-cu12-libs') == '$($InstallerPackageLock.packages.'tensorrt-cu12-libs')'; assert m.version('nvidia-cuda-runtime-cu12') == '$($InstallerPackageLock.packages.'nvidia-cuda-runtime-cu12')'"
$NvidiaReady = $false
if (Test-Path -LiteralPath $NvidiaReceipt -PathType Leaf) {
  try {
    $Receipt = Get-Content -LiteralPath $NvidiaReceipt -Raw | ConvertFrom-Json
    if ($Receipt.installerPackageLockSha256 -eq $InstallerLockSha256) {
      $env:PYTHONPATH = $NvidiaRoot
      $NvidiaReady = Test-Runtime @("-B", "-s", "-c", $VerifyNvidia)
    }
  } catch { $NvidiaReady = $false }
}
if (-not $NvidiaReady) {
  if (Test-Path -LiteralPath $NvidiaPending) { Remove-Item -LiteralPath $NvidiaPending -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $NvidiaPending | Out-Null
  $NvidiaReport = Join-Path $NvidiaPending "pip-report-nvidia.json"
  $PyPiReport = Join-Path $NvidiaPending "pip-report-pypi.json"
  Invoke-Runtime @(
    "-B", "-I", "-m", "pip", "install", "--disable-pip-version-check",
    "--no-deps", "--target", $NvidiaPending, "--report", $NvidiaReport,
    "--index-url", "https://pypi.nvidia.com",
    "tensorrt-cu12_bindings==$($InstallerPackageLock.packages.'tensorrt-cu12-bindings')",
    "tensorrt-cu12_libs==$($InstallerPackageLock.packages.'tensorrt-cu12-libs')",
    "nvidia-cuda-runtime-cu12==$($InstallerPackageLock.packages.'nvidia-cuda-runtime-cu12')"
  ) "Pinned NVIDIA runtime acquisition failed"
  Invoke-Runtime @(
    "-B", "-I", "-m", "pip", "install", "--disable-pip-version-check",
    "--no-deps", "--target", $NvidiaPending, "--report", $PyPiReport,
    "--index-url", "https://pypi.org/simple",
    "tensorrt-cu12==$($InstallerPackageLock.packages.'tensorrt-cu12')"
  ) "Pinned TensorRT Python package acquisition failed"
  $env:PYTHONPATH = $NvidiaPending
  Invoke-Runtime @("-B", "-s", "-c", $VerifyNvidia) "Acquired TensorRT package verification failed"
  $Receipt = [ordered]@{
    schemaVersion = 1
    installerPackageLockSha256 = $InstallerLockSha256
    sources = $InstallerPackageLock.sources
    nvidiaReportSha256 = (Get-FileHash -LiteralPath $NvidiaReport -Algorithm SHA256).Hash.ToLowerInvariant()
    pypiReportSha256 = (Get-FileHash -LiteralPath $PyPiReport -Algorithm SHA256).Hash.ToLowerInvariant()
  }
  [IO.File]::WriteAllText(
    (Join-Path $NvidiaPending "naia-nvidia-package-receipt.json"),
    (($Receipt | ConvertTo-Json -Depth 8) + [Environment]::NewLine),
    [Text.UTF8Encoding]::new($false)
  )
  if (Test-Path -LiteralPath $NvidiaBackup) { Remove-Item -LiteralPath $NvidiaBackup -Recurse -Force }
  if (Test-Path -LiteralPath $NvidiaRoot) { Move-Item -LiteralPath $NvidiaRoot -Destination $NvidiaBackup }
  try { Move-Item -LiteralPath $NvidiaPending -Destination $NvidiaRoot }
  catch {
    if ((-not (Test-Path -LiteralPath $NvidiaRoot)) -and (Test-Path -LiteralPath $NvidiaBackup)) { Move-Item -LiteralPath $NvidiaBackup -Destination $NvidiaRoot }
    throw
  }
  if (Test-Path -LiteralPath $NvidiaBackup) { Remove-Item -LiteralPath $NvidiaBackup -Recurse -Force }
}
$env:PYTHONPATH = $NvidiaRoot
Invoke-Runtime @("-B", "-s", "-c", "import torch,voxcpm,soundfile,tensorrt,onnx; import voxcpm2_tensorrt.http_server; assert torch.cuda.is_available()") "Bundled VoxCPM2 TensorRT runtime verification failed"

$ModelDir = Join-Path $RuntimeRoot "models\VoxCPM2"
$ModelArgs = @("-B", "-s", "-c", "from voxcpm2_tensorrt.materialize_voxcpm2_model import main; main()", "--repo", [string]$Manifest.model.id, "--revision", [string]$Manifest.model.revision, "--model-dir", $ModelDir)
if (-not (Test-Runtime @($ModelArgs + "--verify-only"))) {
  Write-Output "VOXCPM2_MODEL_PREPARE_REQUIRED"
  Invoke-Runtime $ModelArgs "Pinned VoxCPM2 model materialization failed"
}

$Checkpoints = Join-Path $RuntimeRoot "checkpoints"
$Engine = Join-Path $Checkpoints "voxcpm2_trt"
$Pending = Join-Path $Checkpoints "voxcpm2_trt.pending"
$Backup = Join-Path $Checkpoints "voxcpm2_trt.backup"
$env:NAIA_VOXCPM2_ENGINE_DIR = $Engine
$env:NAIA_VOXCPM2_MODEL_DIR = $ModelDir
$env:NAIA_VOXCPM2_MODEL_ID = [string]$Manifest.model.id
$env:NAIA_VOXCPM2_MODEL_REVISION = [string]$Manifest.model.revision
$VerifyEngine = "import os; from pathlib import Path; from voxcpm2_tensorrt.model_contract import MODEL_RECEIPT_NAME,sha256_file; from voxcpm2_tensorrt.voxcpm2_trt import TensorRTLocDiT,load_engine_manifest; m=load_engine_manifest(os.environ['NAIA_VOXCPM2_ENGINE_DIR'],model_id=os.environ['NAIA_VOXCPM2_MODEL_ID']); assert m.data['model_revision']==os.environ['NAIA_VOXCPM2_MODEL_REVISION'].lower(); assert m.data['model_receipt_sha256']==sha256_file(Path(os.environ['NAIA_VOXCPM2_MODEL_DIR'])/MODEL_RECEIPT_NAME); TensorRTLocDiT(m)"
if (-not (Test-Runtime @("-B", "-s", "-c", $VerifyEngine))) {
  Write-Output "VOXCPM2_ENGINE_PREPARE_REQUIRED"
  if (Test-Path -LiteralPath $Pending) { Remove-Item -LiteralPath $Pending -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $Pending | Out-Null
  Invoke-Runtime @("-B", "-s", "-c", "from voxcpm2_tensorrt.build_voxcpm2_trt import main; main()", "--model", [string]$Manifest.model.id, "--revision", [string]$Manifest.model.revision, "--model-dir", $ModelDir, "--output-dir", $Pending, "--workspace-gib", "1.0") "VoxCPM2 TensorRT engine preparation failed"
  if (Test-Path -LiteralPath $Backup) { Remove-Item -LiteralPath $Backup -Recurse -Force }
  if (Test-Path -LiteralPath $Engine) { Move-Item -LiteralPath $Engine -Destination $Backup }
  try {
    Move-Item -LiteralPath $Pending -Destination $Engine
  } catch {
    if ((-not (Test-Path -LiteralPath $Engine)) -and (Test-Path -LiteralPath $Backup)) { Move-Item -LiteralPath $Backup -Destination $Engine }
    throw
  }
  if (Test-Path -LiteralPath $Backup) { Remove-Item -LiteralPath $Backup -Recurse -Force }
  Invoke-Runtime @("-B", "-s", "-c", $VerifyEngine) "Prepared VoxCPM2 TensorRT engine verification failed"
}

$Ready = [ordered]@{
  schemaVersion = 1
  profile = "windows_trt_6g"
  artifactManifestSha256 = (Get-FileHash -LiteralPath $ArtifactManifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
  source = $ArtifactManifest.source
  model = $Manifest.model
}
$ReadyPath = Join-Path $RuntimeRoot "voxcpm2-runtime-ready.json"
$ReadyPending = "$ReadyPath.pending"
[IO.File]::WriteAllText($ReadyPending, (($Ready | ConvertTo-Json -Depth 8) + [Environment]::NewLine), [Text.UTF8Encoding]::new($false))
Move-Item -LiteralPath $ReadyPending -Destination $ReadyPath -Force
Write-Output "VOXCPM2_MODEL_READY"
