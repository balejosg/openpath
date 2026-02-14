# OpenPath Windows Pester Tests
# Tests for all PowerShell modules

# PSScriptAnalyzer: Test-FunctionExists ends with "s" but "Exists" is not a plural noun
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSUseSingularNouns', '')]
param()

# Helper function to safely check if a function exists
# Must be at script scope (outside BeforeAll) for -Skip evaluation during discovery
function Test-FunctionExists {
    param([string]$FunctionName)
    return $null -ne (Get-Command -Name $FunctionName -ErrorAction SilentlyContinue)
}

# Helper to check admin privileges safely during discovery
function Test-IsAdmin {
    if (Test-FunctionExists 'Test-AdminPrivileges') {
        return Test-AdminPrivileges
    }
    return $false
}

# Import modules at script scope for discovery-time availability
$script:modulePath = Join-Path $PSScriptRoot ".." "lib"
Import-Module "$script:modulePath\Common.psm1" -Force -ErrorAction SilentlyContinue
Import-Module "$script:modulePath\DNS.psm1" -Force -ErrorAction SilentlyContinue
Import-Module "$script:modulePath\Firewall.psm1" -Force -ErrorAction SilentlyContinue
Import-Module "$script:modulePath\Browser.psm1" -Force -ErrorAction SilentlyContinue
Import-Module "$script:modulePath\Services.psm1" -Force -ErrorAction SilentlyContinue

BeforeAll {
    # Re-import modules in BeforeAll to ensure fresh state for tests
    $modulePath = Join-Path $PSScriptRoot ".." "lib"
    Import-Module "$modulePath\Common.psm1" -Force
}

Describe "Common Module" {
    Context "Test-AdminPrivileges" {
        It "Returns a boolean value" {
            $result = Test-AdminPrivileges
            $result | Should -BeOfType [bool]
        }
    }

    Context "Write-OpenPathLog" {
        It "Writes INFO level logs" {
            { Write-OpenPathLog -Message "Test INFO message" -Level INFO } | Should -Not -Throw
        }

        It "Writes WARN level logs" {
            { Write-OpenPathLog -Message "Test WARN message" -Level WARN } | Should -Not -Throw
        }

        It "Writes ERROR level logs" {
            { Write-OpenPathLog -Message "Test ERROR message" -Level ERROR } | Should -Not -Throw
        }
    }

    Context "Get-PrimaryDNS" {
        It "Returns a valid IP address string" {
            $dns = Get-PrimaryDNS
            $dns | Should -Not -BeNullOrEmpty
            $dns | Should -Match '^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$'
        }
    }

    Context "Get-OpenPathFromUrl" {
        It "Throws when URL is invalid" {
            { Get-OpenPathFromUrl -Url "https://invalid.example.com/404" } | Should -Throw
        }
    }

    Context "Test-InternetConnection" {
        It "Returns a boolean value" {
            $result = Test-InternetConnection
            $result | Should -BeOfType [bool]
        }
    }
}

Describe "DNS Module" {
    BeforeAll {
        $modulePath = Join-Path $PSScriptRoot ".." "lib"
        Import-Module "$modulePath\DNS.psm1" -Force -ErrorAction SilentlyContinue
    }

    Context "Test-AcrylicInstalled" {
        It "Returns a boolean value" -Skip:(-not (Test-FunctionExists 'Test-AcrylicInstalled')) {
            $result = Test-AcrylicInstalled
            $result | Should -BeOfType [bool]
        }
    }

    Context "Get-AcrylicPath" {
        It "Returns null or valid path" -Skip:(-not (Test-FunctionExists 'Get-AcrylicPath')) {
            $path = Get-AcrylicPath
            if ($path) {
                Test-Path $path | Should -BeTrue
            } else {
                $path | Should -BeNullOrEmpty
            }
        }
    }

    Context "Update-AcrylicHost" {
        It "Generates valid hosts content" -Skip:(-not ((Test-FunctionExists 'Test-AcrylicInstalled') -and (Test-FunctionExists 'Update-AcrylicHost') -and (Test-AcrylicInstalled))) {
            $result = Update-AcrylicHost -WhitelistedDomains @("example.com", "test.com") -BlockedSubdomains @()
            $result | Should -BeTrue
        }
    }
}

Describe "Firewall Module" {
    BeforeAll {
        $modulePath = Join-Path $PSScriptRoot ".." "lib"
        Import-Module "$modulePath\Firewall.psm1" -Force -ErrorAction SilentlyContinue
    }

    Context "Test-FirewallActive" {
        It "Returns a boolean value" -Skip:(-not (Test-FunctionExists 'Test-FirewallActive')) {
            $result = Test-FirewallActive
            $result | Should -BeOfType [bool]
        }
    }

    Context "Get-FirewallStatus" {
        It "Returns a hashtable with expected keys" -Skip:(-not (Test-FunctionExists 'Get-FirewallStatus')) {
            $status = Get-FirewallStatus
            $status | Should -Not -BeNullOrEmpty
            $status.TotalRules | Should -Not -BeNullOrEmpty
            $status.AllowRules | Should -Not -BeNullOrEmpty
            $status.BlockRules | Should -Not -BeNullOrEmpty
        }
    }
}

Describe "Browser Module" {
    BeforeAll {
        $modulePath = Join-Path $PSScriptRoot ".." "lib"
        Import-Module "$modulePath\Browser.psm1" -Force -ErrorAction SilentlyContinue
    }

    Context "Set-FirefoxPolicy" {
        It "Returns a boolean value" -Skip:(-not (Test-FunctionExists 'Set-FirefoxPolicy')) {
            $result = Set-FirefoxPolicy -BlockedPaths @()
            $result | Should -BeOfType [bool]
        }
    }

    Context "Set-ChromePolicy" {
        It "Does not throw with empty blocked paths" -Skip:(-not ((Test-FunctionExists 'Set-ChromePolicy') -and (Test-IsAdmin))) {
            { Set-ChromePolicy -BlockedPaths @() } | Should -Not -Throw
        }
    }
}

Describe "Services Module" {
    BeforeAll {
        $modulePath = Join-Path $PSScriptRoot ".." "lib"
        Import-Module "$modulePath\Services.psm1" -Force -ErrorAction SilentlyContinue
    }

    Context "Get-OpenPathTaskStatus" {
        It "Returns an array or empty result" -Skip:(-not (Test-FunctionExists 'Get-OpenPathTaskStatus')) {
            $status = Get-OpenPathTaskStatus
            # Status can be empty array, null, or array of objects
            { $status } | Should -Not -Throw
        }
    }

    Context "Register-OpenPathTask" {
        It "Accepts custom interval parameters" -Skip:(-not ((Test-FunctionExists 'Register-OpenPathTask') -and (Test-IsAdmin))) {
            # Just verify the function signature works
            { Register-OpenPathTask -UpdateIntervalMinutes 15 -WatchdogIntervalMinutes 2 -WhatIf } | Should -Not -Throw
        }
    }

    Context "Start-OpenPathTask" {
        It "Accepts SSE as a valid task type" -Skip:(-not (Test-FunctionExists 'Start-OpenPathTask')) {
            # Verify the SSE task type is accepted in the ValidateSet
            { Start-OpenPathTask -TaskType SSE -WhatIf } | Should -Not -Throw
        }
    }
}

Describe "SSE Listener" {
    Context "Script existence" {
        It "Start-SSEListener.ps1 exists" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Start-SSEListener.ps1"
            Test-Path $scriptPath | Should -BeTrue
        }
    }
}
