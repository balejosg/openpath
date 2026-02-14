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

$ErrorActionPreference = "SilentlyContinue"
$OpenPathRoot = "C:\OpenPath"

# Import modules
Import-Module "$OpenPathRoot\lib\Common.psm1" -Force
Import-Module "$OpenPathRoot\lib\DNS.psm1" -Force
Import-Module "$OpenPathRoot\lib\Firewall.psm1" -Force

$issues = @()

# Check 1: Acrylic service running
$acrylicService = Get-Service -DisplayName "*Acrylic*" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $acrylicService -or $acrylicService.Status -ne 'Running') {
    $issues += "Acrylic service not running"
    Write-OpenPathLog "Watchdog: Acrylic service not running, attempting restart..." -Level WARN
    Start-AcrylicService
}

# Check 2: DNS resolution working (should resolve whitelisted domain)
if (-not (Test-DNSResolution -Domain "google.com")) {
    $issues += "DNS resolution failed for whitelisted domain"
    Write-OpenPathLog "Watchdog: DNS resolution failed, restarting Acrylic..." -Level WARN
    Restart-AcrylicService
    Start-Sleep -Seconds 3
}

# Check 3: DNS sinkhole working (should block non-whitelisted)
if (-not (Test-DNSSinkhole -Domain "this-should-be-blocked-test-12345.com")) {
    $issues += "DNS sinkhole not working"
    Write-OpenPathLog "Watchdog: Sinkhole not working properly" -Level WARN
}

# Check 4: Firewall rules active
if (-not (Test-FirewallActive)) {
    $issues += "Firewall rules not active"
    Write-OpenPathLog "Watchdog: Firewall rules missing, reconfiguring..." -Level WARN
    
    try {
        $config = Get-OpenPathConfig
        $acrylicPath = Get-AcrylicPath
        Set-OpenPathFirewall -UpstreamDNS $config.primaryDNS -AcrylicPath $acrylicPath
    }
    catch {
        Write-OpenPathLog "Failed to reconfigure firewall: $_" -Level ERROR
    }
}

# Check 5: Local DNS configured
$dnsServers = Get-DnsClientServerAddress -AddressFamily IPv4 | 
    Where-Object { $_.ServerAddresses -contains "127.0.0.1" }

if (-not $dnsServers) {
    $issues += "Local DNS not configured"
    Write-OpenPathLog "Watchdog: Local DNS not configured, fixing..." -Level WARN
    Set-LocalDNS
}

# Check 6: SSE listener running
$sseTask = Get-ScheduledTask -TaskName "OpenPath-SSE" -ErrorAction SilentlyContinue
if ($sseTask -and $sseTask.State -ne 'Running') {
    $issues += "SSE listener not running"
    Write-OpenPathLog "Watchdog: SSE listener not running, restarting..." -Level WARN
    Start-ScheduledTask -TaskName "OpenPath-SSE" -ErrorAction SilentlyContinue
}

# Check 7: Captive portal detection
# If we're behind a captive portal (WiFi login), temporarily allow full access
try {
    $captiveResponse = Invoke-WebRequest -Uri "http://www.msftconnecttest.com/connecttest.txt" `
        -UseBasicParsing -TimeoutSec 5 -MaximumRedirection 0 -ErrorAction Stop
    $isCaptive = ($captiveResponse.StatusCode -ne 200 -or $captiveResponse.Content.Trim() -ne "Microsoft Connect Test")
}
catch {
    # A redirect (3xx) or connection failure could indicate captive portal
    $isCaptive = $true
}

if ($isCaptive -and (Test-InternetConnection)) {
    # We have network connectivity but captive portal detected
    $issues += "Captive portal detected"
    Write-OpenPathLog "Watchdog: Captive portal detected - temporarily opening DNS for authentication" -Level WARN
    Restore-OriginalDNS
    
    # Wait for user to complete captive portal authentication
    Start-Sleep -Seconds 30
    
    # Re-check if captive portal is resolved
    try {
        $recheck = Invoke-WebRequest -Uri "http://www.msftconnecttest.com/connecttest.txt" `
            -UseBasicParsing -TimeoutSec 5 -MaximumRedirection 0 -ErrorAction Stop
        if ($recheck.StatusCode -eq 200 -and $recheck.Content.Trim() -eq "Microsoft Connect Test") {
            Write-OpenPathLog "Watchdog: Captive portal resolved - restoring DNS protection" 
            Set-LocalDNS
        }
    }
    catch {
        Write-OpenPathLog "Watchdog: Captive portal still active - will retry next cycle" -Level WARN
    }
}

# Summary
if ($issues.Count -eq 0) {
    # All checks passed - silent success
    exit 0
}
else {
    Write-OpenPathLog "Watchdog completed with $($issues.Count) issue(s) detected and handled"
    exit 0
}
