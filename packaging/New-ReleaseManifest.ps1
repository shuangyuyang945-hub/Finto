param(
  [Parameter(Mandatory = $true)][string]$Version,
  [Parameter(Mandatory = $true)][string]$Repository,
  [string]$DistRoot = ''
)

$ErrorActionPreference = 'Stop'
if (-not $DistRoot) {
  $projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
  $DistRoot = Join-Path $projectRoot 'dist'
}
$installer = Join-Path $DistRoot "Finto-Setup-$Version.exe"
$portable = Join-Path $DistRoot 'Finto.exe'
if (-not (Test-Path -LiteralPath $installer)) { throw "Installer was not found: $installer" }
if (-not (Test-Path -LiteralPath $portable)) { throw "Portable app was not found: $portable" }

$releaseBase = "https://github.com/$Repository/releases/download/v$Version"
$manifest = [ordered]@{
  version = $Version
  installer_url = "$releaseBase/Finto-Setup-$Version.exe"
  portable_url = "$releaseBase/Finto.exe"
  sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $installer).Hash.ToLowerInvariant()
  published_at = (Get-Date).ToUniversalTime().ToString('o')
  notes_url = "https://github.com/$Repository/releases/tag/v$Version"
}
$output = Join-Path $DistRoot 'release.json'
[System.IO.File]::WriteAllText($output, ($manifest | ConvertTo-Json), [System.Text.UTF8Encoding]::new($false))
Write-Output $output
