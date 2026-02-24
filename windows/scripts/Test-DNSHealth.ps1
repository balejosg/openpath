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
    Watchdog script to verify DNS health and auto-recover
.DESCRIPTION
    Runs periodically to ensure Acrylic DNS and firewall are working correctly.
    Attempts auto-recovery if problems are detected.
#>

$ErrorActionPreference = "Stop"
$OpenPathRoot = "C:\OpenPath"

# Import modules
Import-Module "$OpenPathRoot\lib\Common.psm1" -Force
Import-Module "$OpenPathRoot\lib\DNS.psm1" -Force
Import-Module "$OpenPathRoot\lib\Firewall.psm1" -Force

$issues = @()
$watchdogFailCountPath = "$OpenPathRoot\data\watchdog-fails.txt"
$staleFailsafeStatePath = "$OpenPathRoot\data\stale-failsafe-state.json"
$captivePortalStatePath = "$OpenPathRoot\data\captive-portal-active.json"
$config = $null

try {
    $config = Get-OpenPathConfig
}
catch {
    $issues += "Configuration load failed"
    Write-OpenPathLog "Watchdog: Error loading configuration: $_" -Level ERROR
}

function Get-WatchdogFailCount {
    if (-not (Test-Path $watchdogFailCountPath)) {
        return 0
    }

    try {
        $rawValue = Get-Content $watchdogFailCountPath -Raw -ErrorAction Stop
        return [int]$rawValue
    }
    catch {
        return 0
    }
}

function Set-WatchdogFailCount {
    param(
        [Parameter(Mandatory = $true)]
        [int]$Count
    )

    Set-Content $watchdogFailCountPath -Value ([Math]::Max($Count, 0)) -Encoding UTF8
}

function Increment-WatchdogFailCount {
    $newCount = (Get-WatchdogFailCount) + 1
    Set-WatchdogFailCount -Count $newCount
    return $newCount
}

function Reset-WatchdogFailCount {
    Set-WatchdogFailCount -Count 0
}

function Restore-CheckpointFromWatchdog {
    param(
        [Parameter(Mandatory = $true)]
        [PSCustomObject]$Config
    )

    $whitelistPath = "$OpenPathRoot\data\whitelist.txt"

    $restoreResult = Restore-OpenPathLatestCheckpoint -Config $Config -WhitelistPath $whitelistPath
    if (-not $restoreResult.Success) {
        if ($restoreResult.Error) {
            Write-OpenPathLog "Watchdog: $($restoreResult.Error)" -Level WARN
        }
        else {
            Write-OpenPathLog 'Watchdog: Checkpoint recovery failed for unknown reason' -Level WARN
        }
        return $false
    }

    try {
        Start-Sleep -Seconds 2

        if ((Test-DNSResolution -Domain "google.com") -and (Test-DNSSinkhole -Domain "this-should-be-blocked-test-12345.com")) {
            Write-OpenPathLog "Watchdog: Checkpoint recovery succeeded from $($restoreResult.CheckpointPath)" -Level WARN
            return $true
        }

        Write-OpenPathLog "Watchdog: Checkpoint recovery did not fully restore DNS behavior" -Level WARN
        return $false
    }
    catch {
        Write-OpenPathLog "Watchdog: Checkpoint recovery failed: $_" -Level ERROR
        return $false
    }
}

function Get-OpenPathCaptivePortalMarker {
    if (-not (Test-Path $captivePortalStatePath)) {
        return $null
    }

    try {
        $raw = Get-Content $captivePortalStatePath -Raw -ErrorAction Stop
        if (-not $raw) {
            return $null
        }
        return ($raw | ConvertFrom-Json -ErrorAction Stop)
    }
    catch {
        return $null
    }
}

function Set-OpenPathCaptivePortalMarker {
    param(
        [Parameter(Mandatory = $true)]
        [string]$State
    )

    try {
        $dir = Split-Path $captivePortalStatePath -Parent
        if (-not (Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
        }

        $existing = Get-OpenPathCaptivePortalMarker
        $since = (Get-Date).ToString('o')
        if ($existing -and $existing.PSObject.Properties['since'] -and $existing.since) {
            $since = [string]$existing.since
        }

        $payload = @{
            active = $true
            state = [string]$State
            since = [string]$since
            updatedAt = (Get-Date).ToString('o')
        } | ConvertTo-Json -Depth 8

        $payload | Set-Content -Path $captivePortalStatePath -Encoding UTF8 -Force
        return $true
    }
    catch {
        return $false
    }
}

function Clear-OpenPathCaptivePortalMarker {
    try {
        Remove-Item -Path $captivePortalStatePath -Force -ErrorAction SilentlyContinue
        return $true
    }
    catch {
        return $false
    }
}

function Test-OpenPathCaptivePortalState {
    <#
    .SYNOPSIS
        Detects captive portal state using multiple endpoints.
    .OUTPUTS
        String: Authenticated | Portal | NoNetwork
    #>
    [CmdletBinding()]
    param(
        [int]$TimeoutSec = 3
    )

    $checks = @(
        @{ Url = 'http://www.msftconnecttest.com/connecttest.txt'; ExpectedStatus = 200; ExpectedBody = 'Microsoft Connect Test' },
        @{ Url = 'http://detectportal.firefox.com/success.txt'; ExpectedStatus = 200; ExpectedBody = 'success' },
        @{ Url = 'http://clients3.google.com/generate_204'; ExpectedStatus = 204; ExpectedBody = '' }
    )

    $total = 0
    $success = 0
    $transportFail = 0

    foreach ($check in $checks) {
        $total += 1

        $statusCode = $null
        $content = ''

        try {
            $resp = Invoke-WebRequest -Uri $check.Url -UseBasicParsing -TimeoutSec $TimeoutSec -MaximumRedirection 0 -ErrorAction Stop
            $statusCode = [int]$resp.StatusCode
            if ($resp.PSObject.Properties['Content'] -and $resp.Content) {
                $content = [string]$resp.Content
            }
        }
        catch {
            $ex = $_.Exception

            # Attempt to extract HTTP status code from the exception if present
            try {
                if ($ex -and $ex.Response -and $ex.Response.StatusCode) {
                    $statusCode = [int]$ex.Response.StatusCode
                }
            }
            catch {
                # Ignore
            }

            try {
                if (-not $statusCode -and $ex -and $ex.PSObject.Properties['StatusCode']) {
                    $statusCode = [int]$ex.StatusCode
                }
            }
            catch {
                # Ignore
            }

            if (-not $statusCode) {
                $transportFail += 1
            }
            continue
        }

        $content = $content.Trim()
        if ($statusCode -eq [int]$check.ExpectedStatus) {
            if ([string]$check.ExpectedBody -eq '' -or $content -eq [string]$check.ExpectedBody) {
                $success += 1
            }
        }
    }

    if ($total -le 0) {
        return 'NoNetwork'
    }
    if ($transportFail -ge $total) {
        return 'NoNetwork'
    }

    $threshold = [Math]::Floor($total / 2) + 1
    if ($success -ge $threshold) {
        return 'Authenticated'
    }
    return 'Portal'
}

function Enable-OpenPathCaptivePortalMode {
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [string]$State = 'Portal'
    )

    if (-not $PSCmdlet.ShouldProcess('OpenPath', 'Enable captive portal mode')) {
        return $false
    }

    if (Test-Path $captivePortalStatePath) {
        Set-OpenPathCaptivePortalMarker -State $State | Out-Null
        return $true
    }

    Write-OpenPathLog 'Watchdog: Captive portal detected - entering portal mode (temporarily opening DNS + firewall)' -Level WARN

    Disable-OpenPathFirewall | Out-Null
    Restore-OriginalDNS
    Set-OpenPathCaptivePortalMarker -State $State | Out-Null
    return $true
}

function Disable-OpenPathCaptivePortalMode {
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [PSCustomObject]$Config = $null
    )

    if (-not $PSCmdlet.ShouldProcess('OpenPath', 'Disable captive portal mode')) {
        return $false
    }

    if (-not (Test-Path $captivePortalStatePath)) {
        return $true
    }

    Write-OpenPathLog 'Watchdog: Captive portal resolved - restoring DNS protection' -Level WARN

    Set-LocalDNS

    if (-not $Config) {
        try {
            $Config = Get-OpenPathConfig
        }
        catch {
            $Config = $null
        }
    }

    try {
        $acrylicPath = Get-AcrylicPath
        $upstream = '8.8.8.8'
        if ($Config -and $Config.PSObject.Properties['primaryDNS'] -and $Config.primaryDNS) {
            $upstream = [string]$Config.primaryDNS
        }

        if ($acrylicPath) {
            Set-OpenPathFirewall -UpstreamDNS $upstream -AcrylicPath $acrylicPath | Out-Null
        }
        else {
            Enable-OpenPathFirewall | Out-Null
        }
    }
    catch {
        # Non-fatal
    }

    Clear-OpenPathCaptivePortalMarker | Out-Null
    return $true
}

# Pre-check: Captive portal state
$portalModeActive = (Test-Path $captivePortalStatePath)
$captiveState = 'NoNetwork'
try {
    $captiveState = Test-OpenPathCaptivePortalState -TimeoutSec 3
}
catch {
    $captiveState = 'NoNetwork'
}

if ($captiveState -eq 'Portal') {
    Enable-OpenPathCaptivePortalMode -State $captiveState | Out-Null
}
elseif ($captiveState -eq 'Authenticated' -and $portalModeActive) {
    Disable-OpenPathCaptivePortalMode -Config $config | Out-Null
}

$portalModeActive = (Test-Path $captivePortalStatePath)
if ($portalModeActive) {
    $issues += 'Captive portal mode active'
}

# Check 1: Acrylic service running
try {
    $acrylicService = Get-Service -DisplayName "*Acrylic*" -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $acrylicService -or $acrylicService.Status -ne 'Running') {
        $issues += "Acrylic service not running"
        Write-OpenPathLog "Watchdog: Acrylic service not running, attempting restart..." -Level WARN
        Start-AcrylicService
    }
}
catch {
    Write-OpenPathLog "Watchdog: Error checking Acrylic service: $_" -Level ERROR
}

# Check 2: DNS resolution working (should resolve whitelisted domain)
try {
    if (-not $portalModeActive -and -not (Test-DNSResolution -Domain "google.com")) {
        $issues += "DNS resolution failed for whitelisted domain"
        Write-OpenPathLog "Watchdog: DNS resolution failed, restarting Acrylic..." -Level WARN
        Restart-AcrylicService
        Start-Sleep -Seconds 3
    }
}
catch {
    Write-OpenPathLog "Watchdog: Error checking DNS resolution: $_" -Level ERROR
}

# Check 3: DNS sinkhole working (should block non-whitelisted)
try {
    if (-not $portalModeActive -and -not (Test-DNSSinkhole -Domain "this-should-be-blocked-test-12345.com")) {
        $issues += "DNS sinkhole not working"
        Write-OpenPathLog "Watchdog: Sinkhole not working properly" -Level WARN
    }
}
catch {
    Write-OpenPathLog "Watchdog: Error checking DNS sinkhole: $_" -Level ERROR
}

# Check 4: Firewall rules active
try {
    if (-not $portalModeActive -and -not (Test-FirewallActive)) {
        $issues += "Firewall rules not active"
        Write-OpenPathLog "Watchdog: Firewall rules missing, reconfiguring..." -Level WARN
        if (-not $config) {
            $config = Get-OpenPathConfig
        }
        $acrylicPath = Get-AcrylicPath
        Set-OpenPathFirewall -UpstreamDNS $config.primaryDNS -AcrylicPath $acrylicPath
    }
}
catch {
    Write-OpenPathLog "Watchdog: Error checking/reconfiguring firewall: $_" -Level ERROR
}

# Check 5: Local DNS configured
try {
    $dnsServers = Get-DnsClientServerAddress -AddressFamily IPv4 | 
        Where-Object { $_.ServerAddresses -contains "127.0.0.1" }

    if (-not $portalModeActive -and -not $dnsServers) {
        $issues += "Local DNS not configured"
        Write-OpenPathLog "Watchdog: Local DNS not configured, fixing..." -Level WARN
        Set-LocalDNS
    }
}
catch {
    Write-OpenPathLog "Watchdog: Error checking local DNS: $_" -Level ERROR
}

# Check 6: SSE listener running
try {
    $sseTask = Get-ScheduledTask -TaskName "OpenPath-SSE" -ErrorAction SilentlyContinue
    if ($sseTask -and $sseTask.State -ne 'Running') {
        $issues += "SSE listener not running"
        Write-OpenPathLog "Watchdog: SSE listener not running, restarting..." -Level WARN
        Start-ScheduledTask -TaskName "OpenPath-SSE" -ErrorAction SilentlyContinue
    }
}
catch {
    Write-OpenPathLog "Watchdog: Error checking SSE listener: $_" -Level ERROR
}

# Check 7: Stale fail-safe marker
$staleFailsafeActive = $false
if (Test-Path $staleFailsafeStatePath) {
    $staleFailsafeActive = $true
    Write-OpenPathLog "Watchdog: stale whitelist fail-safe mode is currently active" -Level WARN
}

# Check 8: Integrity baseline checks (anti-tampering)
$integrityTampered = $false
try {
    $integrityChecksEnabled = $true
    if ($config -and $config.PSObject.Properties['enableIntegrityChecks']) {
        $integrityChecksEnabled = [bool]$config.enableIntegrityChecks
    }

    if ($integrityChecksEnabled) {
        $integrityResult = Test-OpenPathIntegrity

        if (-not $integrityResult.BaselinePresent) {
            Write-OpenPathLog "Watchdog: Integrity baseline missing, creating baseline" -Level WARN
            Save-OpenPathIntegrityBackup | Out-Null
            New-OpenPathIntegrityBaseline | Out-Null
        }
        elseif (-not $integrityResult.Healthy) {
            Write-OpenPathLog "Watchdog: Integrity mismatch detected, attempting restore" -Level WARN
            $restoreResult = Restore-OpenPathIntegrity -IntegrityResult $integrityResult
            if (-not $restoreResult.Healthy) {
                $integrityTampered = $true
                $issues += "Integrity tampering detected"
                Write-OpenPathLog "Watchdog: Integrity restore incomplete" -Level ERROR
            }
            else {
                Write-OpenPathLog "Watchdog: Integrity restored from backup" -Level WARN
            }
        }
    }
}
catch {
    $issues += "Integrity check error"
    Write-OpenPathLog "Watchdog: Error during integrity checks: $_" -Level ERROR
}

# Captive portal handling now runs as a pre-check so other checks can skip
# enforcement while portal mode is active.

# Summary
$status = 'HEALTHY'
if ($integrityTampered) {
    $status = 'TAMPERED'
}
elseif ($staleFailsafeActive) {
    $status = 'STALE_FAILSAFE'
}
elseif ($issues.Count -gt 0) {
    $status = 'DEGRADED'
}

$watchdogFailCount = 0
if ($status -eq 'HEALTHY' -or $status -eq 'STALE_FAILSAFE' -or ($portalModeActive -and $status -eq 'DEGRADED')) {
    Reset-WatchdogFailCount
}
else {
    $watchdogFailCount = Increment-WatchdogFailCount
    if ($status -eq 'DEGRADED' -and $watchdogFailCount -ge 3) {
        $status = 'CRITICAL'
    }
}

$checkpointRecovered = $false
if ($status -eq 'CRITICAL' -and $config) {
    $checkpointRollbackEnabled = $true
    if ($config.PSObject.Properties['enableCheckpointRollback']) {
        $checkpointRollbackEnabled = [bool]$config.enableCheckpointRollback
    }

    if ($checkpointRollbackEnabled) {
        Write-OpenPathLog "Watchdog: CRITICAL state reached, attempting checkpoint recovery" -Level WARN
        if (Restore-CheckpointFromWatchdog -Config $config) {
            $checkpointRecovered = $true
            $status = 'DEGRADED'
            $watchdogFailCount = 0
            Reset-WatchdogFailCount
            $issues += "Checkpoint rollback restored DNS state"
        }
        else {
            $issues += "Checkpoint rollback failed"
        }
    }
}

$actions = if ($issues.Count -gt 0) {
    ($issues | Sort-Object -Unique) -join '; '
}
else {
    'watchdog_ok'
}

if ($staleFailsafeActive) {
    if ($actions -eq 'watchdog_ok') {
        $actions = 'stale_failsafe_active'
    }
    else {
        $actions = "$actions; stale_failsafe_active"
    }
}

if ($integrityTampered) {
    if ($actions -eq 'watchdog_ok') {
        $actions = 'integrity_tampered'
    }
    else {
        $actions = "$actions; integrity_tampered"
    }
}

if ($checkpointRecovered) {
    if ($actions -eq 'watchdog_ok') {
        $actions = 'checkpoint_recovery_applied'
    }
    else {
        $actions = "$actions; checkpoint_recovery_applied"
    }
}

$runtimeHealth = Get-OpenPathRuntimeHealth
Send-OpenPathHealthReport -Status $status `
    -DnsServiceRunning $runtimeHealth.DnsServiceRunning `
    -DnsResolving $runtimeHealth.DnsResolving `
    -FailCount $watchdogFailCount `
    -Actions $actions | Out-Null

if ($status -ne 'HEALTHY') {
    Write-OpenPathLog "Watchdog status=$status failCount=$watchdogFailCount actions=$actions"
}

exit 0
