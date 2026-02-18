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

[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSAvoidUsingWriteHost', '')]
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSUseBOMForUnicodeEncodedFile', '')]

#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Unified operational command for OpenPath Windows agent.
.DESCRIPTION
    Provides a Linux-like command entrypoint for common operations:
    status, update, health, enroll, rotate-token, restart.
#>

param(
    [string]$Command = 'status',
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
)

$ErrorActionPreference = 'Stop'

function Resolve-OpenPathRoot {
    $installedRoot = 'C:\OpenPath'
    if (Test-Path "$installedRoot\lib\Common.psm1") {
        return $installedRoot
    }

    if (Test-Path "$PSScriptRoot\lib\Common.psm1") {
        return $PSScriptRoot
    }

    throw 'OpenPath installation not found (missing lib/Common.psm1)'
}

function Show-OpenPathHelp {
    Write-Host 'OpenPath Windows command'
    Write-Host ''
    Write-Host 'Usage:'
    Write-Host '  .\OpenPath.ps1 [command] [args]'
    Write-Host ''
    Write-Host 'Commands:'
    Write-Host '  status        Show runtime status summary'
    Write-Host '  update        Trigger immediate whitelist update'
    Write-Host '  health        Run watchdog health check now'
    Write-Host '  self-update   Update Windows agent software from server'
    Write-Host '  enroll        Register machine in classroom mode'
    Write-Host '  rotate-token  Rotate tokenized whitelist URL'
    Write-Host '  restart       Restart Acrylic + trigger update'
    Write-Host '  help          Show this help'
    Write-Host ''
    Write-Host 'Examples:'
    Write-Host '  .\OpenPath.ps1 status'
    Write-Host '  .\OpenPath.ps1 update'
    Write-Host '  .\OpenPath.ps1 self-update --check'
    Write-Host '  .\OpenPath.ps1 enroll -Classroom Aula1 -ApiUrl https://api.example.com -RegistrationToken <token>'
    Write-Host '  .\OpenPath.ps1 rotate-token -Secret <shared-secret>'
}

function Invoke-OpenPathScript {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ScriptPath,

        [string[]]$ScriptArguments = @()
    )

    if (-not (Test-Path $ScriptPath)) {
        throw "Script not found: $ScriptPath"
    }

    & $ScriptPath @ScriptArguments
}

function Show-OpenPathStatus {
    param(
        [Parameter(Mandatory = $true)]
        [string]$OpenPathRoot
    )

    $configPath = "$OpenPathRoot\data\config.json"
    $staleStatePath = "$OpenPathRoot\data\stale-failsafe-state.json"
    $watchdogFailPath = "$OpenPathRoot\data\watchdog-fails.txt"

    $config = $null
    if (Test-Path $configPath) {
        try {
            $config = Get-OpenPathConfig
        }
        catch {
            Write-OpenPathLog "Unable to read config for status command: $_" -Level WARN
        }
    }

    $acrylicService = Get-Service -DisplayName '*Acrylic*' -ErrorAction SilentlyContinue | Select-Object -First 1
    $acrylicState = if ($acrylicService) { [string]$acrylicService.Status } else { 'NotInstalled' }

    $dnsResolving = $false
    $sinkholeWorking = $false
    $firewallActive = $false

    try {
        $dnsResolving = [bool](Test-DNSResolution -Domain 'google.com')
    }
    catch {
        $dnsResolving = $false
    }

    try {
        $sinkholeWorking = [bool](Test-DNSSinkhole -Domain 'this-should-be-blocked-test-12345.com')
    }
    catch {
        $sinkholeWorking = $false
    }

    try {
        $firewallActive = [bool](Test-FirewallActive)
    }
    catch {
        $firewallActive = $false
    }

    $tasks = @()
    try {
        $tasks = @(Get-OpenPathTaskStatus)
    }
    catch {
        $tasks = @()
    }

    $watchdogFails = 0
    if (Test-Path $watchdogFailPath) {
        try {
            $watchdogFails = [int](Get-Content $watchdogFailPath -Raw)
        }
        catch {
            $watchdogFails = 0
        }
    }

    $staleFailsafe = Test-Path $staleStatePath

    $overallStatus = if ($acrylicState -eq 'Running' -and $dnsResolving -and $sinkholeWorking) {
        'HEALTHY'
    }
    elseif ($acrylicState -eq 'Running' -and $dnsResolving) {
        'DEGRADED'
    }
    else {
        'CRITICAL'
    }

    if ($staleFailsafe) {
        $overallStatus = 'STALE_FAILSAFE'
    }

    Write-Host '==========================================' -ForegroundColor Cyan
    Write-Host '  OpenPath Windows Status' -ForegroundColor Cyan
    Write-Host '==========================================' -ForegroundColor Cyan
    Write-Host "Overall: $overallStatus"
    Write-Host "Acrylic service: $acrylicState"
    Write-Host "DNS resolving: $dnsResolving"
    Write-Host "Sinkhole active: $sinkholeWorking"
    Write-Host "Firewall active: $firewallActive"
    Write-Host "Stale failsafe: $staleFailsafe"
    Write-Host "Watchdog fail count: $watchdogFails"

    if ($config) {
        Write-Host "Agent version: $($config.version)"
        if ($config.PSObject.Properties['lastAgentUpdateAt'] -and $config.lastAgentUpdateAt) {
            Write-Host "Last agent update: $($config.lastAgentUpdateAt)"
        }
        Write-Host "Classroom: $($config.classroom)"
        Write-Host "API URL: $($config.apiUrl)"
        Write-Host "Whitelist URL: $($config.whitelistUrl)"
    }

    if ($tasks.Count -gt 0) {
        Write-Host ''
        Write-Host 'Scheduled tasks:'
        foreach ($task in $tasks | Sort-Object Name) {
            Write-Host "  - $($task.Name): $($task.State) (last result: $($task.LastResult))"
        }
    }
}

try {
    $openPathRoot = Resolve-OpenPathRoot

    Import-Module "$openPathRoot\lib\Common.psm1" -Force
    Import-Module "$openPathRoot\lib\DNS.psm1" -Force
    Import-Module "$openPathRoot\lib\Firewall.psm1" -Force
    Import-Module "$openPathRoot\lib\Services.psm1" -Force

    $scriptsPath = "$openPathRoot\scripts"
    $commandName = $Command.ToLowerInvariant()

    switch ($commandName) {
        'status' {
            Show-OpenPathStatus -OpenPathRoot $openPathRoot
        }
        'update' {
            Invoke-OpenPathScript -ScriptPath "$scriptsPath\Update-OpenPath.ps1" -ScriptArguments $Arguments
        }
        'health' {
            Invoke-OpenPathScript -ScriptPath "$scriptsPath\Test-DNSHealth.ps1" -ScriptArguments $Arguments
        }
        'self-update' {
            $checkOnly = $Arguments -contains '--check' -or $Arguments -contains '-check'
            $silent = $Arguments -contains '--silent' -or $Arguments -contains '-silent'
            $result = Invoke-OpenPathAgentSelfUpdate -CheckOnly:$checkOnly -Silent:$silent
            if (-not $result.Success) {
                throw $result.Message
            }
        }
        'enroll' {
            Invoke-OpenPathScript -ScriptPath "$scriptsPath\Enroll-Machine.ps1" -ScriptArguments $Arguments
        }
        'rotate-token' {
            Invoke-OpenPathScript -ScriptPath "$openPathRoot\Rotate-Token.ps1" -ScriptArguments $Arguments
        }
        'restart' {
            Restart-AcrylicService | Out-Null
            Start-OpenPathTask -TaskType SSE | Out-Null
            Invoke-OpenPathScript -ScriptPath "$scriptsPath\Update-OpenPath.ps1"
        }
        'help' {
            Show-OpenPathHelp
        }
        default {
            Write-Host "Unknown command: $Command" -ForegroundColor Red
            Show-OpenPathHelp
            exit 1
        }
    }
}
catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
    exit 1
}
