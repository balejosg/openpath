# OpenPath - Strict Internet Access Control
# Copyright (C) 2025 OpenPath Authors
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as
# published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Updates the OpenPath whitelist from remote URL and applies all configurations
.DESCRIPTION
    Downloads whitelist, updates Acrylic DNS hosts, configures firewall,
    and applies browser policies.
#>

$ErrorActionPreference = "Stop"
$OpenPathRoot = "C:\OpenPath"
$script:UpdateMutexName = "Global\OpenPathUpdateLock"

# Import modules
Import-Module "$OpenPathRoot\lib\Common.psm1" -Force
Import-Module "$OpenPathRoot\lib\DNS.psm1" -Force
Import-Module "$OpenPathRoot\lib\Firewall.psm1" -Force
Import-Module "$OpenPathRoot\lib\Browser.psm1" -Force

$mutex = $null
$lockAcquired = $false
$shouldRunUpdate = $true
$exitCode = 0
$whitelistPath = "$OpenPathRoot\data\whitelist.txt"
$backupPath = "$OpenPathRoot\data\whitelist.backup.txt"
$staleFailsafeStatePath = "$OpenPathRoot\data\stale-failsafe-state.json"

function Clear-StaleFailsafeState {
    if (Test-Path $staleFailsafeStatePath) {
        Remove-Item $staleFailsafeStatePath -Force -ErrorAction SilentlyContinue
        Write-OpenPathLog "Cleared stale fail-safe marker"
    }
}

function Enter-StaleWhitelistFailsafe {
    param(
        [Parameter(Mandatory = $true)]
        [PSCustomObject]$Config,

        [Parameter(Mandatory = $true)]
        [double]$WhitelistAgeHours
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
    Restart-AcrylicService | Out-Null

    if ($Config.enableFirewall) {
        $acrylicPath = Get-AcrylicPath
        Set-OpenPathFirewall -UpstreamDNS $Config.primaryDNS -AcrylicPath $acrylicPath | Out-Null
    }

    Set-LocalDNS

    @{
        enteredAt = (Get-Date -Format 'o')
        whitelistAgeHours = [Math]::Round($WhitelistAgeHours, 2)
        controlDomains = $controlDomains
    } | ConvertTo-Json -Depth 8 | Set-Content $staleFailsafeStatePath -Encoding UTF8

    Write-OpenPathLog "Stale fail-safe active. Control domains: $($controlDomains -join ', ')" -Level WARN
}

function Restore-OpenPathCheckpoint {
    param(
        [Parameter(Mandatory = $true)]
        [PSCustomObject]$Config
    )

    $restoreResult = Restore-OpenPathLatestCheckpoint -Config $Config -WhitelistPath $whitelistPath
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
        Clear-StaleFailsafeState
        Write-OpenPathLog "Checkpoint rollback applied from $($restoreResult.CheckpointPath)" -Level WARN
        return $true
    }
    catch {
        Write-OpenPathLog "Checkpoint rollback failed: $_" -Level WARN
        return $false
    }
}

try {
    $mutex = [System.Threading.Mutex]::new($false, $script:UpdateMutexName)
    try {
        $lockAcquired = $mutex.WaitOne(0)
    }
    catch [System.Threading.AbandonedMutexException] {
        $lockAcquired = $true
        Write-OpenPathLog "OpenPath update lock was abandoned by a previous process - continuing" -Level WARN
    }

    if (-not $lockAcquired) {
        Write-OpenPathLog "Another OpenPath update is already running - skipping this cycle" -Level WARN
        $shouldRunUpdate = $false
    }

    if ($shouldRunUpdate) {
        Write-OpenPathLog "=== Starting openpath update ==="

        # Load configuration
        $config = Get-OpenPathConfig

        $staleWhitelistMaxAgeHours = 24
        if ($config.PSObject.Properties['staleWhitelistMaxAgeHours']) {
            try {
                $configuredMaxAge = [int]$config.staleWhitelistMaxAgeHours
                if ($configuredMaxAge -ge 0) {
                    $staleWhitelistMaxAgeHours = $configuredMaxAge
                }
            }
            catch {
                Write-OpenPathLog "Invalid staleWhitelistMaxAgeHours value, using default: $_" -Level WARN
            }
        }

        $enableStaleFailsafe = $true
        if ($config.PSObject.Properties['enableStaleFailsafe']) {
            $enableStaleFailsafe = [bool]$config.enableStaleFailsafe
        }

        $enableCheckpointRollback = $true
        if ($config.PSObject.Properties['enableCheckpointRollback']) {
            $enableCheckpointRollback = [bool]$config.enableCheckpointRollback
        }

        $maxCheckpoints = 3
        if ($config.PSObject.Properties['maxCheckpoints']) {
            try {
                $configuredMaxCheckpoints = [int]$config.maxCheckpoints
                if ($configuredMaxCheckpoints -ge 1) {
                    $maxCheckpoints = $configuredMaxCheckpoints
                }
            }
            catch {
                Write-OpenPathLog "Invalid maxCheckpoints value, using default: $_" -Level WARN
            }
        }

        # Backup current whitelist for rollback
        if (Test-Path $whitelistPath) {
            Copy-Item $whitelistPath $backupPath -Force
            Write-OpenPathLog "Backed up current whitelist for rollback"

            if ($enableCheckpointRollback) {
                $checkpointResult = Save-OpenPathWhitelistCheckpoint -WhitelistPath $whitelistPath -MaxCheckpoints $maxCheckpoints -Reason 'pre-update'
                if ($checkpointResult.Success) {
                    Write-OpenPathLog "Checkpoint created at $($checkpointResult.CheckpointPath)"
                }
                else {
                    Write-OpenPathLog "Checkpoint creation failed (non-critical): $($checkpointResult.Error)" -Level WARN
                }
            }
        }

        # Download and parse whitelist
        $whitelist = $null
        $downloadFailed = $false
        try {
            $whitelist = Get-OpenPathFromUrl -Url $config.whitelistUrl
        }
        catch {
            $downloadFailed = $true
            Write-OpenPathLog "Whitelist download failed: $_" -Level WARN
        }

        if ($downloadFailed) {
            if (-not (Test-Path $whitelistPath)) {
                throw "No local whitelist available and download failed"
            }

            $cachedAgeHours = Get-OpenPathFileAgeHours -Path $whitelistPath
            if ($enableStaleFailsafe -and $staleWhitelistMaxAgeHours -gt 0 -and $cachedAgeHours -ge $staleWhitelistMaxAgeHours) {
                Enter-StaleWhitelistFailsafe -Config $config -WhitelistAgeHours $cachedAgeHours
                $runtimeHealth = Get-OpenPathRuntimeHealth
                Send-OpenPathHealthReport -Status 'STALE_FAILSAFE' `
                    -DnsServiceRunning $runtimeHealth.DnsServiceRunning `
                    -DnsResolving $runtimeHealth.DnsResolving `
                    -FailCount 0 `
                    -Actions "stale_whitelist_failsafe age=${cachedAgeHours}h" | Out-Null
                Write-OpenPathLog "Stale fail-safe activated after download failure (age=$cachedAgeHours h)" -Level WARN
            }
            else {
                $runtimeHealth = Get-OpenPathRuntimeHealth
                Send-OpenPathHealthReport -Status 'DEGRADED' `
                    -DnsServiceRunning $runtimeHealth.DnsServiceRunning `
                    -DnsResolving $runtimeHealth.DnsResolving `
                    -FailCount 0 `
                    -Actions 'download_failed_cached_whitelist' | Out-Null
                Write-OpenPathLog "Using cached whitelist (age=$cachedAgeHours h) until next successful download" -Level WARN
            }
        }
        else {
            # Check for deactivation flag
            if ($whitelist.IsDisabled) {
                Write-OpenPathLog "DEACTIVATION FLAG detected - entering fail-open mode" -Level WARN

                # Restore normal DNS
                Restore-OriginalDNS

                # Remove firewall rules
                Remove-OpenPathFirewall

                # Remove browser policies
                Remove-BrowserPolicy

                Clear-StaleFailsafeState

                $runtimeHealth = Get-OpenPathRuntimeHealth
                Send-OpenPathHealthReport -Status 'FAIL_OPEN' `
                    -DnsServiceRunning $runtimeHealth.DnsServiceRunning `
                    -DnsResolving $runtimeHealth.DnsResolving `
                    -FailCount 0 `
                    -Actions 'remote_disable_marker' | Out-Null

                Write-OpenPathLog "System in fail-open mode"
            }
            else {
                # Save whitelist to local file
                $whitelist.Whitelist | Set-Content $whitelistPath -Encoding UTF8

                # Update Acrylic DNS hosts
                Update-AcrylicHost -WhitelistedDomains $whitelist.Whitelist -BlockedSubdomains $whitelist.BlockedSubdomains

                # Restart Acrylic to apply changes
                Restart-AcrylicService | Out-Null

                # Configure firewall (if enabled)
                if ($config.enableFirewall) {
                    $acrylicPath = Get-AcrylicPath
                    Set-OpenPathFirewall -UpstreamDNS $config.primaryDNS -AcrylicPath $acrylicPath | Out-Null
                }

                # Configure browser policies (if enabled)
                if ($config.enableBrowserPolicies) {
                    Set-AllBrowserPolicy -BlockedPaths $whitelist.BlockedPaths
                }

                Clear-StaleFailsafeState

                $runtimeHealth = Get-OpenPathRuntimeHealth
                Send-OpenPathHealthReport -Status 'HEALTHY' `
                    -DnsServiceRunning $runtimeHealth.DnsServiceRunning `
                    -DnsResolving $runtimeHealth.DnsResolving `
                    -FailCount 0 `
                    -Actions 'update' | Out-Null

                Write-OpenPathLog "=== OpenPath update completed successfully ==="
            }
        }
    }
}
catch {
    Write-OpenPathLog "Update failed: $_" -Level ERROR

    $checkpointRollbackEnabled = $true
    if ($config -and $config.PSObject.Properties['enableCheckpointRollback']) {
        $checkpointRollbackEnabled = [bool]$config.enableCheckpointRollback
    }

    $rollbackMethod = 'none'
    $rollbackSucceeded = $false
    if ($checkpointRollbackEnabled -and $config) {
        Write-OpenPathLog 'Attempting checkpoint rollback...' -Level WARN
        $rollbackSucceeded = Restore-OpenPathCheckpoint -Config $config
        if ($rollbackSucceeded) {
            $rollbackMethod = 'checkpoint'
        }
    }

    # Fallback rollback: restore previous whitelist and restart Acrylic
    if (-not $rollbackSucceeded -and (Test-Path $backupPath)) {
        Write-OpenPathLog 'Falling back to backup whitelist rollback...' -Level WARN
        try {
            Copy-Item $backupPath $whitelistPath -Force
            $backupContent = Get-ValidWhitelistDomainsFromFile -Path $whitelistPath
            Update-AcrylicHost -WhitelistedDomains $backupContent -BlockedSubdomains @() -ErrorAction SilentlyContinue
            Restart-AcrylicService -ErrorAction SilentlyContinue

            if ($config -and $config.enableFirewall) {
                $acrylicPath = Get-AcrylicPath
                Set-OpenPathFirewall -UpstreamDNS $config.primaryDNS -AcrylicPath $acrylicPath -ErrorAction SilentlyContinue | Out-Null
            }

            Set-LocalDNS -ErrorAction SilentlyContinue
            $rollbackSucceeded = $true
            $rollbackMethod = 'backup'
            Write-OpenPathLog 'Backup rollback completed successfully' -Level WARN
        }
        catch {
            Write-OpenPathLog "Backup rollback also failed: $_" -Level ERROR
        }
    }

    try {
        $runtimeHealth = Get-OpenPathRuntimeHealth
        $failureAction = if ($rollbackSucceeded) { "update_failed_rollback_$rollbackMethod" } else { 'update_failed_no_rollback' }
        $failureStatus = if ($rollbackSucceeded) { 'DEGRADED' } else { 'CRITICAL' }
        $failureCount = if ($rollbackSucceeded) { 0 } else { 1 }
        Send-OpenPathHealthReport -Status $failureStatus `
            -DnsServiceRunning $runtimeHealth.DnsServiceRunning `
            -DnsResolving $runtimeHealth.DnsResolving `
            -FailCount $failureCount `
            -Actions $failureAction | Out-Null
    }
    catch {
        # Ignore health reporting errors while handling critical failure
    }

    $exitCode = 1
}
finally {
    if ($lockAcquired -and $mutex) {
        try {
            $mutex.ReleaseMutex()
        }
        catch [System.ApplicationException] {
            # Ignore if mutex ownership was not held at release time
        }
    }

    if ($mutex) {
        $mutex.Dispose()
    }
}

exit $exitCode
