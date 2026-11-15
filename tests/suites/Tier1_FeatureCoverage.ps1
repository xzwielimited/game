# ==============================================================================
# IRON FLEET E2E TEST SUITE - TIER 1: FEATURE COVERAGE (50 TESTS)
# tests/suites/Tier1_FeatureCoverage.ps1
# Covers Features F1 through F10 (5 tests per feature)
# ==============================================================================

# ------------------------------------------------------------------------------
# Feature 1: Rust Dev Toolchain (F1)
# ------------------------------------------------------------------------------

Register-TestCase -Id "T1.1.1" -Tier 1 -Feature "F1_RustDevToolchain" `
    -Name "Verify rustc --version succeeds and runs nightly toolchain" -ScriptBlock {
    param($ctx)
    $res = Assert-CommandSuccess -Executable "rustc" -Arguments @("--version") -Message "rustc --version failed"
    Assert-True ($res.StdOut -match "rustc\s+1\.\d+\.\d+-nightly") "Expected rustc nightly compiler, but got: $($res.StdOut)"
}

Register-TestCase -Id "T1.1.2" -Tier 1 -Feature "F1_RustDevToolchain" `
    -Name "Verify cargo --version succeeds" -ScriptBlock {
    param($ctx)
    $res = Assert-CommandSuccess -Executable "cargo" -Arguments @("--version") -Message "cargo --version failed"
    Assert-True ($res.StdOut -match "cargo\s+1\.\d+\.\d+") "Expected valid cargo version, but got: $($res.StdOut)"
}

Register-TestCase -Id "T1.1.3" -Tier 1 -Feature "F1_RustDevToolchain" `
    -Name "Verify wasm32-unknown-unknown target is installed" -ScriptBlock {
    param($ctx)
    $res = Assert-CommandSuccess -Executable "rustup" -Arguments @("target", "list", "--installed") -Message "rustup target list failed"
    Assert-True ($res.StdOut -match "wasm32-unknown-unknown") "wasm32-unknown-unknown target is not installed in rustup"
}

Register-TestCase -Id "T1.1.4" -Tier 1 -Feature "F1_RustDevToolchain" `
    -Name "Verify trunk --version succeeds" -ScriptBlock {
    param($ctx)
    $res = Assert-CommandSuccess -Executable "trunk" -Arguments @("--version") -Message "trunk --version failed"
    Assert-True ($res.StdOut -match "trunk\s+0\.\d+\.\d+") "Expected valid trunk version (0.21.x), but got: $($res.StdOut)"
}

Register-TestCase -Id "T1.1.5" -Tier 1 -Feature "F1_RustDevToolchain" `
    -Name "Verify all toolchain binaries are discoverable in active PATH" -ScriptBlock {
    param($ctx)
    $requiredTools = @("rustc", "cargo", "rustup", "trunk", "git")
    foreach ($tool in $requiredTools) {
        $found = Resolve-Tool $tool
        Assert-True ($null -ne $found -and (Test-Path $found)) "Tool '$tool' could not be resolved in active PATH or standard locations"
    }
}

# ------------------------------------------------------------------------------
# Feature 2: Codebase Structure & Trees (F2)
# ------------------------------------------------------------------------------

Register-TestCase -Id "T1.2.1" -Tier 1 -Feature "F2_CodebaseStructure" `
    -Name "Verify root Cargo workspace configuration" -ScriptBlock {
    param($ctx)
    $cargoToml = Join-Path $ctx.RepoRoot "Cargo.toml"
    Assert-FileExists -Path $cargoToml -Message "Root Cargo.toml is missing"
    Assert-FileContains -Path $cargoToml -Pattern "\[workspace\]" -Message "Root Cargo.toml does not define [workspace]"
    Assert-FileContains -Path $cargoToml -Pattern '"common"' -Message "Root Cargo.toml workspace does not include 'common'"
    Assert-FileContains -Path $cargoToml -Pattern '"server"' -Message "Root Cargo.toml workspace does not include 'server'"
    Assert-FileContains -Path $cargoToml -Pattern '"client"' -Message "Root Cargo.toml workspace does not include 'client'"
}

Register-TestCase -Id "T1.2.2" -Tier 1 -Feature "F2_CodebaseStructure" `
    -Name "Verify common crate manifest exists and is valid" -ScriptBlock {
    param($ctx)
    $toml = Join-Path $ctx.RepoRoot "common\Cargo.toml"
    Assert-FileExists -Path $toml -Message "common/Cargo.toml is missing"
    Assert-FileContains -Path $toml -Pattern 'name\s*=\s*"common"' -Message "common/Cargo.toml package name is not 'common'"
}

Register-TestCase -Id "T1.2.3" -Tier 1 -Feature "F2_CodebaseStructure" `
    -Name "Verify server crate manifest exists and is valid" -ScriptBlock {
    param($ctx)
    $toml = Join-Path $ctx.RepoRoot "server\Cargo.toml"
    Assert-FileExists -Path $toml -Message "server/Cargo.toml is missing"
    Assert-FileContains -Path $toml -Pattern 'name\s*=\s*"server"' -Message "server/Cargo.toml package name is not 'server'"
}

Register-TestCase -Id "T1.2.4" -Tier 1 -Feature "F2_CodebaseStructure" `
    -Name "Verify client crate manifest and index.html exist" -ScriptBlock {
    param($ctx)
    $toml = Join-Path $ctx.RepoRoot "client\Cargo.toml"
    $html = Join-Path $ctx.RepoRoot "client\index.html"
    Assert-FileExists -Path $toml -Message "client/Cargo.toml is missing"
    Assert-FileExists -Path $html -Message "client/index.html is missing"
    Assert-FileContains -Path $toml -Pattern 'name\s*=\s*"client"' -Message "client/Cargo.toml package name is not 'client'"
}

Register-TestCase -Id "T1.2.5" -Tier 1 -Feature "F2_CodebaseStructure" `
    -Name "Verify engine submodule/directory contains kodiak crates" -ScriptBlock {
    param($ctx)
    $engineDir = Join-Path $ctx.RepoRoot "engine"
    Assert-DirectoryExists -Path $engineDir -Message "engine directory is missing"
    $engineCargo = Join-Path $engineDir "Cargo.toml"
    Assert-FileExists -Path $engineCargo -Message "engine/Cargo.toml is missing"
}

# ------------------------------------------------------------------------------
# Feature 3: Independent Rebranding (F3)
# ------------------------------------------------------------------------------

Register-TestCase -Id "T1.3.1" -Tier 1 -Feature "F3_Rebranding" `
    -Name "Verify client web page title matches 'Iron Fleet'" -ScriptBlock {
    param($ctx)
    $html = Join-Path $ctx.RepoRoot "client\index.html"
    Assert-FileExists -Path $html -Message "client/index.html is missing"
    Assert-FileContains -Path $html -Pattern "<title>\s*(?i:Iron Fleet)\s*</title>" -Message "client/index.html title is not 'Iron Fleet'"
    Assert-FileNotContains -Path $html -Pattern "<title>\s*(?i:mk48\.io)\s*</title>" -Message "client/index.html still contains 'mk48.io' in <title>"
}

Register-TestCase -Id "T1.3.2" -Tier 1 -Feature "F3_Rebranding" `
    -Name "Verify web app manifest displays 'Iron Fleet' as application name" -ScriptBlock {
    param($ctx)
    $manifestPaths = @(
        (Join-Path $ctx.RepoRoot "client\data\manifest.json"),
        (Join-Path $ctx.RepoRoot "client\manifest.json")
    )
    $found = $manifestPaths | Where-Object { Test-Path $_ -PathType Leaf } | Select-Object -First 1
    Assert-True ($null -ne $found) "Web app manifest.json not found in client/data/ or client/"
    
    $manifest = Assert-JsonValid -Path $found
    Assert-True ($manifest.name -match "(?i)Iron Fleet") "manifest.json 'name' ($($manifest.name)) does not contain 'Iron Fleet'"
    Assert-True ($manifest.short_name -match "(?i)Iron Fleet") "manifest.json 'short_name' ($($manifest.short_name)) does not contain 'Iron Fleet'"
    if ($manifest.id) {
        Assert-False ($manifest.id -match "mk48") "manifest.json 'id' ($($manifest.id)) contains legacy 'mk48'"
    }
}

Register-TestCase -Id "T1.3.3" -Tier 1 -Feature "F3_Rebranding" `
    -Name "Verify common GameConstants defines name as 'Iron Fleet'" -ScriptBlock {
    param($ctx)
    $libRs = Join-Path $ctx.RepoRoot "common\src\lib.rs"
    Assert-FileExists -Path $libRs -Message "common/src/lib.rs is missing"
    Assert-FileContains -Path $libRs -Pattern 'name:\s*"Iron Fleet"' -Message "GameConstants name in common/src/lib.rs is not 'Iron Fleet'"
    Assert-FileContains -Path $libRs -Pattern 'domain:\s*"ironfleet\.io"' -Message "GameConstants domain in common/src/lib.rs is not 'ironfleet.io'"
}

Register-TestCase -Id "T1.3.4" -Tier 1 -Feature "F3_Rebranding" `
    -Name "Verify zero unauthorized 'mk48.io' trademark references in user-facing UI" -ScriptBlock {
    param($ctx)
    $uiFiles = @(
        (Join-Path $ctx.RepoRoot "client\index.html")
    )
    $manifest = Join-Path $ctx.RepoRoot "client\data\manifest.json"
    if (Test-Path $manifest) { $uiFiles += $manifest }

    $uiSrc = Join-Path $ctx.RepoRoot "client\src\ui"
    if (Test-Path $uiSrc) {
        $uiFiles += (Get-ChildItem -Path $uiSrc -Filter "*.rs" | Select-Object -ExpandProperty FullName)
    }

    foreach ($f in $uiFiles) {
        if (Test-Path $f) {
            $lines = Get-Content -Path $f -Encoding UTF8
            $lineNum = 0
            foreach ($line in $lines) {
                $lineNum++
                # Exclude code license comments / SPDX
                if ($line -match "SPDX-" -or $line -match "Softbear" -or $line -match "//\s*SPDX") { continue }
                if ($line -match "(?i)\bmk48\.io\b") {
                    throw "Unauthorized 'mk48.io' trademark reference found in $f at line $lineNum : $line"
                }
            }
        }
    }
}

Register-TestCase -Id "T1.3.5" -Tier 1 -Feature "F3_Rebranding" `
    -Name "Verify client HUD logo component references new brand identity" -ScriptBlock {
    param($ctx)
    $logoRs = Join-Path $ctx.RepoRoot "client\src\ui\logo.rs"
    Assert-FileExists -Path $logoRs -Message "client/src/ui/logo.rs is missing"
    
    # Positive assertion: HUD logo component must reference the Iron Fleet brand identity
    # Accepts SVG text, accessibility labels (aria-label), SVG titles, or branded element IDs
    Assert-FileContains -Path $logoRs -Pattern '(?i)Iron[\s_-]*Fleet' `
        -Message "client/src/ui/logo.rs does not reference new brand identity 'Iron Fleet'"
    
    # Negative assertion: HUD logo component must not retain legacy mk48 vector glyph paths
    Assert-FileNotContains -Path $logoRs -Pattern 'id="path85"|id="path89"' `
        -Message "client/src/ui/logo.rs still contains legacy mk48 vector glyph paths (path85/path89)"
}

# ------------------------------------------------------------------------------
# Feature 4: AGPL-3.0 License Compliance (F4)
# ------------------------------------------------------------------------------

Register-TestCase -Id "T1.4.1" -Tier 1 -Feature "F4_LicenseCompliance" `
    -Name "Verify root LICENSE file retains AGPL-3.0 text" -ScriptBlock {
    param($ctx)
    $license = Join-Path $ctx.RepoRoot "LICENSE"
    Assert-FileExists -Path $license -Message "Root LICENSE file is missing"
    Assert-FileContains -Path $license -Pattern "GNU AFFERO GENERAL PUBLIC LICENSE" -Message "LICENSE is not GNU Affero GPL"
    Assert-FileContains -Path $license -Pattern "Version 3" -Message "LICENSE is not Version 3"
}

Register-TestCase -Id "T1.4.2" -Tier 1 -Feature "F4_LicenseCompliance" `
    -Name "Verify SPDX headers and Softbear copyright preserved in source files" -ScriptBlock {
    param($ctx)
    $filesToCheck = @(
        (Join-Path $ctx.RepoRoot "common\src\lib.rs"),
        (Join-Path $ctx.RepoRoot "server\src\main.rs"),
        (Join-Path $ctx.RepoRoot "client\src\main.rs")
    )
    foreach ($f in $filesToCheck) {
        Assert-FileExists -Path $f -Message "Source file '$f' is missing"
        Assert-FileContains -Path $f -Pattern "SPDX-License-Identifier:\s*AGPL-3\.0" -Message "Missing SPDX AGPL-3.0 header in $f"
        Assert-FileContains -Path $f -Pattern "Softbear,\s*Inc\." -Message "Missing Softbear copyright attribution in $f"
    }
}

Register-TestCase -Id "T1.4.3" -Tier 1 -Feature "F4_LicenseCompliance" `
    -Name "Verify engine sub-licensing (LGPL-3.0) preserved in engine directory" -ScriptBlock {
    param($ctx)
    $engineLicense = Join-Path $ctx.RepoRoot "engine\LICENSE"
    if (Test-Path $engineLicense) {
        Assert-FileContains -Path $engineLicense -Pattern "GNU LESSER GENERAL PUBLIC LICENSE|LGPL-3\.0" -Message "Engine LICENSE does not mention LGPL-3.0"
    } else {
        # Check source headers in engine crates
        $engineSrc = Get-ChildItem -Path (Join-Path $ctx.RepoRoot "engine") -Filter "*.rs" -Recurse | Select-Object -First 5
        Assert-True ($engineSrc.Count -gt 0) "No source files found in engine directory"
        $hasLgpl = $false
        foreach ($f in $engineSrc) {
            $c = Get-Content $f.FullName -Raw -Encoding UTF8
            if ($c -match "LGPL-3\.0|SPDX-License-Identifier:\s*LGPL") { $hasLgpl = $true; break }
        }
        Assert-True $hasLgpl "Engine files do not contain LGPL-3.0 license headers"
    }
}

Register-TestCase -Id "T1.4.4" -Tier 1 -Feature "F4_LicenseCompliance" `
    -Name "Verify open source repository link is present for AGPL-3.0 compliance" -ScriptBlock {
    param($ctx)
    $files = @(
        (Join-Path $ctx.RepoRoot "client\src\ui\game_ui.rs"),
        (Join-Path $ctx.RepoRoot "client\src\ui\about_dialog.rs"),
        (Join-Path $ctx.RepoRoot "client\index.html"),
        (Join-Path $ctx.RepoRoot "README.md")
    )
    $foundRepoLink = $false
    foreach ($f in $files) {
        if (Test-Path $f) {
            $c = Get-Content $f -Raw -Encoding UTF8
            if ($c -match "https://github\.com/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+") {
                $foundRepoLink = $true
                break
            }
        }
    }
    Assert-True $foundRepoLink "Source code repository link for AGPL-3.0 network interaction is missing"
}

Register-TestCase -Id "T1.4.5" -Tier 1 -Feature "F4_LicenseCompliance" `
    -Name "Verify author attribution preserved in Cargo manifests and documentation" -ScriptBlock {
    param($ctx)
    # 1. Documentation author attribution
    $readme = Join-Path $ctx.RepoRoot "README.md"
    Assert-FileExists -Path $readme -Message "README.md is missing"
    Assert-FileContains -Path $readme -Pattern "Softbear" `
        -Message "README.md does not preserve Softbear author attribution"

    # 2. Crate manifests author attribution
    $manifestsToCheck = @(
        (Join-Path $ctx.RepoRoot "common\Cargo.toml"),
        (Join-Path $ctx.RepoRoot "server\Cargo.toml"),
        (Join-Path $ctx.RepoRoot "client\Cargo.toml")
    )
    foreach ($manifest in $manifestsToCheck) {
        Assert-FileExists -Path $manifest -Message "Cargo manifest '$manifest' is missing"
        Assert-FileContains -Path $manifest -Pattern 'authors\s*=\s*\[.*Softbear.*\]' `
            -Message "Cargo manifest '$manifest' does not preserve Softbear author attribution"
    }

    # 3. Root workspace manifest author attribution (if workspace package metadata is defined)
    $rootToml = Join-Path $ctx.RepoRoot "Cargo.toml"
    if (Test-Path $rootToml) {
        $rootContent = Get-Content -Path $rootToml -Raw -Encoding UTF8
        if ($rootContent -match 'authors\s*=') {
            Assert-FileContains -Path $rootToml -Pattern 'authors\s*=\s*\[.*Softbear.*\]' `
                -Message "Root Cargo.toml defines authors but does not preserve Softbear attribution"
        }
    }
}

# ------------------------------------------------------------------------------
# Feature 5: Spritesheet Utility Tool (F5)
# ------------------------------------------------------------------------------

Register-TestCase -Id "T1.5.1" -Tier 1 -Feature "F5_SpritesheetUtil" `
    -Name "Verify tools/sprite_sheet_util crate exists" -ScriptBlock {
    param($ctx)
    $toml = Join-Path $ctx.RepoRoot "tools\sprite_sheet_util\Cargo.toml"
    Assert-FileExists -Path $toml -Message "tools/sprite_sheet_util/Cargo.toml is missing"
    Assert-FileContains -Path $toml -Pattern 'name\s*=\s*"sprite_sheet_util"' -Message "Package name is not 'sprite_sheet_util'"
}

Register-TestCase -Id "T1.5.2" -Tier 1 -Feature "F5_SpritesheetUtil" `
    -Name "Verify sprite_sheet_util compiles cleanly with cargo check" -ScriptBlock {
    param($ctx)
    $toml = Join-Path $ctx.RepoRoot "tools\sprite_sheet_util\Cargo.toml"
    $res = Assert-CommandSuccess -Executable "cargo" -Arguments @("check", "--manifest-path", "`"$toml`"") -WorkingDir $ctx.RepoRoot -TimeoutSeconds 120 -Message "cargo check for sprite_sheet_util failed"
}

Register-TestCase -Id "T1.5.3" -Tier 1 -Feature "F5_SpritesheetUtil" `
    -Name "Verify sprite_sheet_util supports CLI arguments for input and output" -ScriptBlock {
    param($ctx)
    $toml = Join-Path $ctx.RepoRoot "tools\sprite_sheet_util\Cargo.toml"
    $res = Assert-CommandSuccess -Executable "cargo" -Arguments @("run", "--manifest-path", "`"$toml`"", "--", "--help") -WorkingDir $ctx.RepoRoot -TimeoutSeconds 120 -Message "cargo run -- --help failed for sprite_sheet_util"
    Assert-True ($res.StdOut -match "(?i)input" -or $res.StdOut -match "-i") "CLI help output does not mention input argument"
    Assert-True ($res.StdOut -match "(?i)output" -or $res.StdOut -match "-o") "CLI help output does not mention output argument"
}

Register-TestCase -Id "T1.5.4" -Tier 1 -Feature "F5_SpritesheetUtil" `
    -Name "Verify sprite_sheet_util generates valid dual atlas dimensions" -ScriptBlock {
    param($ctx)
    $toml = Join-Path $ctx.RepoRoot "tools\sprite_sheet_util\Cargo.toml"
    $inDir = Join-Path $ctx.FixturesDir "sample_ship"
    $outDir = Join-Path $ctx.SandboxDir "out_atlas"
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null

    $res = Assert-CommandSuccess -Executable "cargo" -Arguments @("run", "--manifest-path", "`"$toml`"", "--", "--input", "`"$inDir`"", "--output", "`"$outDir`"") -WorkingDir $ctx.RepoRoot -TimeoutSeconds 180 -Message "sprite_sheet_util failed to pack sample_ship fixture"

    $colorAtlas = Join-Path $outDir "sprites_webgl.png"
    $normalAtlas = Join-Path $outDir "sprites_normal_webgl.png"
    Assert-FileExists -Path $colorAtlas -Message "sprites_webgl.png was not generated"
    Assert-FileExists -Path $normalAtlas -Message "sprites_normal_webgl.png was not generated"

    # Verify matching dimensions
    Add-Type -AssemblyName System.Drawing
    $bytes = [System.IO.File]::ReadAllBytes($colorAtlas)
    $ms = New-Object System.IO.MemoryStream(,$bytes)
    $bmp = [System.Drawing.Image]::FromStream($ms)
    $w = $bmp.Width; $h = $bmp.Height
    $bmp.Dispose(); $ms.Dispose()

    Assert-True ($w -gt 0 -and $h -gt 0) "Generated atlas dimensions must be greater than 0"
    Assert-ImageDimensions -ImagePath $normalAtlas -ExpectedWidth $w -ExpectedHeight $h -Message "Normal atlas dimensions must match color atlas"
}

Register-TestCase -Id "T1.5.5" -Tier 1 -Feature "F5_SpritesheetUtil" `
    -Name "Verify generated UV coordinate JSON manifest schema" -ScriptBlock {
    param($ctx)
    $toml = Join-Path $ctx.RepoRoot "tools\sprite_sheet_util\Cargo.toml"
    $inDir = Join-Path $ctx.FixturesDir "sample_ship"
    $outDir = Join-Path $ctx.SandboxDir "out_manifest"
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null

    Assert-CommandSuccess -Executable "cargo" -Arguments @("run", "--manifest-path", "`"$toml`"", "--", "--input", "`"$inDir`"", "--output", "`"$outDir`"") -WorkingDir $ctx.RepoRoot -TimeoutSeconds 180 -Message "sprite_sheet_util execution failed"

    $jsonPath = Join-Path $outDir "sprites_webgl.json"
    Assert-FileExists -Path $jsonPath -Message "sprites_webgl.json was not generated"

    $manifest = Assert-JsonValid -Path $jsonPath
    Assert-True ($null -ne $manifest.sprites) "JSON manifest missing top-level 'sprites' object"
}

# ------------------------------------------------------------------------------
# Feature 6: 3D-to-Spritesheet Pipeline (F6)
# ------------------------------------------------------------------------------

Register-TestCase -Id "T1.6.1" -Tier 1 -Feature "F6_Pipeline3D" `
    -Name "Verify sample ship fixture is transparent 32bppArgb PNG" -ScriptBlock {
    param($ctx)
    $colorPath = Join-Path $ctx.FixturesDir "sample_ship\color0001.png"
    $normalPath = Join-Path $ctx.FixturesDir "sample_ship\normal0001.png"
    Assert-FileExists -Path $colorPath -Message "color0001.png fixture is missing"
    Assert-FileExists -Path $normalPath -Message "normal0001.png fixture is missing"

    Add-Type -AssemblyName System.Drawing
    $bytes = [System.IO.File]::ReadAllBytes($colorPath)
    $ms = New-Object System.IO.MemoryStream(,$bytes)
    $bmp = New-Object System.Drawing.Bitmap $ms
    try {
        Assert-Equal $bmp.Width 256 "Expected color fixture width 256"
        Assert-Equal $bmp.Height 64 "Expected color fixture height 64"
        # Check corner pixel is transparent
        $corner = $bmp.GetPixel(0, 0)
        Assert-Equal $corner.A 0 "Expected pixel (0,0) alpha to be 0 (transparent)"
    } finally {
        $bmp.Dispose()
        $ms.Dispose()
    }
}

Register-TestCase -Id "T1.6.2" -Tier 1 -Feature "F6_Pipeline3D" `
    -Name "Verify sample ship sprite pair processes without error" -ScriptBlock {
    param($ctx)
    $toml = Join-Path $ctx.RepoRoot "tools\sprite_sheet_util\Cargo.toml"
    $inDir = Join-Path $ctx.FixturesDir "sample_ship"
    $outDir = Join-Path $ctx.SandboxDir "out_pipeline"
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null

    $res = Assert-CommandSuccess -Executable "cargo" -Arguments @("run", "--manifest-path", "`"$toml`"", "--", "--input", "`"$inDir`"", "--output", "`"$outDir`"") -WorkingDir $ctx.RepoRoot -TimeoutSeconds 180 -Message "Processing sample_ship fixture failed"
    Assert-False ($res.StdOut -match "panicked" -or $res.StdErr -match "panicked") "Process panicked during ship sprite packaging"
}

Register-TestCase -Id "T1.6.3" -Tier 1 -Feature "F6_Pipeline3D" `
    -Name "Verify color sprite atlas output has valid PNG header" -ScriptBlock {
    param($ctx)
    $toml = Join-Path $ctx.RepoRoot "tools\sprite_sheet_util\Cargo.toml"
    $inDir = Join-Path $ctx.FixturesDir "sample_ship"
    $outDir = Join-Path $ctx.SandboxDir "out_png_header"
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null

    Assert-CommandSuccess -Executable "cargo" -Arguments @("run", "--manifest-path", "`"$toml`"", "--", "--input", "`"$inDir`"", "--output", "`"$outDir`"") -WorkingDir $ctx.RepoRoot -TimeoutSeconds 180 -Message "sprite_sheet_util failed"

    $colorAtlas = Join-Path $outDir "sprites_webgl.png"
    Assert-FileExists -Path $colorAtlas
    $bytes = [System.IO.File]::ReadAllBytes($colorAtlas)
    Assert-True ($bytes.Length -gt 8) "PNG file size too small"
    # PNG Magic Bytes: 89 50 4E 47 0D 0A 1A 0A
    $expectedMagic = @(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)
    for ($i = 0; $i -lt 8; $i++) {
        Assert-Equal $bytes[$i] $expectedMagic[$i] "Byte at offset $i does not match PNG magic number"
    }
}

Register-TestCase -Id "T1.6.4" -Tier 1 -Feature "F6_Pipeline3D" `
    -Name "Verify normal sprite atlas matches color atlas dimensions" -ScriptBlock {
    param($ctx)
    $toml = Join-Path $ctx.RepoRoot "tools\sprite_sheet_util\Cargo.toml"
    $inDir = Join-Path $ctx.FixturesDir "sample_ship"
    $outDir = Join-Path $ctx.SandboxDir "out_dimensions_match"
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null

    Assert-CommandSuccess -Executable "cargo" -Arguments @("run", "--manifest-path", "`"$toml`"", "--", "--input", "`"$inDir`"", "--output", "`"$outDir`"") -WorkingDir $ctx.RepoRoot -TimeoutSeconds 180 -Message "sprite_sheet_util failed"

    $colorAtlas = Join-Path $outDir "sprites_webgl.png"
    $normalAtlas = Join-Path $outDir "sprites_normal_webgl.png"

    Add-Type -AssemblyName System.Drawing
    $bytesC = [System.IO.File]::ReadAllBytes($colorAtlas)
    $msC = New-Object System.IO.MemoryStream(,$bytesC)
    $bmpC = [System.Drawing.Image]::FromStream($msC)

    $bytesN = [System.IO.File]::ReadAllBytes($normalAtlas)
    $msN = New-Object System.IO.MemoryStream(,$bytesN)
    $bmpN = [System.Drawing.Image]::FromStream($msN)

    try {
        Assert-Equal $bmpN.Width $bmpC.Width "Normal atlas width does not match color atlas width"
        Assert-Equal $bmpN.Height $bmpC.Height "Normal atlas height does not match color atlas height"
    } finally {
        $bmpC.Dispose(); $msC.Dispose()
        $bmpN.Dispose(); $msN.Dispose()
    }
}

Register-TestCase -Id "T1.6.5" -Tier 1 -Feature "F6_Pipeline3D" `
    -Name "Verify generated UV manifest maps sprite ID to normalized coordinates" -ScriptBlock {
    param($ctx)
    $toml = Join-Path $ctx.RepoRoot "tools\sprite_sheet_util\Cargo.toml"
    $inDir = Join-Path $ctx.FixturesDir "sample_ship"
    $outDir = Join-Path $ctx.SandboxDir "out_uv_coords"
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null

    Assert-CommandSuccess -Executable "cargo" -Arguments @("run", "--manifest-path", "`"$toml`"", "--", "--input", "`"$inDir`"", "--output", "`"$outDir`"") -WorkingDir $ctx.RepoRoot -TimeoutSeconds 180 -Message "sprite_sheet_util failed"

    $jsonPath = Join-Path $outDir "sprites_webgl.json"
    $manifest = Assert-JsonValid -Path $jsonPath

    # Verify sprites entry exists and uvs are normalized in [0.0, 1.0]
    $spriteKeys = $manifest.sprites | Get-Member -MemberType NoteProperty | Select-Object -ExpandProperty Name
    Assert-True ($spriteKeys.Count -gt 0) "No sprites found in manifest 'sprites' map"
    
    $firstKey = $spriteKeys[0]
    $firstSprite = $manifest.sprites.$firstKey
    Assert-True ($null -ne $firstSprite.aspect) "Sprite $firstKey is missing 'aspect'"
    Assert-True ($null -ne $firstSprite.uvs) "Sprite $firstKey is missing 'uvs'"
    
    foreach ($quad in $firstSprite.uvs) {
        foreach ($coord in $quad) {
            $val = [double]$coord
            Assert-True ($val -ge 0.0 -and $val -le 1.0) "UV coordinate $val out of range [0.0, 1.0]"
        }
    }
}

# ------------------------------------------------------------------------------
# Feature 7: Native Server Compilation (F7)
# ------------------------------------------------------------------------------

Register-TestCase -Id "T1.7.1" -Tier 1 -Feature "F7_ServerCompilation" `
    -Name "Verify cargo check --bin server exits with code 0" -ScriptBlock {
    param($ctx)
    $serverDir = Join-Path $ctx.RepoRoot "server"
    $res = Assert-CommandSuccess -Executable "cargo" -Arguments @("check", "--bin", "server") -WorkingDir $serverDir -TimeoutSeconds 180 -Message "cargo check --bin server failed"
}

Register-TestCase -Id "T1.7.2" -Tier 1 -Feature "F7_ServerCompilation" `
    -Name "Verify server compilation has zero critical errors" -ScriptBlock {
    param($ctx)
    $serverDir = Join-Path $ctx.RepoRoot "server"
    $res = Assert-CommandSuccess -Executable "cargo" -Arguments @("check", "--bin", "server") -WorkingDir $serverDir -TimeoutSeconds 180 -Message "cargo check failed"
    $errorLines = ($res.StdErr -split "`n") | Where-Object { $_ -match "^error(\[[A-Z0-9]+\])?:" }
    Assert-Equal $errorLines.Count 0 "Critical compiler errors found in server crate: $($errorLines -join '; ')"
}

Register-TestCase -Id "T1.7.3" -Tier 1 -Feature "F7_ServerCompilation" `
    -Name "Verify server default constants and configuration parse cleanly" -ScriptBlock {
    param($ctx)
    $serverRs = Join-Path $ctx.RepoRoot "server\src\server.rs"
    $commonLib = Join-Path $ctx.RepoRoot "common\src\lib.rs"
    Assert-FileExists -Path $serverRs -Message "server/src/server.rs is missing"
    Assert-FileExists -Path $commonLib -Message "common/src/lib.rs is missing"

    # 1. Parse and validate GameConstants definition in common/src/lib.rs
    $commonContent = Get-Content -Path $commonLib -Raw -Encoding UTF8
    $hasConstants = $commonContent -match '(?s)(?:pub\s+const\s+\w+_CONSTANTS\s*:\s*&(?:\''static\s+)?GameConstants\s*=\s*&GameConstants\s*\{)(.*?)\};'
    Assert-True $hasConstants "common/src/lib.rs does not define a GameConstants structure"

    $constantsBody = $matches[1]

    # Validate name configuration
    Assert-True ($constantsBody -match 'name:\s*"([^"]+)"') "GameConstants missing valid 'name' field"
    $configName = $matches[1]
    Assert-True ($configName.Trim().Length -gt 0) "Server constant 'name' cannot be blank"

    # Validate domain configuration syntax (RFC 1123)
    Assert-True ($constantsBody -match 'domain:\s*"([^"]+)"') "GameConstants missing valid 'domain' field"
    $configDomain = $matches[1]
    Assert-True ($configDomain -match '^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$') "Server constant 'domain' ('$configDomain') has invalid domain syntax"

    # Validate server_names region list
    Assert-True ($constantsBody -match '(?s)server_names:\s*&\[(.*?)\]') "GameConstants missing 'server_names' configuration"
    $serverList = $matches[1]
    Assert-True ($serverList -match '"[^"]+"') "GameConstants server_names list must contain at least one server name"

    # 2. Validate ArenaService constant bindings in server/src/server.rs
    $serverContent = Get-Content -Path $serverRs -Raw -Encoding UTF8
    Assert-True ($serverContent -match 'impl\s+ArenaService\s+for\s+Server\s*\{') "server/src/server.rs does not implement ArenaService"
    Assert-True ($serverContent -match 'const\s+GAME_CONSTANTS\s*:\s*&''static\s+GameConstants\s*=\s*\w+_CONSTANTS;') "Server does not bind GAME_CONSTANTS to common constants"
    Assert-True ($serverContent -match 'const\s+TICK_PERIOD_SECS\s*:\s*f32\s*=') "Server does not configure TICK_PERIOD_SECS"
    Assert-True ($serverContent -match 'const\s+LIMBO\s*:\s*Duration\s*=\s*Duration::from_secs\(\s*(\d+)\s*\);') "Server does not configure LIMBO duration"
    $limboSecs = [int]$matches[1]
    Assert-True ($limboSecs -ge 1 -and $limboSecs -le 60) "Server LIMBO duration ($limboSecs s) out of reasonable operational range (1-60s)"

    # 3. Validate runtime JSON configuration files if present
    $domainBackup = Join-Path $ctx.RepoRoot "server\domain_backup.json"
    if (Test-Path $domainBackup) {
        Assert-JsonValid -Path $domainBackup -Message "server/domain_backup.json failed to parse as valid JSON"
    }

    # 4. If server executable is already compiled, verify CLI configuration parser with option flags
    $exeCandidates = @(
        (Join-Path $ctx.RepoRoot "target\debug\server.exe"),
        (Join-Path $ctx.RepoRoot "server\target\debug\server.exe")
    )
    $foundExe = $exeCandidates | Where-Object { Test-Path $_ -PathType Leaf } | Select-Object -First 1
    if ($foundExe) {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = $foundExe
        $psi.Arguments = "--domain-backup domain_test.json --debug-game info --help"
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError = $true
        $psi.UseShellExecute = $false
        $psi.CreateNoWindow = $true
        $proc = [System.Diagnostics.Process]::Start($psi)
        $proc.WaitForExit(5000)
        Assert-True ($proc.HasExited) "server.exe hung during configuration argument parsing"
    }
}

Register-TestCase -Id "T1.7.4" -Tier 1 -Feature "F7_ServerCompilation" -IsLongRunning `
    -Name "Verify server executable builds successfully with cargo build" -ScriptBlock {
    param($ctx)
    $serverDir = Join-Path $ctx.RepoRoot "server"
    $res = Assert-CommandSuccess -Executable "cargo" -Arguments @("build", "--bin", "server") -WorkingDir $serverDir -TimeoutSeconds 300 -Message "cargo build --bin server failed"
    
    $exeCandidates = @(
        (Join-Path $ctx.RepoRoot "target\debug\server.exe"),
        (Join-Path $serverDir "target\debug\server.exe")
    )
    $foundExe = $exeCandidates | Where-Object { Test-Path $_ -PathType Leaf } | Select-Object -First 1
    Assert-True ($null -ne $foundExe) "Compiled server.exe binary not found in target/debug/"
    $size = (Get-Item $foundExe).Length
    Assert-True ($size -gt 100000) "server.exe size ($size bytes) is suspiciously small"
}

Register-TestCase -Id "T1.7.5" -Tier 1 -Feature "F7_ServerCompilation" -IsLongRunning `
    -Name "Verify server binary executes and handles --help or initialization" -ScriptBlock {
    param($ctx)
    $exeCandidates = @(
        (Join-Path $ctx.RepoRoot "target\debug\server.exe"),
        (Join-Path $ctx.RepoRoot "server\target\debug\server.exe")
    )
    $foundExe = $exeCandidates | Where-Object { Test-Path $_ -PathType Leaf } | Select-Object -First 1
    if (-not $foundExe) {
        # Build server first if not yet built
        Assert-CommandSuccess -Executable "cargo" -Arguments @("build", "--bin", "server") -WorkingDir $ctx.RepoRoot -TimeoutSeconds 300 -Message "Failed to build server for execution test"
        $foundExe = $exeCandidates | Where-Object { Test-Path $_ -PathType Leaf } | Select-Object -First 1
    }
    Assert-True ($null -ne $foundExe) "server.exe binary not found"
    
    # Run with --help
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $foundExe
    $psi.Arguments = "--help"
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $proc = [System.Diagnostics.Process]::Start($psi)
    $proc.WaitForExit(10000)
    # Even if exit code is 0 or 1, ensure process terminated without unhandled system fault
    Assert-True ($proc.HasExited) "server.exe failed to terminate on --help"
}

# ------------------------------------------------------------------------------
# Feature 8: Wasm Client Compilation (F8)
# ------------------------------------------------------------------------------

Register-TestCase -Id "T1.8.1" -Tier 1 -Feature "F8_ClientCompilation" `
    -Name "Verify cargo check client for wasm32 target succeeds" -ScriptBlock {
    param($ctx)
    $clientDir = Join-Path $ctx.RepoRoot "client"
    $res = Assert-CommandSuccess -Executable "cargo" -Arguments @("check", "--target", "wasm32-unknown-unknown", "-p", "client") -WorkingDir $clientDir -TimeoutSeconds 180 -Message "cargo check client for wasm32 target failed"
}

Register-TestCase -Id "T1.8.2" -Tier 1 -Feature "F8_ClientCompilation" -IsLongRunning `
    -Name "Verify trunk build compiles client WebAssembly distribution" -ScriptBlock {
    param($ctx)
    $clientDir = Join-Path $ctx.RepoRoot "client"
    $res = Assert-CommandSuccess -Executable "trunk" -Arguments @("build", "--filehash", "false") -WorkingDir $clientDir -TimeoutSeconds 300 -Message "trunk build in client directory failed"
    $distDir = Join-Path $clientDir "dist"
    Assert-DirectoryExists -Path $distDir -Message "client/dist directory was not created by trunk build"
}

Register-TestCase -Id "T1.8.3" -Tier 1 -Feature "F8_ClientCompilation" `
    -Name "Verify client/dist/index.html is generated" -ScriptBlock {
    param($ctx)
    $distHtml = Join-Path $ctx.RepoRoot "client\dist\index.html"
    Assert-FileExists -Path $distHtml -Message "client/dist/index.html is missing. Run trunk build first."
    $size = (Get-Item $distHtml).Length
    Assert-True ($size -gt 100) "client/dist/index.html file size is too small ($size bytes)"
}

Register-TestCase -Id "T1.8.4" -Tier 1 -Feature "F8_ClientCompilation" `
    -Name "Verify compiled .wasm binary exists with valid WebAssembly magic header" -ScriptBlock {
    param($ctx)
    $distDir = Join-Path $ctx.RepoRoot "client\dist"
    Assert-DirectoryExists -Path $distDir -Message "client/dist directory is missing"
    $wasms = Get-ChildItem -Path $distDir -Filter "*.wasm"
    Assert-True ($wasms.Count -gt 0) "No .wasm files found in client/dist/"
    
    $wasmFile = $wasms[0].FullName
    $bytes = [System.IO.File]::ReadAllBytes($wasmFile)
    Assert-True ($bytes.Length -gt 1024) "Wasm file size is too small"
    # WebAssembly Magic Header: 00 61 73 6D (\0asm)
    $expected = @(0x00, 0x61, 0x73, 0x6D)
    for ($i = 0; $i -lt 4; $i++) {
        Assert-Equal $bytes[$i] $expected[$i] "Offset $i in wasm file is not WebAssembly magic header"
    }
}

Register-TestCase -Id "T1.8.5" -Tier 1 -Feature "F8_ClientCompilation" `
    -Name "Verify wasm-bindgen JavaScript glue code exists in client/dist/" -ScriptBlock {
    param($ctx)
    $distDir = Join-Path $ctx.RepoRoot "client\dist"
    Assert-DirectoryExists -Path $distDir -Message "client/dist directory is missing"
    $jsFiles = Get-ChildItem -Path $distDir -Filter "*.js"
    Assert-True ($jsFiles.Count -gt 0) "No .js glue code files found in client/dist/"
    
    $glueCode = Get-Content $jsFiles[0].FullName -Raw -Encoding UTF8
    Assert-True ($glueCode -match "wasm" -or $glueCode -match "__wbg_") "JS file does not contain wasm initialization bindings"
}

# ------------------------------------------------------------------------------
# Feature 9: Automated Unit/Integration Testing (F9)
# ------------------------------------------------------------------------------

Register-TestCase -Id "T1.9.1" -Tier 1 -Feature "F9_AutomatedTesting" `
    -Name "Verify cargo test -p common runs and passes" -ScriptBlock {
    param($ctx)
    $res = Assert-CommandSuccess -Executable "cargo" -Arguments @("test", "-p", "common") -WorkingDir $ctx.RepoRoot -TimeoutSeconds 180 -Message "cargo test -p common failed"
    Assert-True ($res.StdOut -match "test result: ok\.") "common unit tests did not report 'test result: ok.'"
}

Register-TestCase -Id "T1.9.2" -Tier 1 -Feature "F9_AutomatedTesting" `
    -Name "Verify cargo test -p server runs and passes" -ScriptBlock {
    param($ctx)
    $res = Assert-CommandSuccess -Executable "cargo" -Arguments @("test", "-p", "server") -WorkingDir $ctx.RepoRoot -TimeoutSeconds 180 -Message "cargo test -p server failed"
    Assert-True ($res.StdOut -match "test result: ok\.") "server unit tests did not report 'test result: ok.'"
}

Register-TestCase -Id "T1.9.3" -Tier 1 -Feature "F9_AutomatedTesting" `
    -Name "Verify physics and spatial collision unit tests pass without panic" -ScriptBlock {
    param($ctx)
    $res = Assert-CommandSuccess -Executable "cargo" -Arguments @("test", "-p", "common", "--", "terrain") -WorkingDir $ctx.RepoRoot -TimeoutSeconds 180 -Message "physics/collision tests failed"
    Assert-False ($res.StdOut -match "FAILED" -or $res.StdOut -match "panicked") "Collision unit test failure or panic detected"
}

Register-TestCase -Id "T1.9.4" -Tier 1 -Feature "F9_AutomatedTesting" `
    -Name "Verify binary network packet serialization unit tests pass" -ScriptBlock {
    param($ctx)
    $res = Assert-CommandSuccess -Executable "cargo" -Arguments @("test", "-p", "common", "--", "packet") -WorkingDir $ctx.RepoRoot -TimeoutSeconds 180 -Message "packet serialization unit tests failed"
    Assert-False ($res.StdOut -match "FAILED") "Packet serialization tests failed"
}

Register-TestCase -Id "T1.9.5" -Tier 1 -Feature "F9_AutomatedTesting" -IsLongRunning `
    -Name "Verify full workspace cargo test executes cleanly" -ScriptBlock {
    param($ctx)
    $res = Assert-CommandSuccess -Executable "cargo" -Arguments @("test", "--workspace", "--no-fail-fast") -WorkingDir $ctx.RepoRoot -TimeoutSeconds 300 -Message "Full workspace cargo test failed"
    Assert-True ($res.StdOut -match "test result: ok\.") "Full workspace test run did not succeed"
}

# ------------------------------------------------------------------------------
# Feature 10: Workspace Preservation & Documentation (F10)
# ------------------------------------------------------------------------------

Register-TestCase -Id "T1.10.1" -Tier 1 -Feature "F10_PreservationDocs" `
    -Name "Verify legacy workspace scratch/game is intact and unmodified" -ScriptBlock {
    param($ctx)
    $gameDir = Join-Path $ctx.ScratchRoot "game"
    Assert-DirectoryExists -Path $gameDir -Message "scratch/game directory is missing"
    
    $files = Get-ChildItem -Path $gameDir -File -Recurse
    Assert-Equal $files.Count 82 "Expected exactly 82 files in scratch/game, got $($files.Count)"
    
    $totalBytes = ($files | Measure-Object -Property Length -Sum).Sum
    Assert-Equal $totalBytes 1451826 "Expected total size 1451826 bytes in scratch/game, got $totalBytes"
}

Register-TestCase -Id "T1.10.2" -Tier 1 -Feature "F10_PreservationDocs" `
    -Name "Verify legacy workspace scratch/game_m12_latest is intact and unmodified" -ScriptBlock {
    param($ctx)
    $m12Dir = Join-Path $ctx.ScratchRoot "game_m12_latest"
    Assert-DirectoryExists -Path $m12Dir -Message "scratch/game_m12_latest directory is missing"

    $files = Get-ChildItem -Path $m12Dir -File -Recurse
    Assert-Equal $files.Count 83 "Expected exactly 83 files in scratch/game_m12_latest, got $($files.Count)"

    $totalBytes = ($files | Measure-Object -Property Length -Sum).Sum
    Assert-Equal $totalBytes 1041709 "Expected total size 1041709 bytes in scratch/game_m12_latest, got $totalBytes"
}

Register-TestCase -Id "T1.10.3" -Tier 1 -Feature "F10_PreservationDocs" `
    -Name "Verify HANDOFF.md exists in project root" -ScriptBlock {
    param($ctx)
    $handoff = Join-Path $ctx.RepoRoot "HANDOFF.md"
    Assert-FileExists -Path $handoff -Message "HANDOFF.md is missing from project root"
    $size = (Get-Item $handoff).Length
    Assert-True ($size -gt 500) "HANDOFF.md is too short ($size bytes)"
}

Register-TestCase -Id "T1.10.4" -Tier 1 -Feature "F10_PreservationDocs" `
    -Name "Verify HANDOFF.md contains required operational sections" -ScriptBlock {
    param($ctx)
    $handoff = Join-Path $ctx.RepoRoot "HANDOFF.md"
    Assert-FileExists -Path $handoff -Message "HANDOFF.md is missing"
    $content = Get-Content -Path $handoff -Raw -Encoding UTF8
    Assert-True ($content -match "(?i)environment|setup") "HANDOFF.md lacks Environment / Setup section"
    Assert-True ($content -match "(?i)architecture|structure") "HANDOFF.md lacks Architecture section"
    Assert-True ($content -match "(?i)build|runbook|instructions") "HANDOFF.md lacks Build / Instructions section"
    Assert-True ($content -match "(?i)roadmap|next steps") "HANDOFF.md lacks Roadmap / Next Steps section"
}

Register-TestCase -Id "T1.10.5" -Tier 1 -Feature "F10_PreservationDocs" `
    -Name "Verify scratch root contains only authorized directories" -ScriptBlock {
    param($ctx)
    $rootItems = Get-ChildItem -Path $ctx.ScratchRoot
    $allowedDirs = @("game", "game_m12_latest", "naval_combat_rust", "teamwork")
    
    foreach ($item in $rootItems) {
        if ($item.PSIsContainer) {
            Assert-True ($item.Name -in $allowedDirs) "Unauthorized directory '$($item.Name)' found in scratch root"
        } else {
            throw "Unauthorized dangling file '$($item.Name)' found in scratch root"
        }
    }
}
