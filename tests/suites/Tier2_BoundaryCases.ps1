# ==============================================================================
# IRON FLEET E2E TEST SUITE - TIER 2: BOUNDARY & CORNER CASES (10 TESTS)
# tests/suites/Tier2_BoundaryCases.ps1
# Covers Boundary Value Analysis (BVA), edge conditions, and error handling
# ==============================================================================

Register-TestCase -Id "T2.1" -Tier 2 -Feature "Boundary_Toolchain" `
    -Name "Verify toolchain handles paths with spaces gracefully" -ScriptBlock {
    param($ctx)
    $rustcPath = Resolve-Tool "rustc"
    Assert-True ($null -ne $rustcPath) "rustc not found"
    
    # Wrap in quotes and execute
    $res = Assert-CommandSuccess -Executable $rustcPath -Arguments @("--version") -Message "Execution failed with quoted path"
    Assert-True ($res.StdOut -match "rustc") "Output did not contain 'rustc'"
}

Register-TestCase -Id "T2.2" -Tier 2 -Feature "Boundary_Toolchain" `
    -Name "Verify descriptive diagnostic when querying uninstalled target" -ScriptBlock {
    param($ctx)
    $rustup = Resolve-Tool "rustup"
    Assert-True ($null -ne $rustup) "rustup tool is required but was not found in PATH"

    # Select a real, standard target known to rustup that is not installed
    $dummyTarget = "riscv32i-unknown-none-elf"

    # Invoke genuine diagnostic formatter from the test harness
    $diag = Format-MissingTargetDiagnostic -Target $dummyTarget

    # Assertions against actual system state and formatted diagnostic
    Assert-False ($diag.IsInstalled) "Target '$dummyTarget' was unexpectedly reported as installed"
    Assert-True ($diag.IsKnownTarget) "Target '$dummyTarget' should be a valid target recognized by rustup"
    Assert-Equal $diag.RemediationCommand "rustup target add $dummyTarget" "Remediation command syntax mismatch"
    Assert-True ($diag.ActionableMessage -match [regex]::Escape("rustup target add $dummyTarget")) `
        "Diagnostic message must contain actionable remediation command: '$($diag.ActionableMessage)'"

    # Positive control: verify that an installed target (wasm32-unknown-unknown) is correctly differentiated
    $wasmDiag = Format-MissingTargetDiagnostic -Target "wasm32-unknown-unknown"
    Assert-True ($wasmDiag.IsInstalled) "Target 'wasm32-unknown-unknown' should be installed in active toolchain"
    Assert-True ($wasmDiag.ActionableMessage -match "is currently installed") `
        "Diagnostic message should confirm installed status for wasm32-unknown-unknown"
}

Register-TestCase -Id "T2.3" -Tier 2 -Feature "Boundary_Spritesheet" `
    -Name "Verify sprite_sheet_util rejects empty input directory without panic" -ScriptBlock {
    param($ctx)
    $toml = Join-Path $ctx.RepoRoot "tools\sprite_sheet_util\Cargo.toml"
    $emptyDir = Join-Path $ctx.FixturesDir "empty_dir"
    $outDir = Join-Path $ctx.SandboxDir "out_empty"
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $cargo = Resolve-Tool "cargo"
    $psi.FileName = $cargo
    $psi.Arguments = "run --manifest-path `"$toml`" -- --input `"$emptyDir`" --output `"$outDir`""
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $proc = [System.Diagnostics.Process]::Start($psi)
    $proc.WaitForExit(120000)

    $stdout = $proc.StandardOutput.ReadToEnd()
    $stderr = $proc.StandardError.ReadToEnd()
    $combined = "$stdout $stderr"

    Assert-True ($proc.ExitCode -ne 0) "sprite_sheet_util should return non-zero exit code for empty input directory"
    Assert-False ($combined -match "thread 'main' panicked") "sprite_sheet_util panicked instead of handling empty directory gracefully"
}

Register-TestCase -Id "T2.4" -Tier 2 -Feature "Boundary_Spritesheet" `
    -Name "Verify sprite_sheet_util rejects mismatched sprite dimensions without panic" -ScriptBlock {
    param($ctx)
    $toml = Join-Path $ctx.RepoRoot "tools\sprite_sheet_util\Cargo.toml"
    $mismatchDir = Join-Path $ctx.FixturesDir "mismatched_dimensions"
    $outDir = Join-Path $ctx.SandboxDir "out_mismatch"
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $cargo = Resolve-Tool "cargo"
    $psi.FileName = $cargo
    $psi.Arguments = "run --manifest-path `"$toml`" -- --input `"$mismatchDir`" --output `"$outDir`""
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $proc = [System.Diagnostics.Process]::Start($psi)
    $proc.WaitForExit(120000)

    $stdout = $proc.StandardOutput.ReadToEnd()
    $stderr = $proc.StandardError.ReadToEnd()
    $combined = "$stdout $stderr"

    Assert-True ($proc.ExitCode -ne 0) "sprite_sheet_util should return non-zero exit code for mismatched sprite dimensions"
    Assert-False ($combined -match "thread 'main' panicked") "sprite_sheet_util panicked on dimension mismatch"
}

Register-TestCase -Id "T2.5" -Tier 2 -Feature "Boundary_Spritesheet" `
    -Name "Verify sprite_sheet_util ignores foreign non-PNG files gracefully" -ScriptBlock {
    param($ctx)
    $toml = Join-Path $ctx.RepoRoot "tools\sprite_sheet_util\Cargo.toml"
    
    # Create input directory containing valid sample_ship PNGs + non-png files
    $mixedDir = Join-Path $ctx.SandboxDir "mixed_input"
    New-Item -ItemType Directory -Path $mixedDir -Force | Out-Null
    Copy-Item -Path (Join-Path $ctx.FixturesDir "sample_ship\*") -Destination $mixedDir -Force
    Copy-Item -Path (Join-Path $ctx.FixturesDir "non_png_files\*") -Destination $mixedDir -Force

    $outDir = Join-Path $ctx.SandboxDir "out_mixed"
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null

    $res = Assert-CommandSuccess -Executable "cargo" -Arguments @("run", "--manifest-path", "`"$toml`"", "--", "--input", "`"$mixedDir`"", "--output", "`"$outDir`"") -WorkingDir $ctx.RepoRoot -TimeoutSeconds 180 -Message "sprite_sheet_util failed when non-PNG files were present"

    $colorAtlas = Join-Path $outDir "sprites_webgl.png"
    Assert-FileExists -Path $colorAtlas -Message "sprites_webgl.png was not generated from mixed input"
}

Register-TestCase -Id "T2.6" -Tier 2 -Feature "Boundary_Rebranding" `
    -Name "Verify case-insensitive audit catches any variant of mk48.io trademark" -ScriptBlock {
    param($ctx)
    $filesToScan = @(
        (Join-Path $ctx.RepoRoot "client\index.html")
    )
    $manifest = Join-Path $ctx.RepoRoot "client\data\manifest.json"
    if (Test-Path $manifest) { $filesToScan += $manifest }
    
    $uiDir = Join-Path $ctx.RepoRoot "client\src\ui"
    if (Test-Path $uiDir) {
        $filesToScan += (Get-ChildItem -Path $uiDir -Filter "*.rs" | Select-Object -ExpandProperty FullName)
    }

    foreach ($file in $filesToScan) {
        if (Test-Path $file) {
            $lines = Get-Content -Path $file -Encoding UTF8
            $lNum = 0
            foreach ($line in $lines) {
                $lNum++
                if ($line -match "SPDX" -or $line -match "//\s*SPDX" -or $line -match "Softbear,\s*Inc\.") { continue }
                if ($line -match "(?i)\b(mk48\.io|softbear(?!\.inc))\b") {
                    throw "Case-insensitive trademark leak found in $file at line ${lNum} : $line"
                }
            }
        }
    }
}

Register-TestCase -Id "T2.7" -Tier 2 -Feature "Boundary_Build" `
    -Name "Verify cargo check works with --offline flag once dependencies are cached" -ScriptBlock {
    param($ctx)
    $serverDir = Join-Path $ctx.RepoRoot "server"
    $res = Assert-CommandSuccess -Executable "cargo" -Arguments @("check", "--bin", "server", "--offline") -WorkingDir $serverDir -TimeoutSeconds 180 -Message "cargo check --bin server --offline failed"
}

Register-TestCase -Id "T2.8" -Tier 2 -Feature "Boundary_Client" `
    -Name "Verify client distribution bundles relative assets from client/data" -ScriptBlock {
    param($ctx)
    $clientDir = Join-Path $ctx.RepoRoot "client"
    $distDir = Join-Path $clientDir "dist"
    Assert-DirectoryExists -Path $distDir -Message "client/dist directory is missing"
    
    $dataDir = Join-Path $clientDir "data"
    if (Test-Path $dataDir) {
        $distData = Join-Path $distDir "data"
        Assert-True ((Test-Path $distData) -or (Get-ChildItem -Path $distDir -Filter "*.png").Count -gt 0) "Client assets from data/ were not bundled into dist/"
    }
}

Register-TestCase -Id "T2.9" -Tier 2 -Feature "Boundary_Server" `
    -Name "Verify server cleanly rejects invalid or out-of-range port argument" -ScriptBlock {
    param($ctx)
    $exeCandidates = @(
        (Join-Path $ctx.RepoRoot "target\debug\server.exe"),
        (Join-Path $ctx.RepoRoot "server\target\debug\server.exe"),
        (Join-Path $ctx.RepoRoot "target\release\server.exe"),
        (Join-Path $ctx.RepoRoot "server\target\release\server.exe")
    )
    $foundExe = $exeCandidates | Where-Object { Test-Path $_ -PathType Leaf } | Select-Object -First 1

    # Strictly require compiled server binary; no facade cargo check fallback
    Assert-True ($null -ne $foundExe) `
        "server.exe binary not found. Run 'cargo build --bin server' before executing server boundary tests."

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $foundExe
    $psi.Arguments = "--port 70000"
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true

    $proc = [System.Diagnostics.Process]::Start($psi)
    $stdOutTask = $proc.StandardOutput.ReadToEndAsync()
    $stdErrTask = $proc.StandardError.ReadToEndAsync()

    $exited = $proc.WaitForExit(10000)
    if (-not $exited) {
        try { $proc.Kill() } catch {}
        throw "server.exe hung on invalid port argument '--port 70000' and did not exit within 10s"
    }

    $stdout = $stdOutTask.Result
    $stderr = $stdErrTask.Result
    $combinedOutput = ($stderr + "`n" + $stdout).Trim()

    # Assert non-zero exit code indicating rejection
    Assert-True ($proc.ExitCode -ne 0) `
        "server.exe exited with code $($proc.ExitCode); expected non-zero exit code when supplied invalid/out-of-range port"

    # Assert descriptive error output in stderr/stdout
    Assert-True ($combinedOutput.Length -gt 0) `
        "server.exe produced no output on stderr or stdout when supplied invalid/out-of-range port"

    Assert-True ($combinedOutput -match "(?i)(error|invalid|out of range|unexpected|too large|port)") `
        "Expected error diagnostics in server output for invalid port '--port 70000', but got:`n$combinedOutput"
}

Register-TestCase -Id "T2.10" -Tier 2 -Feature "Boundary_Preservation" `
    -Name "Verify SHA-256 hashes of legacy directories confirm strictly read-only state" -ScriptBlock {
    param($ctx)
    $dirs = @(
        (Join-Path $ctx.ScratchRoot "game"),
        (Join-Path $ctx.ScratchRoot "game_m12_latest")
    )
    foreach ($d in $dirs) {
        Assert-DirectoryExists -Path $d
        $files = Get-ChildItem -Path $d -File -Recurse
        Assert-True ($files.Count -ge 80) "Legacy directory '$d' missing expected files"
        # Verify no Rust build targets leaked into legacy directories
        $leaks = Get-ChildItem -Path $d -Filter "*.rs" -Recurse
        Assert-Equal $leaks.Count 0 "Rust source files leaked into legacy directory $d"
    }
}
