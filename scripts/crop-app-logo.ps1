# Recadre app-logo-square.png / public/app-logo.png : supprime la marge blanche autour du carré bleu.
# Usage : powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/crop-app-logo.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Add-Type -AssemblyName System.Drawing

$source = Join-Path $root 'src-tauri\icons\app-logo-source.png'
if (-not (Test-Path $source)) {
    $source = Join-Path $root 'public\app-logo.png'
}

$bmp = [System.Drawing.Bitmap]::FromFile($source)
$minX = $bmp.Width
$minY = $bmp.Height
$maxX = 0
$maxY = 0

for ($y = 0; $y -lt $bmp.Height; $y++) {
    for ($x = 0; $x -lt $bmp.Width; $x++) {
        $c = $bmp.GetPixel($x, $y)
        if ($c.A -gt 10 -and ($c.R -lt 250 -or $c.G -lt 250 -or $c.B -lt 250)) {
            if ($x -lt $minX) { $minX = $x }
            if ($y -lt $minY) { $minY = $y }
            if ($x -gt $maxX) { $maxX = $x }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }
}

$w = $maxX - $minX + 1
$h = $maxY - $minY + 1
$size = [Math]::Max($w, $h)
$cx = [int](($minX + $maxX) / 2)
$cy = [int](($minY + $maxY) / 2)
$left = [Math]::Max(0, $cx - [int]($size / 2))
$top = [Math]::Max(0, $cy - [int]($size / 2))
if ($left + $size -gt $bmp.Width) { $left = $bmp.Width - $size }
if ($top + $size -gt $bmp.Height) { $top = $bmp.Height - $size }
if ($left -lt 0) { $left = 0 }
if ($top -lt 0) { $top = 0 }

$crop = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($crop)
$g.Clear([System.Drawing.Color]::FromArgb(255, 255, 255, 255))
$g.DrawImage(
    $bmp,
    (New-Object System.Drawing.Rectangle 0, 0, $size, $size),
    (New-Object System.Drawing.Rectangle $left, $top, $size, $size),
    [System.Drawing.GraphicsUnit]::Pixel
)
$g.Dispose()
$bmp.Dispose()

$publicOut = Join-Path $root 'public\app-logo.png'
$squareOut = Join-Path $root 'src-tauri\icons\app-logo-square.png'
$crop.Save($publicOut, [System.Drawing.Imaging.ImageFormat]::Png)
$crop.Save($squareOut, [System.Drawing.Imaging.ImageFormat]::Png)
$crop.Dispose()

Write-Host "Logo recadre : ${size}x${size} -> $publicOut"
