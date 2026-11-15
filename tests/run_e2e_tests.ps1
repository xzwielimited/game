<#
.SYNOPSIS
    Iron Fleet E2E Test Runner Harness
.DESCRIPTION
    Executes automated opaque-box E2E tests across Tiers 1-4 for the Iron Fleet naval combat project.
.PARAMETER Tier
    Test tier to execute: 'All', '1', '2', '3', '4' (Default: 'All').
.PARAMETER Feature
    Filter tests by Feature ID (e.g. 'F1', 'F3', 'F5').
.PARAMETER TestFilter
    Regex pattern to match Test ID or Test Name (e.g. 'T1.5.*').
.PARAMETER SkipLong
    Skip long-running builds (full trunk release build, heavy tests) for rapid iteration.
.PARAMETER VerboseOutput
    Display real-time standard output and error from spawned commands.
.PARAMETER StopOnFirstFailure
    Halt test execution immediately upon encountering the first failure.
.PARAMETER ReportPath
    Custom path for JSON report (Default: tests/reports/e2e_summary.json).
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0, Mandatory = $false)]
    [ValidateSet('All', '1', '2', '3', '4', 'Tier1', 'Tier2', 'Tier3', 'Tier4')]
    [string]$Tier = 'All',

    [Parameter(Mandatory = $false)]
    [string]$Feature = '',

    [Parameter(Mandatory = $false)]
    [string]$TestFilter = '',

    [Parameter(Mandatory = $false)]
    [switch]$SkipLong,

    [Parameter(Mandatory = $false)]
    [switch]$VerboseOutput,

    [Parameter(Mandatory = $false)]
    [switch]$StopOnFirstFailure,

    [Parameter(Mandatory = $false)]
    [string]$ReportPath = ''
)

# 1. Ensure UTF-8 Console Encoding
$OutputEncoding = [System.Text.Encoding]::UTF8
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

# 2. PATH Bootstrapping from Registry & Well-Known Directories
$userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
$machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")

$toolDirs = @(
    "$env:USERPROFILE\.cargo\bin",
    "C:\Users\Administrator\.cargo\bin",
    "$env:USERPROFILE\bin\w64devkit\bin",
    "C:\Users\Administrator\bin\w64devkit\bin",
    "$env:USERPROFILE\bin\cmd",
    "C:\Users\Administrator\bin\cmd",
    "$env:USERPROFILE\bin",
    "C:\Users\Administrator\bin"
)

$allPaths = @()
foreach ($d in ($toolDirs + ($userPath -split ';') + ($machinePath -split ';') + ($env:PATH -split ';'))) {
    if ($d) {
        $clean = $d.Trim().TrimEnd('\').TrimEnd('/')
        if ($clean -and (Test-Path $clean) -and (-not ($allPaths -contains $clean))) {
            $allPaths += $clean
        }
    }
}
$env:PATH = $allPaths -join ';'

# 3. Toolchain Self-Healing: Ensure default nightly toolchain is active if present
$rustupCmd = Get-Command rustup -ErrorAction SilentlyContinue
if ($rustupCmd) {
    try {
        $toolchains = & $rustupCmd.Source toolchain list 2>$null
        $hasDefault = ($toolchains | Where-Object { $_ -match "\(default\)" })
        if (-not $hasDefault) {
            $nightly = ($toolchains | Where-Object { $_ -match "nightly-2024-04-20" })
            if ($nightly) {
                & $rustupCmd.Source default nightly-2024-04-20 2>$null | Out-Null
            }
        }
    } catch {}
}

# 4. Resolve Core Directories
$ScriptDir = $PSScriptRoot
$RepoRoot = (Resolve-Path (Join-Path $ScriptDir "..")).Path
$ScratchRoot = (Resolve-Path (Join-Path $RepoRoot "..")).Path
$FixturesDir = Join-Path $ScriptDir "fixtures"
$ReportsDir = Join-Path $ScriptDir "reports"
$TmpDir = Join-Path $ScriptDir "tmp"

if (-not (Test-Path $ReportsDir)) { New-Item -ItemType Directory -Path $ReportsDir -Force | Out-Null }
if (-not (Test-Path $TmpDir)) { New-Item -ItemType Directory -Path $TmpDir -Force | Out-Null }

# 5. Ensure Mock Fixtures are Generated
$FixtureGenScript = Join-Path $FixturesDir "generate_fixtures.ps1"
if (Test-Path $FixtureGenScript) {
    & $FixtureGenScript -FixturesDir $FixturesDir | Out-Null
}

# 6. Load Test Harness Framework
$HarnessScript = Join-Path $ScriptDir "framework\TestHarness.ps1"
if (-not (Test-Path $HarnessScript)) {
    Write-Error "TestHarness.ps1 not found at $HarnessScript"
    exit 2
}
. $HarnessScript

# 7. Normalize Selected Tiers
$SelectedTiers = switch ($Tier) {
    '1'     { @(1) }
    'Tier1' { @(1) }
    '2'     { @(2) }
    'Tier2' { @(2) }
    '3'     { @(3) }
    'Tier3' { @(3) }
    '4'     { @(4) }
    'Tier4' { @(4) }
    default { @(1, 2, 3, 4) }
}

# 8. Load Suite Files for Selected Tiers
foreach ($t in $SelectedTiers) {
    $SuiteFiles = Get-ChildItem -Path (Join-Path $ScriptDir "suites") -Filter "Tier${t}_*.ps1" -ErrorAction SilentlyContinue
    foreach ($suite in $SuiteFiles) {
        . $suite.FullName
    }
}

# 9. Configure and Execute Test Runner
$DefaultReport = Join-Path $ReportsDir "e2e_summary.json"
$Config = [PSCustomObject]@{
    RepoRoot           = $RepoRoot
    ScratchRoot        = $ScratchRoot
    FixturesDir        = $FixturesDir
    ReportsDir         = $ReportsDir
    TmpDir             = $TmpDir
    SelectedTiers      = $SelectedTiers
    FeatureFilter      = $Feature
    TestFilter         = $TestFilter
    SkipLong           = $SkipLong.IsPresent
    VerboseOutput      = $VerboseOutput.IsPresent
    StopOnFirstFailure = $StopOnFirstFailure.IsPresent
    ReportPath         = if ($ReportPath) { $ReportPath } else { $DefaultReport }
}

$ExitCode = Invoke-TestSuite -Config $Config
exit $ExitCode
