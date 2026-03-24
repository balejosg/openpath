# OpenPath Script Bootstrap Module for Windows
# Centralizes standalone script initialization for PowerShell entrypoints.

function Initialize-OpenPathScriptSession {
    <#
    .SYNOPSIS
        Imports OpenPath modules for a standalone script session and validates required commands.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$OpenPathRoot,

        [string[]]$DependentModules = @(),

        [string[]]$RequiredCommands = @(),

        [string]$ScriptName = 'OpenPath script'
    )

    foreach ($moduleName in @($DependentModules)) {
        if (-not $moduleName -or $moduleName -in @('Common', 'ScriptBootstrap')) {
            continue
        }

        Import-Module (Join-Path $OpenPathRoot "lib\$moduleName.psm1") -Force
    }

    # Re-import Common globally after dependent modules so exported helpers stay
    # visible in standalone script sessions.
    Import-Module (Join-Path $OpenPathRoot 'lib\Common.psm1') -Force -Global

    $missingCommands = @(
        $RequiredCommands | Where-Object {
            -not (Get-Command -Name $_ -ErrorAction SilentlyContinue)
        }
    )

    if ($missingCommands.Count -gt 0) {
        throw "$ScriptName failed to import required commands: $($missingCommands -join ', ')"
    }

    return $true
}

Export-ModuleMember -Function @(
    'Initialize-OpenPathScriptSession'
)
