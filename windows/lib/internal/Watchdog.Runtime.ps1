function Restore-CheckpointFromWatchdog {
    param(
        [Parameter(Mandatory = $true)]
        [PSCustomObject]$Config,

        [string]$OpenPathRoot = 'C:\OpenPath'
    )

    $whitelistPath = Join-Path $OpenPathRoot 'data\whitelist.txt'

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

        if ((Test-DNSResolution) -and (Test-DNSSinkhole -Domain "this-should-be-blocked-test-12345.com")) {
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

function Invoke-OpenPathWatchdogPrechecks {
    param(
        [AllowNull()]
        [PSCustomObject]$Config
    )

    $portalModeActive = Test-OpenPathCaptivePortalModeActive
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
        Disable-OpenPathCaptivePortalMode -Config $Config | Out-Null
    }

    return [PSCustomObject]@{
        PortalModeActive = (Test-OpenPathCaptivePortalModeActive)
        CaptiveState = $captiveState
    }
}

function Invoke-OpenPathWatchdogChecks {
    param(
        [AllowNull()]
        [PSCustomObject]$Config,

        [Parameter(Mandatory = $true)]
        [bool]$PortalModeActive,

        [Parameter(Mandatory = $true)]
        [string]$OpenPathRoot,

        [Parameter(Mandatory = $true)]
        [string]$StaleFailsafeStatePath
    )

    $issues = @()
    $recoveryEligibleIssues = @()
    $localWhitelistPath = Join-Path $OpenPathRoot 'data\whitelist.txt'
    $localWhitelistSections = $null
    $failOpenActive = $false

    try {
        $localWhitelistSections = Get-OpenPathWhitelistSectionsFromFile -Path $localWhitelistPath
        $failOpenActive = [bool]$localWhitelistSections.IsDisabled
        if ($failOpenActive) {
            Write-OpenPathLog "Watchdog: local fail-open whitelist marker active; skipping protected-mode DNS/firewall recovery" -Level WARN
        }
    }
    catch {
        Write-OpenPathLog "Watchdog: Error reading local whitelist state: $_" -Level WARN
    }

    $shouldRunProtectedModeChecks = -not $PortalModeActive -and -not $failOpenActive

    try {
        $acrylicService = if ($shouldRunProtectedModeChecks) { Get-Service -DisplayName "*Acrylic*" -ErrorAction SilentlyContinue | Select-Object -First 1 } else { $null }
        if ($shouldRunProtectedModeChecks -and (-not $acrylicService -or $acrylicService.Status -ne 'Running')) {
            $issues += "Acrylic service not running"
            $recoveryEligibleIssues += "Acrylic service not running"
            Write-OpenPathLog "Watchdog: Acrylic service not running, attempting restart..." -Level WARN
            Start-AcrylicService
        }
    }
    catch {
        Write-OpenPathLog "Watchdog: Error checking Acrylic service: $_" -Level ERROR
    }

    try {
        if ($shouldRunProtectedModeChecks -and -not (Test-DNSResolution)) {
            $issues += "DNS resolution failed for allowed domain"
            $recoveryEligibleIssues += "DNS resolution failed for allowed domain"
            Write-OpenPathLog "Watchdog: DNS resolution failed, restarting Acrylic..." -Level WARN
            Restart-AcrylicService
            Start-Sleep -Seconds 3
        }
    }
    catch {
        Write-OpenPathLog "Watchdog: Error checking DNS resolution: $_" -Level ERROR
    }

    try {
        if ($shouldRunProtectedModeChecks -and -not (Test-DNSSinkhole -Domain "this-should-be-blocked-test-12345.com")) {
            $issues += "DNS sinkhole not working"
            $recoveryEligibleIssues += "DNS sinkhole not working"
            Write-OpenPathLog "Watchdog: Sinkhole not working properly" -Level WARN
        }
    }
    catch {
        Write-OpenPathLog "Watchdog: Error checking DNS sinkhole: $_" -Level ERROR
    }

    try {
        if ($shouldRunProtectedModeChecks -and -not (Test-FirewallActive)) {
            $issues += "Firewall rules not active"
            $recoveryEligibleIssues += "Firewall rules not active"
            Write-OpenPathLog "Watchdog: Firewall rules missing, reconfiguring..." -Level WARN
            if (-not $Config) {
                $Config = Get-OpenPathConfig
            }
            $acrylicPath = Get-AcrylicPath
            Set-OpenPathFirewall -UpstreamDNS $Config.primaryDNS -AcrylicPath $acrylicPath
        }
    }
    catch {
        Write-OpenPathLog "Watchdog: Error checking/reconfiguring firewall: $_" -Level ERROR
    }

    try {
        $dnsServers = Get-DnsClientServerAddress -AddressFamily IPv4 |
            Where-Object { $_.ServerAddresses -contains "127.0.0.1" }

        if ($shouldRunProtectedModeChecks -and -not $dnsServers) {
            $issues += "Local DNS not configured"
            $recoveryEligibleIssues += "Local DNS not configured"
            Write-OpenPathLog "Watchdog: Local DNS not configured, fixing..." -Level WARN
            Set-LocalDNS
        }
    }
    catch {
        Write-OpenPathLog "Watchdog: Error checking local DNS: $_" -Level ERROR
    }

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

    $staleFailsafeActive = $false
    if (Test-Path $StaleFailsafeStatePath) {
        $staleFailsafeActive = $true
        Write-OpenPathLog "Watchdog: stale whitelist fail-safe mode is currently active" -Level WARN
    }

    $integrityTampered = $false
    try {
        $integrityChecksEnabled = $true
        if ($Config -and $Config.PSObject.Properties['enableIntegrityChecks']) {
            $integrityChecksEnabled = [bool]$Config.enableIntegrityChecks
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

    try {
        if (Sync-OpenPathFirefoxManagedExtensionPolicy) {
            Write-OpenPathLog "Watchdog: refreshed Firefox managed extension policy"
        }
    }
    catch {
        Write-OpenPathLog "Watchdog: Firefox managed extension policy refresh failed: $_" -Level WARN
    }

    return [PSCustomObject]@{
        Issues = @($issues)
        RecoveryEligibleIssues = @($recoveryEligibleIssues)
        StaleFailsafeActive = $staleFailsafeActive
        IntegrityTampered = $integrityTampered
        FailOpenActive = $failOpenActive
    }
}

function Get-OpenPathWatchdogOutcome {
    param(
        [AllowNull()]
        [PSCustomObject]$Config,

        [Parameter(Mandatory = $true)]
        [string[]]$Issues,

        [Parameter(Mandatory = $true)]
        [string[]]$RecoveryEligibleIssues,

        [Parameter(Mandatory = $true)]
        [bool]$StaleFailsafeActive,

        [Parameter(Mandatory = $true)]
        [bool]$IntegrityTampered,

        [Parameter(Mandatory = $true)]
        [bool]$FailOpenActive,

        [Parameter(Mandatory = $true)]
        [bool]$PortalModeActive,

        [Parameter(Mandatory = $true)]
        [string]$WatchdogFailCountPath,

        [Parameter(Mandatory = $true)]
        [string]$OpenPathRoot
    )

    $status = 'HEALTHY'
    if ($FailOpenActive) {
        $status = 'FAIL_OPEN'
    }
    elseif ($IntegrityTampered) {
        $status = 'TAMPERED'
    }
    elseif ($StaleFailsafeActive) {
        $status = 'STALE_FAILSAFE'
    }
    elseif ($Issues.Count -gt 0) {
        $status = 'DEGRADED'
    }

    $watchdogFailCount = 0
    $shouldIncrementFailCount = $status -eq 'DEGRADED' -and $RecoveryEligibleIssues.Count -gt 0
    if (
        $status -eq 'HEALTHY' -or
        $status -eq 'FAIL_OPEN' -or
        $status -eq 'STALE_FAILSAFE' -or
        ($PortalModeActive -and $status -eq 'DEGRADED') -or
        (-not $shouldIncrementFailCount)
    ) {
        Reset-WatchdogFailCount -WatchdogFailCountPath $WatchdogFailCountPath
    }
    else {
        $watchdogFailCount = Increment-WatchdogFailCount -WatchdogFailCountPath $WatchdogFailCountPath
        if ($status -eq 'DEGRADED' -and $watchdogFailCount -ge 3) {
            $status = 'CRITICAL'
        }
    }

    $issuesList = @($Issues)
    $checkpointRecovered = $false
    if ($status -eq 'CRITICAL' -and $Config) {
        $checkpointRollbackEnabled = $true
        if ($Config.PSObject.Properties['enableCheckpointRollback']) {
            $checkpointRollbackEnabled = [bool]$Config.enableCheckpointRollback
        }

        if ($checkpointRollbackEnabled) {
            Write-OpenPathLog "Watchdog: CRITICAL state reached, attempting checkpoint recovery" -Level WARN
            if (Restore-CheckpointFromWatchdog -Config $Config -OpenPathRoot $OpenPathRoot) {
                $checkpointRecovered = $true
                $status = 'DEGRADED'
                $watchdogFailCount = 0
                Reset-WatchdogFailCount -WatchdogFailCountPath $WatchdogFailCountPath
                $issuesList += "Checkpoint rollback restored DNS state"
            }
            else {
                $issuesList += "Checkpoint rollback failed"
            }
        }
    }

    $actions = if ($issuesList.Count -gt 0) {
        ($issuesList | Sort-Object -Unique) -join '; '
    }
    else {
        'watchdog_ok'
    }

    if ($StaleFailsafeActive) {
        $actions = if ($actions -eq 'watchdog_ok') { 'stale_failsafe_active' } else { "$actions; stale_failsafe_active" }
    }

    if ($IntegrityTampered) {
        $actions = if ($actions -eq 'watchdog_ok') { 'integrity_tampered' } else { "$actions; integrity_tampered" }
    }

    if ($FailOpenActive) {
        $actions = if ($actions -eq 'watchdog_ok') { 'fail_open_active' } else { "$actions; fail_open_active" }
    }

    if ($checkpointRecovered) {
        $actions = if ($actions -eq 'watchdog_ok') { 'checkpoint_recovery_applied' } else { "$actions; checkpoint_recovery_applied" }
    }

    return [PSCustomObject]@{
        Status = $status
        WatchdogFailCount = $watchdogFailCount
        Actions = $actions
    }
}
