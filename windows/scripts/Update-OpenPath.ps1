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

try {
    $mutex = [System.Threading.Mutex]::new($false, $script:UpdateMutexName)
    $lockAcquired = $mutex.WaitOne(0)

    if (-not $lockAcquired) {
        Write-OpenPathLog "Another OpenPath update is already running - skipping this cycle" -Level WARN
        exit 0
    }
}
catch {
    Write-OpenPathLog "Failed to acquire OpenPath update lock: $_" -Level ERROR
    exit 1
}

try {
    Write-OpenPathLog "=== Starting openpath update ==="
    
    # Load configuration
    $config = Get-OpenPathConfig
    
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
        exit 0
    }
    
    # Save whitelist to local file
    $whitelist.Whitelist | Set-Content "$OpenPathRoot\data\whitelist.txt" -Encoding UTF8
    
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
    
    Write-OpenPathLog "=== OpenPath update completed successfully ==="
    
}
catch {
    Write-OpenPathLog "Update failed: $_" -Level ERROR
    exit 1
}
finally {
    if ($lockAcquired -and $mutex) {
        $mutex.ReleaseMutex()
    }

    if ($mutex) {
        $mutex.Dispose()
    }
}
