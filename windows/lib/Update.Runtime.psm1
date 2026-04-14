# OpenPath Windows update runtime helpers

function Clear-StaleFailsafeState {
    [CmdletBinding()]
    param(
        [string]$StaleFailsafeStatePath = 'C:\OpenPath\data\stale-failsafe-state.json'
    )

    if (Test-Path $StaleFailsafeStatePath) {
        Remove-Item $StaleFailsafeStatePath -Force -ErrorAction SilentlyContinue
        Write-OpenPathLog "Cleared stale fail-safe marker"
    }
}

function Enter-StaleWhitelistFailsafe {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [PSCustomObject]$Config,

        [Parameter(Mandatory = $true)]
        [double]$WhitelistAgeHours,

        [string]$StaleFailsafeStatePath = 'C:\OpenPath\data\stale-failsafe-state.json'
    )

    $controlDomains = @()
    $whitelistHost = Get-HostFromUrl -Url $Config.whitelistUrl
    if ($whitelistHost) {
        $controlDomains += $whitelistHost
    }

    if ($Config.PSObject.Properties['apiUrl']) {
        $apiHost = Get-HostFromUrl -Url $Config.apiUrl
        if ($apiHost) {
            $controlDomains += $apiHost
        }
    }

    $controlDomains = @($controlDomains | Where-Object { $_ } | Sort-Object -Unique)

    Write-OpenPathLog "Entering stale-whitelist fail-safe mode (age=$WhitelistAgeHours h)" -Level WARN
    Update-AcrylicHost -WhitelistedDomains $controlDomains -BlockedSubdomains @()
    Restore-OpenPathProtectedMode -Config $Config | Out-Null

    @{
        enteredAt = (Get-Date -Format 'o')
        whitelistAgeHours = [Math]::Round($WhitelistAgeHours, 2)
        controlDomains = $controlDomains
    } | ConvertTo-Json -Depth 8 | Set-Content $StaleFailsafeStatePath -Encoding UTF8

    Write-OpenPathLog "Stale fail-safe active. Control domains: $($controlDomains -join ', ')" -Level WARN
}

function Restore-OpenPathCheckpoint {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [PSCustomObject]$Config,

        [string]$WhitelistPath = 'C:\OpenPath\data\whitelist.txt',

        [string]$StaleFailsafeStatePath = 'C:\OpenPath\data\stale-failsafe-state.json'
    )

    $restoreResult = Restore-OpenPathLatestCheckpoint -Config $Config -WhitelistPath $WhitelistPath
    if (-not $restoreResult.Success) {
        if ($restoreResult.Error) {
            Write-OpenPathLog $restoreResult.Error -Level WARN
        }
        else {
            Write-OpenPathLog 'Checkpoint rollback failed for unknown reason' -Level WARN
        }
        return $false
    }

    try {
        Clear-StaleFailsafeState -StaleFailsafeStatePath $StaleFailsafeStatePath
        Write-OpenPathLog "Checkpoint rollback applied from $($restoreResult.CheckpointPath)" -Level WARN
        return $true
    }
    catch {
        Write-OpenPathLog "Checkpoint rollback failed: $_" -Level WARN
        return $false
    }
}

function Write-UpdateCatchLog {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message,

        [ValidateSet('INFO', 'WARN', 'ERROR')]
        [string]$Level = 'INFO'
    )

    if (Get-Command -Name 'Write-OpenPathLog' -ErrorAction SilentlyContinue) {
        Write-OpenPathLog -Message $Message -Level $Level
        return
    }

    $fallbackEntry = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [$Level] [Update-OpenPath.ps1] [PID:$PID] $Message"
    switch ($Level) {
        'ERROR' { Write-Error $fallbackEntry -ErrorAction Continue }
        'WARN' { Write-Warning $fallbackEntry }
        default { Write-Information $fallbackEntry -InformationAction Continue }
    }
}

function Sync-FirefoxNativeHostMirror {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [PSCustomObject]$Config,

        [string]$WhitelistPath = 'C:\OpenPath\data\whitelist.txt',

        [switch]$ClearWhitelist
    )

    try {
        Sync-OpenPathFirefoxNativeHostState -Config $Config -WhitelistPath $WhitelistPath -ClearWhitelist:$ClearWhitelist | Out-Null
    }
    catch {
        Write-OpenPathLog "Firefox native host mirror sync failed: $_" -Level WARN
    }
}

Export-ModuleMember -Function @(
    'Clear-StaleFailsafeState',
    'Enter-StaleWhitelistFailsafe',
    'Restore-OpenPathCheckpoint',
    'Write-UpdateCatchLog',
    'Sync-FirefoxNativeHostMirror'
)
