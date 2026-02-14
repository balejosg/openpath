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

        # Backup current whitelist for rollback
        if (Test-Path $whitelistPath) {
            Copy-Item $whitelistPath $backupPath -Force
            Write-OpenPathLog "Backed up current whitelist for rollback"
        }

        # Download and parse whitelist
        $whitelist = Get-OpenPathFromUrl -Url $config.whitelistUrl

        # Check for deactivation flag
        if ($whitelist.Whitelist -contains "#DESACTIVADO" -or $whitelist.Whitelist[0] -match "^#DESACTIVADO") {
            Write-OpenPathLog "DEACTIVATION FLAG detected - entering fail-open mode" -Level WARN

            # Restore normal DNS
            Restore-OriginalDNS

            # Remove firewall rules
            Remove-OpenPathFirewall

            # Remove browser policies
            Remove-BrowserPolicy

            Write-OpenPathLog "System in fail-open mode"
        }
        else {
            # Save whitelist to local file
            $whitelist.Whitelist | Set-Content $whitelistPath -Encoding UTF8

            # Update Acrylic DNS hosts
            Update-AcrylicHost -WhitelistedDomains $whitelist.Whitelist -BlockedSubdomains $whitelist.BlockedSubdomains

            # Restart Acrylic to apply changes
            Restart-AcrylicService

            # Configure firewall (if enabled)
            if ($config.enableFirewall) {
                $acrylicPath = Get-AcrylicPath
                Set-OpenPathFirewall -UpstreamDNS $config.primaryDNS -AcrylicPath $acrylicPath
            }

            # Configure browser policies (if enabled)
            if ($config.enableBrowserPolicies) {
                Set-AllBrowserPolicy -BlockedPaths $whitelist.BlockedPaths
            }

            # Send health report to central API (best-effort, non-blocking)
            if ($config.apiUrl) {
                try {
                    $healthReport = @{
                        hostname       = $env:COMPUTERNAME
                        status         = "ok"
                        platform       = "windows"
                        domainsCount   = $whitelist.Whitelist.Count
                        firewallActive = [bool](Test-FirewallActive)
                        acrylicRunning = ((Get-Service -DisplayName "*Acrylic*" -ErrorAction SilentlyContinue | Select-Object -First 1).Status -eq 'Running')
                        lastUpdate     = (Get-Date -Format "o")
                    } | ConvertTo-Json

                    Invoke-RestMethod -Uri "$($config.apiUrl)/api/machines/$($env:COMPUTERNAME)/health" `
                        -Method Post -Body $healthReport -ContentType "application/json" `
                        -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null

                    Write-OpenPathLog "Health report sent to API"
                }
                catch {
                    Write-OpenPathLog "Health report failed (non-critical): $_" -Level WARN
                }
            }

            Write-OpenPathLog "=== OpenPath update completed successfully ==="
        }
    }
}
catch {
    Write-OpenPathLog "Update failed: $_" -Level ERROR

    # Rollback: restore previous whitelist and restart Acrylic
    if (Test-Path $backupPath) {
        Write-OpenPathLog "Rolling back to previous whitelist..." -Level WARN
        try {
            Copy-Item $backupPath $whitelistPath -Force

            # Re-parse the backup and re-apply
            $backupContent = Get-Content $whitelistPath
            Update-AcrylicHost -WhitelistedDomains $backupContent -BlockedSubdomains @() -ErrorAction SilentlyContinue
            Restart-AcrylicService -ErrorAction SilentlyContinue

            Write-OpenPathLog "Rollback completed successfully" -Level WARN
        }
        catch {
            Write-OpenPathLog "Rollback also failed: $_" -Level ERROR
        }
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
