# OpenPath DNS Module for Windows
# Manages Acrylic DNS Proxy configuration and service
#
# Compatibility anchors for Windows.Tests.ps1 content contracts:
# - function Get-OpenPathDnsSettings lives in internal/DNS.Acrylic.Config.ps1
# - function Resolve-OpenPathDnsWithRetry lives in internal/DNS.Diagnostics.ps1
# - [int]$MaxAttempts = 12 remains the retry default in internal/DNS.Diagnostics.ps1
# - NX * remains part of the Acrylic hosts rendering contract in internal/DNS.Acrylic.Config.ps1
# - "IgnoreNegativeResponsesFromPrimaryServer" = "No" is enforced in internal/DNS.Acrylic.Config.ps1
# - "IgnoreNegativeResponsesFromSecondaryServer" = "No" is enforced in internal/DNS.Acrylic.Config.ps1
# - $installerVersion = "2.2.1" is pinned in internal/DNS.Acrylic.Install.ps1
# - https://downloads.sourceforge.net/project/acrylic/Acrylic/$installerVersion/Acrylic-Portable.zip is the direct download source in internal/DNS.Acrylic.Install.ps1
# - Direct Acrylic install failed is logged from internal/DNS.Acrylic.Install.ps1
# - Get-Command choco is the Chocolatey fallback probe in internal/DNS.Acrylic.Install.ps1

$modulePath = Split-Path $PSScriptRoot -Parent
Import-Module "$modulePath\lib\Common.psm1" -Force -ErrorAction SilentlyContinue
$script:InternalModulePath = Join-Path $PSScriptRoot 'internal'

. (Join-Path $script:InternalModulePath 'DNS.Acrylic.Install.ps1')
. (Join-Path $script:InternalModulePath 'DNS.Acrylic.Config.ps1')
. (Join-Path $script:InternalModulePath 'DNS.Acrylic.Service.ps1')
. (Join-Path $script:InternalModulePath 'DNS.Diagnostics.ps1')

Export-ModuleMember -Function @(
    'Get-AcrylicPath',
    'Test-AcrylicInstalled',
    'Install-AcrylicDNS',
    'Update-AcrylicHost',
    'Set-AcrylicConfiguration',
    'Set-LocalDNS',
    'Restore-OriginalDNS',
    'Restart-AcrylicService',
    'Start-AcrylicService',
    'Stop-AcrylicService',
    'Resolve-OpenPathDnsWithRetry',
    'Test-DNSResolution',
    'Test-DNSSinkhole'
)
