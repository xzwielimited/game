# ==============================================================================
# IRON FLEET E2E TEST HARNESS FRAMEWORK
# tests/framework/TestHarness.ps1
# ==============================================================================

# Global Test Registry
$script:RegisteredTests = [System.Collections.Generic.List[PSObject]]::new()

function Register-TestCase {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$Id,
        [Parameter(Mandatory = $true)][int]$Tier,
        [Parameter(Mandatory = $true)][string]$Feature,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $false)][switch]$IsLongRunning,
        [Parameter(Mandatory = $true)][scriptblock]$ScriptBlock
    )
    $script:RegisteredTests.Add([PSCustomObject]@{
        Id            = $Id
        Tier          = $Tier
        Feature       = $Feature
        Name          = $Name
        IsLongRunning = $IsLongRunning.IsPresent
        ScriptBlock   = $ScriptBlock
    })
}

function Resolve-Tool {
    param([string]$ToolName)
    $cmd = Get-Command $ToolName -ErrorAction SilentlyContinue
    if ($cmd -and (Test-Path $cmd.Source)) { return $cmd.Source }

    $candidates = @(
        "$env:USERPROFILE\.cargo\bin\$ToolName.exe",
        "C:\Users\Administrator\.cargo\bin\$ToolName.exe",
        "$env:USERPROFILE\bin\cmd\$ToolName.exe",
        "C:\Users\Administrator\bin\cmd\$ToolName.exe",
        "$env:USERPROFILE\bin\$ToolName.exe",
        "C:\Users\Administrator\bin\$ToolName.exe"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { return $c }
    }
    return $null
}

function Format-MissingTargetDiagnostic {
    <#
    .SYNOPSIS
        Formats actionable diagnostic and remediation guidance for missing or uninstalled Rust targets.
    .PARAMETER Target
        The target triple (e.g., 'wasm32-unknown-unknown', 'riscv32i-unknown-none-elf').
    .PARAMETER Toolchain
        Optional specific toolchain name to include in remediation command (e.g., 'nightly-2024-04-20').
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Target,
        [Parameter(Mandatory = $false)]
        [string]$Toolchain = ""
    )

    $rustup = Resolve-Tool "rustup"
    $installedTargets = @()
    $isKnownTarget = $false

    if ($rustup) {
        $rawTargets = & $rustup target list 2>$null
        $installedTargets = & $rustup target list --installed 2>$null
        if ($rawTargets) {
            $isKnownTarget = ($rawTargets | Where-Object { 
                ($_ -replace '\s+\(installed\)', '').Trim() -eq $Target 
            }).Count -gt 0
        }
    }

    $isInstalled = ($installedTargets -contains $Target)
    $toolchainSuffix = if ($Toolchain) { " --toolchain $Toolchain" } else { "" }
    $remediationCmd = "rustup target add $Target$toolchainSuffix"

    $diagnosticMessage = if ($isInstalled) {
        "Target '$Target' is currently installed and ready in the active Rust toolchain."
    } elseif ($isKnownTarget) {
        "Target '$Target' is missing from the active Rust toolchain. To install it, run: `"$remediationCmd`"."
    } else {
        "Target '$Target' is not recognized as a standard rustup target triple. Verify target name with 'rustup target list'."
    }

    return [PSCustomObject]@{
        Target             = $Target
        Toolchain          = $Toolchain
        IsInstalled        = $isInstalled
        IsKnownTarget      = $isKnownTarget
        RemediationCommand = $remediationCmd
        DiagnosticMessage  = $diagnosticMessage
        ActionableMessage  = $diagnosticMessage
    }
}

# --- ASSERTION LIBRARY ---

function Assert-True {
    param([bool]$Condition, [string]$Message = "Assertion failed: expected true, got false")
    if (-not $Condition) { throw $Message }
}

function Assert-False {
    param([bool]$Condition, [string]$Message = "Assertion failed: expected false, got true")
    if ($Condition) { throw $Message }
}

function Assert-Equal {
    param($Actual, $Expected, [string]$Message = "")
    if ($Actual -ne $Expected) {
        $msg = if ($Message) { $Message } else { "Expected '$Expected', but got '$Actual'" }
        throw $msg
    }
}

function Assert-FileExists {
    param([string]$Path, [string]$Message = "")
    if (-not (Test-Path -Path $Path -PathType Leaf)) {
        $msg = if ($Message) { $Message } else { "File does not exist: $Path" }
        throw $msg
    }
}

function Assert-DirectoryExists {
    param([string]$Path, [string]$Message = "")
    if (-not (Test-Path -Path $Path -PathType Container)) {
        $msg = if ($Message) { $Message } else { "Directory does not exist: $Path" }
        throw $msg
    }
}

function Assert-FileContains {
    param([string]$Path, [string]$Pattern, [string]$Message = "")
    Assert-FileExists -Path $Path
    $content = Get-Content -Path $Path -Raw -Encoding UTF8
    if ($content -notmatch $Pattern) {
        $msg = if ($Message) { $Message } else { "File '$Path' does not contain pattern: '$Pattern'" }
        throw $msg
    }
}

function Assert-FileNotContains {
    param([string]$Path, [string]$Pattern, [string]$Message = "")
    Assert-FileExists -Path $Path
    $content = Get-Content -Path $Path -Raw -Encoding UTF8
    if ($content -match $Pattern) {
        $msg = if ($Message) { $Message } else { "File '$Path' contains forbidden pattern: '$Pattern'" }
        throw $msg
    }
}

function Assert-CommandSuccess {
    param(
        [string]$Executable,
        [string[]]$Arguments = @(),
        [string]$WorkingDir = "",
        [int]$TimeoutSeconds = 60,
        [string]$Message = ""
    )
    $resolved = Resolve-Tool $Executable
    $exePath = if ($resolved) { $resolved } else { $Executable }

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $exePath
    $psi.Arguments = ($Arguments -join " ")
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    if ($WorkingDir -and (Test-Path $WorkingDir)) {
        $psi.WorkingDirectory = (Resolve-Path $WorkingDir).Path
    }

    $proc = [System.Diagnostics.Process]::Start($psi)
    $stdOutTask = $proc.StandardOutput.ReadToEndAsync()
    $stdErrTask = $proc.StandardError.ReadToEndAsync()

    $exited = $proc.WaitForExit($TimeoutSeconds * 1000)
    if (-not $exited) {
        try { $proc.Kill() } catch {}
        throw "Command '$Executable $($Arguments -join ' ')' timed out after $TimeoutSeconds seconds"
    }

    $stdout = $stdOutTask.Result
    $stderr = $stdErrTask.Result

    if ($proc.ExitCode -ne 0) {
        $msg = if ($Message) { $Message } else { "Command '$Executable $($Arguments -join ' ')' failed with exit code $($proc.ExitCode).`nSTDERR:`n$stderr`nSTDOUT:`n$stdout" }
        throw $msg
    }

    return [PSCustomObject]@{
        ExitCode = $proc.ExitCode
        StdOut   = $stdout
        StdErr   = $stderr
    }
}

function Assert-ImageDimensions {
    param([string]$ImagePath, [int]$ExpectedWidth, [int]$ExpectedHeight, [string]$Message = "")
    Assert-FileExists -Path $ImagePath
    Add-Type -AssemblyName System.Drawing
    $fullPath = (Resolve-Path $ImagePath).Path
    $bytes = [System.IO.File]::ReadAllBytes($fullPath)
    $ms = New-Object System.IO.MemoryStream(,$bytes)
    $bmp = [System.Drawing.Image]::FromStream($ms)
    try {
        if ($bmp.Width -ne $ExpectedWidth -or $bmp.Height -ne $ExpectedHeight) {
            $msg = if ($Message) { $Message } else { "Image '$ImagePath' dimensions ($($bmp.Width)x$($bmp.Height)) do not match expected ($($ExpectedWidth)x$($ExpectedHeight))" }
            throw $msg
        }
    } finally {
        $bmp.Dispose()
        $ms.Dispose()
    }
}

function Assert-JsonValid {
    param([string]$Path, [scriptblock]$Validator = $null, [string]$Message = "")
    Assert-FileExists -Path $Path
    $raw = Get-Content -Path $Path -Raw -Encoding UTF8
    try {
        $json = $raw | ConvertFrom-Json
    } catch {
        throw "Failed to parse JSON file '$Path': $($_.Exception.Message)"
    }
    if ($Validator) {
        & $Validator $json
    }
    return $json
}

# --- TEST SUITE RUNNER ---

function Invoke-TestSuite {
    param([PSObject]$Config)

    $Stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    $Results = [System.Collections.Generic.List[PSObject]]::new()
    $CurrentDir = Get-Location

    Write-Host ""
    Write-Host "================================================================================" -ForegroundColor Cyan
    Write-Host "   IRON FLEET NAVAL COMBAT - E2E AUTOMATED TEST RUNNER HARNESS                 " -ForegroundColor Cyan
    Write-Host "================================================================================" -ForegroundColor Cyan
    Write-Host " Host OS      : Microsoft Windows [PowerShell $($PSVersionTable.PSVersion)]"
    Write-Host " Repo Root    : $($Config.RepoRoot)"
    Write-Host " Selected Tier: $($Config.SelectedTiers -join ', ')"
    Write-Host " SkipLong     : $($Config.SkipLong)"
    Write-Host " Time         : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss UTC')"
    Write-Host "================================================================================" -ForegroundColor Cyan
    Write-Host ""

    # Validate TestFilter regex syntax upfront
    if ($Config.TestFilter) {
        try {
            [regex]::new($Config.TestFilter) | Out-Null
        } catch {
            Write-Error "Invalid regex pattern provided to -TestFilter: '$($Config.TestFilter)' - $($_.Exception.Message)"
            return 2
        }
    }

    # Filter registered tests
    $FilteredTests = $script:RegisteredTests | Where-Object {
        $_.Tier -in $Config.SelectedTiers -and
        (-not $Config.FeatureFilter -or $_.Feature -match "(^|_)$([regex]::Escape($Config.FeatureFilter))($|_)") -and
        (-not $Config.TestFilter -or $_.Id -match $Config.TestFilter -or $_.Name -match $Config.TestFilter)
    }

    $PassCount = 0
    $FailCount = 0
    $SkipCount = 0

    foreach ($test in $FilteredTests) {
        $TestWatch = [System.Diagnostics.Stopwatch]::StartNew()
        $TestResult = [PSCustomObject]@{
            id            = $test.Id
            tier          = $test.Tier
            feature       = $test.Feature
            name          = $test.Name
            status        = 'PENDING'
            duration_ms   = 0
            error_message = $null
            stack_trace   = $null
        }

        # Skip long-running tests if -SkipLong is specified
        if ($Config.SkipLong -and $test.IsLongRunning) {
            $TestWatch.Stop()
            $TestResult.status = 'SKIP'
            $TestResult.duration_ms = [int]$TestWatch.ElapsedMilliseconds
            $SkipCount++
            Write-Host " [SKIP] " -ForegroundColor Yellow -NoNewline
            Write-Host "$($test.Id): $($test.Name) " -NoNewline
            Write-Host "(Skipped via -SkipLong)" -ForegroundColor DarkGray
            $Results.Add($TestResult)
            continue
        }

        # Isolate workspace sandbox per test
        $TestSandbox = Join-Path $Config.TmpDir $test.Id
        if (Test-Path $TestSandbox) { Remove-Item $TestSandbox -Recurse -Force -ErrorAction SilentlyContinue }
        New-Item -ItemType Directory -Path $TestSandbox -Force | Out-Null

        try {
            $TestContext = [PSCustomObject]@{
                RepoRoot    = $Config.RepoRoot
                ScratchRoot = $Config.ScratchRoot
                FixturesDir = $Config.FixturesDir
                SandboxDir  = $TestSandbox
                Config      = $Config
            }

            $origErrorAction = $ErrorActionPreference
            $ErrorActionPreference = 'Stop'
            try {
                & $test.ScriptBlock $TestContext
                $TestResult.status = 'PASS'
                $PassCount++
                $TestWatch.Stop()
                $TestResult.duration_ms = [int]$TestWatch.ElapsedMilliseconds
                Write-Host " [PASS] " -ForegroundColor Green -NoNewline
                Write-Host "$($test.Id): $($test.Name) " -NoNewline
                Write-Host "($($TestResult.duration_ms) ms)" -ForegroundColor DarkGray
            } finally {
                $ErrorActionPreference = $origErrorAction
            }
        } catch {
            $TestWatch.Stop()
            $TestResult.status = 'FAIL'
            $TestResult.duration_ms = [int]$TestWatch.ElapsedMilliseconds
            $TestResult.error_message = $_.Exception.Message
            $TestResult.stack_trace = $_.ScriptStackTrace
            $FailCount++

            Write-Host " [FAIL] " -ForegroundColor Red -NoNewline
            Write-Host "$($test.Id): $($test.Name) " -NoNewline
            Write-Host "($($TestResult.duration_ms) ms)" -ForegroundColor DarkGray
            Write-Host "        Error: $($_.Exception.Message)" -ForegroundColor Red

            if ($Config.StopOnFirstFailure) {
                $Results.Add($TestResult)
                break
            }
        } finally {
            Set-Location $CurrentDir
            if ($TestResult.status -eq 'PASS' -and (Test-Path $TestSandbox)) {
                Remove-Item $TestSandbox -Recurse -Force -ErrorAction SilentlyContinue
            }
        }

        $Results.Add($TestResult)
    }

    $Stopwatch.Stop()
    $TotalSeconds = [Math]::Round($Stopwatch.Elapsed.TotalSeconds, 2)

    # Console Summary Table
    Write-Host ""
    Write-Host "--------------------------------------------------------------------------------" -ForegroundColor Cyan
    Write-Host " TEST EXECUTION SUMMARY                                                         " -ForegroundColor Cyan
    Write-Host "--------------------------------------------------------------------------------" -ForegroundColor Cyan
    Write-Host " Total Tests Executed : $($Results.Count)"
    Write-Host " Passed               : $PassCount" -ForegroundColor Green
    Write-Host " Failed               : $FailCount" -ForegroundColor $(if ($FailCount -gt 0) { 'Red' } else { 'DarkGray' })
    Write-Host " Skipped              : $SkipCount" -ForegroundColor $(if ($SkipCount -gt 0) { 'Yellow' } else { 'DarkGray' })
    Write-Host " Total Time Elapsed   : $TotalSeconds s"
    Write-Host "--------------------------------------------------------------------------------" -ForegroundColor Cyan

    # Generate JSON Summary Report
    $ReportJson = [PSCustomObject]@{
        timestamp       = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        hostname        = $env:COMPUTERNAME
        os              = (Get-CimInstance Win32_OperatingSystem).Caption
        powershell      = $PSVersionTable.PSVersion.ToString()
        total_tests     = $Results.Count
        passed          = $PassCount
        failed          = $FailCount
        skipped         = $SkipCount
        elapsed_seconds = $TotalSeconds
        tier_breakdown  = [PSCustomObject]@{
            tier1 = @{
                total   = @($Results | Where-Object { $_.tier -eq 1 }).Count
                passed  = @($Results | Where-Object { $_.tier -eq 1 -and $_.status -eq 'PASS' }).Count
                failed  = @($Results | Where-Object { $_.tier -eq 1 -and $_.status -eq 'FAIL' }).Count
                skipped = @($Results | Where-Object { $_.tier -eq 1 -and $_.status -eq 'SKIP' }).Count
            }
            tier2 = @{
                total   = @($Results | Where-Object { $_.tier -eq 2 }).Count
                passed  = @($Results | Where-Object { $_.tier -eq 2 -and $_.status -eq 'PASS' }).Count
                failed  = @($Results | Where-Object { $_.tier -eq 2 -and $_.status -eq 'FAIL' }).Count
                skipped = @($Results | Where-Object { $_.tier -eq 2 -and $_.status -eq 'SKIP' }).Count
            }
            tier3 = @{
                total   = @($Results | Where-Object { $_.tier -eq 3 }).Count
                passed  = @($Results | Where-Object { $_.tier -eq 3 -and $_.status -eq 'PASS' }).Count
                failed  = @($Results | Where-Object { $_.tier -eq 3 -and $_.status -eq 'FAIL' }).Count
                skipped = @($Results | Where-Object { $_.tier -eq 3 -and $_.status -eq 'SKIP' }).Count
            }
            tier4 = @{
                total   = @($Results | Where-Object { $_.tier -eq 4 }).Count
                passed  = @($Results | Where-Object { $_.tier -eq 4 -and $_.status -eq 'PASS' }).Count
                failed  = @($Results | Where-Object { $_.tier -eq 4 -and $_.status -eq 'FAIL' }).Count
                skipped = @($Results | Where-Object { $_.tier -eq 4 -and $_.status -eq 'SKIP' }).Count
            }
        }
        results         = $Results
    }

    $reportDir = Split-Path $Config.ReportPath -Parent
    if ($reportDir -and -not (Test-Path $reportDir -PathType Container)) {
        New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
    }
    try {
        $JsonString = $ReportJson | ConvertTo-Json -Depth 10
        Set-Content -Path $Config.ReportPath -Value $JsonString -Encoding UTF8
        Write-Host " Structured JSON report generated at: $($Config.ReportPath)" -ForegroundColor Cyan
    } catch {
        Write-Warning "Could not write structured JSON report: $($_.Exception.Message)"
    }

    if ($FailCount -gt 0) {
        Write-Host " === FINAL VERDICT: FAILED ($FailCount failed tests) ===" -ForegroundColor Red
        return 1
    } else {
        Write-Host " === FINAL VERDICT: ALL TESTS PASSED ===" -ForegroundColor Green
        return 0
    }
}
