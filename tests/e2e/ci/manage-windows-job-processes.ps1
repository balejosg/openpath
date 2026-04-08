[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('capture', 'cleanup')]
    [string]$Mode,

    [string]$SnapshotPath = ''
)

$ErrorActionPreference = 'Stop'

function Resolve-FullPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    return [System.IO.Path]::GetFullPath($Path)
}

function Get-ProcessSnapshot {
    $processes = @(Get-CimInstance Win32_Process -ErrorAction Stop)

    return @(
        foreach ($process in $processes) {
            $commandLine = ''
            if ($null -ne $process.CommandLine) {
                $commandLine = [string]$process.CommandLine
            }

            [pscustomobject]@{
                ProcessId       = [int]$process.ProcessId
                ParentProcessId = [int]$process.ParentProcessId
                Name            = [string]$process.Name
                CreationDate    = [string]$process.CreationDate
                CommandLine     = $commandLine
            }
        }
    )
}

function Get-ProcessIdentityKey {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Process
    )

    return "{0}|{1}" -f [int]$Process.ProcessId, [string]$Process.CreationDate
}

function New-ProcessMap {
    param(
        [Parameter(Mandatory = $true)]
        [object[]]$Processes
    )

    $map = @{}
    foreach ($process in $Processes) {
        $map[[int]$process.ProcessId] = $process
    }

    return $map
}

function Get-ProtectedProcessIds {
    param(
        [Parameter(Mandatory = $true)]
        [int]$ProcessId,

        [Parameter(Mandatory = $true)]
        [hashtable]$ProcessMap
    )

    $protectedIds = New-Object 'System.Collections.Generic.HashSet[int]'
    $currentId = $ProcessId

    while ($currentId -gt 0) {
        if (-not $protectedIds.Add($currentId)) {
            break
        }

        if (-not $ProcessMap.ContainsKey($currentId)) {
            break
        }

        $parentId = [int]$ProcessMap[$currentId].ParentProcessId
        if ($parentId -le 0) {
            break
        }

        $currentId = $parentId
    }

    return ,$protectedIds
}

function Expand-ProtectedProcessIds {
    param(
        [Parameter(Mandatory = $true)]
        [System.Collections.Generic.HashSet[int]]$ProtectedIds,

        [Parameter(Mandatory = $true)]
        [object[]]$Processes
    )

    $updated = $true
    while ($updated) {
        $updated = $false

        foreach ($process in $Processes) {
            $processId = [int]$process.ProcessId
            $parentId = [int]$process.ParentProcessId

            if ($ProtectedIds.Contains($processId)) {
                continue
            }

            if ($ProtectedIds.Contains($parentId)) {
                [void]$ProtectedIds.Add($processId)
                $updated = $true
            }
        }
    }

    return ,$ProtectedIds
}

function Write-ProcessListing {
    param(
        [Parameter(Mandatory = $true)]
        [AllowEmptyCollection()]
        [object[]]$Processes,

        [Parameter(Mandatory = $true)]
        [string]$Title
    )

    Write-Host $Title

    if ($Processes.Count -eq 0) {
        Write-Host '  (none)'
        return
    }

    foreach ($process in $Processes) {
        $commandLine = [string]$process.CommandLine
        if ($commandLine.Length -gt 180) {
            $commandLine = $commandLine.Substring(0, 180) + '...'
        }

        Write-Host ("  pid={0} parent={1} name={2} cmd={3}" -f `
                $process.ProcessId, `
                $process.ParentProcessId, `
                $process.Name, `
                $commandLine)
    }
}

$defaultSnapshotPath = if ($env:RUNNER_TEMP) {
    Join-Path $env:RUNNER_TEMP 'openpath-windows-process-baseline.json'
}
else {
    Join-Path $PSScriptRoot 'openpath-windows-process-baseline.json'
}

if ([string]::IsNullOrWhiteSpace($SnapshotPath)) {
    $SnapshotPath = $defaultSnapshotPath
}

$SnapshotPath = Resolve-FullPath -Path $SnapshotPath
$snapshotDirectory = Split-Path $SnapshotPath -Parent
if ($snapshotDirectory -and -not (Test-Path $snapshotDirectory)) {
    New-Item -ItemType Directory -Path $snapshotDirectory -Force | Out-Null
}

switch ($Mode) {
    'capture' {
        $snapshot = Get-ProcessSnapshot
        [pscustomobject]@{
            CapturedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
            Processes     = $snapshot
        } |
            ConvertTo-Json -Depth 4 |
            Set-Content -Path $SnapshotPath -Encoding utf8

        Write-Host ("Captured Windows job baseline with {0} processes at {1}" -f $snapshot.Count, $SnapshotPath)
        break
    }

    'cleanup' {
        if (-not (Test-Path $SnapshotPath)) {
            throw "Windows job process baseline not found at $SnapshotPath."
        }

        $snapshotPayload = Get-Content $SnapshotPath -Raw | ConvertFrom-Json
        $baselineSnapshot = @()
        if ($snapshotPayload -is [System.Array]) {
            $baselineSnapshot = @($snapshotPayload)
        }
        elseif ($null -ne $snapshotPayload.Processes) {
            $baselineSnapshot = @($snapshotPayload.Processes)
        }

        $baselineKeys = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::Ordinal)
        foreach ($process in $baselineSnapshot) {
            [void]$baselineKeys.Add((Get-ProcessIdentityKey -Process $process))
        }

        $currentProcesses = Get-ProcessSnapshot
        $processMap = New-ProcessMap -Processes $currentProcesses
        $protectedIds = Get-ProtectedProcessIds -ProcessId $PID -ProcessMap $processMap

        # Protect the active cleanup shell subtree, but do not expand from the
        # entire runner ancestor chain or we mask the very descendants we want
        # to identify and terminate before GitHub's own orphan sweep runs.
        $activeCleanupShellIds = New-Object 'System.Collections.Generic.HashSet[int]'
        [void]$activeCleanupShellIds.Add($PID)
        $activeCleanupShellIds = Expand-ProtectedProcessIds -ProtectedIds $activeCleanupShellIds -Processes $currentProcesses
        foreach ($protectedId in $activeCleanupShellIds) {
            [void]$protectedIds.Add($protectedId)
        }

        $newProcesses = @(
            $currentProcesses |
                Where-Object {
                    -not $baselineKeys.Contains((Get-ProcessIdentityKey -Process $_)) -and
                    -not $protectedIds.Contains([int]$_.ProcessId)
                } |
                Sort-Object Name, ProcessId
        )

        Write-ProcessListing -Processes $newProcesses -Title 'Windows processes started after the job baseline:'

        $cleanupNames = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
        foreach ($name in @('bash.exe', 'cmd.exe', 'conhost.exe', 'git.exe', 'OpenConsole.exe', 'powershell.exe', 'pwsh.exe', 'sh.exe')) {
            [void]$cleanupNames.Add($name)
        }

        $interestingProcesses = @(
            $currentProcesses |
                Where-Object {
                    $cleanupNames.Contains([string]$_.Name) -and
                    -not $protectedIds.Contains([int]$_.ProcessId)
                } |
                Sort-Object Name, ProcessId
        )

        Write-ProcessListing -Processes $interestingProcesses -Title 'Windows processes of interest still present before job completion:'

        $cleanupCandidatesByKey = @{}
        foreach ($candidate in @($newProcesses + $interestingProcesses)) {
            if (-not $cleanupNames.Contains([string]$candidate.Name)) {
                continue
            }

            $identityKey = Get-ProcessIdentityKey -Process $candidate
            $cleanupCandidatesByKey[$identityKey] = $candidate
        }

        $cleanupCandidates = @(
            $cleanupCandidatesByKey.Values |
                Sort-Object ProcessId -Descending
        )

        Write-ProcessListing -Processes $cleanupCandidates -Title 'Windows orphan cleanup candidates:'

        foreach ($candidate in $cleanupCandidates) {
            try {
                Stop-Process -Id $candidate.ProcessId -Force -ErrorAction Stop
                Write-Host ("Terminated lingering Windows shell process pid={0} name={1}" -f $candidate.ProcessId, $candidate.Name)
            }
            catch {
                Write-Warning ("Failed to terminate pid={0} name={1}: {2}" -f $candidate.ProcessId, $candidate.Name, $_.Exception.Message)
            }
        }

        break
    }
}
