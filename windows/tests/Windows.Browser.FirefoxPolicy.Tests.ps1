# OpenPath Windows browser Firefox policy tests

Import-Module (Join-Path $PSScriptRoot "TestHelpers.psm1") -Force
$modulePath = Join-Path $PSScriptRoot ".." "lib"
Import-Module "$modulePath\Browser.Common.psm1" -Force -Global -ErrorAction Stop
Import-Module "$modulePath\Browser.FirefoxPolicy.psm1" -Force -Global -ErrorAction Stop

Describe "Browser Module - Firefox Policy" {
    BeforeAll {
        $modulePath = Join-Path $PSScriptRoot ".." "lib"
        Import-Module (Join-Path $modulePath "Browser.Common.psm1") -Force -Global -ErrorAction Stop
        Import-Module (Join-Path $modulePath "Browser.FirefoxPolicy.psm1") -Force -Global -ErrorAction Stop
    }

    Context "Set-FirefoxPolicy" {
        It "Returns a boolean value" {
            $result = Set-FirefoxPolicy -BlockedPaths @()
            $result | Should -BeOfType [bool]
        }

        It "Skips Firefox extension force-install when only the unsigned staged bundle is available" {
            $script:capturedFirefoxPolicyJson = $null

            Mock Test-Path {
                param([string]$Path)
                if ($Path -like '*firefox.exe') { return $true }
                if ($Path -like '*browser-extension\firefox\manifest.json') { return $true }
                return $false
            } -ModuleName Browser.FirefoxPolicy

            Mock New-Item { [PSCustomObject]@{ FullName = 'mock-path' } } -ModuleName Browser.FirefoxPolicy
            Mock Get-OpenPathConfig { [PSCustomObject]@{} } -ModuleName Browser.FirefoxPolicy
            Mock Write-OpenPathUtf8NoBomFile {
                param([string]$Path, [string]$Value)
                if ($Path -like '*policies.json') {
                    $script:capturedFirefoxPolicyJson = $Value
                }
            } -ModuleName Browser.FirefoxPolicy
            Mock Write-OpenPathLog { } -ModuleName Browser.FirefoxPolicy

            $result = Set-FirefoxPolicy -BlockedPaths @()
            $result | Should -BeTrue
            $script:capturedFirefoxPolicyJson | Should -Not -BeNullOrEmpty

            $policy = $script:capturedFirefoxPolicyJson | ConvertFrom-Json
            $policy.policies.PSObject.Properties.Name | Should -Not -Contain 'ExtensionSettings'
        }

        It "Uses explicit signed Firefox extension config when available" {
            $script:capturedFirefoxPolicyJson = $null
            $contract = Get-ContractFixtureJson -FileName 'browser-firefox-managed-extension.json'

            Mock Test-Path {
                param([string]$Path)
                if ($Path -like '*firefox.exe') { return $true }
                return $false
            } -ModuleName Browser.FirefoxPolicy

            Mock New-Item { [PSCustomObject]@{ FullName = 'mock-path' } } -ModuleName Browser.FirefoxPolicy
            Mock Get-OpenPathConfig {
                [PSCustomObject]@{
                    firefoxExtensionId = $contract.extensionId
                    firefoxExtensionInstallUrl = $contract.configuredInstallUrl
                }
            } -ModuleName Browser.FirefoxPolicy
            Mock Write-OpenPathUtf8NoBomFile {
                param([string]$Path, [string]$Value)
                if ($Path -like '*policies.json') {
                    $script:capturedFirefoxPolicyJson = $Value
                }
            } -ModuleName Browser.FirefoxPolicy
            Mock Write-OpenPathLog { } -ModuleName Browser.FirefoxPolicy

            $result = Set-FirefoxPolicy -BlockedPaths @()
            $result | Should -BeTrue

            $policy = $script:capturedFirefoxPolicyJson | ConvertFrom-Json
            $policy.policies.ExtensionSettings.($contract.extensionId).installation_mode | Should -Be 'force_installed'
            $policy.policies.ExtensionSettings.($contract.extensionId).install_url | Should -Be $contract.configuredInstallUrl
        }

        It "Uses the managed OpenPath API for Firefox release updates when apiUrl is configured" {
            $script:capturedFirefoxPolicyJson = $null
            $contract = Get-ContractFixtureJson -FileName 'browser-firefox-managed-extension.json'

            Mock Test-Path {
                param([string]$Path)
                if ($Path -like '*firefox.exe') { return $true }
                if ($Path -like '*browser-extension\firefox-release\metadata.json') { return $true }
                if ($Path -like '*browser-extension\firefox-release\openpath-firefox-extension.xpi') { return $true }
                return $false
            } -ModuleName Browser.FirefoxPolicy

            Mock New-Item { [PSCustomObject]@{ FullName = 'mock-path' } } -ModuleName Browser.FirefoxPolicy
            Mock Get-OpenPathConfig { [PSCustomObject]@{ apiUrl = 'https://school.example/' } } -ModuleName Browser.FirefoxPolicy
            Mock Get-Content {
                param([string]$Path, [switch]$Raw)
                if ($Path -like '*browser-extension\firefox-release\metadata.json') {
                    return '{"extensionId":"monitor-bloqueos@openpath","version":"2.0.0"}'
                }

                throw "Unexpected path: $Path"
            } -ModuleName Browser.FirefoxPolicy
            Mock Write-OpenPathUtf8NoBomFile {
                param([string]$Path, [string]$Value)
                if ($Path -like '*policies.json') {
                    $script:capturedFirefoxPolicyJson = $Value
                }
            } -ModuleName Browser.FirefoxPolicy
            Mock Write-OpenPathLog { } -ModuleName Browser.FirefoxPolicy

            $result = Set-FirefoxPolicy -BlockedPaths @()
            $result | Should -BeTrue

            $policy = $script:capturedFirefoxPolicyJson | ConvertFrom-Json
            $policy.policies.ExtensionSettings.($contract.extensionId).install_url | Should -Be $contract.managedApiInstallUrl
        }

        It "Prefers the staged signed Firefox XPI over metadata installUrl when both exist" {
            $script:capturedFirefoxPolicyJson = $null
            $contract = Get-ContractFixtureJson -FileName 'browser-firefox-managed-extension.json'

            Mock Test-Path {
                param([string]$Path)
                if ($Path -like '*firefox.exe') { return $true }
                if ($Path -like '*browser-extension\firefox-release\metadata.json') { return $true }
                if ($Path -like '*browser-extension\firefox-release\openpath-firefox-extension.xpi') { return $true }
                return $false
            } -ModuleName Browser.FirefoxPolicy

            Mock New-Item { [PSCustomObject]@{ FullName = 'mock-path' } } -ModuleName Browser.FirefoxPolicy
            Mock Get-OpenPathConfig { [PSCustomObject]@{} } -ModuleName Browser.FirefoxPolicy
            Mock Resolve-Path { $null } -ModuleName Browser.FirefoxPolicy
            Mock ConvertTo-OpenPathFileUrl { $contract.stagedReleaseInstallUrl } -ModuleName Browser.FirefoxPolicy
            Mock Get-Content {
                param([string]$Path, [switch]$Raw)
                if ($Path -like '*browser-extension\firefox-release\metadata.json') {
                    return "{`"extensionId`":`"$($contract.extensionId)`",`"version`":`"2.0.0`",`"installUrl`":`"$($contract.metadataInstallUrl)`"}"
                }

                throw "Unexpected path: $Path"
            } -ModuleName Browser.FirefoxPolicy
            Mock Write-OpenPathUtf8NoBomFile {
                param([string]$Path, [string]$Value)
                if ($Path -like '*policies.json') {
                    $script:capturedFirefoxPolicyJson = $Value
                }
            } -ModuleName Browser.FirefoxPolicy
            Mock Write-OpenPathLog { } -ModuleName Browser.FirefoxPolicy

            $result = Set-FirefoxPolicy -BlockedPaths @()
            $result | Should -BeTrue

            $policy = $script:capturedFirefoxPolicyJson | ConvertFrom-Json
            $policy.policies.ExtensionSettings.($contract.extensionId).install_url | Should -Be $contract.stagedReleaseInstallUrl
        }

        It "Resolves staged Firefox release artifacts from the default OpenPath root" {
            $script:capturedFirefoxPolicyJson = $null
            $contract = Get-ContractFixtureJson -FileName 'browser-firefox-managed-extension.json'

            Mock Test-Path {
                param([string]$Path)
                switch ($Path) {
                    { $_ -like '*firefox.exe' } { return $true }
                    'C:\OpenPath\browser-extension\firefox-release\metadata.json' { return $true }
                    'C:\OpenPath\browser-extension\firefox-release\openpath-firefox-extension.xpi' { return $true }
                    default { return $false }
                }
            } -ModuleName Browser.FirefoxPolicy

            Mock New-Item { [PSCustomObject]@{ FullName = 'mock-path' } } -ModuleName Browser.FirefoxPolicy
            Mock Get-OpenPathConfig { [PSCustomObject]@{} } -ModuleName Browser.FirefoxPolicy
            Mock Resolve-Path { $null } -ModuleName Browser.FirefoxPolicy
            Mock ConvertTo-OpenPathFileUrl { $contract.stagedReleaseInstallUrl } -ModuleName Browser.FirefoxPolicy
            Mock Get-Content {
                param([string]$Path, [switch]$Raw)
                if ($Path -eq 'C:\OpenPath\browser-extension\firefox-release\metadata.json') {
                    return "{`"extensionId`":`"$($contract.extensionId)`",`"version`":`"2.0.0`"}"
                }

                throw "Unexpected path: $Path"
            } -ModuleName Browser.FirefoxPolicy
            Mock Write-OpenPathUtf8NoBomFile {
                param([string]$Path, [string]$Value)
                if ($Path -like '*policies.json') {
                    $script:capturedFirefoxPolicyJson = $Value
                }
            } -ModuleName Browser.FirefoxPolicy
            Mock Write-OpenPathLog { } -ModuleName Browser.FirefoxPolicy

            $result = Set-FirefoxPolicy -BlockedPaths @()
            $result | Should -BeTrue

            $policy = $script:capturedFirefoxPolicyJson | ConvertFrom-Json
            $policy.policies.ExtensionSettings.($contract.extensionId).install_url | Should -Be $contract.stagedReleaseInstallUrl
        }

        It "Converts unresolved staged Windows XPI paths into file URLs" {
            $contract = Get-ContractFixtureJson -FileName 'browser-firefox-managed-extension.json'

            Mock Resolve-Path { $null } -ModuleName Browser.Common

            $result = InModuleScope Browser.Common {
                ConvertTo-OpenPathFileUrl -Path 'C:\OpenPath\browser-extension\firefox-release\openpath-firefox-extension.xpi'
            }
            $result | Should -Be $contract.stagedReleaseInstallUrl
        }

        It "Writes UTF-8 text files without a BOM" {
            $tempFile = Join-Path $TestDrive 'policies.json'
            $json = '{"policies":{"DisableTelemetry":true}}'

            InModuleScope Browser.Common -Parameters @{
                TempFile = $tempFile
                Json = $json
            } {
                Write-OpenPathUtf8NoBomFile -Path $TempFile -Value $Json
            }

            $bytes = [System.IO.File]::ReadAllBytes($tempFile)
            $hasUtf8Bom = $bytes.Length -ge 3 -and $bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191

            $hasUtf8Bom | Should -BeFalse
            [System.IO.File]::ReadAllText($tempFile, [System.Text.UTF8Encoding]::new($false)) | Should -Be $json
        }

        It "Guards Firefox policy output against Set-Content -Encoding UTF8 regressions" {
            $browserPolicyModulePath = Join-Path $PSScriptRoot ".." "lib" "Browser.FirefoxPolicy.psm1"
            $content = Get-Content $browserPolicyModulePath -Raw

            $content | Should -Not -Match 'Set-Content\s+[^\r\n]*-Encoding\s+UTF8'
            $content | Should -Match 'Write-OpenPathUtf8NoBomFile -Path \$policiesPath -Value \$policiesJson'
        }

        It "Writes DNSOverHTTPS disabled and locked" {
            $script:capturedFirefoxPolicyJson = $null

            Mock Test-Path {
                param([string]$Path)
                if ($Path -like '*firefox.exe') { return $true }
                return $false
            } -ModuleName Browser.FirefoxPolicy

            Mock New-Item { [PSCustomObject]@{ FullName = 'mock-path' } } -ModuleName Browser.FirefoxPolicy
            Mock Write-OpenPathUtf8NoBomFile {
                param([string]$Path, [string]$Value)
                if ($Path -like '*policies.json') {
                    $script:capturedFirefoxPolicyJson = $Value
                }
            } -ModuleName Browser.FirefoxPolicy
            Mock Write-OpenPathLog { } -ModuleName Browser.FirefoxPolicy

            $result = Set-FirefoxPolicy -BlockedPaths @()
            $result | Should -BeTrue

            $policy = $script:capturedFirefoxPolicyJson | ConvertFrom-Json
            $policy.policies.DNSOverHTTPS.Enabled | Should -BeFalse
            $policy.policies.DNSOverHTTPS.Locked | Should -BeTrue
        }
    }
}
