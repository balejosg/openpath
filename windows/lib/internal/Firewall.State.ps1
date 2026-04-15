function Remove-OpenPathFirewall {
    <#
    .SYNOPSIS
        Removes all whitelist firewall rules
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param()

    if (-not $PSCmdlet.ShouldProcess('Windows Firewall', 'Remove OpenPath firewall rules')) {
        return $false
    }

    Write-OpenPathLog 'Removing openpath firewall rules...'

    try {
        Get-NetFirewallRule -DisplayName "$script:RulePrefix-*" -ErrorAction SilentlyContinue |
            Remove-NetFirewallRule -ErrorAction SilentlyContinue

        Write-OpenPathLog 'Firewall rules removed'
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
    return ($blockRules.Count -ge 2)
}

function Get-FirewallStatus {
    <#
    .SYNOPSIS
        Gets detailed status of whitelist firewall rules
    #>
    $rules = Get-NetFirewallRule -DisplayName "$script:RulePrefix-*" -ErrorAction SilentlyContinue
    return [PSCustomObject]@{
        TotalRules  = $rules.Count
        EnabledRules = ($rules | Where-Object Enabled).Count
        BlockRules  = ($rules | Where-Object { $_.Action -eq 'Block' }).Count
        AllowRules  = ($rules | Where-Object { $_.Action -eq 'Allow' }).Count
        Active      = (Test-FirewallActive)
    }
}

function Disable-OpenPathFirewall {
    <#
    .SYNOPSIS
        Temporarily disables whitelist firewall rules without removing them
    #>
    Write-OpenPathLog 'Disabling openpath firewall rules...'

    try {
        Get-NetFirewallRule -DisplayName "$script:RulePrefix-*" -ErrorAction SilentlyContinue |
            Disable-NetFirewallRule -ErrorAction SilentlyContinue

        Write-OpenPathLog 'Firewall rules disabled'
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
    Write-OpenPathLog 'Enabling openpath firewall rules...'

    try {
        Get-NetFirewallRule -DisplayName "$script:RulePrefix-*" -ErrorAction SilentlyContinue |
            Enable-NetFirewallRule -ErrorAction SilentlyContinue

        Write-OpenPathLog 'Firewall rules enabled'
        return $true
    }
    catch {
        Write-OpenPathLog "Error enabling firewall rules: $_" -Level WARN
        return $false
    }
}
