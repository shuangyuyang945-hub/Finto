param(
  [string]$Python = "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe",
  [switch]$Installer,
  [string]$SignTool = '',
  [string]$CertificateThumbprint = '',
  [string]$TimestampUrl = 'http://timestamp.digicert.com'
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$distRoot = Join-Path $projectRoot 'dist'
$workRoot = Join-Path $projectRoot 'build\pyinstaller'
$specRoot = Join-Path $projectRoot 'build'
$icon = Join-Path $PSScriptRoot 'finto.ico'
$version = (Get-Content -LiteralPath (Join-Path $projectRoot 'VERSION') -Raw).Trim()
$versionParts = @($version.Split('.') | ForEach-Object { [int]$_ })
while ($versionParts.Count -lt 4) { $versionParts += 0 }
$versionTuple = ($versionParts[0..3] -join ', ')
$versionTemplate = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'version_info.template.txt') -Raw
$versionInfo = Join-Path $specRoot 'version_info.txt'

if (-not (Test-Path -LiteralPath $Python)) { throw "Python was not found: $Python" }
if (($SignTool -and -not $CertificateThumbprint) -or ($CertificateThumbprint -and -not $SignTool)) {
  throw 'Both SignTool and CertificateThumbprint are required for code signing.'
}
if ($SignTool -and -not (Test-Path -LiteralPath $SignTool)) { throw "SignTool was not found: $SignTool" }

function Sign-FintoFile {
  param([string]$Path)
  if (-not $SignTool) { return }
  & $SignTool sign /sha1 $CertificateThumbprint /fd SHA256 /tr $TimestampUrl /td SHA256 $Path
  if ($LASTEXITCODE -ne 0) { throw "Code signing failed: $Path" }
  & $SignTool verify /pa /v $Path
  if ($LASTEXITCODE -ne 0) { throw "Code-signature verification failed: $Path" }
}

& (Join-Path $PSScriptRoot 'Create-Icon.ps1') | Out-Null
New-Item -ItemType Directory -Path $specRoot -Force | Out-Null
[System.IO.File]::WriteAllText($versionInfo, $versionTemplate.Replace('__VERSION_TUPLE__', $versionTuple).Replace('__VERSION__', $version))

& $Python -m PyInstaller `
  --noconfirm `
  --clean `
  --onefile `
  --windowed `
  --name Finto `
  --icon $icon `
  --version-file $versionInfo `
  --add-data "$projectRoot\web;web" `
  --add-data "$projectRoot\VERSION;." `
  --add-data "$projectRoot\release-channel.json;." `
  --distpath $distRoot `
  --workpath $workRoot `
  --specpath $specRoot `
  (Join-Path $projectRoot 'desktop.py')

if ($LASTEXITCODE -ne 0) { throw 'Finto executable build failed.' }
Sign-FintoFile -Path (Join-Path $distRoot 'Finto.exe')

if ($Installer) {
  $isccCandidates = @(
    "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
    'C:\Program Files (x86)\Inno Setup 6\ISCC.exe',
    'C:\Program Files\Inno Setup 6\ISCC.exe'
  )
  $iscc = $isccCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if (-not $iscc) { throw 'Inno Setup 6 was not found. Only Finto.exe can be built.' }
  & $iscc "/DProjectRoot=$projectRoot" "/DAppVersion=$version" (Join-Path $PSScriptRoot 'Finto.iss')
  if ($LASTEXITCODE -ne 0) { throw 'Finto installer build failed.' }
  Sign-FintoFile -Path (Join-Path $distRoot "Finto-Setup-$version.exe")
}

Write-Output (Join-Path $distRoot 'Finto.exe')
