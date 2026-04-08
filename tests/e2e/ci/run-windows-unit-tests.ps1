[CmdletBinding()]
param(
    [switch]$Child,
    [string]$RepoRoot = (Join-Path $PSScriptRoot '..' '..' '..'),
    [string]$ResultsPath = 'windows-test-results.xml',
    [int]$TimeoutSeconds = 900
)

$ErrorActionPreference = 'Stop'

function Resolve-FullPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [string]$BasePath = (Get-Location).Path
    )

    if ([System.IO.Path]::IsPathRooted($Path)) {
        return [System.IO.Path]::GetFullPath($Path)
    }

    return [System.IO.Path]::GetFullPath((Join-Path $BasePath $Path))
}

function Invoke-IsolatedPwshProcess {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ScriptPath,

        [Parameter(Mandatory = $true)]
        [string]$RepoRoot,

        [Parameter(Mandatory = $true)]
        [string]$ResultsPath,

        [Parameter(Mandatory = $true)]
        [int]$TimeoutSeconds
    )

    $pwshPath = (Get-Command pwsh -ErrorAction Stop).Source
    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $pwshPath
    $startInfo.WorkingDirectory = $RepoRoot
    $startInfo.UseShellExecute = $false
    # Let the isolated child inherit the runner console directly.
    # Redirected pipes can stay open after pwsh exits if descendants inherit
    # the handles, which leaves the CI wrapper blocked on EOF.
    $startInfo.RedirectStandardOutput = $false
    $startInfo.RedirectStandardError = $false

    foreach ($argument in @(
            '-NoLogo',
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            $ScriptPath,
            '-Child',
            '-RepoRoot',
            $RepoRoot,
            '-ResultsPath',
            $ResultsPath,
            '-TimeoutSeconds',
            [string]$TimeoutSeconds
        )) {
        [void]$startInfo.ArgumentList.Add($argument)
    }

    $null = $startInfo.Environment.Remove('RUNNER_TRACKING_ID')
    $startInfo.Environment['OPENPATH_WINDOWS_CI_ISOLATED_PESTER'] = '1'

    $process = [System.Diagnostics.Process]::Start($startInfo)
    if ($null -eq $process) {
        throw 'Failed to start isolated pwsh process for Windows unit tests.'
    }

    try {
        if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
            try {
                $process.Kill($true)
            }
            catch {
                # Best effort.
            }

            throw "Isolated Windows Pester host timed out after $TimeoutSeconds seconds."
        }

        if ($process.ExitCode -ne 0) {
            throw "Isolated Windows Pester host failed with exit code $($process.ExitCode)."
        }
    }
    finally {
        try {
            if (-not $process.HasExited) {
                try {
                    $process.Kill($true)
                    $null = $process.WaitForExit(5000)
                }
                catch {
                    # Best effort.
                }
            }
        }
        finally {
            $process.Dispose()
        }
    }
}

function Invoke-ChildPesterRun {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot,

        [Parameter(Mandatory = $true)]
        [string]$ResultsPath
    )

    Set-Location $RepoRoot

    if (Test-Path $ResultsPath) {
        Remove-Item $ResultsPath -Force
    }

    $minimumPesterVersion = [version]'5.0.0'
    $availablePester = Get-Module -ListAvailable -Name Pester |
        Sort-Object Version -Descending |
        Select-Object -First 1

    if ($null -eq $availablePester -or $availablePester.Version -lt $minimumPesterVersion) {
        Install-Module -Name Pester -MinimumVersion $minimumPesterVersion.ToString() -Force -Scope CurrentUser
    }

    Import-Module Pester -MinimumVersion $minimumPesterVersion -ErrorAction Stop

    # Match the historical workflow host semantics for the Windows suite.
    # Several legacy assertions rely on Pester's default non-strict runtime.
    Set-StrictMode -Off

    $config = New-PesterConfiguration
    $config.Run.Path = 'windows/tests'
    $config.Run.PassThru = $true
    $config.Output.Verbosity = 'Detailed'
    $config.TestResult.Enabled = $true
    $config.TestResult.OutputPath = $ResultsPath
    $config.TestResult.OutputFormat = 'NUnitXml'

    $result = Invoke-Pester -Configuration $config

    if (-not (Test-Path $ResultsPath)) {
        throw "Windows Pester suite did not produce $ResultsPath."
    }

    if ($null -eq $result) {
        throw 'Invoke-Pester returned no result object.'
    }

    if ($result.FailedCount -gt 0) {
        throw "Windows Pester suite reported $($result.FailedCount) failure(s)."
    }

    $jobs = @(Get-Job -ErrorAction SilentlyContinue)
    if ($jobs.Count -gt 0) {
        $jobs | Stop-Job -ErrorAction SilentlyContinue
        $jobs | Remove-Job -Force -ErrorAction SilentlyContinue
    }
}

$RepoRoot = Resolve-FullPath -Path $RepoRoot
$ResultsPath = Resolve-FullPath -Path $ResultsPath -BasePath $RepoRoot
$resultsDirectory = Split-Path $ResultsPath -Parent

if ($resultsDirectory -and -not (Test-Path $resultsDirectory)) {
    New-Item -ItemType Directory -Path $resultsDirectory -Force | Out-Null
}

if ($Child) {
    Invoke-ChildPesterRun -RepoRoot $RepoRoot -ResultsPath $ResultsPath
    return
}

Invoke-IsolatedPwshProcess -ScriptPath $MyInvocation.MyCommand.Path -RepoRoot $RepoRoot -ResultsPath $ResultsPath -TimeoutSeconds $TimeoutSeconds

if (-not (Test-Path $ResultsPath)) {
    throw "Windows Pester suite did not produce $ResultsPath."
}
