# ==============================================================================
# IRON FLEET E2E TEST SUITE - TIER 4: REAL-WORLD SCENARIOS (4 TESTS)
# tests/suites/Tier4_Scenarios.ps1
# End-to-end composite lifecycles and realistic developer workflows
# ==============================================================================

Register-TestCase -Id "T4.1" -Tier 4 -Feature "Scenario_CleanBuildLifecycle" -IsLongRunning `
    -Name "Scenario 1: Clean build lifecycle (codebase -> spritesheet -> server -> client -> tests)" -ScriptBlock {
    param($ctx)
    Write-Host "`n    [Lifecycle Step 1/5] Codebase workspace check..." -ForegroundColor DarkGray
    $rootToml = Join-Path $ctx.RepoRoot "Cargo.toml"
    Assert-FileExists -Path $rootToml

    Write-Host "    [Lifecycle Step 2/5] Spritesheet packing..." -ForegroundColor DarkGray
    $sheetToml = Join-Path $ctx.RepoRoot "tools\sprite_sheet_util\Cargo.toml"
    $inDir = Join-Path $ctx.FixturesDir "sample_ship"
    $outDir = Join-Path $ctx.SandboxDir "scenario_atlas"
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
    Assert-CommandSuccess -Executable "cargo" -Arguments @("run", "--manifest-path", "`"$sheetToml`"", "--", "--input", "`"$inDir`"", "--output", "`"$outDir`"") -WorkingDir $ctx.RepoRoot -TimeoutSeconds 180

    Write-Host "    [Lifecycle Step 3/5] Server compilation..." -ForegroundColor DarkGray
    Assert-CommandSuccess -Executable "cargo" -Arguments @("check", "--bin", "server") -WorkingDir (Join-Path $ctx.RepoRoot "server") -TimeoutSeconds 180

    Write-Host "    [Lifecycle Step 4/5] Client Wasm build..." -ForegroundColor DarkGray
    Assert-CommandSuccess -Executable "cargo" -Arguments @("check", "--target", "wasm32-unknown-unknown", "-p", "client") -WorkingDir (Join-Path $ctx.RepoRoot "client") -TimeoutSeconds 180

    Write-Host "    [Lifecycle Step 5/5] Common tests execution..." -ForegroundColor DarkGray
    Assert-CommandSuccess -Executable "cargo" -Arguments @("test", "-p", "common") -WorkingDir $ctx.RepoRoot -TimeoutSeconds 180
}

Register-TestCase -Id "T4.2" -Tier 4 -Feature "Scenario_AssetIngestion" `
    -Name "Scenario 2: Graphic designer ship asset ingestion workflow" -ScriptBlock {
    param($ctx)
    $sheetToml = Join-Path $ctx.RepoRoot "tools\sprite_sheet_util\Cargo.toml"
    
    # Designer places a new turret or ship model into asset directory
    $newAssetDir = Join-Path $ctx.SandboxDir "designer_assets"
    New-Item -ItemType Directory -Path $newAssetDir -Force | Out-Null
    Copy-Item -Path (Join-Path $ctx.FixturesDir "sample_turret\*") -Destination $newAssetDir -Force

    $outDir = Join-Path $ctx.SandboxDir "designer_out"
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null

    # Execute spritesheet packer
    Assert-CommandSuccess -Executable "cargo" -Arguments @("run", "--manifest-path", "`"$sheetToml`"", "--", "--input", "`"$newAssetDir`"", "--output", "`"$outDir`"") -WorkingDir $ctx.RepoRoot -TimeoutSeconds 180

    # Verify manifest has registered the new asset
    $jsonPath = Join-Path $outDir "sprites_webgl.json"
    $manifest = Assert-JsonValid -Path $jsonPath
    Assert-True ($null -ne $manifest.sprites) "Generated manifest missing sprites mapping"
}

Register-TestCase -Id "T4.3" -Tier 4 -Feature "Scenario_ComplianceAudit" `
    -Name "Scenario 3: Pre-release gatekeeper compliance & integrity audit" -ScriptBlock {
    param($ctx)
    # 1. Audit AGPL license and copyright
    $lic = Join-Path $ctx.RepoRoot "LICENSE"
    Assert-FileExists -Path $lic
    Assert-FileContains -Path $lic -Pattern "GNU AFFERO GENERAL PUBLIC LICENSE"

    # 2. Audit trademark cleanliness in client HTML
    $html = Join-Path $ctx.RepoRoot "client\index.html"
    Assert-FileExists -Path $html
    Assert-FileNotContains -Path $html -Pattern "<title>\s*(?i:mk48\.io)\s*</title>"

    # 3. Audit toolchain versions
    $rustcRes = Assert-CommandSuccess -Executable "rustc" -Arguments @("--version")
    Assert-True ($rustcRes.StdOut -match "nightly") "Active compiler must be nightly"

    # 4. Audit legacy directories
    $game = Join-Path $ctx.ScratchRoot "game"
    $m12 = Join-Path $ctx.ScratchRoot "game_m12_latest"
    Assert-True (Test-Path (Join-Path $game "package.json")) "scratch/game/package.json missing"
    Assert-True (Test-Path (Join-Path $m12 "package.json")) "scratch/game_m12_latest/package.json missing"
}

Register-TestCase -Id "T4.4" -Tier 4 -Feature "Scenario_OnboardingRunbook" `
    -Name "Scenario 4: Developer onboarding simulation via HANDOFF.md runbook" -ScriptBlock {
    param($ctx)
    $handoffPath = Join-Path $ctx.RepoRoot "HANDOFF.md"
    Assert-FileExists -Path $handoffPath -Message "HANDOFF.md runbook is missing"

    $handoffContent = Get-Content -Path $handoffPath -Raw -Encoding UTF8
    Assert-True ($handoffContent.Length -gt 200) "HANDOFF.md is too short to be a valid onboarding runbook"

    # 1. Parse fenced Markdown code blocks (bash, powershell, sh, cmd, or plain)
    $codeBlockPattern = '(?ms)```(?:powershell|bash|sh|cmd|pwsh)?\r?\n(.*?)\r?\n```'
    $codeMatches = [regex]::Matches($handoffContent, $codeBlockPattern)
    Assert-True ($codeMatches.Count -gt 0) "HANDOFF.md contains no executable code blocks"

    # 2. Extract and filter executable command lines
    $candidateCommands = [System.Collections.Generic.List[string]]::new()
    foreach ($match in $codeMatches) {
        $block = $match.Groups[1].Value
        $lines = $block -split "`r?`n"
        foreach ($line in $lines) {
            $trimmed = $line.Trim()
            if ($trimmed -and -not $trimmed.StartsWith("#") -and -not $trimmed.StartsWith("//")) {
                $candidateCommands.Add($trimmed)
            }
        }
    }
    Assert-True ($candidateCommands.Count -gt 0) "No executable command lines found in HANDOFF.md code blocks"

    # 3. Select verification command (prioritizing non-destructive checks)
    $verificationCmd = $candidateCommands | Where-Object {
        $_ -match '^(cargo\s+check(\s+--bin\s+server)?|cargo\s+--version|rustc\s+--version)'
    } | Select-Object -First 1

    if (-not $verificationCmd) {
        $verificationCmd = $candidateCommands | Where-Object {
            $_ -match '^(cargo|rustc|trunk)\b' -and $_ -notmatch '(clean|rm|remove|delete)'
        } | Select-Object -First 1
    }
    Assert-True ($null -ne $verificationCmd) "HANDOFF.md does not document a recognizable verification command (e.g. 'cargo check --bin server', 'cargo --version', etc.)"

    Write-Host "`n    [Onboarding Simulation] Executing runbook command: '$verificationCmd'..." -ForegroundColor DarkGray

    # 4. Execute the command in an isolated subshell sandbox from project root
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "powershell.exe"
    $psi.Arguments = "-NoProfile -NonInteractive -Command `"$verificationCmd`""
    $psi.WorkingDirectory = $ctx.RepoRoot
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.EnvironmentVariables["PATH"] = $env:PATH

    $proc = [System.Diagnostics.Process]::Start($psi)
    $stdOutTask = $proc.StandardOutput.ReadToEndAsync()
    $stdErrTask = $proc.StandardError.ReadToEndAsync()

    $timeoutSec = 180
    $completed = $proc.WaitForExit($timeoutSec * 1000)
    if (-not $completed) {
        try { $proc.Kill() } catch {}
        throw "Onboarding runbook command '$verificationCmd' timed out after $timeoutSec seconds"
    }

    $stdout = $stdOutTask.Result
    $stderr = $stdErrTask.Result

    Assert-Equal $proc.ExitCode 0 "Onboarding command '$verificationCmd' failed with exit code $($proc.ExitCode).`nSTDERR:`n$stderr`nSTDOUT:`n$stdout"
}
