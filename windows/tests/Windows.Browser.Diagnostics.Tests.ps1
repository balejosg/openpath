# OpenPath Windows browser diagnostics tests

Import-Module (Join-Path $PSScriptRoot "TestHelpers.psm1") -Force
$modulePath = Join-Path $PSScriptRoot ".." "lib"

Describe "Browser Module - Diagnostics" {
    BeforeAll {
        Import-OpenPathTestModules -ModuleNames @('Browser')
    }

    Context "Browser doctor" {
        It "Exports a focused browser doctor report helper" {
            $browserDiagnosticsPath = Join-Path $PSScriptRoot ".." "lib" "Browser.Diagnostics.psm1"
            $content = Get-Content $browserDiagnosticsPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'function Get-OpenPathBrowserDoctorReport',
                'Firefox metadata path:',
                'Firefox XPI ACL summary:',
                'Resolved install_url:',
                'Policy JSON parse:'
            )
        }

        It "OpenPath.ps1 routes doctor browser to the browser report" {
            $scriptPath = Join-Path $PSScriptRoot ".." "OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                "Write-Host '  doctor        Print focused diagnostics (for example: browser)'",
                "Write-Host '  .\OpenPath.ps1 doctor browser'",
                "'doctor' {",
                "'browser' {",
                'Get-OpenPathBrowserDoctorReport'
            )
        }

        It "Reports Firefox native host diagnostics alongside browser policy state" {
            $browserDiagnosticsPath = Join-Path $PSScriptRoot ".." "lib" "Browser.Diagnostics.psm1"
            $content = Get-Content $browserDiagnosticsPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'Native host manifest path:',
                'Native host manifest parse:',
                'Native host registry path:',
                'Native host manifest name:',
                'Native host wrapper path:',
                'Native host whitelist readable:',
                'Native host state readable:',
                'Native host update task present:',
                'Native host update task user access:'
            )
        }
    }
}
