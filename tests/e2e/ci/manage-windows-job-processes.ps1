[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('capture', 'cleanup')]
    [string]$Mode,

    [string]$SnapshotPath = (if ($env:RUNNER_TEMP) {
            Join-Path $env:RUNNER_TEMP 'openpath-windows-process-baseline.json'
        }
        else {
            Join-Path $PSScriptRoot 'openpath-windows-process-baseline.json'
        })
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
            [pscustomobject]@{
                ProcessId       = [int]$process.ProcessId
                ParentProcessId = [int]$process.ParentProcessId
                Name            = [string]$process.Name
                CommandLine     = [string]($process.CommandLine ?? '')
            }
        }
    )
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

    return $protectedIds
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

    return $ProtectedIds
}

function Write-ProcessListing {
    param(
        [Parameter(Mandatory = $true)]
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

$SnapshotPath = Resolve-FullPath -Path $SnapshotPath
$snapshotDirectory = Split-Path $SnapshotPath -Parent
if ($snapshotDirectory -and -not (Test-Path $snapshotDirectory)) {
    New-Item -ItemType Directory -Path $snapshotDirectory -Force | Out-Null
}

switch ($Mode) {
    'capture' {
        $snapshot = Get-ProcessSnapshot
        $snapshot |
            ConvertTo-Json -Depth 4 |
            Set-Content -Path $SnapshotPath -Encoding utf8

        Write-Host ("Captured Windows job baseline with {0} processes at {1}" -f $snapshot.Count, $SnapshotPath)
        break
    }

    'cleanup' {
        if (-not (Test-Path $SnapshotPath)) {
            throw "Windows job process baseline not found at $SnapshotPath."
        }

        $baselineSnapshot = @(Get-Content $SnapshotPath -Raw | ConvertFrom-Json)
        $baselineIds = New-Object 'System.Collections.Generic.HashSet[int]'
        foreach ($process in $baselineSnapshot) {
            [void]$baselineIds.Add([int]$process.ProcessId)
        }

        $currentProcesses = Get-ProcessSnapshot
        $processMap = New-ProcessMap -Processes $currentProcesses
        $protectedIds = Get-ProtectedProcessIds -ProcessId $PID -ProcessMap $processMap
        $protectedIds = Expand-ProtectedProcessIds -ProtectedIds $protectedIds -Processes $currentProcesses

        $newProcesses = @(
            $currentProcesses |
                Where-Object {
                    -not $baselineIds.Contains([int]$_.ProcessId) -and
                    -not $protectedIds.Contains([int]$_.ProcessId)
                } |
                Sort-Object Name, ProcessId
        )

        Write-ProcessListing -Processes $newProcesses -Title 'Windows processes started after the job baseline:'

        $cleanupNames = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
        foreach ($name in @('cmd.exe', 'conhost.exe', 'OpenConsole.exe', 'powershell.exe', 'pwsh.exe')) {
            [void]$cleanupNames.Add($name)
        }

        $cleanupCandidates = @(
            $newProcesses |
                Where-Object { $cleanupNames.Contains([string]$_.Name) } |
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
