# ==============================================================================
# IRON FLEET FIXTURES GENERATOR
# tests/fixtures/generate_fixtures.ps1
# Pure .NET System.Drawing fixture generator for orthographic mock sprites
# ==============================================================================

param(
    [string]$FixturesDir = $PSScriptRoot
)

Add-Type -AssemblyName System.Drawing

function Create-PngSprite {
    param(
        [string]$Path,
        [int]$Width,
        [int]$Height,
        [scriptblock]$DrawAction
    )
    $dir = Split-Path -Parent $Path
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }

    $bmp = New-Object System.Drawing.Bitmap $Width, $Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $gfx = [System.Drawing.Graphics]::FromImage($bmp)
    $gfx.Clear([System.Drawing.Color]::Transparent)

    if ($DrawAction) {
        & $DrawAction $gfx $Width $Height
    }

    $gfx.Dispose()
    # Save to file
    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

# 1. sample_ship (256x64 px, ship bow pointing +X)
$shipDir = Join-Path $FixturesDir "sample_ship"

# Color map: hull polygon, bow pointing right (+X)
Create-PngSprite -Path (Join-Path $shipDir "color0001.png") -Width 256 -Height 64 -DrawAction {
    param($g, $w, $h)
    $hullBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 75, 85, 95))
    $deckBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 110, 120, 130))
    $bridgeBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 140, 150, 160))
    
    $points = @(
        [System.Drawing.Point]::new(20, 20),
        [System.Drawing.Point]::new(210, 20),
        [System.Drawing.Point]::new(250, 32), # Bow at +X
        [System.Drawing.Point]::new(210, 44),
        [System.Drawing.Point]::new(20, 44)
    )
    $g.FillPolygon($hullBrush, $points)
    $g.FillRectangle($deckBrush, 40, 24, 140, 16)
    $g.FillRectangle($bridgeBrush, 80, 27, 40, 10)

    $hullBrush.Dispose()
    $deckBrush.Dispose()
    $bridgeBrush.Dispose()
}

# Normal map: RGB(128, 128, 255) flat +Z normal, Alpha encodes height
Create-PngSprite -Path (Join-Path $shipDir "normal0001.png") -Width 256 -Height 64 -DrawAction {
    param($g, $w, $h)
    $hullNormBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(150, 128, 128, 255))
    $deckNormBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(200, 128, 128, 255))
    $bridgeNormBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(240, 128, 128, 255))

    $points = @(
        [System.Drawing.Point]::new(20, 20),
        [System.Drawing.Point]::new(210, 20),
        [System.Drawing.Point]::new(250, 32),
        [System.Drawing.Point]::new(210, 44),
        [System.Drawing.Point]::new(20, 44)
    )
    $g.FillPolygon($hullNormBrush, $points)
    $g.FillRectangle($deckNormBrush, 40, 24, 140, 16)
    $g.FillRectangle($bridgeNormBrush, 80, 27, 40, 10)

    $hullNormBrush.Dispose()
    $deckNormBrush.Dispose()
    $bridgeNormBrush.Dispose()
}

# 2. sample_turret (64x32 px, barrel pointing +X)
$turretDir = Join-Path $FixturesDir "sample_turret"
Create-PngSprite -Path (Join-Path $turretDir "color0001.png") -Width 64 -Height 32 -DrawAction {
    param($g, $w, $h)
    $baseBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 60, 70, 80))
    $barrelBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 40, 45, 50))
    
    # Gun barrel facing +X
    $g.FillRectangle($barrelBrush, 24, 14, 36, 4)
    # Turret dome
    $g.FillEllipse($baseBrush, 8, 8, 22, 16)

    $baseBrush.Dispose()
    $barrelBrush.Dispose()
}

Create-PngSprite -Path (Join-Path $turretDir "normal0001.png") -Width 64 -Height 32 -DrawAction {
    param($g, $w, $h)
    $normBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(220, 128, 128, 255))
    $g.FillEllipse($normBrush, 8, 8, 22, 16)
    $g.FillRectangle($normBrush, 24, 14, 36, 4)
    $normBrush.Dispose()
}

# 3. mismatched_dimensions (Color 256x64, Normal 128x64) for boundary testing (T2.4)
$mismatchDir = Join-Path $FixturesDir "mismatched_dimensions"
Create-PngSprite -Path (Join-Path $mismatchDir "color0001.png") -Width 256 -Height 64 -DrawAction {
    param($g, $w, $h)
    $b = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 100, 100, 100))
    $g.FillRectangle($b, 10, 10, 230, 44)
    $b.Dispose()
}
Create-PngSprite -Path (Join-Path $mismatchDir "normal0001.png") -Width 128 -Height 64 -DrawAction {
    param($g, $w, $h)
    $b = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(128, 128, 128, 255))
    $g.FillRectangle($b, 10, 10, 108, 44)
    $b.Dispose()
}

# 4. non_png_files for boundary testing (T2.5)
$nonPngDir = Join-Path $FixturesDir "non_png_files"
if (-not (Test-Path $nonPngDir)) { New-Item -ItemType Directory -Path $nonPngDir -Force | Out-Null }
Set-Content -Path (Join-Path $nonPngDir "notes.txt") -Value "Sample text file inside fixture dir" -Encoding UTF8
Set-Content -Path (Join-Path $nonPngDir "model.blend") -Value "BLENDER-v293 mock header" -Encoding UTF8

# 5. empty_dir for boundary testing (T2.3)
$emptyDir = Join-Path $FixturesDir "empty_dir"
if (-not (Test-Path $emptyDir)) { New-Item -ItemType Directory -Path $emptyDir -Force | Out-Null }

Write-Host "Fixtures successfully generated at: $FixturesDir" -ForegroundColor Green
