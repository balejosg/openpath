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

        It "Includes daily silent agent update task" {
            $helperPath = Join-Path $PSScriptRoot ".." "lib" "internal" "Services.TaskBuilders.ps1"
            $content = Get-Content $helperPath -Raw

            $content.Contains('$TaskPrefix-AgentUpdate') | Should -BeTrue
            $content.Contains('self-update --silent') | Should -BeTrue
        }

        It "Avoids explicit max repetition duration for recurring tasks" {
            $helperPath = Join-Path $PSScriptRoot ".." "lib" "internal" "Services.TaskBuilders.ps1"
            $content = Get-Content $helperPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                '$updateTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2)',
                '-RepetitionInterval (New-TimeSpan -Minutes $UpdateIntervalMinutes)',
                '$watchdogTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1)',
                '-RepetitionInterval (New-TimeSpan -Minutes $WatchdogIntervalMinutes)'
            )

            $content.Contains('RepetitionDuration ([TimeSpan]::MaxValue)') | Should -BeFalse
        }
    }

    Context "Agent self-update" {
        It "Re-registers the Firefox native host after applying updated files" {
            $modulePath = Join-Path $PSScriptRoot ".." "lib" "internal" "Common.Update.ps1"
            $content = Get-Content $modulePath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'Copy-Item -Path $download.StagedPath -Destination $download.DestinationPath -Force',
                'Register-OpenPathFirefoxNativeHost -Config $config | Out-Null'
            )
        }

        It "Reapplies protected DNS mode after applying updated files" {
            $modulePath = Join-Path $PSScriptRoot ".." "lib" "internal" "Common.Update.ps1"
            $content = Get-Content $modulePath -Raw

            $content | Should -Match '(?s)Register-OpenPathTask.*?Enable-OpenPathTask.*?Register-OpenPathFirefoxNativeHost.*?Restore-OpenPathProtectedMode -Config \$config.*?Start-OpenPathTask -TaskType SSE'
        }
    }

    Context "Start-OpenPathTask" {
        It "Accepts SSE as a valid task type" -Skip:(-not (Test-FunctionExists 'Start-OpenPathTask')) {
            # Verify the SSE task type is accepted in the ValidateSet
            { Start-OpenPathTask -TaskType SSE -WhatIf } | Should -Not -Throw
        }

        It "Accepts AgentUpdate as a valid task type" -Skip:(-not (Test-FunctionExists 'Start-OpenPathTask')) {
            { Start-OpenPathTask -TaskType AgentUpdate -WhatIf } | Should -Not -Throw
        }
    }
}

Describe "Script Bootstrap Module" {
    Context "Standalone script initialization" {
        It "Provides a shared initializer for standalone Windows scripts" {
            $modulePath = Join-Path $PSScriptRoot ".." "lib" "ScriptBootstrap.psm1"
            $content = Get-Content $modulePath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'function Initialize-OpenPathScriptSession',
                '[string[]]$DependentModules = @()',
                '[string[]]$RequiredCommands = @()',
                '[string]$ScriptName = ''OpenPath script''',
                'Import-Module (Join-Path $OpenPathRoot "lib\$moduleName.psm1") -Force -Global',
                'Import-Module (Join-Path $OpenPathRoot ''lib\Common.psm1'') -Force -Global',
                'failed to import required commands',
                'Export-ModuleMember -Function @('
            )
        }
    }
}

Describe "SSE Listener" {
    Context "Script existence" {
        It "Start-SSEListener.ps1 exists" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Start-SSEListener.ps1"
            Test-Path $scriptPath | Should -BeTrue
        }

        It "Keeps parser-sensitive messages ASCII-only" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Start-SSEListener.ps1"
            $content = Get-Content $scriptPath -Raw

            $content.Contains('—') | Should -BeFalse
        }

        It "Uses the shared standalone bootstrap helper and loads HTTP assembly support" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Start-SSEListener.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'Import-Module "$OpenPathRoot\lib\ScriptBootstrap.psm1" -Force',
                'Initialize-OpenPathScriptSession `',
                '-OpenPathRoot $OpenPathRoot',
                '-RequiredCommands @(',
                '-ScriptName ''Start-SSEListener.ps1''',
                "Add-Type -AssemblyName 'System.Net.Http' -ErrorAction Stop",
                "[System.Reflection.Assembly]::Load('System.Net.Http')",
                '[System.Net.Http.HttpClientHandler]::new()'
            )
        }
    }

    Context "Update process triggering" {
        It "prefers the registered OpenPath-Update task for SSE-triggered local policy refreshes" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Start-SSEListener.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                "Start-ScheduledTask -TaskName 'OpenPath-Update'",
                'SSE: Starting OpenPath-Update scheduled task',
                'SSE: OpenPath-Update scheduled task started'
            )
        }

        It "keeps a detached PowerShell direct-update fallback instead of in-process jobs" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Start-SSEListener.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'Start-OpenPathSseUpdateProcess',
                '[System.Diagnostics.ProcessStartInfo]::new()',
                '[System.Diagnostics.Process]::Start($processInfo)',
                '$processInfo.UseShellExecute = $false',
                '$processInfo.CreateNoWindow = $true',
                '$processInfo.Arguments =',
                '-NoProfile',
                '-ExecutionPolicy',
                'Bypass',
                '-EncodedCommand',
                'Update.ScriptPath'
            )

            $content | Should -Not -Match '\.ArgumentList\.Add'
            $content | Should -Not -Match 'Start-Job\s+-ScriptBlock'
            $content | Should -Not -Match 'Get-Job\s+-Name'
        }

        It "queues one delayed catch-up update when whitelist changes arrive during cooldown" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Start-SSEListener.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                '$script:DelayedUpdateDueAt = [datetime]::MinValue',
                'function Start-OpenPathSseUpdateProcess',
                '-DelaySeconds $delaySeconds',
                'Start-Sleep -Seconds',
                'SSE: Queuing delayed update'
            )
        }

        It "logs SSE update process boundaries for production diagnostics" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Start-SSEListener.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'SSE: Starting detached update process',
                'SSE: Detached update process started',
                'SSE: Failed to start detached update process'
            )
        }
    }
}
