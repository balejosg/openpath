Describe "Watchdog Script" {
    Context "Module import resilience" {
        It "Uses the shared standalone bootstrap helper" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Test-DNSHealth.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'Import-Module "$OpenPathRoot\lib\ScriptBootstrap.psm1" -Force',
                'Initialize-OpenPathScriptSession `',
                '-OpenPathRoot $OpenPathRoot',
                '-DependentModules @(''DNS'', ''Firewall'', ''Browser'', ''CaptivePortal'')',
                '-RequiredCommands @(',
                '-ScriptName ''Test-DNSHealth.ps1''',
                '''Set-FirefoxPolicy''',
                '''Get-OpenPathWhitelistSectionsFromFile'''
            )
        }
    }

    Context "Firefox policy refresh" {
        It "Reapplies Firefox policies from the local whitelist so later Firefox installs become managed automatically" {
            $helperPath = Join-Path $PSScriptRoot ".." "lib" "internal" "Watchdog.Runtime.ps1"
            $content = Get-Content $helperPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                "$localWhitelistPath = Join-Path `$OpenPathRoot 'data\whitelist.txt'",
                '$localWhitelistSections = Get-OpenPathWhitelistSectionsFromFile -Path $localWhitelistPath',
                'Watchdog: skipped Firefox policy refresh because local whitelist is disabled',
                'Set-FirefoxPolicy -BlockedPaths $localWhitelistSections.BlockedPaths',
                'Watchdog: refreshed Firefox policies from local whitelist state'
            )
        }
    }

    Context "SSE listener monitoring" {
        It "Checks and restarts SSE listener task" {
            $helperPath = Join-Path $PSScriptRoot ".." "lib" "internal" "Watchdog.Runtime.ps1"
            $content = Get-Content $helperPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'OpenPath-SSE',
                'Start-ScheduledTask -TaskName "OpenPath-SSE"'
            )
        }
    }

    Context "Captive portal detection" {
        It "Detects captive portals and temporarily opens DNS" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Test-DNSHealth.ps1"
            $modulePath = Join-Path $PSScriptRoot ".." "lib" "CaptivePortal.psm1"
            $scriptContent = Get-Content $scriptPath -Raw
            $moduleContent = Get-Content $modulePath -Raw

            Assert-ContentContainsAll -Content $scriptContent -Needles @(
                '-DependentModules @(',
                '''DNS''',
                '''Firewall''',
                '''Browser''',
                '''CaptivePortal''',
                'Test-OpenPathCaptivePortalState',
                'Enable-OpenPathCaptivePortalMode'
            )

            Assert-ContentContainsAll -Content $moduleContent -Needles @(
                'msftconnecttest.com',
                'detectportal.firefox.com',
                'clients3.google.com',
                'captive-portal-active.json',
                'Captive portal detected',
                'Disable-OpenPathFirewall',
                'Restore-OriginalDNS'
            )
        }

        It "Restores DNS protection after captive portal is resolved" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Test-DNSHealth.ps1"
            $modulePath = Join-Path $PSScriptRoot ".." "lib" "CaptivePortal.psm1"
            $scriptContent = Get-Content $scriptPath -Raw
            $moduleContent = Get-Content $modulePath -Raw

            Assert-ContentContainsAll -Content $scriptContent -Needles @(
                'Disable-OpenPathCaptivePortalMode',
                'Test-OpenPathCaptivePortalModeActive'
            )

            Assert-ContentContainsAll -Content $moduleContent -Needles @(
                'Captive portal resolved',
                'restoring DNS protection',
                'Restore-OpenPathProtectedMode -Config $Config -SkipAcrylicRestart',
                'Clear-OpenPathCaptivePortalMarker'
            )
        }
    }

    Context "Integrity checks" {
        It "Verifies baseline integrity and handles tampering" {
            $helperPath = Join-Path $PSScriptRoot ".." "lib" "internal" "Watchdog.Runtime.ps1"
            $content = Get-Content $helperPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'Test-OpenPathIntegrity',
                'Restore-OpenPathIntegrity',
                'TAMPERED'
            )
        }
    }

    Context "Watchdog health states" {
        It "Reports FAIL_OPEN, STALE_FAILSAFE and CRITICAL states" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Test-DNSHealth.ps1"
            $helperPath = Join-Path $PSScriptRoot ".." "lib" "internal" "Watchdog.Runtime.ps1"
            $content = Get-Content $scriptPath -Raw
            $helperContent = Get-Content $helperPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'Get-OpenPathWatchdogOutcome',
                'Send-OpenPathHealthReport'
            )

            Assert-ContentContainsAll -Content $helperContent -Needles @(
                'FAIL_OPEN',
                'STALE_FAILSAFE',
                'CRITICAL'
            )
        }

        It "Does not repair protected DNS or firewall while the local fail-open marker is active" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Test-DNSHealth.ps1"
            $helperPath = Join-Path $PSScriptRoot ".." "lib" "internal" "Watchdog.Runtime.ps1"
            $content = Get-Content $scriptPath -Raw
            $helperContent = Get-Content $helperPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                '-FailOpenActive $checkResult.FailOpenActive'
            )

            Assert-ContentContainsAll -Content $helperContent -Needles @(
                '$failOpenActive = [bool]$localWhitelistSections.IsDisabled',
                '$shouldRunProtectedModeChecks = -not $PortalModeActive -and -not $failOpenActive',
                'Watchdog: local fail-open whitelist marker active; skipping protected-mode DNS/firewall recovery',
                'FailOpenActive = $failOpenActive',
                '$status = ''FAIL_OPEN''',
                'fail_open_active'
            )
        }
    }

    Context "DNS probe selection" {
        It "Relies on the shared DNS probe instead of a hard-coded public domain" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Test-DNSHealth.ps1"
            $helperPath = Join-Path $PSScriptRoot ".." "lib" "internal" "Watchdog.Runtime.ps1"
            $content = Get-Content $scriptPath -Raw
            $helperContent = Get-Content $helperPath -Raw

            $content.Contains('Test-DNSResolution -Domain "google.com"') | Should -BeFalse
            Assert-ContentContainsAll -Content $content -Needles @(
                '. (Join-Path $OpenPathRoot ''lib\internal\Watchdog.Runtime.ps1'')',
                'Invoke-OpenPathWatchdogChecks'
            )
            $helperContent.Contains('(Test-DNSResolution)') | Should -BeTrue
        }
    }

    Context "Checkpoint recovery" {
        It "Attempts checkpoint recovery when watchdog reaches CRITICAL" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Test-DNSHealth.ps1"
            $helperPath = Join-Path $PSScriptRoot ".." "lib" "internal" "Watchdog.Runtime.ps1"
            $content = Get-Content $scriptPath -Raw
            $helperContent = Get-Content $helperPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'Get-OpenPathWatchdogOutcome'
            )

            Assert-ContentContainsAll -Content $helperContent -Needles @(
                'enableCheckpointRollback',
                'Restore-CheckpointFromWatchdog',
                'Checkpoint rollback restored DNS state'
            )
        }

        It "Does not let SSE listener failures alone trigger checkpoint rollback" {
            $helperPath = Join-Path $PSScriptRoot ".." "lib" "internal" "Watchdog.Runtime.ps1"
            $content = Get-Content $helperPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                '$recoveryEligibleIssues = @()',
                '$shouldIncrementFailCount = $status -eq ''DEGRADED'' -and $RecoveryEligibleIssues.Count -gt 0',
                '$issues += "SSE listener not running"'
            )
            $content.Contains('$recoveryEligibleIssues += "SSE listener not running"') | Should -BeFalse
        }
    }
}
