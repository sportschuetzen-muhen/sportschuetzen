# sync-berichte.ps1
# Synchronisiert Live-Berichte und Bilder von GitHub (sportschuetzen-muhen/website)

[System.Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
$ErrorActionPreference = "Stop"

$repoOwner = "sportschuetzen-muhen"
$repoName = "website"
$branch = "main"

$baseRawUrl = "https://raw.githubusercontent.com/$repoOwner/$repoName/$branch"
$berichteUrl = "$baseRawUrl/data/berichte.json"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$dataDir = Join-Path $scriptDir "frontend\data"
$targetFile = Join-Path $dataDir "berichte.json"
$backupFile = Join-Path $dataDir "berichte.json.bak"
$imgDir = Join-Path $scriptDir "frontend\img\reports"

Write-Host "[1/3] Pruefe lokale Ordner..."
if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Force -Path $dataDir | Out-Null }
if (-not (Test-Path $imgDir)) { New-Item -ItemType Directory -Force -Path $imgDir | Out-Null }

Write-Host "[2/3] Erstelle lokales Backup der berichte.json..."
if (Test-Path $targetFile) {
    Copy-Item -Path $targetFile -Destination $backupFile -Force
    Write-Host "      Backup erstellt: frontend\data\berichte.json.bak"
} else {
    Write-Host "      (Keine vorherige berichte.json vorhanden)"
}

Write-Host "[3/3] Lade aktuelle Live-Berichte von GitHub herunter..."
Write-Host "      Quelle: $berichteUrl"

try {
    $progressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $berichteUrl -OutFile $targetFile -UseBasicParsing -TimeoutSec 20
    $json = Get-Content $targetFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $count = $json.Count
    Write-Host "      [OK] $count Berichte erfolgreich aktualisiert!" -ForegroundColor Green
} catch {
    Write-Host "      [FEHLER] Download fehlgeschlagen: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[Bilder] Pruefe zugehoerige Bericht-Bilder..."
$rawText = Get-Content $targetFile -Raw -Encoding UTF8
$matches = [regex]::Matches($rawText, 'img/reports/([a-zA-Z0-9_\-\.]+)')
$filenames = @()
foreach ($m in $matches) {
    if ($m.Groups[1].Value) {
        $filenames += $m.Groups[1].Value
    }
}

$uniqueFiles = $filenames | Select-Object -Unique
Write-Host "      Gefundene Bild-Referenzen: $($uniqueFiles.Count)"
$downloaded = 0
$skipped = 0

foreach ($fn in $uniqueFiles) {
    $localImg = Join-Path $imgDir $fn
    if (Test-Path $localImg) {
        $skipped++
        continue
    }
    $imgUrl = "$baseRawUrl/img/reports/$fn"
    Write-Host -NoNewline "      Lade $fn... "
    try {
        Invoke-WebRequest -Uri $imgUrl -OutFile $localImg -UseBasicParsing -TimeoutSec 20
        Write-Host "OK" -ForegroundColor Green
        $downloaded++
    } catch {
        Write-Host "Fehler ($($_.Exception.Message))" -ForegroundColor Yellow
    }
}

if ($downloaded -gt 0) {
    Write-Host "      [OK] $downloaded neue(s) Bild(er) heruntergeladen!" -ForegroundColor Green
} else {
    Write-Host "      Alle Bilder sind bereits lokal vorhanden ($skipped geprueft)." -ForegroundColor Gray
}
