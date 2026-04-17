# OpenPath Native Messaging Host for Windows
# Runs under the logged-in Firefox user context and reads only the
# browser-readable mirror staged beneath C:\OpenPath\browser-extension\firefox\native.

$ErrorActionPreference = 'Stop'

function Resolve-OpenPathNativeHostRoot {
    $candidateRoots = @(
        (Join-Path $PSScriptRoot '..'),
        (Join-Path $PSScriptRoot '..\..\..')
    )

    foreach ($candidateRoot in $candidateRoots) {
        $resolvedRoot = [System.IO.Path]::GetFullPath($candidateRoot)
        $stateHelperPath = Join-Path $resolvedRoot 'lib\internal\NativeHost.State.ps1'
        if (Test-Path $stateHelperPath) {
            return $resolvedRoot
        }
    }

    throw "OpenPath native host support libraries not found from $PSScriptRoot"
}

$script:NativeRoot = Split-Path -Parent $PSCommandPath
$script:OpenPathRoot = Resolve-OpenPathNativeHostRoot
$script:StatePath = Join-Path $script:NativeRoot 'native-state.json'
$script:WhitelistPath = Join-Path $script:NativeRoot 'whitelist.txt'
$script:LogPath = Join-Path $script:NativeRoot 'native-host.log'
$script:UpdateTaskName = 'OpenPath-Update'
$script:MaxDomains = 50
$script:MaxMessageBytes = 1MB

. (Join-Path $script:OpenPathRoot 'lib\internal\NativeHost.State.ps1')
. (Join-Path $script:OpenPathRoot 'lib\internal\NativeHost.Protocol.ps1')
. (Join-Path $script:OpenPathRoot 'lib\internal\NativeHost.Actions.ps1')

function Write-NativeHostLog {
    param(
        [string]$Message
    )

    try {
        $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
        Add-Content -Path $script:LogPath -Value "[$timestamp] $Message" -Encoding UTF8
    }
    catch {
        # Logging must never break protocol handling.
    }
}

Write-NativeHostLog 'Native host started'

while ($true) {
    try {
        $message = Read-NativeMessage
        if ($null -eq $message) {
            break
        }

        $response = Handle-Message -Message $message
        Write-NativeMessage -Message $response
    }
    catch {
        Write-NativeHostLog "Fatal protocol error: $_"
        try {
            Write-NativeMessage -Message @{
                success = $false
                error = [string]$_
            }
        }
        catch {
            break
        }
    }
}
