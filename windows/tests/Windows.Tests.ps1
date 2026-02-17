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

        It "Includes PID in log entries" {
            $logPath = "C:\OpenPath\data\logs\openpath.log"
            if (Test-Path $logPath) {
                Write-OpenPathLog -Message "PID test entry" -Level INFO
                $lastLine = Get-Content $logPath -Tail 1
                $lastLine | Should -Match "\[PID:\d+\]"
            }
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

Describe "Common Module - Mocked Tests" {
    BeforeAll {
        $modulePath = Join-Path $PSScriptRoot ".." "lib"
        Import-Module "$modulePath\Common.psm1" -Force
    }

    Context "Get-OpenPathFromUrl parsing" {
        It "Parses whitelist sections correctly" {
            Mock Invoke-WebRequest {
                @{ Content = "domain1.com`ndomain2.com`ndomain3.com`n## BLOCKED-SUBDOMAINS`nbad.domain.com`n## BLOCKED-PATHS`n/blocked/path" }
            } -ModuleName Common

            $result = Get-OpenPathFromUrl -Url "http://test.example.com/whitelist.txt"
            $result.Whitelist | Should -HaveCount 3
            $result.Whitelist[0] | Should -Be "domain1.com"
            $result.BlockedSubdomains | Should -HaveCount 1
            $result.BlockedSubdomains[0] | Should -Be "bad.domain.com"
            $result.BlockedPaths | Should -HaveCount 1
        }

        It "Detects #DESACTIVADO marker" {
            Mock Invoke-WebRequest {
                @{ Content = "#DESACTIVADO`ndomain1.com`ndomain2.com`ndomain3.com" }
            } -ModuleName Common

            $result = Get-OpenPathFromUrl -Url "http://test.example.com/whitelist.txt"
            $result.IsDisabled | Should -BeTrue
        }

        It "Accepts disabled whitelist even without minimum domains" {
            Mock Invoke-WebRequest {
                @{ Content = "#DESACTIVADO" }
            } -ModuleName Common

            $result = Get-OpenPathFromUrl -Url "http://test.example.com/whitelist.txt"
            $result.IsDisabled | Should -BeTrue
            $result.Whitelist | Should -HaveCount 0
        }

        It "Skips comment lines and empty lines" {
            Mock Invoke-WebRequest {
                @{ Content = "# comment`n`ndomain1.com`ndomain2.com`ndomain3.com`n# another comment" }
            } -ModuleName Common

            $result = Get-OpenPathFromUrl -Url "http://test.example.com/whitelist.txt"
            $result.Whitelist | Should -HaveCount 3
        }

        It "Rejects whitelist with insufficient valid domains" {
            Mock Invoke-WebRequest {
                @{ Content = "not-a-domain" }
            } -ModuleName Common

            { Get-OpenPathFromUrl -Url "http://test.example.com/whitelist.txt" } | Should -Throw "*Invalid whitelist*"
        }

        It "Handles empty response content" {
            Mock Invoke-WebRequest {
                @{ Content = "" }
            } -ModuleName Common

            { Get-OpenPathFromUrl -Url "http://test.example.com/whitelist.txt" } | Should -Throw "*Invalid whitelist*"
        }
    }

    Context "Get-PrimaryDNS with mocked network" {
        It "Returns DNS from adapter when available" {
            Mock Get-DnsClientServerAddress {
                @([PSCustomObject]@{ ServerAddresses = @("192.168.1.1") })
            } -ModuleName Common

            $dns = Get-PrimaryDNS
            $dns | Should -Be "192.168.1.1"
        }

        It "Falls back to gateway when no DNS adapter found" {
            Mock Get-DnsClientServerAddress { @() } -ModuleName Common
            Mock Get-NetRoute {
                @([PSCustomObject]@{ NextHop = "10.0.0.1" })
            } -ModuleName Common

            $dns = Get-PrimaryDNS
            $dns | Should -Be "10.0.0.1"
        }

        It "Falls back to 8.8.8.8 as ultimate default" {
            Mock Get-DnsClientServerAddress { @() } -ModuleName Common
            Mock Get-NetRoute { @() } -ModuleName Common

            $dns = Get-PrimaryDNS
            $dns | Should -Be "8.8.8.8"
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

    Context "Max domains limit" {
        It "Update-AcrylicHost code enforces a max domains limit" -Skip:(-not (Test-FunctionExists 'Update-AcrylicHost')) {
            $modulePath = Join-Path $PSScriptRoot ".." "lib" "DNS.psm1"
            $content = Get-Content $modulePath -Raw
            $content | Should -Match 'maxDomains'
            $content | Should -Match 'Truncating whitelist'
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

    Context "DoH egress blocking" {
        It "Firewall module blocks known DoH resolver IPs on TCP/UDP 443" {
            $modulePath = Join-Path $PSScriptRoot ".." "lib" "Firewall.psm1"
            $content = Get-Content $modulePath -Raw

            $content | Should -Match 'enableDohIpBlocking'
            $content | Should -Match 'Block-DoH'
            $content | Should -Match 'RemotePort 443'
            $content | Should -Match '8\.8\.8\.8'
            $content | Should -Match '1\.1\.1\.1'
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

    Context "DoH blocking" {
        It "Firefox policy includes DNSOverHTTPS disabled and locked" {
            $modulePath = Join-Path $PSScriptRoot ".." "lib" "Browser.psm1"
            $content = Get-Content $modulePath -Raw
            $content | Should -Match 'DNSOverHTTPS'
            $content | Should -Match 'Locked\s*=\s*\$true'
        }

        It "Chrome/Edge policy includes DnsOverHttpsMode off" {
            $modulePath = Join-Path $PSScriptRoot ".." "lib" "Browser.psm1"
            $content = Get-Content $modulePath -Raw
            $content | Should -Match 'DnsOverHttpsMode'
            $content | Should -Match '"off"'
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

    Context "Update job deduplication" {
        It "uses a named job and active-job guard" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Start-SSEListener.ps1"
            $content = Get-Content $scriptPath -Raw

            $content | Should -Match 'OpenPath-SSE-Update'
            $content | Should -Match 'Get-Job\s+-Name\s+\$script:UpdateJobName'
            $content | Should -Match 'State\s+-notin\s+@\(''Completed'',\s*''Failed'',\s*''Stopped''\)'
            $content | Should -Match 'Start-Job\s+-ScriptBlock'
            $content | Should -Match '-Name\s+\$script:UpdateJobName'
        }
    }
}

Describe "Operational Command Script" {
    Context "Script existence" {
        It "OpenPath.ps1 exists" {
            $scriptPath = Join-Path $PSScriptRoot ".." "OpenPath.ps1"
            Test-Path $scriptPath | Should -BeTrue
        }
    }

    Context "Command routing" {
        It "Routes key commands through a unified dispatcher" {
            $scriptPath = Join-Path $PSScriptRoot ".." "OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            $content | Should -Match 'switch \(\$commandName\)'
            $content | Should -Match "'status'"
            $content | Should -Match "'update'"
            $content | Should -Match "'health'"
            $content | Should -Match "'enroll'"
            $content | Should -Match "'rotate-token'"
            $content | Should -Match "'restart'"
            $content | Should -Match 'Show-OpenPathStatus'
            $content | Should -Match 'Enroll-Machine\.ps1'
        }
    }
}

Describe "Update Script" {
    Context "Concurrency guard" {
        It "Update-OpenPath.ps1 uses a global mutex lock" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Update-OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            $content | Should -Match "System\.Threading\.Mutex"
            $content | Should -Match "Global\\OpenPathUpdateLock"
            $content | Should -Match "WaitOne\(0\)"
        }
    }

    Context "Rollback system" {
        It "Creates rolling checkpoints before applying new whitelist" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Update-OpenPath.ps1"
            $commonPath = Join-Path $PSScriptRoot ".." "lib" "Common.psm1"
            $content = Get-Content $scriptPath -Raw
            $commonContent = Get-Content $commonPath -Raw

            $content | Should -Match 'whitelist\.backup\.txt'
            $content | Should -Match 'Copy-Item.*\$whitelistPath.*\$backupPath'
            $content | Should -Match 'Save-OpenPathWhitelistCheckpoint'
            $content | Should -Match 'maxCheckpoints'
            $commonContent | Should -Match 'Save-OpenPathWhitelistCheckpoint'
            $commonContent | Should -Match 'Get-OpenPathLatestCheckpoint'
        }

        It "Restores checkpoint and falls back to backup on update failure" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Update-OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            $content | Should -Match 'Restore-OpenPathCheckpoint'
            $content | Should -Match 'Attempting checkpoint rollback'
            $content | Should -Match 'Falling back to backup whitelist rollback'
            $content | Should -Match 'Copy-Item.*\$backupPath.*\$whitelistPath'
        }
    }

    Context "Health report" {
        It "Sends health report to API after successful update" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Update-OpenPath.ps1"
            $commonPath = Join-Path $PSScriptRoot ".." "lib" "Common.psm1"
            $updateContent = Get-Content $scriptPath -Raw
            $commonContent = Get-Content $commonPath -Raw

            $updateContent | Should -Match 'Send-OpenPathHealthReport'
            $commonContent | Should -Match '/trpc/healthReports\.submit'
            $commonContent | Should -Match 'dnsmasqRunning'
        }
    }

    Context "Stale whitelist fail-safe" {
        It "Includes stale threshold logic and STALE_FAILSAFE handling" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Update-OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            $content | Should -Match 'staleWhitelistMaxAgeHours'
            $content | Should -Match 'Enter-StaleWhitelistFailsafe'
            $content | Should -Match 'STALE_FAILSAFE'
        }
    }
}

Describe "Watchdog Script" {
    Context "SSE listener monitoring" {
        It "Checks and restarts SSE listener task" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Test-DNSHealth.ps1"
            $content = Get-Content $scriptPath -Raw

            $content | Should -Match 'OpenPath-SSE'
            $content | Should -Match 'Start-ScheduledTask.*OpenPath-SSE'
        }
    }

    Context "Captive portal detection" {
        It "Detects captive portals and temporarily opens DNS" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Test-DNSHealth.ps1"
            $content = Get-Content $scriptPath -Raw

            $content | Should -Match 'msftconnecttest\.com'
            $content | Should -Match 'Captive portal detected'
            $content | Should -Match 'Restore-OriginalDNS'
        }

        It "Restores DNS protection after captive portal is resolved" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Test-DNSHealth.ps1"
            $content = Get-Content $scriptPath -Raw

            $content | Should -Match 'Captive portal resolved.*restoring DNS protection'
            $content | Should -Match 'Set-LocalDNS'
        }
    }

    Context "Integrity checks" {
        It "Verifies baseline integrity and handles tampering" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Test-DNSHealth.ps1"
            $content = Get-Content $scriptPath -Raw

            $content | Should -Match 'Test-OpenPathIntegrity'
            $content | Should -Match 'Restore-OpenPathIntegrity'
            $content | Should -Match 'TAMPERED'
        }
    }

    Context "Watchdog health states" {
        It "Reports STALE_FAILSAFE and CRITICAL states" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Test-DNSHealth.ps1"
            $content = Get-Content $scriptPath -Raw

            $content | Should -Match 'STALE_FAILSAFE'
            $content | Should -Match 'CRITICAL'
            $content | Should -Match 'Send-OpenPathHealthReport'
        }
    }

    Context "Checkpoint recovery" {
        It "Attempts checkpoint recovery when watchdog reaches CRITICAL" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Test-DNSHealth.ps1"
            $content = Get-Content $scriptPath -Raw

            $content | Should -Match 'enableCheckpointRollback'
            $content | Should -Match 'Restore-CheckpointFromWatchdog'
            $content | Should -Match 'Checkpoint rollback restored DNS state'
        }
    }
}

Describe "Installer" {
    Context "ACL lockdown" {
        It "Sets restrictive file permissions during installation" {
            $scriptPath = Join-Path $PSScriptRoot ".." "Install-OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            $content | Should -Match 'SetAccessRuleProtection'
            $content | Should -Match 'NT AUTHORITY\\SYSTEM'
            $content | Should -Match 'BUILTIN\\Administrators'
        }
    }

    Context "Source path validation" {
        It "Validates modules exist before copying" {
            $scriptPath = Join-Path $PSScriptRoot ".." "Install-OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            $content | Should -Match 'Modules not found'
            $content | Should -Match 'Test-Path.*lib.*psm1'
        }
    }

    Context "Checkpoint defaults" {
        It "Configures checkpoint rollback defaults during install" {
            $scriptPath = Join-Path $PSScriptRoot ".." "Install-OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            $content | Should -Match 'enableCheckpointRollback'
            $content | Should -Match 'maxCheckpoints'
        }
    }

    Context "Enrollment extraction" {
        It "Uses Enroll-Machine script for classroom registration" {
            $scriptPath = Join-Path $PSScriptRoot ".." "Install-OpenPath.ps1"
            $enrollScriptPath = Join-Path $PSScriptRoot ".." "scripts" "Enroll-Machine.ps1"
            $content = Get-Content $scriptPath -Raw

            Test-Path $enrollScriptPath | Should -BeTrue
            $content | Should -Match 'Enroll-Machine\.ps1'
            $content | Should -Match 'SkipTokenValidation'
            $content | Should -Match 'Machine registration completed'
        }
    }

    Context "Operational script installation" {
        It "Copies OpenPath.ps1 and Rotate-Token.ps1 into install root" {
            $scriptPath = Join-Path $PSScriptRoot ".." "Install-OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            $content | Should -Match "'OpenPath\.ps1', 'Rotate-Token\.ps1'"
        }
    }

    Context "Pre-install validation integration" {
        It "Runs pre-install validation by default and supports SkipPreflight" {
            $scriptPath = Join-Path $PSScriptRoot ".." "Install-OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            $content | Should -Match 'SkipPreflight'
            $content | Should -Match 'Pre-Install-Validation\.ps1'
            $content | Should -Match 'powershell\.exe\s+-NoProfile\s+-ExecutionPolicy\s+Bypass\s+-File'
        }
    }
}

Describe "Whitelist Validation" {
    Context "Content validation" {
        It "Common module validates minimum domain count" {
            $modulePath = Join-Path $PSScriptRoot ".." "lib" "Common.psm1"
            $content = Get-Content $modulePath -Raw

            $content | Should -Match 'minRequiredDomains'
            $content | Should -Match 'Invalid whitelist content'
        }
    }
}

Describe "Log Rotation" {
    Context "Automatic rotation" {
        It "Common module implements log rotation" {
            $modulePath = Join-Path $PSScriptRoot ".." "lib" "Common.psm1"
            $content = Get-Content $modulePath -Raw

            $content | Should -Match 'MaxLogSizeBytes'
            $content | Should -Match 'Move-Item.*archivePath'
            $content | Should -Match 'Select-Object -Skip 5'
        }
    }
}
