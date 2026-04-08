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

function Get-DescendantProcesses {
    param(
        [Parameter(Mandatory = $true)]
        [int]$RootPid
    )

    $allProcesses = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
    if ($allProcesses.Count -eq 0) {
        return @()
    }

    $childrenByParent = @{}
    foreach ($processInfo in $allProcesses) {
        $parentId = [int]$processInfo.ParentProcessId
        if (-not $childrenByParent.ContainsKey($parentId)) {
            $childrenByParent[$parentId] = @()
        }

        $childrenByParent[$parentId] += $processInfo
    }

    $pendingParents = [System.Collections.Generic.Queue[int]]::new()
    $pendingParents.Enqueue($RootPid)

    $descendants = @()
    while ($pendingParents.Count -gt 0) {
        $parentId = $pendingParents.Dequeue()
        foreach ($processInfo in @($childrenByParent[$parentId])) {
            $descendants += $processInfo
            $pendingParents.Enqueue([int]$processInfo.ProcessId)
        }
    }

    return @($descendants)
}

function Write-DescendantProcessSnapshot {
    param(
        [Parameter(Mandatory = $true)]
        [int]$RootPid,

        [Parameter(Mandatory = $true)]
        [string]$Label
    )

    $descendants = @(Get-DescendantProcesses -RootPid $RootPid)
    if ($descendants.Count -eq 0) {
        Write-Host "$Label: no descendant processes detected."
        return @()
    }

    Write-Host "$Label:"
    foreach ($processInfo in @($descendants | Sort-Object ParentProcessId, ProcessId)) {
        $commandLine = [string]$processInfo.CommandLine
        if ($commandLine.Length -gt 180) {
            $commandLine = $commandLine.Substring(0, 177) + '...'
        }

        Write-Host "  PID=$($processInfo.ProcessId) PPID=$($processInfo.ParentProcessId) Name=$($processInfo.Name) CommandLine=$commandLine"
    }

    return @($descendants)
}

function Stop-DescendantProcesses {
    param(
        [Parameter(Mandatory = $true)]
        [int]$RootPid
    )

    $descendants = @(Write-DescendantProcessSnapshot -RootPid $RootPid -Label "Descendants for root PID $RootPid after Pester exit")
    if ($descendants.Count -eq 0) {
        return
    }

    $processIds = @(
        $descendants |
            ForEach-Object { [int]$_.ProcessId } |
            Sort-Object -Descending -Unique
    )

    Write-Host "Stopping lingering descendant processes for root PID $RootPid: $($processIds -join ', ')"
    Stop-Process -Id $processIds -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1

    $remaining = @(Get-DescendantProcesses -RootPid $RootPid)
    if ($remaining.Count -eq 0) {
        Write-Host "All descendants for root PID $RootPid exited."
        return
    }

    Write-Host "Remaining descendants for root PID $RootPid after cleanup:"
    foreach ($processInfo in @($remaining | Sort-Object ParentProcessId, ProcessId)) {
        Write-Host "  PID=$($processInfo.ProcessId) PPID=$($processInfo.ParentProcessId) Name=$($processInfo.Name)"
    }
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
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true

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
        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()

        if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
            try {
                $process.Kill($true)
            }
            catch {
                # Best effort.
            }

            $stdout = $stdoutTask.GetAwaiter().GetResult()
            $stderr = $stderrTask.GetAwaiter().GetResult()
            throw "Isolated Windows Pester host timed out after $TimeoutSeconds seconds.`nSTDOUT:`n$stdout`nSTDERR:`n$stderr"
        }

        $stdout = $stdoutTask.GetAwaiter().GetResult()
        $stderr = $stderrTask.GetAwaiter().GetResult()

        if ($stdout) {
            $stdout | Out-Host
        }

        if ($stderr) {
            $stderr | Out-Host
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

            Stop-DescendantProcesses -RootPid $process.Id
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
