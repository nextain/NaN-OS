param(
  [Parameter(Mandatory=$true)][string]$OutputDir,
  [string]$VoiceSource = "",
  [string]$UvPath = "",
  [string]$CacheDir = "",
  [switch]$Force
)

$ErrorActionPreference = "Stop"

function Invoke-Checked([string]$FilePath, [string[]]$Arguments) {
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed (exit=$LASTEXITCODE): $FilePath $($Arguments -join ' ')"
  }
}

if ($env:OS -ne "Windows_NT") {
  throw "The VoxCPM2 TensorRT product runtime can only be built on Windows."
}

$manifestPath = Join-Path $PSScriptRoot "voxcpm2-runtime-manifest.json"
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.profile -ne "windows_trt_6g") {
  throw "Unexpected VoxCPM2 runtime profile: $($manifest.profile)"
}
if ($manifest.runtime.installPolicy.voxcpm -ne "no-deps") {
  throw "The Windows runtime must explicitly isolate VoxCPM from its unsupported torchcodec dependency."
}

if (-not $UvPath) {
  $UvPath = (Get-Command uv -ErrorAction Stop).Source
}
if (-not (Test-Path -LiteralPath $UvPath -PathType Leaf)) {
  throw "uv executable not found: $UvPath"
}

$outputParent = Split-Path -Parent $OutputDir
if (-not $outputParent) {
  $outputParent = (Get-Location).Path
  $OutputDir = Join-Path $outputParent $OutputDir
}
if (-not (Test-Path -LiteralPath $outputParent -PathType Container)) {
  New-Item -ItemType Directory -Force -Path $outputParent | Out-Null
}
$outputParent = (Resolve-Path -LiteralPath $outputParent).Path
$OutputDir = Join-Path $outputParent (Split-Path -Leaf $OutputDir)
$pending = "$OutputDir.pending-$PID"
if (Test-Path -LiteralPath $pending) {
  Remove-Item -LiteralPath $pending -Recurse -Force
}
if ((Test-Path -LiteralPath $OutputDir) -and -not $Force) {
  throw "Output already exists. Choose a new directory or pass -Force: $OutputDir"
}

New-Item -ItemType Directory -Force -Path $pending | Out-Null
if (-not $CacheDir) {
  $CacheDir = Join-Path $outputParent "voxcpm2-pip-cache"
}
New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null

try {
  $pythonVersion = [string]$manifest.runtime.python
  Invoke-Checked $UvPath @("python", "install", $pythonVersion)
  $sourcePython = (& $UvPath python find $pythonVersion).Trim()
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $sourcePython -PathType Leaf)) {
    throw "uv did not provide CPython $pythonVersion"
  }
  $sourcePythonRoot = Split-Path -Parent $sourcePython
  $pythonRoot = Join-Path $pending "python"
  Copy-Item -LiteralPath $sourcePythonRoot -Destination $pythonRoot -Recurse
  $python = Join-Path $pythonRoot "python.exe"
  # uv marks its shared interpreter as externally managed. The copied product
  # runtime is intentionally a private build artifact; remove the marker only
  # from that copy so TensorRT's metapackage can run its nested NVIDIA pip
  # install without mutating the shared uv interpreter.
  $managedMarker = Join-Path $pythonRoot "Lib\EXTERNALLY-MANAGED"
  if (Test-Path -LiteralPath $managedMarker -PathType Leaf) {
    Remove-Item -LiteralPath $managedMarker -Force
  }

  $packages = $manifest.runtime.packages
  $pipArgs = @(
    "-m", "pip", "install",
    "--break-system-packages", "--disable-pip-version-check",
    "--cache-dir", $CacheDir, "--no-warn-script-location"
  )
  $torchArgs = $pipArgs + @(
    "--index-url", "https://download.pytorch.org/whl/cu121",
    "torch==$($packages.torch)",
    "torchaudio==$($packages.torchaudio)"
  )
  Invoke-Checked $python $torchArgs

  $runtimePackageNames = @(
    "numpy", "soundfile", "huggingface-hub",
    "safetensors", "onnx", "transformers", "einops", "pydantic",
    "tqdm", "librosa", "regex", "inflect", "wetext"
  )
  $runtimeArgs = $pipArgs + @(
    "--index-url", "https://pypi.org/simple"
  )
  foreach ($name in $runtimePackageNames) {
    $version = [string]$packages.$name
    if (-not $version) { throw "Pinned package is missing from the runtime manifest: $name" }
    $runtimeArgs += "$name==$version"
  }
  Invoke-Checked $python $runtimeArgs
  Invoke-Checked $python ($pipArgs + @(
    "--index-url", "https://pypi.nvidia.com",
    "tensorrt-cu12_bindings==$($packages.'tensorrt-cu12_bindings')",
    "tensorrt-cu12_libs==$($packages.'tensorrt-cu12_libs')"
  ))
  Invoke-Checked $python ($pipArgs + @(
    "--index-url", "https://pypi.org/simple", "--no-deps",
    "tensorrt-cu12==$($packages.'tensorrt-cu12')"
  ))
  Invoke-Checked $python ($pipArgs + @(
    "--index-url", "https://pypi.org/simple",
    "--no-deps", "voxcpm==$($packages.voxcpm)"
  ))

  if (-not $VoiceSource) {
    $projectsRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")
    $VoiceSource = Join-Path $projectsRoot "naia-omni-cascade\assets\ref_audio\ref_ko_485.wav"
  }
  if (-not (Test-Path -LiteralPath $VoiceSource -PathType Leaf)) {
    throw "Reference voice not found: $VoiceSource"
  }
  $voices = Join-Path $pending "voices"
  New-Item -ItemType Directory -Force -Path $voices | Out-Null
  Copy-Item -LiteralPath $VoiceSource -Destination (Join-Path $voices "naia-default.wav")
  Copy-Item -LiteralPath $manifestPath -Destination (Join-Path $pending "runtime-manifest.json")

  $smoke = @'
import importlib.metadata as metadata
import torch, torchaudio, voxcpm, soundfile, tensorrt, onnx
from voxcpm.core import VoxCPM
from voxcpm.utils.text_normalize import TextNormalizer
assert torch.version.cuda == "12.1", torch.version.cuda
assert metadata.version("voxcpm") == "2.0.3"
assert metadata.version("tensorrt-cu12") == "10.3.0"
assert VoxCPM and TextNormalizer
print("VOXCPM2_RUNTIME_READY", torch.__version__, torchaudio.__version__, tensorrt.__version__)
'@
  $smokePath = Join-Path $pending "verify-runtime.py"
  [IO.File]::WriteAllText($smokePath, $smoke, [Text.UTF8Encoding]::new($false))
  Invoke-Checked $python @("-I", $smokePath)
  Remove-Item -LiteralPath $smokePath -Force

  if (Test-Path -LiteralPath $OutputDir) {
    Remove-Item -LiteralPath $OutputDir -Recurse -Force
  }
  Move-Item -LiteralPath $pending -Destination $OutputDir
  $size = (Get-ChildItem -LiteralPath $OutputDir -Recurse -File | Measure-Object Length -Sum).Sum
  Write-Output "VOXCPM2_RUNTIME_ARTIFACT path=$OutputDir bytes=$size"
} catch {
  if (Test-Path -LiteralPath $pending) {
    Remove-Item -LiteralPath $pending -Recurse -Force
  }
  throw
}
