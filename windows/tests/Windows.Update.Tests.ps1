Describe "Update Script" {
    Context "Concurrency guard" {
        It "Update-OpenPath.ps1 uses a global mutex lock" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Update-OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'System.Threading.Mutex',
                'Global\OpenPathUpdateLock',
                'WaitOne(0)'
            )
        }
    }

    Context "Module import resilience" {
        It "Uses the shared standalone bootstrap helper" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Update-OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'Import-Module "$OpenPathRoot\lib\ScriptBootstrap.psm1" -Force',
                'Initialize-OpenPathScriptSession `',
                '-OpenPathRoot $OpenPathRoot',
                '-DependentModules @(''DNS'', ''Firewall'', ''Browser'')',
                '-RequiredCommands @(',
                '-ScriptName ''Update-OpenPath.ps1'''
            )
        }
    }

    Context "Rollback system" {
        It "Creates rolling checkpoints before applying new whitelist" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Update-OpenPath.ps1"
            $whitelistHelperPath = Join-Path $PSScriptRoot ".." "lib" "internal" "Common.Whitelist.ps1"
            $content = Get-Content $scriptPath -Raw
            $commonContent = Get-Content $whitelistHelperPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'whitelist.backup.txt',
                'Copy-Item $whitelistPath $backupPath -Force',
                'Save-OpenPathWhitelistCheckpoint',
                'maxCheckpoints'
            )

            Assert-ContentContainsAll -Content $commonContent -Needles @(
                'Save-OpenPathWhitelistCheckpoint',
                'Get-OpenPathLatestCheckpoint',
                'Restore-OpenPathLatestCheckpoint'
            )
        }

        It "Restores checkpoint and falls back to backup on update failure" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Update-OpenPath.ps1"
            $runtimePath = Join-Path $PSScriptRoot ".." "lib" "Update.Runtime.psm1"
            $content = Get-Content $scriptPath -Raw
            $runtimeContent = Get-Content $runtimePath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'Restore-OpenPathCheckpoint',
                'Attempting checkpoint rollback',
                'Falling back to backup whitelist rollback',
                'Copy-Item $backupPath $whitelistPath -Force',
                'Write-UpdateCatchLog "Update failed: $_" -Level ERROR'
            )

            Assert-ContentContainsAll -Content $runtimeContent -Needles @(
                'function Write-UpdateCatchLog',
                'function Restore-OpenPathCheckpoint'
            )
        }
    }

    Context "Health report" {
        It "Sends health report to API after successful update" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Update-OpenPath.ps1"
            $commonPath = Join-Path $PSScriptRoot ".." "lib" "internal" "Common.Http.Health.ps1"
            $updateContent = Get-Content $scriptPath -Raw
            $commonContent = Get-Content $commonPath -Raw

            $updateContent.Contains('Send-OpenPathHealthReport') | Should -BeTrue
            $commonContent.Contains('/trpc/healthReports.submit') | Should -BeTrue
            $commonContent.Contains('dnsmasqRunning') | Should -BeTrue
        }
    }

    Context "Stale whitelist fail-safe" {
        It "Includes stale threshold logic and restores protected mode via shared helper" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Update-OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'staleWhitelistMaxAgeHours',
                'Enter-StaleWhitelistFailsafe',
                'STALE_FAILSAFE'
            )

            $content | Should -Match 'Restore-OpenPathProtectedMode -Config \$config'
        }
    }

    Context "Protected mode recovery" {
        It "Restores local DNS and firewall through the shared helper after applying a valid whitelist" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Update-OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            $content | Should -Match '(?s)elseif \(\$whitelist\.IsDisabled\).*?Restore-OriginalDNS'
            $content | Should -Match '(?s)# Save whitelist to local file.*?Update-AcrylicHost.*?Restore-OpenPathProtectedMode -Config \$config'
            $content | Should -Match '(?s)Falling back to backup whitelist rollback.*?Restore-OpenPathProtectedMode -Config \$config -ErrorAction SilentlyContinue'
        }
    }
}
