# ==============================================================================
# IRON FLEET E2E TEST SUITE - TIER 3: CROSS-FEATURE INTERACTIONS (5 TESTS)
# tests/suites/Tier3_CrossFeature.ps1
# Pairwise & cross-crate integration testing
# ==============================================================================

Register-TestCase -Id "T3.1" -Tier 3 -Feature "Cross_Toolchain_Client" -IsLongRunning `
    -Name "Verify Trunk cleanly invokes Rust Nightly compiler for wasm32 target" -ScriptBlock {
    param($ctx)
    $clientDir = Join-Path $ctx.RepoRoot "client"
    $res = Assert-CommandSuccess -Executable "trunk" -Arguments @("build", "--filehash", "false") -WorkingDir $clientDir -TimeoutSeconds 300 -Message "Trunk failed to interface with Rust Nightly or wasm32 target"
    
    $distDir = Join-Path $clientDir "dist"
    Assert-DirectoryExists -Path $distDir
    $wasm = Get-ChildItem -Path $distDir -Filter "*.wasm"
    Assert-True ($wasm.Count -gt 0) "No .wasm binary produced by Trunk build"
}

Register-TestCase -Id "T3.2" -Tier 3 -Feature "Cross_Spritesheet_Client" `
    -Name "Verify sprite_sheet_util output conforms to Kodiak UvSpriteSheet schema" -ScriptBlock {
    param($ctx)
    $toml = Join-Path $ctx.RepoRoot "tools\sprite_sheet_util\Cargo.toml"
    $inDir = Join-Path $ctx.FixturesDir "sample_ship"
    $outDir = Join-Path $ctx.SandboxDir "cross_spritesheet"
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null

    Assert-CommandSuccess -Executable "cargo" -Arguments @("run", "--manifest-path", "`"$toml`"", "--", "--input", "`"$inDir`"", "--output", "`"$outDir`"") -WorkingDir $ctx.RepoRoot -TimeoutSeconds 180 -Message "sprite_sheet_util failed"

    $jsonPath = Join-Path $outDir "sprites_webgl.json"
    $manifest = Assert-JsonValid -Path $jsonPath -Message "sprites_webgl.json is not valid JSON"

    # Schema verification: 'sprites' object, quad UV coordinates [[u,v] x 4]
    Assert-True ($null -ne $manifest.sprites) "Missing top-level 'sprites' object"
    
    $firstKey = ($manifest.sprites | Get-Member -MemberType NoteProperty | Select-Object -First 1).Name
    $spriteData = $manifest.sprites.$firstKey
    Assert-True ($null -ne $spriteData.aspect) "Sprite data missing 'aspect'"
    Assert-True ($null -ne $spriteData.uvs) "Sprite data missing 'uvs'"

    # Image dimensions power-of-two check
    $pngPath = Join-Path $outDir "sprites_webgl.png"
    Add-Type -AssemblyName System.Drawing
    $bytes = [System.IO.File]::ReadAllBytes($pngPath)
    $ms = New-Object System.IO.MemoryStream(,$bytes)
    $bmp = [System.Drawing.Image]::FromStream($ms)
    $w = $bmp.Width; $h = $bmp.Height
    $bmp.Dispose(); $ms.Dispose()

    # Power of two test: (w & (w - 1)) == 0
    Assert-True (($w -band ($w - 1)) -eq 0) "Texture width $w is not a power-of-two"
    Assert-True (($h -band ($h - 1)) -eq 0) "Texture height $h is not a power-of-two"
}

Register-TestCase -Id "T3.3" -Tier 3 -Feature "Cross_Rebranding_Sync" `
    -Name "Verify brand consistency across common constants, client HTML, and manifest" -ScriptBlock {
    param($ctx)
    # 1. common/src/lib.rs
    $libRs = Join-Path $ctx.RepoRoot "common\src\lib.rs"
    Assert-FileExists -Path $libRs
    $libContent = Get-Content -Path $libRs -Raw -Encoding UTF8
    Assert-True ($libContent -match 'name:\s*"Iron Fleet"') "common/src/lib.rs name does not match 'Iron Fleet'"

    # 2. client/index.html
    $html = Join-Path $ctx.RepoRoot "client\index.html"
    Assert-FileExists -Path $html
    $htmlContent = Get-Content -Path $html -Raw -Encoding UTF8
    Assert-True ($htmlContent -match "<title>\s*(?i:Iron Fleet)\s*</title>") "client/index.html title does not match 'Iron Fleet'"

    # 3. manifest.json
    $manifestPath = Join-Path $ctx.RepoRoot "client\data\manifest.json"
    if (-not (Test-Path $manifestPath)) { $manifestPath = Join-Path $ctx.RepoRoot "client\manifest.json" }
    if (Test-Path $manifestPath) {
        $manifest = Assert-JsonValid -Path $manifestPath
        Assert-True ($manifest.name -match "(?i)Iron Fleet") "manifest.json name does not match 'Iron Fleet'"
    }
}

Register-TestCase -Id "T3.4" -Tier 3 -Feature "Cross_Server_Common" `
    -Name "Verify server crate correctly links and consumes common physics types" -ScriptBlock {
    param($ctx)
    $serverDir = Join-Path $ctx.RepoRoot "server"
    $res = Assert-CommandSuccess -Executable "cargo" -Arguments @("test", "-p", "server", "--", "world") -WorkingDir $ctx.RepoRoot -TimeoutSeconds 180 -Message "server world tests testing common linkage failed"
    Assert-False ($res.StdOut -match "FAILED") "Server tests exercising common types failed"
}

Register-TestCase -Id "T3.5" -Tier 3 -Feature "Cross_Preservation_Isolation" `
    -Name "Verify build artifacts are strictly isolated from legacy workspaces" -ScriptBlock {
    param($ctx)
    $legacyDirs = @(
        (Join-Path $ctx.ScratchRoot "game"),
        (Join-Path $ctx.ScratchRoot "game_m12_latest")
    )
    foreach ($d in $legacyDirs) {
        $targetDirs = Get-ChildItem -Path $d -Filter "target" -Directory -Recurse
        Assert-Equal $targetDirs.Count 0 "Found leaked 'target' directory in legacy workspace $d"

        $distDirs = Get-ChildItem -Path $d -Filter "dist" -Directory -Recurse
        # Legacy vite dist might exist in game/dist, but verify no wasm build leaks
        $wasmFiles = Get-ChildItem -Path $d -Filter "*.wasm" -Recurse
        Assert-Equal $wasmFiles.Count 0 "Found leaked '.wasm' binary in legacy workspace $d"
    }
}
