function Get-DefaultDohResolverIps {
    <#
    .SYNOPSIS
        Returns default DoH resolver IP catalog used for egress blocking
    #>
    return @(
        '8.8.8.8', '8.8.4.4',
        '1.1.1.1', '1.0.0.1',
        '9.9.9.9', '149.112.112.112',
        '208.67.222.222', '208.67.220.220',
        '45.90.28.0', '45.90.30.0',
        '194.242.2.2', '194.242.2.3',
        '94.140.14.14', '94.140.15.15',
        '76.76.2.0', '76.76.10.0'
    )
}

function Get-DefaultVpnBlockRules {
    <#
    .SYNOPSIS
        Returns default VPN egress block rules (protocol/port/name)
    #>
    return @(
        [PSCustomObject]@{ Protocol = 'UDP'; Port = 1194; Name = 'OpenVPN' },
        [PSCustomObject]@{ Protocol = 'TCP'; Port = 1194; Name = 'OpenVPN-TCP' },
        [PSCustomObject]@{ Protocol = 'UDP'; Port = 51820; Name = 'WireGuard' },
        [PSCustomObject]@{ Protocol = 'TCP'; Port = 1723; Name = 'PPTP' },
        [PSCustomObject]@{ Protocol = 'UDP'; Port = 500; Name = 'IKE' },
        [PSCustomObject]@{ Protocol = 'UDP'; Port = 4500; Name = 'IPSec-NAT' }
    )
}

function Get-DefaultTorBlockPorts {
    <#
    .SYNOPSIS
        Returns default Tor-related TCP ports to block
    #>
    return @(9001, 9030, 9050, 9051, 9150)
}
