# OpenPath Firewall Module for Windows
# Manages Windows Firewall rules to prevent DNS bypass

# Import common functions
$modulePath = Split-Path $PSScriptRoot -Parent
Import-Module "$modulePath\lib\Common.psm1" -Force -ErrorAction SilentlyContinue

$script:RulePrefix = "OpenPath-DNS"

function Set-OpenPathFirewall {
    <#
    .SYNOPSIS
        Configures Windows Firewall to block external DNS and VPNs
    .PARAMETER UpstreamDNS
        The upstream DNS server IP that Acrylic should be allowed to reach
    .PARAMETER AcrylicPath
        Path to Acrylic DNS Proxy installation
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [string]$UpstreamDNS = "8.8.8.8",
        [string]$AcrylicPath = "${env:ProgramFiles(x86)}\Acrylic DNS Proxy"
    )

    if (-not (Test-AdminPrivileges)) {
        Write-OpenPathLog "Administrator privileges required for firewall configuration" -Level ERROR
        return $false
    }

    if (-not $PSCmdlet.ShouldProcess("Windows Firewall", "Configure OpenPath firewall rules")) {
        return $false
    }

    Write-OpenPathLog "Configuring Windows Firewall..."

    # Remove existing rules first
    Remove-OpenPathFirewall

    try {
        # 1. Allow loopback DNS (for applications -> Acrylic)
        New-NetFirewallRule -DisplayName "$script:RulePrefix-Allow-Loopback-UDP" `
            -Direction Outbound `
            -Protocol UDP `
            -RemoteAddress 127.0.0.1 `
            -RemotePort 53 `
            -Action Allow `
            -Profile Any `
            -Description "Allow DNS to local Acrylic DNS Proxy" | Out-Null
        
        New-NetFirewallRule -DisplayName "$script:RulePrefix-Allow-Loopback-TCP" `
            -Direction Outbound `
            -Protocol TCP `
            -RemoteAddress 127.0.0.1 `
            -RemotePort 53 `
            -Action Allow `
            -Profile Any `
            -Description "Allow DNS to local Acrylic DNS Proxy (TCP)" | Out-Null
        
        # 2. Allow Acrylic to reach upstream DNS
        $acrylicExe = "$AcrylicPath\AcrylicService.exe"
        if (Test-Path $acrylicExe) {
            New-NetFirewallRule -DisplayName "$script:RulePrefix-Allow-Upstream-UDP" `
                -Direction Outbound `
                -Protocol UDP `
                -RemoteAddress $UpstreamDNS `
                -RemotePort 53 `
                -Action Allow `
                -Program $acrylicExe `
                -Profile Any `
                -Description "Allow Acrylic to reach upstream DNS" | Out-Null
            
            # Also allow secondary DNS
            New-NetFirewallRule -DisplayName "$script:RulePrefix-Allow-Secondary-UDP" `
                -Direction Outbound `
                -Protocol UDP `
                -RemoteAddress "8.8.4.4" `
                -RemotePort 53 `
                -Action Allow `
                -Program $acrylicExe `
                -Profile Any `
                -Description "Allow Acrylic to reach secondary DNS" | Out-Null
        }
        
        # 3. Block all other DNS (UDP and TCP port 53)
        New-NetFirewallRule -DisplayName "$script:RulePrefix-Block-DNS-UDP" `
            -Direction Outbound `
            -Protocol UDP `
            -RemotePort 53 `
            -Action Block `
            -Profile Any `
            -Description "Block external DNS to prevent bypass" | Out-Null
        
        New-NetFirewallRule -DisplayName "$script:RulePrefix-Block-DNS-TCP" `
            -Direction Outbound `
            -Protocol TCP `
            -RemotePort 53 `
            -Action Block `
            -Profile Any `
            -Description "Block external DNS (TCP) to prevent bypass" | Out-Null
        
        # 4. Block DNS-over-TLS (port 853)
        New-NetFirewallRule -DisplayName "$script:RulePrefix-Block-DoT" `
            -Direction Outbound `
            -Protocol TCP `
            -RemotePort 853 `
            -Action Block `
            -Profile Any `
            -Description "Block DNS-over-TLS to prevent bypass" | Out-Null

        # 4b. Block known DNS-over-HTTPS resolver IPs on 443
        $enableDohIpBlocking = $true
        try {
            $config = Get-OpenPathConfig
            if ($config.PSObject.Properties['enableDohIpBlocking']) {
                $enableDohIpBlocking = [bool]$config.enableDohIpBlocking
            }
        }
        catch {
            # Keep defaults if config cannot be read
        }

        if ($enableDohIpBlocking) {
            $dohResolvers = @(
                "8.8.8.8", "8.8.4.4",
                "1.1.1.1", "1.0.0.1",
                "9.9.9.9", "149.112.112.112",
                "94.140.14.14", "94.140.15.15",
                "76.76.2.0", "76.76.10.0"
            )

            $dohRuleCount = 0
            foreach ($resolverIp in ($dohResolvers | Sort-Object -Unique)) {
                if ($resolverIp -eq $UpstreamDNS) {
                    continue
                }

                $resolverId = $resolverIp -replace '[^0-9A-Za-z]', '-'

                New-NetFirewallRule -DisplayName "$script:RulePrefix-Block-DoH-$resolverId-TCP443" `
                    -Direction Outbound `
                    -Protocol TCP `
                    -RemoteAddress $resolverIp `
                    -RemotePort 443 `
                    -Action Block `
                    -Profile Any `
                    -Description "Block DoH resolver $resolverIp over TCP/443" | Out-Null

                New-NetFirewallRule -DisplayName "$script:RulePrefix-Block-DoH-$resolverId-UDP443" `
                    -Direction Outbound `
                    -Protocol UDP `
                    -RemoteAddress $resolverIp `
                    -RemotePort 443 `
                    -Action Block `
                    -Profile Any `
                    -Description "Block DoH resolver $resolverIp over UDP/443" | Out-Null

                $dohRuleCount += 2
            }

            Write-OpenPathLog "Added $dohRuleCount DoH egress block rules"
        }
        else {
            Write-OpenPathLog "DoH IP blocking disabled by configuration" -Level WARN
        }

        # 5. Block common VPN ports
        $vpnPorts = @(
            @{Port = 1194; Name = "OpenVPN"; Protocol = "UDP"},
            @{Port = 1194; Name = "OpenVPN-TCP"; Protocol = "TCP"},
            @{Port = 51820; Name = "WireGuard"; Protocol = "UDP"},
            @{Port = 1723; Name = "PPTP"; Protocol = "TCP"},
            @{Port = 500; Name = "IKE"; Protocol = "UDP"},
            @{Port = 4500; Name = "IPSec-NAT"; Protocol = "UDP"}
        )
        
        foreach ($vpn in $vpnPorts) {
            New-NetFirewallRule -DisplayName "$script:RulePrefix-Block-VPN-$($vpn.Name)" `
                -Direction Outbound `
                -Protocol $vpn.Protocol `
                -RemotePort $vpn.Port `
                -Action Block `
                -Profile Any `
                -Description "Block $($vpn.Name) VPN traffic" | Out-Null
        }
        
        # 6. Block Tor ports
        $torPorts = @(9001, 9030, 9050, 9051, 9150)
        foreach ($port in $torPorts) {
            New-NetFirewallRule -DisplayName "$script:RulePrefix-Block-Tor-$port" `
                -Direction Outbound `
                -Protocol TCP `
                -RemotePort $port `
                -Action Block `
                -Profile Any `
                -Description "Block Tor traffic on port $port" | Out-Null
        }
        
        Write-OpenPathLog "Windows Firewall configured successfully"
        return $true
    }
    catch {
        Write-OpenPathLog "Failed to configure firewall: $_" -Level ERROR
        return $false
    }
}

function Remove-OpenPathFirewall {
    <#
    .SYNOPSIS
        Removes all whitelist firewall rules
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param()

    if (-not $PSCmdlet.ShouldProcess("Windows Firewall", "Remove OpenPath firewall rules")) {
        return $false
    }

    Write-OpenPathLog "Removing openpath firewall rules..."

    try {
        Get-NetFirewallRule -DisplayName "$script:RulePrefix-*" -ErrorAction SilentlyContinue |
            Remove-NetFirewallRule -ErrorAction SilentlyContinue

        Write-OpenPathLog "Firewall rules removed"
        return $true
    }
    catch {
        Write-OpenPathLog "Error removing firewall rules: $_" -Level WARN
        return $false
    }
}

function Test-FirewallActive {
    <#
    .SYNOPSIS
        Checks if whitelist firewall rules are active
    #>
    $rules = Get-NetFirewallRule -DisplayName "$script:RulePrefix-*" -ErrorAction SilentlyContinue
    $blockRules = $rules | Where-Object { $_.Action -eq 'Block' -and $_.Enabled -eq $true }
    
    # Should have at least the DNS block rules
    return ($blockRules.Count -ge 2)
}

function Get-FirewallStatus {
    <#
    .SYNOPSIS
        Gets detailed status of whitelist firewall rules
    #>
    $rules = Get-NetFirewallRule -DisplayName "$script:RulePrefix-*" -ErrorAction SilentlyContinue
    
    $status = @{
        TotalRules = $rules.Count
        EnabledRules = ($rules | Where-Object Enabled).Count
        BlockRules = ($rules | Where-Object { $_.Action -eq 'Block' }).Count
        AllowRules = ($rules | Where-Object { $_.Action -eq 'Allow' }).Count
        Active = (Test-FirewallActive)
    }
    
    return [PSCustomObject]$status
}

function Disable-OpenPathFirewall {
    <#
    .SYNOPSIS
        Temporarily disables whitelist firewall rules without removing them
    #>
    Write-OpenPathLog "Disabling openpath firewall rules..."
    
    try {
        Get-NetFirewallRule -DisplayName "$script:RulePrefix-*" -ErrorAction SilentlyContinue | 
            Disable-NetFirewallRule -ErrorAction SilentlyContinue
        
        Write-OpenPathLog "Firewall rules disabled"
        return $true
    }
    catch {
        Write-OpenPathLog "Error disabling firewall rules: $_" -Level WARN
        return $false
    }
}

function Enable-OpenPathFirewall {
    <#
    .SYNOPSIS
        Re-enables whitelist firewall rules
    #>
    Write-OpenPathLog "Enabling openpath firewall rules..."
    
    try {
        Get-NetFirewallRule -DisplayName "$script:RulePrefix-*" -ErrorAction SilentlyContinue | 
            Enable-NetFirewallRule -ErrorAction SilentlyContinue
        
        Write-OpenPathLog "Firewall rules enabled"
        return $true
    }
    catch {
        Write-OpenPathLog "Error enabling firewall rules: $_" -Level WARN
        return $false
    }
}

# Export module members
Export-ModuleMember -Function @(
    'Set-OpenPathFirewall',
    'Remove-OpenPathFirewall',
    'Test-FirewallActive',
    'Get-FirewallStatus',
    'Disable-OpenPathFirewall',
    'Enable-OpenPathFirewall'
)
