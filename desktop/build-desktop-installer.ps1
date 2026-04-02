$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$downloadsDir = Join-Path $repoRoot 'downloads'
$sourceRoot = Join-Path $downloadsDir 'win-unpacked'
$workDir = Join-Path $repoRoot '.local\desktop-installer'
$payloadZip = Join-Path $workDir 'Lexorium-payload.zip'
$outputExe = Join-Path $downloadsDir 'Lexorium-Setup.exe'
$bootstrapSource = Join-Path $PSScriptRoot 'bootstrap-launcher.cs'
$builderCmd = Join-Path $repoRoot 'node_modules\.bin\electron-builder.cmd'
$cscPath = 'C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe'

if (!(Test-Path $builderCmd)) {
  throw "electron-builder.cmd was not found at $builderCmd"
}

$shouldBuildDesktop = !(Test-Path (Join-Path $sourceRoot 'Lexorium.exe'))

if ($shouldBuildDesktop) {
  Push-Location $repoRoot
  try {
    & $builderCmd --win dir
    if ($LASTEXITCODE -ne 0) {
      throw "electron-builder --win dir failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
}

if (!(Test-Path $sourceRoot)) {
  throw "Expected desktop build output at $sourceRoot"
}

New-Item -ItemType Directory -Path $workDir -Force | Out-Null
Remove-Item -LiteralPath $payloadZip -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $outputExe -Force -ErrorAction SilentlyContinue

Compress-Archive -Path (Join-Path $sourceRoot '*') -DestinationPath $payloadZip -Force

if (!(Test-Path $bootstrapSource)) {
  throw "Expected bootstrap source at $bootstrapSource"
}

if (!(Test-Path $cscPath)) {
  throw "csc.exe was not found at $cscPath"
}

$cscArgs = @(
  '/nologo',
  '/target:winexe',
  "/out:$outputExe",
  "/resource:$payloadZip,Lexorium.Payload.zip",
  '/r:System.IO.Compression.dll',
  '/r:System.IO.Compression.FileSystem.dll',
  '/r:System.Windows.Forms.dll',
  $bootstrapSource
)

& $cscPath @cscArgs

if ($LASTEXITCODE -ne 0) {
  throw "csc.exe failed with exit code $LASTEXITCODE"
}

Write-Host "Built desktop installer at $outputExe"
