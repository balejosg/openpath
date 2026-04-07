# Shared OpenPath Windows Pester helpers

# PSScriptAnalyzer: Test-FunctionExists ends with "s" but "Exists" is not a plural noun
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSUseSingularNouns', '')]
param()

# Must be at script scope (outside BeforeAll) for -Skip evaluation during discovery.
function Test-FunctionExists {
    param([string]$FunctionName)
    return $null -ne (Get-Command -Name $FunctionName -ErrorAction SilentlyContinue)
}

function Test-IsAdmin {
    if (Test-FunctionExists 'Test-AdminPrivileges') {
        return Test-AdminPrivileges
    }

    return $false
}

$script:modulePath = Join-Path $PSScriptRoot ".." "lib"
Import-Module "$script:modulePath\Common.psm1" -Force -ErrorAction SilentlyContinue
Import-Module "$script:modulePath\DNS.psm1" -Force -ErrorAction SilentlyContinue
Import-Module "$script:modulePath\Firewall.psm1" -Force -ErrorAction SilentlyContinue
Import-Module "$script:modulePath\Browser.psm1" -Force -ErrorAction SilentlyContinue
Import-Module "$script:modulePath\Services.psm1" -Force -ErrorAction SilentlyContinue

function Assert-ContentContainsAll {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Content,

        [Parameter(Mandatory = $true)]
        [string[]]$Needles
    )

    foreach ($needle in $Needles) {
        $Content.Contains($needle) | Should -BeTrue -Because "Expected content to include '$needle'"
    }
}

function Initialize-FirewallRuleCaptureMocks {
    $script:createdFirewallRules = @()

    Mock Test-AdminPrivileges { $true } -ModuleName Firewall
    Mock Remove-OpenPathFirewall { $true } -ModuleName Firewall

    Mock New-NetFirewallRule {
        param(
            [string]$DisplayName,
            [string]$Direction,
            [string]$Protocol,
            [object]$RemoteAddress,
            [object]$RemotePort,
            [string]$Action,
            [string]$Profile,
            [string]$Description,
            [string]$Program
        )

        $script:createdFirewallRules += [PSCustomObject]@{
            DisplayName = $DisplayName
            Direction = $Direction
            Protocol = $Protocol
            RemoteAddress = [string]$RemoteAddress
            RemotePort = [string]$RemotePort
            Action = $Action
            Program = $Program
        }

        return [PSCustomObject]@{ DisplayName = $DisplayName }
    } -ModuleName Firewall

    Mock Test-Path { $false } -ModuleName Firewall -ParameterFilter { $Path -like '*AcrylicService.exe' }
}

function Get-ContractFixturePath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FileName
    )

    $contractsDir = Join-Path $PSScriptRoot '..' '..' 'tests' 'contracts'
    $fixturePath = Join-Path $contractsDir $FileName

    if (-not (Test-Path $fixturePath)) {
        throw "Contract fixture not found: $fixturePath"
    }

    return $fixturePath
}

function Get-ContractFixtureLines {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FileName
    )

    $fixturePath = Get-ContractFixturePath -FileName $FileName
    return @(
        Get-Content $fixturePath -ErrorAction Stop |
            ForEach-Object { $_.Trim() } |
            Where-Object { $_ -and -not $_.StartsWith('#') }
    )
}

function Get-ContractFixtureJson {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FileName
    )

    $fixturePath = Get-ContractFixturePath -FileName $FileName
    return Get-Content $fixturePath -Raw | ConvertFrom-Json -ErrorAction Stop
}
