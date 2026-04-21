Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

Write-Host 'Resetting persistent self-hosted Windows runner state...'

$openPathTaskNames = @(
    'OpenPath-AgentUpdate',
    'OpenPath-SSE',
    'OpenPath-Startup',
    'OpenPath-Update',
    'OpenPath-Watchdog'
)

foreach ($taskName in $openPathTaskNames) {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
}

Get-ScheduledTask -ErrorAction SilentlyContinue |
    Where-Object {
        $_.TaskName -like 'OpenPath-*' -or
        $_.TaskName -like 'Whitelist-*' -or
        $_.TaskPath -like '*OpenPath*' -or
        $_.TaskPath -like '*Whitelist*'
    } |
    ForEach-Object {
        Stop-ScheduledTask -TaskName $_.TaskName -TaskPath $_.TaskPath -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $_.TaskName -TaskPath $_.TaskPath -Confirm:$false -ErrorAction SilentlyContinue
    }

Get-Process -ErrorAction SilentlyContinue |
    Where-Object {
        ($_.Path -and $_.Path.StartsWith('C:\OpenPath', [System.StringComparison]::OrdinalIgnoreCase)) -or
        $_.ProcessName -like 'OpenPath*' -or
        $_.ProcessName -like 'Acrylic*'
    } |
    Stop-Process -Force -ErrorAction SilentlyContinue

$acrylicServiceName = 'AcrylicDNSProxySvc'
Stop-Service -Name $acrylicServiceName -Force -ErrorAction SilentlyContinue
& sc.exe delete $acrylicServiceName 2>$null | Out-Null

$pathsToRemove = @(
    'C:\OpenPath',
    "${env:ProgramFiles}\Acrylic DNS Proxy",
    "${env:ProgramFiles(x86)}\Acrylic DNS Proxy"
)

foreach ($path in $pathsToRemove) {
    if ($path -and (Test-Path -LiteralPath $path)) {
        Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction SilentlyContinue
    }
}

$firefoxDistributionPaths = @(
    "${env:ProgramFiles}\Mozilla Firefox\distribution",
    "${env:ProgramFiles(x86)}\Mozilla Firefox\distribution"
)

foreach ($distributionPath in $firefoxDistributionPaths) {
    if (-not $distributionPath) {
        continue
    }

    $firefoxRoot = Split-Path -Parent $distributionPath
    if (-not (Test-Path -LiteralPath $firefoxRoot)) {
        continue
    }

    New-Item -Path $distributionPath -ItemType Directory -Force | Out-Null
    Remove-Item -LiteralPath (Join-Path $distributionPath 'policies.json') -Force -ErrorAction SilentlyContinue
    & icacls $distributionPath /grant 'SYSTEM:(OI)(CI)F' 'Administrators:(OI)(CI)F' /T | Out-Null
}

$dnsServers = @('1.1.1.1', '8.8.8.8')
$activeAdapters = Get-NetAdapter -ErrorAction SilentlyContinue |
    Where-Object { $_.Status -eq 'Up' -and $_.InterfaceDescription -notlike '*Loopback*' }

foreach ($adapter in $activeAdapters) {
    Set-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex -ServerAddresses $dnsServers -ErrorAction SilentlyContinue
}

if (-not $activeAdapters) {
    Set-DnsClientServerAddress -InterfaceAlias 'Ethernet' -ServerAddresses @('1.1.1.1', '8.8.8.8') -ErrorAction SilentlyContinue
}

Clear-DnsClientCache -ErrorAction SilentlyContinue

Write-Host 'Self-hosted Windows runner reset complete.'
