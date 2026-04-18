Import-Module (Join-Path $PSScriptRoot "TestHelpers.psm1") -Force

Describe "Enrollment script" {
    Context "Standalone bootstrap" {
        It "Uses the shared standalone bootstrap helper for enrollment reconfiguration" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Enroll-Machine.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'Import-Module "$OpenPathRoot\lib\ScriptBootstrap.psm1" -Force',
                'Initialize-OpenPathScriptSession `',
                '-OpenPathRoot $OpenPathRoot',
                '-DependentModules @(''Browser'')',
                '-RequiredCommands @(',
                '''Get-OpenPathConfig''',
                '''Set-OpenPathConfigValue''',
                '''Register-OpenPathFirefoxNativeHost''',
                '-ScriptName ''Enroll-Machine.ps1'''
            )
        }
    }

    Context "Token modes" {
        It "Supports registration and enrollment token parameters" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Enroll-Machine.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                '[string]$EnrollmentToken = ""',
                '[string]$ClassroomId = ""',
                '[switch]$Unattended',
                'RegistrationToken and EnrollmentToken cannot be used together',
                'ClassroomId requires EnrollmentToken mode',
                'New-OpenPathMachineRegistrationBody',
                'Resolve-OpenPathMachineRegistration'
            )
        }

        It "Preserves enrollment errors for the installer to surface" {
            $scriptPath = Join-Path $PSScriptRoot ".." "lib" "install" "Installer.Enrollment.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                "EnrollmentError = ''",
                '$result.EnrollmentError = "Enrollment script not found: $enrollScript"',
                '$result.EnrollmentError = ''Machine registration returned an incomplete result''',
                '$result.EnrollmentError = [string]$_'
            )
        }
    }

    Context "Firefox native host sync" {
        It "Registers the Firefox native host after persisting enrollment config" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Enroll-Machine.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                '-DependentModules @(''Browser'')',
                'Register-OpenPathFirefoxNativeHost -Config $config -ClearWhitelist | Out-Null',
                'Failed to register Firefox native host after enrollment'
            )
        }
    }
}
